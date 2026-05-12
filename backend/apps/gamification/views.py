"""Gamification views"""
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
        from apps.sessions.models import Participant
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
