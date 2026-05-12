"""AI Copilot views"""
from rest_framework import generics
from core.permissions import IsInstructor
from .models import AIGenerationLog
from .serializers import AIGenerationLogSerializer


class AIGenerationLogListView(generics.ListAPIView):
    """GET /api/v1/ai/sessions/<id>/logs/ — AI generation history"""
    serializer_class = AIGenerationLogSerializer
    permission_classes = [IsInstructor]

    def get_queryset(self):
        return AIGenerationLog.objects.filter(session_id=self.kwargs["session_id"])
