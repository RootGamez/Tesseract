"""Chat URL patterns"""
from django.urls import path
from .views import ChatHistoryView

urlpatterns = [
    path("sessions/<uuid:session_id>/messages/", ChatHistoryView.as_view(), name="chat-history"),
]
