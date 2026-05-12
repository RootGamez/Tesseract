"""Chat serializers"""
from rest_framework import serializers
from .models import ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author_display_name", read_only=True)

    class Meta:
        model = ChatMessage
        fields = [
            "id", "session", "author", "author_name", "text",
            "is_floating", "is_system", "is_deleted", "parent",
            "mentions", "created_at",
        ]
        read_only_fields = ["id", "author", "is_system", "created_at"]
