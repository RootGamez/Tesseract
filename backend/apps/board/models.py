"""
Board app — Models
RF-BOARD-01: Excalidraw sync
RF-BOARD-02: BoardSnapshot persistence per stage
RF-BOARD-04: Collaborative permissions per participant
"""
from django.db import models
from django.conf import settings
from core.models import BaseModel


class BoardSnapshot(BaseModel):
    """
    Serialized Excalidraw state saved at the end of each stage.
    RF-BOARD-02: Persisted in PostgreSQL JSONField.
    RF-ANA-01: Used for async replay post-class.
    """

    session = models.ForeignKey(
        "sessions.LiveSession",
        on_delete=models.CASCADE,
        related_name="board_snapshots",
    )
    stage = models.ForeignKey(
        "sessions.Stage",
        on_delete=models.SET_NULL,
        null=True,
        related_name="board_snapshots",
    )
    # Excalidraw JSON state
    elements = models.JSONField(default=list)
    app_state = models.JSONField(default=dict)
    # S3/MinIO backup URL (for large canvases)
    s3_key = models.CharField(max_length=500, blank=True)

    class Meta:
        verbose_name = "Snapshot de pizarra"
        verbose_name_plural = "Snapshots de pizarra"
        unique_together = [("session", "stage")]
        ordering = ["created_at"]

    def __str__(self):
        stage_title = self.stage.title if self.stage else "—"
        return f"Snapshot: {self.session.title} / {stage_title}"


class BoardCollaborator(BaseModel):
    """
    Tracks which participants have been granted write access to the board.
    RF-BOARD-04: Instructor grants/revokes draw permissions per student.
    """

    session = models.ForeignKey(
        "sessions.LiveSession",
        on_delete=models.CASCADE,
        related_name="board_collaborators",
    )
    participant = models.ForeignKey(
        "sessions.Participant",
        on_delete=models.CASCADE,
        related_name="board_permissions",
    )
    # Assigned cursor color for multi-cursor display
    cursor_color = models.CharField(max_length=7, default="#FF5733")
    is_active = models.BooleanField(default=True)
    granted_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Colaborador de pizarra"
        unique_together = [("session", "participant")]
