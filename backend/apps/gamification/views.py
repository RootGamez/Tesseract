"""Gamification views"""
from django.db import transaction
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet
from core.permissions import IsInstructor, IsParticipantOrInstructor
from .models import Quiz, QuizQuestion, PointEvent, Timer
from .serializers import (
    QuizSerializer, QuizQuestionSerializer, PointEventSerializer,
    TimerSerializer, LeaderboardEntrySerializer,
)


class QuizViewSet(ModelViewSet):
    """
    CRUD ViewSet for the Instructor's Quiz database/library.
    """
    serializer_class = QuizSerializer
    permission_classes = [IsInstructor]

    def get_queryset(self):
        return Quiz.objects.filter(owner=self.request.user).prefetch_related("questions")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class QuizQuestionListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/gamification/sessions/<id>/questions/"""
    serializer_class = QuizQuestionSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsInstructor()]
        return [IsParticipantOrInstructor()]

    def get_queryset(self):
        session_id = self.kwargs["session_id"]
        stage_id = self.request.query_params.get("stage_id")
        qs = QuizQuestion.objects.filter(session_id=session_id)
        if stage_id:
            qs = qs.filter(stage_id=stage_id)
            if not qs.exists():
                # Check if this stage has a quiz_id in config
                from apps.live_sessions.models import Stage
                try:
                    stage = Stage.objects.get(pk=stage_id)
                    quiz_id = stage.config.get("quiz_id")
                    if quiz_id:
                        # Copy questions from the template Quiz to the session + stage
                        from .models import Quiz
                        import datetime
                        from django.utils import timezone
                        quiz = Quiz.objects.get(pk=quiz_id)
                        base_time = timezone.now()
                        for idx, template_q in enumerate(quiz.questions.all().order_by("created_at")):
                            created_time = base_time + datetime.timedelta(seconds=idx)
                            q = QuizQuestion.objects.create(
                                session_id=session_id,
                                stage_id=stage_id,
                                text=template_q.text,
                                question_type=template_q.question_type,
                                options=template_q.options,
                                correct_answer=template_q.correct_answer,
                                explanation=template_q.explanation,
                                difficulty=template_q.difficulty,
                                duration_seconds=template_q.duration_seconds,
                            )
                            QuizQuestion.objects.filter(pk=q.pk).update(created_at=created_time)
                        # Re-fetch queryset
                        qs = QuizQuestion.objects.filter(session_id=session_id, stage_id=stage_id)
                except Exception:
                    pass
        return qs

    def perform_create(self, serializer):
        stage_id = self.request.query_params.get("stage_id")
        serializer.save(session_id=self.kwargs["session_id"], stage_id=stage_id)


class LeaderboardView(APIView):
    """GET /api/v1/gamification/sessions/<id>/leaderboard/ — RF-GAME-02"""
    permission_classes = [IsParticipantOrInstructor]

    def get(self, request, session_id):
        from apps.live_sessions.models import Participant
        participants = Participant.objects.filter(
            session_id=session_id, points__gt=0
        ).order_by("-points")

        data = [
            {"display_name": p.display_name, "points": p.points, "rank": i + 1}
            for i, p in enumerate(participants)
        ]
        return Response({"leaderboard": data})


class PointEventListView(generics.ListAPIView):
    """GET /api/v1/gamification/sessions/<id>/points/ — Points history"""
    serializer_class = PointEventSerializer
    permission_classes = [IsInstructor]

    def get_queryset(self):
        return PointEvent.objects.filter(session_id=self.kwargs["session_id"]).select_related("participant")


class QuizQuestionBatchSyncView(APIView):
    """
    POST /api/v1/gamification/sessions/<session_id>/questions/sync/
    Synchronizes the entire list of questions for a session/stage.
    Keeps the drag-and-drop order by updating the created_at timestamp sequentially.
    """
    permission_classes = [IsInstructor]

    @transaction.atomic
    def post(self, request, session_id):
        import uuid
        import datetime
        from django.utils import timezone
        from apps.live_sessions.models import LiveSession

        try:
            session = LiveSession.objects.get(pk=session_id)
        except LiveSession.DoesNotExist:
            return Response({"error": "Sesión no encontrada"}, status=status.HTTP_404_NOT_FOUND)

        questions_data = request.data.get("questions", [])
        stage_id = request.data.get("stage_id") or request.query_params.get("stage_id")
        if not isinstance(questions_data, list):
            return Response({"error": "El campo 'questions' debe ser una lista"}, status=status.HTTP_400_BAD_REQUEST)

        keep_ids = []
        base_time = timezone.now()

        for idx, q in enumerate(questions_data):
            q_id = q.get("id")
            text = q.get("question_text", "").strip()
            options = q.get("options", [])
            duration = q.get("duration_seconds", 30)

            # Skip completely empty questions
            if not text and not options:
                continue

            # Format options for the database: [{"text": "...", "is_correct": bool}]
            db_options = []
            correct_answer = ""
            for o_idx, o in enumerate(options):
                text_opt = o.get("text", "").strip()
                is_corr = o.get("is_correct", False)
                db_options.append({
                    "text": text_opt,
                    "is_correct": is_corr
                })
                if is_corr:
                    correct_answer = str(o_idx)

            # Sequential created_at to maintain drag & drop order in DB queries
            created_time = base_time + datetime.timedelta(seconds=idx)

            question = None
            is_valid_uuid = False
            if q_id:
                try:
                    uuid.UUID(str(q_id))
                    is_valid_uuid = True
                except ValueError:
                    pass

            if is_valid_uuid:
                try:
                    question_qs = QuizQuestion.objects.filter(pk=q_id, session=session)
                    if stage_id:
                        question_qs = question_qs.filter(stage_id=stage_id)
                    else:
                        question_qs = question_qs.filter(stage__isnull=True)
                    
                    question = question_qs.get()
                    question.text = text
                    question.options = db_options
                    question.correct_answer = correct_answer
                    question.duration_seconds = duration
                    question.save()
                    # Force updated ordering in DB
                    QuizQuestion.objects.filter(pk=question.pk).update(created_at=created_time)
                except QuizQuestion.DoesNotExist:
                    pass

            if not question:
                question = QuizQuestion.objects.create(
                    session=session,
                    stage_id=stage_id,
                    text=text,
                    options=db_options,
                    correct_answer=correct_answer,
                    duration_seconds=duration,
                )
                QuizQuestion.objects.filter(pk=question.pk).update(created_at=created_time)

            keep_ids.append(question.pk)

        # Clean up deleted questions for this stage/session
        cleanup_qs = QuizQuestion.objects.filter(session=session)
        if stage_id:
            cleanup_qs = cleanup_qs.filter(stage_id=stage_id)
        else:
            cleanup_qs = cleanup_qs.filter(stage__isnull=True)
        
        cleanup_qs.exclude(pk__in=keep_ids).delete()

        # Serialize and return updated list
        synced_questions = QuizQuestion.objects.filter(session=session)
        if stage_id:
            synced_questions = synced_questions.filter(stage_id=stage_id)
        else:
            synced_questions = synced_questions.filter(stage__isnull=True)
            
        serializer = QuizQuestionSerializer(synced_questions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

