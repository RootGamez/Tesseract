"""
AI Copilot — Models
RF-AI-01: Question generation log
RF-AI-02: Session summary
RF-AI-03: Live hints
"""
from django.db import models
from core.models import BaseModel


class AIGenerationLog(BaseModel):
    """
    Log of every AI generation request for audit and cost tracking.
    """

    class TaskType(models.TextChoices):
        QUESTIONS = "QUESTIONS", "Generación de preguntas"
        SUMMARY = "SUMMARY", "Resumen de sesión"
        LIVE_HINT = "LIVE_HINT", "Sugerencia en vivo"

    session = models.ForeignKey(
        "sessions.LiveSession",
        on_delete=models.CASCADE,
        related_name="ai_logs",
    )
    task_type = models.CharField(max_length=20, choices=TaskType.choices)
    input_hash = models.CharField(max_length=64, blank=True)  # SHA-256 of input text
    output = models.JSONField(null=True, blank=True)
    model_used = models.CharField(max_length=100, blank=True)
    prompt_tokens = models.PositiveIntegerField(default=0)
    completion_tokens = models.PositiveIntegerField(default=0)
    duration_ms = models.PositiveIntegerField(default=0)
    error = models.TextField(blank=True)
    is_success = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Log de generación IA"
        verbose_name_plural = "Logs de generación IA"
        ordering = ["-created_at"]
