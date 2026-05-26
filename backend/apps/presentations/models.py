"""
Presentations app — models for collaborative slide decks.
"""
from django.db import models
from django.conf import settings

from core.models import BaseModel


class Presentation(BaseModel):
    class Status(models.TextChoices):
        UPLOADED = "UPLOADED", "Subida"
        PROCESSING = "PROCESSING", "Procesando"
        READY = "READY", "Lista"
        FAILED = "FAILED", "Fallida"

    session = models.ForeignKey(
        "live_sessions.LiveSession",
        on_delete=models.CASCADE,
        related_name="presentations",
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_presentations",
    )
    title = models.CharField(max_length=255)
    source_file_key = models.CharField(max_length=1000)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UPLOADED, db_index=True)
    total_slides = models.PositiveIntegerField(default=0)
    current_slide_index = models.PositiveIntegerField(default=0)
    active_canvas_state = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Presentación"
        verbose_name_plural = "Presentaciones"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} — {self.session.title}"


class PresentationSlide(BaseModel):
    presentation = models.ForeignKey(
        Presentation,
        on_delete=models.CASCADE,
        related_name="slides",
    )
    index = models.PositiveIntegerField()
    image_key = models.CharField(max_length=1000)
    thumbnail_key = models.CharField(max_length=1000, blank=True)
    mime_type = models.CharField(max_length=100, default="image/png")
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    render_metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Diapositiva"
        verbose_name_plural = "Diapositivas"
        ordering = ["index"]
        unique_together = [("presentation", "index")]

    def __str__(self):
        return f"Slide {self.index + 1} — {self.presentation.title}"


class PresentationAnnotation(BaseModel):
    presentation = models.ForeignKey(
        Presentation,
        on_delete=models.CASCADE,
        related_name="annotations",
    )
    slide = models.ForeignKey(
        PresentationSlide,
        on_delete=models.CASCADE,
        related_name="annotations",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="presentation_annotations",
    )
    revision = models.PositiveIntegerField(default=1)
    canvas_state = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Anotación"
        verbose_name_plural = "Anotaciones"
        ordering = ["-updated_at"]
        unique_together = [("presentation", "slide")]

    def __str__(self):
        return f"Anotación {self.presentation.title} / slide {self.slide.index + 1}"
