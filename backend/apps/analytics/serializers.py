"""Analytics serializers"""
from rest_framework import serializers
from .models import StageMetric, SessionSummaryMetric


class StageMetricSerializer(serializers.ModelSerializer):
    stage_title = serializers.CharField(source="stage.title", read_only=True)
    stage_type = serializers.CharField(source="stage.stage_type", read_only=True)

    class Meta:
        model = StageMetric
        fields = [
            "id", "stage_title", "stage_type",
            "time_spent_seconds", "estimated_seconds",
            "participants_online", "quiz_response_rate", "quiz_accuracy_rate",
            "emoji_counts", "total_chat_messages",
        ]


class SessionSummaryMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = SessionSummaryMetric
        fields = "__all__"


class SessionReplaySerializer(serializers.Serializer):
    """Placeholder for replay schema documentation."""
    session_id = serializers.UUIDField()
