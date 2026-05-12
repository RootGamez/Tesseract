"""Board serializers"""
from rest_framework import serializers
from .models import BoardSnapshot, BoardCollaborator


class BoardSnapshotSerializer(serializers.ModelSerializer):
    stage_title = serializers.CharField(source="stage.title", read_only=True)

    class Meta:
        model = BoardSnapshot
        fields = ["id", "session", "stage", "stage_title", "elements", "app_state", "created_at"]
        read_only_fields = ["id", "created_at"]


class BoardCollaboratorSerializer(serializers.ModelSerializer):
    participant_name = serializers.CharField(source="participant.display_name", read_only=True)

    class Meta:
        model = BoardCollaborator
        fields = ["id", "participant", "participant_name", "cursor_color", "is_active", "granted_at"]
        read_only_fields = ["id", "granted_at"]
