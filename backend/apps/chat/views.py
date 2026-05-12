"""Chat views — history and moderation REST endpoints"""
from rest_framework import generics
from rest_framework.response import Response
from core.permissions import IsParticipantOrInstructor, IsInstructor
from .models import ChatMessage
from .serializers import ChatMessageSerializer


class ChatHistoryView(generics.ListAPIView):
    """GET /api/v1/chat/sessions/<id>/messages/ — Message history (RF-CHAT-01)"""
    serializer_class = ChatMessageSerializer
    permission_classes = [IsParticipantOrInstructor]

    def get_queryset(self):
        return ChatMessage.objects.filter(
            session_id=self.kwargs["session_id"],
            is_deleted=False,
        ).select_related("author").order_by("created_at")
