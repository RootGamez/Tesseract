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
import base64
from io import BytesIO
import re

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

            payload = data.get("payload", {})
            stage_id = data.get("stage_id") or payload.get("stage_id")

            # Intercept and upload files to MinIO
            files = payload.get("files", {})
            if files:
                processed_files = await self._process_files_to_minio(files, str(self.session_id))
                payload["files"] = processed_files

            # Apply CRDT-like merge and broadcast (RF-BOARD-01)
            merged = await self._apply_crdt_merge(payload)
            if stage_id:
                merged["stage_id"] = stage_id

            # For DB persistence, use the dict with s3:// keys
            db_merged = merged.copy()
            
            # For broadcasting, convert s3:// keys back to pre-signed URLs
            broadcast_merged = merged.copy()
            if "files" in broadcast_merged and broadcast_merged["files"]:
                broadcast_merged["files"] = await self._inject_presigned_urls(broadcast_merged["files"])

            await self.channel_layer.group_send(
                self.board_group,
                {
                    "type": "board.update",
                    "event": BOARD_UPDATE,
                    "payload": broadcast_merged,
                    "sender_channel": self.channel_name,
                },
            )

            # Auto-save the snapshot to the database for persistence (RF-BOARD-02)
            await self._save_board_snapshot(db_merged, stage_id)

        elif event_type == "REQUEST_BOARD_SYNC":
            payload = data.get("payload", {})
            stage_id = payload.get("stage_id")
            await self._send_board_state_for_stage(stage_id)

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
            app_state = snapshot.app_state if snapshot.app_state else {}
            files = app_state.get("files", {}) if isinstance(app_state, dict) else {}
            if files:
                files = await self._inject_presigned_urls(files)
                
            await self.send(text_data=json.dumps({
                "event": BOARD_UPDATE,
                "payload": {
                    "elements": snapshot.elements,
                    "appState": app_state,
                    "files": files,
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

    @database_sync_to_async
    def _save_board_snapshot(self, merged: dict, stage_id: str = None):
        """Persist current board elements and state to database (RF-BOARD-02)."""
        from apps.board.models import BoardSnapshot
        from apps.live_sessions.models import LiveSession, Stage
        try:
            session = LiveSession.objects.get(pk=self.session_id)
            target_stage = None
            if stage_id:
                try:
                    target_stage = Stage.objects.get(pk=stage_id, template=session.template)
                except Stage.DoesNotExist:
                    pass
            if not target_stage:
                target_stage = session.current_stage

            if target_stage and target_stage.stage_type == "BOARD":
                app_state = merged.get("appState", {}) or {}
                files = merged.get("files", {}) or {}
                if files and isinstance(app_state, dict):
                    app_state["files"] = files

                BoardSnapshot.objects.update_or_create(
                    session=session,
                    stage=target_stage,
                    defaults={
                        "elements": merged.get("elements", []),
                        "app_state": app_state,
                    },
                )
        except Exception as e:
            logger.error("failed_to_save_board_snapshot", error=str(e))

    async def _send_board_state_for_stage(self, stage_id: str):
        """Send the snapshot of the board for a specific stage to this client."""
        snapshot = await self._get_snapshot_for_stage(stage_id)
        elements = snapshot.elements if snapshot else []
        app_state = snapshot.app_state if snapshot else {}
        files = app_state.get("files", {}) if isinstance(app_state, dict) else {}
        if files:
            files = await self._inject_presigned_urls(files)
            
        await self.send(text_data=json.dumps({
            "event": BOARD_UPDATE,
            "payload": {
                "elements": elements,
                "appState": app_state,
                "files": files,
                "is_full_sync": True,
                "stage_id": stage_id,
            },
        }))

    @database_sync_to_async
    def _get_snapshot_for_stage(self, stage_id: str):
        from apps.board.models import BoardSnapshot
        from apps.live_sessions.models import LiveSession, Stage
        try:
            session = LiveSession.objects.get(pk=self.session_id)
            target_stage = None
            if stage_id:
                try:
                    target_stage = Stage.objects.get(pk=stage_id, template=session.template)
                except Stage.DoesNotExist:
                    pass
            if not target_stage:
                target_stage = session.current_stage
            if target_stage:
                return BoardSnapshot.objects.filter(
                    session=session, stage=target_stage
                ).first()
        except Exception:
            return None

    @database_sync_to_async
    def _process_files_to_minio(self, files: dict, session_id: str) -> dict:
        from apps.resources.storage import upload_file
        
        modified_files = {}
        for file_id, file_data in files.items():
            data_url = file_data.get("dataURL", "")
            
            # If it's a base64 dataURL, upload it to MinIO
            if isinstance(data_url, str) and data_url.startswith("data:"):
                match = re.match(r"data:(.*?);base64,(.*)", data_url)
                if match:
                    mime_type = match.group(1)
                    base64_str = match.group(2)
                    
                    try:
                        file_bytes = base64.b64decode(base64_str)
                        file_obj = BytesIO(file_bytes)
                        object_key = f"board_files/{session_id}/{file_id}"
                        
                        uploaded_key = upload_file(file_obj, object_key, content_type=mime_type)
                        
                        new_file_data = file_data.copy()
                        new_file_data["dataURL"] = f"s3://{uploaded_key}"
                        modified_files[file_id] = new_file_data
                        continue
                    except Exception as e:
                        logger.error("failed_to_upload_board_file", file_id=file_id, error=str(e))
                        
            modified_files[file_id] = file_data
            
        return modified_files

    @database_sync_to_async
    def _inject_presigned_urls(self, files: dict) -> dict:
        from apps.resources.storage import generate_presigned_url
        
        injected_files = {}
        for file_id, file_data in files.items():
            data_url = file_data.get("dataURL", "")
            new_file_data = file_data.copy()
            
            if isinstance(data_url, str) and data_url.startswith("s3://"):
                s3_key = data_url.replace("s3://", "")
                try:
                    presigned = generate_presigned_url(s3_key)
                    new_file_data["dataURL"] = presigned
                except Exception as e:
                    logger.error("failed_to_presign_board_file", file_id=file_id, error=str(e))
                    
            injected_files[file_id] = new_file_data
            
        return injected_files
