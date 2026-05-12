"""
Chat app — Models
RF-CHAT-01: Real-time chat messages
RF-CHAT-02: Floating notifications
RF-CHAT-03: Moderation
"""
from django.db import models
from django.conf import settings
from core.models import BaseModel


class ChatMessage(BaseModel):
    """
    Chat message within a live session.
    RF-CHAT-01: Real-time via WebSocket.
    RF-CHAT-02: is_floating flag for bubble notifications.
    RF-CHAT-03: is_deleted for moderation.
    """

    session = models.ForeignKey(
        "sessions.LiveSession",
        on_delete=models.CASCADE,
        related_name="chat_messages",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="chat_messages",
    )
    author_display_name = models.CharField(max_length=150)  # Snapshot of name at message time
    text = models.TextField(max_length=2000)
    # RF-CHAT-02: Floating bubble notification
    is_floating = models.BooleanField(default=False)
    # System messages (participant joined, etc.)
    is_system = models.BooleanField(default=False)
    # RF-CHAT-03: Soft delete for moderation
    is_deleted = models.BooleanField(default=False)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_messages",
    )
    deleted_at = models.DateTimeField(null=True, blank=True)
    # Threading (reply to)
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="replies",
    )
    # Mention metadata
    mentions = models.JSONField(default=list, blank=True)

    class Meta:
        verbose_name = "Mensaje de chat"
        verbose_name_plural = "Mensajes de chat"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.author_display_name}: {self.text[:60]}"
