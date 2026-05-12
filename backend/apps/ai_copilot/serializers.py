"""AI Copilot serializers"""
from rest_framework import serializers
from .models import AIGenerationLog


class AIGenerationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIGenerationLog
        fields = [
            "id", "session", "task_type", "output", "model_used",
            "duration_ms", "is_success", "created_at"
        ]
        read_only_fields = ["id", "created_at"]
