"""Gamification serializers"""
from rest_framework import serializers
from apps.authentication.serializers import UserPublicSerializer
from .models import QuizQuestion, QuizResponse, PointEvent, Timer


class QuizQuestionSerializer(serializers.ModelSerializer):
    response_count = serializers.IntegerField(source="responses.count", read_only=True)

    class Meta:
        model = QuizQuestion
        fields = [
            "id", "session", "stage", "text", "question_type", "options",
            "correct_answer", "explanation", "difficulty", "duration_seconds",
            "is_launched", "launched_at", "closed_at", "generated_by_ai",
            "ai_model_used", "response_count",
        ]
        read_only_fields = ["id", "generated_by_ai", "ai_model_used", "is_launched", "launched_at", "closed_at"]
        extra_kwargs = {"correct_answer": {"write_only": True}}  # Hide from students


class QuizResponseSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizResponse
        fields = ["id", "question", "participant", "answer", "is_correct", "answered_at"]
        read_only_fields = ["id", "is_correct", "answered_at"]


class PointEventSerializer(serializers.ModelSerializer):
    participant_name = serializers.CharField(source="participant.display_name", read_only=True)

    class Meta:
        model = PointEvent
        fields = ["id", "session", "participant", "participant_name", "points", "action_label", "awarded_by", "created_at"]
        read_only_fields = ["id", "created_at"]


class TimerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Timer
        fields = ["id", "session", "label", "duration_seconds", "end_timestamp_utc", "state"]
        read_only_fields = ["id", "end_timestamp_utc"]


class LeaderboardEntrySerializer(serializers.Serializer):
    display_name = serializers.CharField()
    points = serializers.IntegerField()
    rank = serializers.IntegerField()
