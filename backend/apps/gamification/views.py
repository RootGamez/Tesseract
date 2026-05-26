"""Gamification views"""
from django.db import transaction
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from core.permissions import IsInstructor, IsParticipantOrInstructor
from .models import QuizQuestion, PointEvent, Timer
from .serializers import (
    QuizQuestionSerializer, PointEventSerializer,
    TimerSerializer, LeaderboardEntrySerializer,
)



class QuizQuestionListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/gamification/sessions/<id>/questions/"""
    serializer_class = QuizQuestionSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsInstructor()]
        return [IsParticipantOrInstructor()]

    def get_queryset(self):
        return QuizQuestion.objects.filter(session_id=self.kwargs["session_id"])

    def perform_create(self, serializer):
        serializer.save(session_id=self.kwargs["session_id"])


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
    Synchronizes the entire list of questions for a session.
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
                    question = QuizQuestion.objects.get(pk=q_id, session=session)
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
                    text=text,
                    options=db_options,
                    correct_answer=correct_answer,
                    duration_seconds=duration,
                )
                QuizQuestion.objects.filter(pk=question.pk).update(created_at=created_time)

            keep_ids.append(question.pk)

        # Clean up deleted questions
        QuizQuestion.objects.filter(session=session).exclude(pk__in=keep_ids).delete()

        # Serialize and return updated list
        synced_questions = QuizQuestion.objects.filter(session=session)
        serializer = QuizQuestionSerializer(synced_questions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

