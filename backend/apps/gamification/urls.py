"""Gamification URL patterns"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    QuizQuestionListCreateView, LeaderboardView, PointEventListView,
    QuizQuestionBatchSyncView, QuizViewSet
)

router = DefaultRouter()
router.register(r"quizzes", QuizViewSet, basename="quizzes")

urlpatterns = [
    path("", include(router.urls)),
    path("sessions/<uuid:session_id>/questions/", QuizQuestionListCreateView.as_view(), name="quiz-questions"),
    path("sessions/<uuid:session_id>/questions/sync/", QuizQuestionBatchSyncView.as_view(), name="quiz-questions-sync"),
    path("sessions/<uuid:session_id>/leaderboard/", LeaderboardView.as_view(), name="leaderboard"),
    path("sessions/<uuid:session_id>/points/", PointEventListView.as_view(), name="point-events"),
]
