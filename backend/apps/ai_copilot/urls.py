"""AI Copilot URL patterns"""
from django.urls import path
from .views import AIGenerationLogListView

urlpatterns = [
    path("sessions/<uuid:session_id>/logs/", AIGenerationLogListView.as_view(), name="ai-logs"),
]
