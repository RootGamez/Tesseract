"""
AI Copilot Celery Tasks
RF-AI-01: generate_questions_from_resource — after PDF upload
RF-AI-02: generate_session_summary — after session ends
RF-AI-03: analyze_session_for_hints — passive live analysis
"""
import time
import structlog
from celery import shared_task

from .llm_client import LLMClient, get_input_hash
from .prompts import (
    QUESTION_GENERATION_SYSTEM, QUESTION_GENERATION_PROMPT,
    SESSION_SUMMARY_SYSTEM, SESSION_SUMMARY_PROMPT,
    LIVE_HINT_SYSTEM, LIVE_HINT_PROMPT,
)

logger = structlog.get_logger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def generate_questions_from_resource(self, resource_id: str):
    """
    RF-AI-01: Extract text from PDF and generate quiz questions via LLM.
    Stores results as QuizQuestion objects linked to the session.
    Fails silently — never blocks the classroom.
    """
    from apps.resources.models import Resource
    from apps.gamification.models import QuizQuestion
    from apps.ai_copilot.models import AIGenerationLog

    try:
        resource = Resource.objects.select_related("session").get(pk=resource_id)
        # Extract text from PDF (minimal implementation)
        text = _extract_pdf_text(resource)
        if not text or len(text) < 100:
            logger.info("ai_skip_insufficient_text", resource_id=resource_id)
            return

        input_hash = get_input_hash(text[:3000])
        prompt = QUESTION_GENERATION_PROMPT.format(text=text[:3000], count=5)

        start = time.monotonic()
        client = LLMClient()
        result = client.complete(prompt, system=QUESTION_GENERATION_SYSTEM, max_tokens=3000)
        duration_ms = int((time.monotonic() - start) * 1000)

        log = AIGenerationLog.objects.create(
            session=resource.session,
            task_type="QUESTIONS",
            input_hash=input_hash,
            model_used=result.get("model", ""),
            prompt_tokens=result.get("prompt_tokens", 0),
            completion_tokens=result.get("completion_tokens", 0),
            duration_ms=duration_ms,
            is_success=bool(result.get("content")),
        )

        questions_data = client.parse_json_response(result.get("content", ""))
        if not questions_data or not isinstance(questions_data, list):
            logger.warning("ai_questions_parse_failed", resource_id=resource_id)
            return

        for q in questions_data[:10]:  # Max 10 questions
            options = q.get("options", [])
            correct = q.get("correct_answer", "")
            QuizQuestion.objects.create(
                session=resource.session,
                text=q.get("text", ""),
                question_type="MULTIPLE_CHOICE",
                options=options,
                correct_answer=correct,
                explanation=q.get("explanation", ""),
                difficulty=q.get("difficulty", "MEDIUM"),
                generated_by_ai=True,
                ai_model_used=result.get("model", ""),
            )

        log.output = {"count": len(questions_data)}
        log.save(update_fields=["output"])
        logger.info("ai_questions_generated", count=len(questions_data), resource_id=resource_id)

    except Exception as exc:
        logger.error("ai_questions_failed", resource_id=resource_id, error=str(exc))
        # Silent fail — no retry for AI tasks


@shared_task(bind=True, max_retries=1)
def generate_session_summary(self, session_id: str):
    """
    RF-AI-02: Generate structured Markdown summary post-session.
    Stores in LiveSession.ai_summary and optionally emails instructor.
    """
    from apps.sessions.models import LiveSession
    from apps.chat.models import ChatMessage
    from apps.resources.models import Snippet
    from apps.gamification.models import QuizQuestion
    from apps.ai_copilot.models import AIGenerationLog

    try:
        session = LiveSession.objects.select_related(
            "instructor", "template"
        ).prefetch_related("board_snapshots__stage").get(pk=session_id)

        # Build context for prompt
        stages = list(session.template.stages.all()) if session.template else []
        stages_summary = "\n".join(
            [f"- {s.title} ({s.stage_type})" for s in stages]
        ) or "No stages recorded."

        chat_msgs = ChatMessage.objects.filter(
            session=session, is_deleted=False, is_system=False
        ).order_by("created_at")[:30]
        chat_sample = "\n".join(
            [f"[{m.author_display_name}]: {m.text}" for m in chat_msgs]
        ) or "Sin mensajes."

        snippets = Snippet.objects.filter(session=session)
        snippets_summary = "\n".join(
            [f"- [{s.language}] {s.title or 'Snippet'}" for s in snippets]
        ) or "Sin snippets."

        quizzes = QuizQuestion.objects.filter(session=session, is_launched=True)
        quiz_summary = "\n".join(
            [f"- {q.text[:80]} ({q.responses.count()} respuestas)" for q in quizzes]
        ) or "Sin quizzes."

        duration_minutes = int((session.duration_seconds or 0) / 60)

        prompt = SESSION_SUMMARY_PROMPT.format(
            session_title=session.title,
            duration_minutes=duration_minutes,
            stages_summary=stages_summary,
            chat_sample=chat_sample,
            snippets_summary=snippets_summary,
            quiz_summary=quiz_summary,
        )

        client = LLMClient()
        result = client.complete(prompt, system=SESSION_SUMMARY_SYSTEM, max_tokens=2000)

        AIGenerationLog.objects.create(
            session=session,
            task_type="SUMMARY",
            model_used=result.get("model", ""),
            duration_ms=result.get("duration_ms", 0),
            is_success=bool(result.get("content")),
        )

        summary = result.get("content") or ""
        if summary:
            session.ai_summary = summary
            session.save(update_fields=["ai_summary"])
            logger.info("ai_summary_generated", session_id=session_id)

    except Exception as exc:
        logger.error("ai_summary_failed", session_id=session_id, error=str(exc))
        # Silent fail


@shared_task
def analyze_session_for_hints(session_id: str):
    """
    RF-AI-03: Analyze passive session signals and send live hints to instructor.
    Scheduled periodically during LIVE sessions.
    """
    from apps.sessions.models import LiveSession
    from apps.ai_copilot.models import AIGenerationLog
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    from core.websocket_events import AI_SUGGESTION
    from django.utils import timezone
    from datetime import timedelta

    try:
        session = LiveSession.objects.select_related("current_stage").get(
            pk=session_id, state="LIVE"
        )

        # Compute signals
        from apps.chat.models import ChatMessage
        from apps.gamification.models import QuizQuestion, QuizResponse

        confusion_emojis = 0  # Would need emoji analytics model for real impl
        recent_msgs = ChatMessage.objects.filter(
            session=session,
            created_at__gte=timezone.now() - timedelta(minutes=3),
        ).count()
        idle_minutes = 3 if recent_msgs == 0 else 0

        last_quiz = QuizQuestion.objects.filter(session=session, is_launched=True).last()
        quiz_response_rate = 0
        if last_quiz:
            total_participants = session.participants.filter(connection_status="ONLINE").count()
            responses = last_quiz.responses.count()
            quiz_response_rate = int((responses / max(total_participants, 1)) * 100)

        stage_type = session.current_stage.stage_type if session.current_stage else "UNKNOWN"

        prompt = LIVE_HINT_PROMPT.format(
            confusion_emojis=confusion_emojis,
            quiz_response_rate=quiz_response_rate,
            idle_minutes=idle_minutes,
            current_stage_type=stage_type,
        )

        client = LLMClient()
        result = client.complete(prompt, system=LIVE_HINT_SYSTEM, max_tokens=200)
        hint = result.get("content", "")

        if hint:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"session_{session_id}",
                {
                    "type": "ai.suggestion",
                    "event": AI_SUGGESTION,
                    "payload": {"hint": hint, "for_instructor_only": True},
                },
            )

            AIGenerationLog.objects.create(
                session=session,
                task_type="LIVE_HINT",
                model_used=result.get("model", ""),
                duration_ms=result.get("duration_ms", 0),
                output={"hint": hint},
                is_success=True,
            )

    except Exception as exc:
        logger.error("ai_hint_failed", session_id=session_id, error=str(exc))


def _extract_pdf_text(resource) -> str:
    """Extract text from a PDF resource stored in S3/MinIO."""
    from apps.resources.storage import _get_s3_client
    from django.conf import settings
    import io

    try:
        client = _get_s3_client()
        response = client.get_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME,
            Key=resource.file_key,
        )
        pdf_bytes = response["Body"].read()

        # Try PyPDF2 / pdfplumber (optional dependency)
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                return "\n".join(page.extract_text() or "" for page in pdf.pages[:10])
        except ImportError:
            try:
                import PyPDF2
                reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
                return "\n".join(
                    page.extract_text() or "" for page in reader.pages[:10]
                )
            except ImportError:
                logger.warning("no_pdf_library_available")
                return ""
    except Exception as exc:
        logger.error("pdf_text_extraction_failed", resource_id=str(resource.pk), error=str(exc))
        return ""
