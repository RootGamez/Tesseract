"""
Chat WebSocket Consumer
RF-CHAT-01: Real-time chat messages
RF-CHAT-02: Floating cloud notifications
RF-CHAT-03: Chat moderation
"""
import json
import structlog
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from core.websocket_events import CHAT_MESSAGE, CHAT_MESSAGE_DELETED, CHAT_USER_SILENCED, WS_ERROR
from core.throttling import WebSocketMessageThrottle

logger = structlog.get_logger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for session chat.
    URL: ws://host/ws/chat/<session_id>/
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.session_id = None
        self.chat_group = None
        self.throttle = WebSocketMessageThrottle()

    async def connect(self):
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.chat_group = f"chat_{self.session_id}"
        self.user = user

        await self.channel_layer.group_add(self.chat_group, self.channel_name)
        await self.accept()

        # Send recent message history on reconnect
        await self._send_history()

    async def disconnect(self, close_code):
        if self.chat_group:
            await self.channel_layer.group_discard(self.chat_group, self.channel_name)

    async def receive(self, text_data):
        if not self.throttle.is_allowed():
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        event_type = data.get("event")
        payload = data.get("payload", {})

        if event_type == CHAT_MESSAGE:
            await self._handle_send_message(payload)

        elif event_type == CHAT_MESSAGE_DELETED:
            # Instructor only
            if await self._is_instructor():
                await self._handle_delete_message(payload)

        elif event_type == CHAT_USER_SILENCED:
            if await self._is_instructor():
                await self._handle_silence_user(payload)

    async def _handle_send_message(self, payload):
        """Save and broadcast a chat message."""
        # Check if user is muted (RF-CHAT-03)
        is_muted = await self._check_muted()
        if is_muted:
            await self.send(text_data=json.dumps({
                "event": WS_ERROR,
                "payload": {"message": "Estás silenciado en este chat."},
            }))
            return

        # Check solo-instructor mode (RF-CHAT-03)
        only_instructor = await self._is_solo_instructor_mode()
        if only_instructor and not await self._is_instructor():
            await self.send(text_data=json.dumps({
                "event": WS_ERROR,
                "payload": {"message": "Solo el instructor puede escribir en este momento."},
            }))
            return

        text = payload.get("text", "").strip()
        if not text or len(text) > 2000:
            return

        is_floating = payload.get("is_floating", False)
        message = await self._save_message(text, is_floating)

        await self.channel_layer.group_send(
            self.chat_group,
            {
                "type": "chat.message",
                "event": CHAT_MESSAGE,
                "payload": {
                    "id": str(message.pk),
                    "author_id": str(self.user.pk),
                    "author": self.user.display_name,
                    "text": text,
                    "timestamp": message.created_at.isoformat(),
                    "float": is_floating,
                    "mentions": payload.get("mentions", []),
                },
            },
        )

    async def _handle_delete_message(self, payload):
        message_id = payload.get("message_id")
        deleted = await self._soft_delete_message(message_id)
        if deleted:
            await self.channel_layer.group_send(
                self.chat_group,
                {
                    "type": "chat.message_deleted",
                    "event": CHAT_MESSAGE_DELETED,
                    "payload": {"message_id": message_id},
                },
            )

    async def _handle_silence_user(self, payload):
        participant_id = payload.get("participant_id")
        silenced = await self._silence_participant(participant_id)
        if silenced:
            await self.channel_layer.group_send(
                self.chat_group,
                {
                    "type": "chat.user_silenced",
                    "event": CHAT_USER_SILENCED,
                    "payload": {"participant_id": participant_id},
                },
            )

    # ── Group message handlers ─────────────────────────────────────────────────

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def chat_message_deleted(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def chat_user_silenced(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    # ── Helpers ────────────────────────────────────────────────────────────────

    @database_sync_to_async
    def _save_message(self, text: str, is_floating: bool):
        from apps.chat.models import ChatMessage
        return ChatMessage.objects.create(
            session_id=self.session_id,
            author=self.user,
            author_display_name=self.user.display_name,
            text=text,
            is_floating=is_floating,
        )

    @database_sync_to_async
    def _soft_delete_message(self, message_id: str) -> bool:
        from apps.chat.models import ChatMessage
        try:
            msg = ChatMessage.objects.get(pk=message_id, session_id=self.session_id)
            msg.is_deleted = True
            msg.deleted_by = self.user
            msg.deleted_at = timezone.now()
            msg.save(update_fields=["is_deleted", "deleted_by", "deleted_at"])
            return True
        except ChatMessage.DoesNotExist:
            return False

    @database_sync_to_async
    def _silence_participant(self, participant_id: str) -> bool:
        from apps.sessions.models import Participant
        try:
            p = Participant.objects.get(pk=participant_id, session_id=self.session_id)
            p.is_chat_muted = not p.is_chat_muted
            p.save(update_fields=["is_chat_muted"])
            return True
        except Participant.DoesNotExist:
            return False

    @database_sync_to_async
    def _check_muted(self) -> bool:
        from apps.sessions.models import Participant
        try:
            p = Participant.objects.get(session_id=self.session_id, user=self.user)
            return p.is_chat_muted
        except Participant.DoesNotExist:
            return False

    @database_sync_to_async
    def _is_instructor(self) -> bool:
        from apps.sessions.models import LiveSession
        return LiveSession.objects.filter(pk=self.session_id, instructor=self.user).exists()

    @database_sync_to_async
    def _is_solo_instructor_mode(self) -> bool:
        from apps.sessions.models import LiveSession
        try:
            session = LiveSession.objects.get(pk=self.session_id)
            return session.template and session.template.stages.filter(
                stage_type="CHAT_FOCUS"
            ).exists()
        except Exception:
            return False

    async def _send_history(self):
        """Send last 50 messages on connect (for late joiners/reconnect)."""
        messages = await self._get_recent_messages()
        await self.send(text_data=json.dumps({
            "event": "CHAT_HISTORY",
            "payload": {"messages": messages},
        }, default=str))

    @database_sync_to_async
    def _get_recent_messages(self) -> list:
        from apps.chat.models import ChatMessage
        msgs = ChatMessage.objects.filter(
            session_id=self.session_id,
            is_deleted=False,
        ).select_related("author").order_by("-created_at")[:50]
        return [
            {
                "id": str(m.pk),
                "author": m.author_display_name,
                "text": m.text,
                "timestamp": m.created_at.isoformat(),
                "float": m.is_floating,
            }
            for m in reversed(list(msgs))
        ]
