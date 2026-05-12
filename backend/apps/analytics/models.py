"""
Analytics app — Models
RF-ANA-01: Async replay
RF-ANA-02: Dashboard
RF-ANA-03: Session history
"""
from django.db import models
from core.models import BaseModel


class StageMetric(BaseModel):
    """
    Per-stage performance metrics recorded after a stage ends.
    RF-ANA-02: Used in instructor analytics dashboard.
    """

    session = models.ForeignKey(
        "live_sessions.LiveSession",
        on_delete=models.CASCADE,
        related_name="stage_metrics",
    )
    stage = models.ForeignKey(
        "live_sessions.Stage",
        on_delete=models.SET_NULL,
        null=True,
        related_name="metrics",
    )
    # Time tracking
    time_spent_seconds = models.PositiveIntegerField(default=0)
    estimated_seconds = models.PositiveIntegerField(default=0)
    # Participation
    participants_online = models.PositiveIntegerField(default=0)
    quiz_response_rate = models.FloatField(default=0.0)  # 0.0-1.0
    quiz_accuracy_rate = models.FloatField(default=0.0)
    # Reactions
    emoji_counts = models.JSONField(default=dict)  # {"👍": 5, "😕": 2}
    total_chat_messages = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Métrica de etapa"
        unique_together = [("session", "stage")]
        ordering = ["created_at"]


class SessionSummaryMetric(BaseModel):
    """
    Aggregated session-level metrics (RF-ANA-02, RF-ANA-03).
    """

    session = models.OneToOneField(
        "live_sessions.LiveSession",
        on_delete=models.CASCADE,
        related_name="summary_metric",
    )
    total_participants = models.PositiveIntegerField(default=0)
    peak_concurrent = models.PositiveIntegerField(default=0)
    total_chat_messages = models.PositiveIntegerField(default=0)
    total_quizzes = models.PositiveIntegerField(default=0)
    avg_quiz_accuracy = models.FloatField(default=0.0)
    total_points_awarded = models.PositiveIntegerField(default=0)
    top_emojis = models.JSONField(default=list)  # [{"emoji": "👍", "count": 10}]
    # Points distribution
    points_distribution = models.JSONField(default=dict)

    class Meta:
        verbose_name = "Métricas de sesión"
