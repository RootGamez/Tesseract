"""
Sessions WebSocket Consumer
Handles session-level events: state changes, stage changes, participant tracking.
RF-SESSION-02: SESSION_STATE broadcasts
RF-SESSION-04: Participant connection tracking
RNF-SEC-01: JWT authentication required
"""
import json
import structlog
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from core.websocket_events import (
    SESSION_STATE, STAGE_CHANGED, PARTICIPANT_JOINED, PARTICIPANT_LEFT,
    PARTICIPANT_STATUS, WS_ERROR, VIDEO_STATE,
)
from core.throttling import WebSocketMessageThrottle

logger = structlog.get_logger(__name__)


class SessionConsumer(AsyncWebsocketConsumer):
    """
    Main WebSocket consumer for a LiveSession room.
    URL: ws://host/ws/sessions/<session_id>/
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.session_id = None
        self.session_group = None
        self.participant = None
        self.throttle = WebSocketMessageThrottle()

    async def connect(self):
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.session_group = f"session_{self.session_id}"
        self.user = user

        # Validate user has access to this session
        session = await self._get_session()
        if not session:
            await self.close(code=4004)
            return

        self.participant = await self._get_or_create_participant(session)

        # Join Redis channel group
        await self.channel_layer.group_add(self.session_group, self.channel_name)
        await self.accept()

        # Mark as online and notify group
        await self._set_connection_status("ONLINE")
        is_instructor = str(session.instructor_id) == str(user.pk)
        if not is_instructor:
            await self.channel_layer.group_send(
                self.session_group,
                {
                    "type": "participant.joined",
                    "event": PARTICIPANT_JOINED,
                    "payload": {
                        "participant_id": str(self.participant.pk),
                        "display_name": self.participant.display_name,
                        "is_guest": self.participant.is_guest,
                    },
                },
            )

        # Send current session state to newly connected client
        await self.send_session_state(session)
        logger.info("ws_connected", session_id=self.session_id, user_id=str(user.pk))

    async def disconnect(self, close_code):
        if self.session_group:
            await self._set_connection_status("OFFLINE")
            await self.channel_layer.group_send(
                self.session_group,
                {
                    "type": "participant.left",
                    "event": PARTICIPANT_LEFT,
                    "payload": {
                        "participant_id": str(self.participant.pk) if self.participant else None,
                        "display_name": getattr(self.participant, "display_name", ""),
                    },
                },
            )
            await self.channel_layer.group_discard(self.session_group, self.channel_name)
        logger.info("ws_disconnected", session_id=self.session_id, code=close_code)

    async def receive(self, text_data):
        """Handle incoming messages from the WebSocket client."""
        if not self.throttle.is_allowed():
            await self.send(text_data=json.dumps({
                "event": WS_ERROR,
                "payload": {"message": "Rate limit exceeded."},
            }))
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        event_type = data.get("event")

        if event_type == "PING":
            await self.send(text_data=json.dumps({"event": "PONG"}))

        elif event_type == "VIDEO_STATE":
            # Sincronización de video: solo el instructor controla; el resto sigue.
            if not await self._is_instructor():
                return
            payload = data.get("payload", {})
            await self.channel_layer.group_send(
                self.session_group,
                {
                    "type": "video.state",
                    "event": VIDEO_STATE,
                    "payload": {
                        "stage_id": payload.get("stage_id", ""),
                        "video_id": payload.get("video_id", ""),
                        "status": payload.get("status", "paused"),
                        "time": float(payload.get("time", 0) or 0),
                        "rate": float(payload.get("rate", 1) or 1),
                        "ts": payload.get("ts", 0),
                    },
                    "sender_channel": self.channel_name,
                },
            )

    # ── Group message handlers ─────────────────────────────────────────────────

    async def session_state_changed(self, event):
        await self.send(text_data=json.dumps({
            "event": event["event"],
            "payload": event["payload"],
        }))

    async def session_stage_changed(self, event):
        await self.send(text_data=json.dumps({
            "event": event["event"],
            "payload": event["payload"],
        }))

    async def participant_joined(self, event):
        await self.send(text_data=json.dumps({
            "event": event["event"],
            "payload": event["payload"],
        }))

    async def participant_left(self, event):
        await self.send(text_data=json.dumps({
            "event": event["event"],
            "payload": event["payload"],
        }))

    async def video_state(self, event):
        # No reenviar al emisor (el instructor ya controla su propio reproductor).
        if event.get("sender_channel") != self.channel_name:
            await self.send(text_data=json.dumps({
                "event": event["event"],
                "payload": event["payload"],
            }))

    # ── Helpers ────────────────────────────────────────────────────────────────

    @database_sync_to_async
    def _is_instructor(self) -> bool:
        from apps.live_sessions.models import LiveSession
        try:
            session = LiveSession.objects.get(pk=self.session_id)
            return session.instructor_id == self.user.id
        except Exception:
            return False

    async def send_session_state(self, session):
        """Send complete current session state on connect (resync)."""
        from apps.live_sessions.serializers import LiveSessionSerializer
        from asgiref.sync import sync_to_async
        data = await sync_to_async(
            lambda: LiveSessionSerializer(session).data
        )()
        await self.send(text_data=json.dumps({
            "event": SESSION_STATE,
            "payload": data,
        }, default=str))

    @database_sync_to_async
    def _get_session(self):
        from apps.live_sessions.models import LiveSession
        try:
            return LiveSession.objects.select_related("instructor", "current_stage").get(
                pk=self.session_id
            )
        except LiveSession.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_or_create_participant(self, session):
        from apps.live_sessions.models import Participant
        participant, _ = Participant.objects.get_or_create(
            session=session,
            user=self.user,
            defaults={
                "display_name": self.user.display_name,
                "is_guest": False,
            },
        )
        return participant

    @database_sync_to_async
    def _set_connection_status(self, status: str):
        from apps.live_sessions.models import Participant
        if self.participant:
            update_fields = {"connection_status": status}
            if status == "ONLINE":
                update_fields["connected_at"] = timezone.now()
            elif status == "OFFLINE":
                update_fields["disconnected_at"] = timezone.now()
            Participant.objects.filter(pk=self.participant.pk).update(**update_fields)
