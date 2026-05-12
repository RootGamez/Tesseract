"""Resources serializers"""
from rest_framework import serializers
from .models import Resource, Snippet


class ResourceSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.display_name", read_only=True)
    presigned_url = serializers.SerializerMethodField()

    class Meta:
        model = Resource
        fields = [
            "id", "session", "stage", "uploaded_by", "uploaded_by_name",
            "name", "resource_type", "size_bytes", "presigned_url", "is_uploaded", "created_at"
        ]
        read_only_fields = ["id", "uploaded_by", "size_bytes", "is_uploaded", "created_at"]

    def get_presigned_url(self, obj):
        if not obj.is_uploaded:
            return None
        from apps.resources.storage import get_or_refresh_presigned_url
        return get_or_refresh_presigned_url(obj)


class ResourceUploadSerializer(serializers.Serializer):
    """Handles the actual file upload endpoint."""
    file = serializers.FileField()
    stage_id = serializers.UUIDField(required=False)
    resource_type = serializers.ChoiceField(choices=Resource.ResourceType.choices)


class SnippetSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True)

    class Meta:
        model = Snippet
        fields = ["id", "session", "stage", "created_by", "created_by_name", "title", "language", "content", "created_at"]
        read_only_fields = ["id", "created_by", "created_at"]
