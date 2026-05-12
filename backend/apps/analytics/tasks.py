"""Analytics Celery tasks"""
from celery import shared_task
import structlog

logger = structlog.get_logger(__name__)


@shared_task
def aggregate_session_analytics(session_id: str):
    """
    Aggregate all session data into StageMetric and SessionSummaryMetric.
    RF-ANA-02: Called after session ends.
    """
    from apps.live_sessions.models import LiveSession, Participant
    from apps.analytics.models import StageMetric, SessionSummaryMetric
    from apps.gamification.models import QuizQuestion, QuizResponse, PointEvent
    from apps.chat.models import ChatMessage
    from django.db.models import Sum, Count, Avg

    try:
        session = LiveSession.objects.prefetch_related(
            "participants", "template__stages"
        ).get(pk=session_id)

        total_participants = session.participants.count()
        total_chat = ChatMessage.objects.filter(session=session, is_system=False).count()
        total_quizzes = QuizQuestion.objects.filter(session=session, is_launched=True).count()
        total_points = PointEvent.objects.filter(session=session).aggregate(
            total=Sum("points")
        )["total"] or 0

        # Quiz accuracy
        all_responses = QuizResponse.objects.filter(question__session=session)
        correct = all_responses.filter(is_correct=True).count()
        total_resp = all_responses.count()
        avg_accuracy = (correct / total_resp) if total_resp > 0 else 0.0

        SessionSummaryMetric.objects.update_or_create(
            session=session,
            defaults={
                "total_participants": total_participants,
                "total_chat_messages": total_chat,
                "total_quizzes": total_quizzes,
                "total_points_awarded": total_points,
                "avg_quiz_accuracy": avg_accuracy,
            },
        )

        logger.info("analytics_aggregated", session_id=session_id)
    except Exception as exc:
        logger.error("analytics_aggregation_failed", session_id=session_id, error=str(exc))
