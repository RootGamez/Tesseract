from rest_framework import serializers

from .models import Presentation, PresentationSlide, PresentationAnnotation


class PresentationSlideSerializer(serializers.ModelSerializer):
    # Presigned URL so the browser can load the slide image from private storage.
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = PresentationSlide
        fields = [
            "id",
            "index",
            "image_key",
            "image_url",
            "thumbnail_key",
            "mime_type",
            "width",
            "height",
            "render_metadata",
        ]

    def get_image_url(self, obj):
        if not obj.image_key:
            return None
        from apps.resources.storage import generate_presigned_url
        return generate_presigned_url(obj.image_key)


class PresentationAnnotationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PresentationAnnotation
        fields = ["id", "slide", "revision", "canvas_state", "updated_at", "created_at"]


class PresentationSerializer(serializers.ModelSerializer):
    slides = PresentationSlideSerializer(many=True, read_only=True)
    annotations = PresentationAnnotationSerializer(many=True, read_only=True)

    class Meta:
        model = Presentation
        fields = [
            "id",
            "session",
            "title",
            "source_file_key",
            "status",
            "total_slides",
            "current_slide_index",
            "active_canvas_state",
            "slides",
            "annotations",
            "created_at",
            "updated_at",
        ]
