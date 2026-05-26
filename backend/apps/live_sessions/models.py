"""
Sessions app — Models
RF-SESSION-01: ClassTemplate y Stage con CRUD completo
RF-SESSION-02: LiveSession con máquina de estados
RF-SESSION-03: Modo dry-run
RF-SESSION-04: Panel Director de Orquesta (datos)
"""
import random
import string
from django.db import models
from django.conf import settings
from django.utils import timezone

from core.models import BaseModel


# ── Stage types (RF-SESSION-01) ───────────────────────────────────────────────

class StageType(models.TextChoices):
    BOARD = "BOARD", "Pizarra"
    PDF = "PDF", "PDF"
    PRESENTATION = "PRESENTATION", "Presentación colaborativa"
    VIDEO = "VIDEO", "Video"
    QUIZ = "QUIZ", "Quiz / Encuesta"
    CHAT_FOCUS = "CHAT_FOCUS", "Chat enfocado"
    GAME = "GAME", "Juego (Ruleta / Timer)"
    RESOURCE = "RESOURCE", "Nube de recursos"
    BREAK = "BREAK", "Descanso"


# ── Session states (RF-SESSION-02) ───────────────────────────────────────────

class SessionState(models.TextChoices):
    SCHEDULED = "SCHEDULED", "Programada"
    LIVE = "LIVE", "En vivo"
    PAUSED = "PAUSED", "Pausada"
    ENDED = "ENDED", "Finalizada"


# ── Class Template ────────────────────────────────────────────────────────────

class ClassTemplate(BaseModel):
    """
    Reusable class template with ordered stages.
    RF-SESSION-01: Create, clone, edit, delete templates.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="templates",
        limit_choices_to={"role__in": ["INSTRUCTOR", "ADMIN"]},
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_public = models.BooleanField(default=False)
    estimated_duration_minutes = models.PositiveIntegerField(default=60)
    tags = models.JSONField(default=list, blank=True)
    # Pre-filled board content for BOARD stages (RF-BOARD-05)
    thumbnail = models.ImageField(upload_to="templates/thumbnails/", blank=True, null=True)

    class Meta:
        verbose_name = "Plantilla de clase"
        verbose_name_plural = "Plantillas de clase"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.owner.display_name})"

    def clone(self, new_owner=None):
        """Create a deep copy of this template with all its stages."""
        owner = new_owner or self.owner
        new_template = ClassTemplate.objects.create(
            owner=owner,
            title=f"Copia de {self.title}",
            description=self.description,
            estimated_duration_minutes=self.estimated_duration_minutes,
            tags=self.tags,
        )
        for stage in self.stages.all():
            Stage.objects.create(
                template=new_template,
                title=stage.title,
                stage_type=stage.stage_type,
                order=stage.order,
                duration_estimated_minutes=stage.duration_estimated_minutes,
                config=stage.config,
                initial_board_state=stage.initial_board_state,
            )
        return new_template


# ── Stage ──────────────────────────────────────────────────────────────────────

class Stage(BaseModel):
    """
    Minimum unit of a class template or live session.
    RF-SESSION-01: Each stage has type, order, and own config.
    RF-BOARD-05: BOARD stages can have pre-filled content.
    """

    template = models.ForeignKey(
        ClassTemplate,
        on_delete=models.CASCADE,
        related_name="stages",
    )
    title = models.CharField(max_length=255)
    stage_type = models.CharField(max_length=20, choices=StageType.choices, db_index=True)
    order = models.PositiveIntegerField(default=0)
    duration_estimated_minutes = models.PositiveIntegerField(default=10)
    # Flexible JSON config per stage type
    # BOARD: {"background": "#fff"}, PDF: {"pdf_resource_id": "..."}, etc.
    config = models.JSONField(default=dict, blank=True)
    # Pre-filled Excalidraw state for BOARD stages (RF-BOARD-05)
    initial_board_state = models.JSONField(null=True, blank=True)

    class Meta:
        verbose_name = "Etapa"
        verbose_name_plural = "Etapas"
        ordering = ["order"]
        unique_together = [("template", "order")]

    def __str__(self):
        return f"{self.title} [{self.stage_type}] — {self.template.title}"


# ── Live Session ───────────────────────────────────────────────────────────────

def _generate_join_code() -> str:
    """Generate a 6-digit numeric join code (RF-AUTH-02)."""
    chars = "0123456789"
    length = 6
    return "".join(random.choices(chars, k=length))


class LiveSession(BaseModel):
    """
    Active instance of a ClassTemplate.
    RF-SESSION-02: States SCHEDULED → LIVE → PAUSED → ENDED.
    RF-SESSION-03: dry_run mode.
    RF-AUTH-02: 6-char join code for students.
    """

    template = models.ForeignKey(
        ClassTemplate,
        on_delete=models.SET_NULL,
        null=True,
        related_name="live_sessions",
    )
    instructor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="instructed_sessions",
    )
    title = models.CharField(max_length=255)
    join_code = models.CharField(
        max_length=6,
        unique=True,
        default=_generate_join_code,
        db_index=True,
    )
    state = models.CharField(
        max_length=20,
        choices=SessionState.choices,
        default=SessionState.SCHEDULED,
        db_index=True,
    )
    current_stage = models.ForeignKey(
        Stage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    # RF-SESSION-03: dry-run mode
    is_dry_run = models.BooleanField(default=False)
    # Timestamps
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    # AI summary (RF-AI-02)
    ai_summary = models.TextField(blank=True)
    # Visibility for replay (RF-ANA-01)
    is_replay_public = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Sesión en vivo"
        verbose_name_plural = "Sesiones en vivo"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} [{self.state}] — {self.join_code}"

    @property
    def is_live(self):
        return self.state == SessionState.LIVE

    @property
    def is_ended(self):
        return self.state == SessionState.ENDED

    @property
    def duration_seconds(self):
        if self.started_at and self.ended_at:
            return (self.ended_at - self.started_at).total_seconds()
        return None


# ── Participant ────────────────────────────────────────────────────────────────

class Participant(BaseModel):
    """
    Relation between a User and a LiveSession.
    Tracks points for gamification leaderboard (RF-GAME-02).
    Supports guest access (RF-AUTH-02).
    """

    class ConnectionStatus(models.TextChoices):
        ONLINE = "ONLINE", "Conectado"
        OFFLINE = "OFFLINE", "Desconectado"
        RECONNECTING = "RECONNECTING", "Reconectando"

    session = models.ForeignKey(
        LiveSession,
        on_delete=models.CASCADE,
        related_name="participants",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="participations",
    )
    # Guest access (RF-AUTH-02)
    is_guest = models.BooleanField(default=False)
    display_name = models.CharField(max_length=150)
    # Gamification (RF-GAME-02)
    points = models.IntegerField(default=0)
    # Board collaboration permissions (RF-BOARD-04)
    can_draw = models.BooleanField(default=False)
    # Connection tracking (RF-SESSION-04)
    connection_status = models.CharField(
        max_length=20,
        choices=ConnectionStatus.choices,
        default=ConnectionStatus.OFFLINE,
    )
    connected_at = models.DateTimeField(null=True, blank=True)
    disconnected_at = models.DateTimeField(null=True, blank=True)
    # Moderación (RF-CHAT-03)
    is_chat_muted = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Participante"
        verbose_name_plural = "Participantes"
        unique_together = [("session", "user")]
        ordering = ["-points"]

    def __str__(self):
        return f"{self.display_name} → {self.session.title}"
