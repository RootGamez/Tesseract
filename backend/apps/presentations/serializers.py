from rest_framework import serializers

from .models import Presentation, PresentationSlide, PresentationAnnotation


class PresentationSlideSerializer(serializers.ModelSerializer):
    class Meta:
        model = PresentationSlide
        fields = [
            "id",
            "index",
            "image_key",
            "thumbnail_key",
            "mime_type",
            "width",
            "height",
            "render_metadata",
        ]


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
