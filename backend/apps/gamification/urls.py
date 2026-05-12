"""Gamification URL patterns"""
from django.urls import path
from .views import QuizQuestionListCreateView, LeaderboardView, PointEventListView

urlpatterns = [
    path("sessions/<uuid:session_id>/questions/", QuizQuestionListCreateView.as_view(), name="quiz-questions"),
    path("sessions/<uuid:session_id>/leaderboard/", LeaderboardView.as_view(), name="leaderboard"),
    path("sessions/<uuid:session_id>/points/", PointEventListView.as_view(), name="point-events"),
]
