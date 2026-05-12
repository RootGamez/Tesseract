"""
Board WebSocket Consumer
RF-BOARD-01: Excalidraw sync with throttle 100ms
RF-BOARD-03: Laser pointer LASER_MOVE throttle 30ms
RF-BOARD-04: Collaborative write permissions
"""
import json
import structlog
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone

from core.websocket_events import (
    BOARD_UPDATE, LASER_MOVE,
    BOARD_PERMISSION_GRANTED, BOARD_PERMISSION_REVOKED, WS_ERROR,
)
from core.throttling import WebSocketMessageThrottle

logger = structlog.get_logger(__name__)


class BoardConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for collaborative Excalidraw board.
    URL: ws://host/ws/board/<session_id>/
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.session_id = None
        self.board_group = None
        self.throttle = WebSocketMessageThrottle()

    async def connect(self):
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.board_group = f"board_{self.session_id}"
        self.user = user

        await self.channel_layer.group_add(self.board_group, self.channel_name)
        await self.accept()

        # Send current board state on reconnect (RNF-INFRA-04)
        await self._send_current_board_state()
        logger.info("board_ws_connected", session_id=self.session_id, user_id=str(user.pk))

    async def disconnect(self, close_code):
        if self.board_group:
            await self.channel_layer.group_discard(self.board_group, self.channel_name)

    async def receive(self, text_data):
        if not self.throttle.is_allowed():
            await self.send(text_data=json.dumps({
                "event": WS_ERROR, "payload": {"message": "Rate limit exceeded."}
            }))
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        event_type = data.get("event")

        if event_type == BOARD_UPDATE:
            # Validate write permission for students (RF-BOARD-04)
            has_permission = await self._check_draw_permission()
            if not has_permission:
                await self.send(text_data=json.dumps({
                    "event": WS_ERROR,
                    "payload": {"message": "No tienes permiso para editar la pizarra."},
                }))
                return

            # Apply CRDT-like merge and broadcast (RF-BOARD-01)
            merged = await self._apply_crdt_merge(data.get("payload", {}))
            await self.channel_layer.group_send(
                self.board_group,
                {
                    "type": "board.update",
                    "event": BOARD_UPDATE,
                    "payload": merged,
                    "sender_channel": self.channel_name,
                },
            )

        elif event_type == LASER_MOVE:
            # Broadcast laser pointer position (RF-BOARD-03)
            payload = data.get("payload", {})
            await self.channel_layer.group_send(
                self.board_group,
                {
                    "type": "laser.move",
                    "event": LASER_MOVE,
                    "payload": {
                        "x": payload.get("x", 0),
                        "y": payload.get("y", 0),
                        "active": payload.get("active", True),
                        "user_id": str(self.user.pk),
                        "display_name": self.user.display_name,
                    },
                    "sender_channel": self.channel_name,
                },
            )

    # ── Group message handlers ─────────────────────────────────────────────────

    async def board_update(self, event):
        # Don't echo back to sender
        if event.get("sender_channel") != self.channel_name:
            await self.send(text_data=json.dumps({
                "event": event["event"],
                "payload": event["payload"],
            }))

    async def laser_move(self, event):
        if event.get("sender_channel") != self.channel_name:
            await self.send(text_data=json.dumps({
                "event": event["event"],
                "payload": event["payload"],
            }))

    async def board_permission_granted(self, event):
        await self.send(text_data=json.dumps({
            "event": BOARD_PERMISSION_GRANTED,
            "payload": event["payload"],
        }))

    async def board_permission_revoked(self, event):
        await self.send(text_data=json.dumps({
            "event": BOARD_PERMISSION_REVOKED,
            "payload": event["payload"],
        }))

    # ── Helpers ────────────────────────────────────────────────────────────────

    @database_sync_to_async
    def _check_draw_permission(self) -> bool:
        from apps.live_sessions.models import LiveSession, Participant
        try:
            session = LiveSession.objects.get(pk=self.session_id)
            if session.instructor == self.user:
                return True
            participant = Participant.objects.get(session=session, user=self.user)
            return participant.can_draw
        except Exception:
            return False

    @database_sync_to_async
    def _apply_crdt_merge(self, payload: dict) -> dict:
        """Apply CRDT-like merge for Excalidraw elements (RF-BOARD-01)."""
        from apps.board.crdt import merge_excalidraw_elements
        return merge_excalidraw_elements(payload)

    async def _send_current_board_state(self):
        """Send the latest board snapshot on reconnect (RNF-INFRA-04)."""
        snapshot = await self._get_latest_snapshot()
        if snapshot:
            await self.send(text_data=json.dumps({
                "event": BOARD_UPDATE,
                "payload": {
                    "elements": snapshot.elements,
                    "appState": snapshot.app_state,
                    "is_full_sync": True,
                },
            }))

    @database_sync_to_async
    def _get_latest_snapshot(self):
        from apps.board.models import BoardSnapshot
        from apps.live_sessions.models import LiveSession
        try:
            session = LiveSession.objects.select_related("current_stage").get(pk=self.session_id)
            if session.current_stage:
                return BoardSnapshot.objects.filter(
                    session=session, stage=session.current_stage
                ).first()
        except Exception:
            return None
