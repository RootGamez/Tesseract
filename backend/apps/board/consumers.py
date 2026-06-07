"""
Board WebSocket Consumer
RF-BOARD-01: Excalidraw sync — modelo nativo (delta + reconcile, last-write-wins por version)
RF-BOARD-03: Laser pointer LASER_MOVE throttle 30ms
RF-BOARD-04: Collaborative write permissions

Protocolo:
  Cliente → servidor:
    REQUEST_BOARD_SYNC { stage_id }   → pide estado completo de una escena
    SCENE_UPDATE { elements (delta), appState, files, stage_id }
    LASER_MOVE   { x, y, active }
  Servidor → cliente:
    SCENE_INIT   { elements (full), appState, files, stage_id }   (al entrar/reconectar/resync)
    SCENE_UPDATE { elements (delta), files, stage_id }            (broadcast en vivo)
    LASER_MOVE   { x, y, active, user_id, display_name }
"""
import json
import asyncio
import structlog
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
import base64
from io import BytesIO
import re

from core.websocket_events import (
    SCENE_INIT, SCENE_UPDATE, LASER_MOVE,
    BOARD_PERMISSION_GRANTED, BOARD_PERMISSION_REVOKED, WS_ERROR,
)
from core.throttling import WebSocketMessageThrottle

logger = structlog.get_logger(__name__)


class BoardConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for collaborative Excalidraw board.
    URL: ws://host/ws/board/<session_id>/
    """

    # Cadencia de persistencia (debounce). El broadcast en vivo es inmediato;
    # el snapshot en BD se escribe a lo sumo cada SAVE_INTERVAL_SECONDS para no
    # generar ~10 escrituras/seg por cada delta (patrón estándar Excalidraw:
    # canal realtime separado de la persistencia).
    SAVE_INTERVAL_SECONDS = 1.0

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.session_id = None
        self.board_group = None
        # Límite alto: un stream de dibujo emite ~10 SCENE_UPDATE/s + ~33 LASER_MOVE/s.
        # 3600/min (= 60/s) cubre el pico con margen y mantiene protección anti-abuso.
        self.throttle = WebSocketMessageThrottle(limit=3600, window_seconds=60)
        # Estado completo en memoria por escena: { stage_id: {elements, appState, files} }
        self._stage_states = {}
        # Escenas con cambios pendientes de persistir + loop de guardado diferido.
        self._dirty_stages = set()
        self._save_loop_task = None

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

        # Loop de persistencia diferida (debounce) para esta conexión.
        self._save_loop_task = asyncio.create_task(self._periodic_save_loop())

        # Enviar estado completo de la escena actual al conectar (SCENE_INIT)
        stage_id = await self._get_current_stage_id()
        if stage_id:
            await self._send_scene_init(stage_id)
        logger.info("board_ws_connected", session_id=self.session_id, user_id=str(user.pk))

    async def disconnect(self, close_code):
        # Detener el loop y persistir lo pendiente antes de cerrar.
        if self._save_loop_task:
            self._save_loop_task.cancel()
        await self._flush_dirty_stages()
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

        if event_type == SCENE_UPDATE:
            await self._handle_scene_update(data)

        elif event_type == "REQUEST_BOARD_SYNC":
            payload = data.get("payload", {})
            stage_id = payload.get("stage_id") or await self._get_current_stage_id()
            if stage_id:
                await self._send_scene_init(stage_id)

        elif event_type == LASER_MOVE:
            payload = data.get("payload", {})
            try:
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
            except Exception as e:
                logger.error("laser_group_send_failed", error=str(e))

    # ── Core: delta update ──────────────────────────────────────────────────────

    async def _handle_scene_update(self, data):
        # Validar permiso de escritura (RF-BOARD-04)
        has_permission = await self._check_draw_permission()
        if not has_permission:
            logger.warning("board_scene_update_no_permission",
                           session_id=self.session_id, user_id=str(self.user.pk))
            await self.send(text_data=json.dumps({
                "event": WS_ERROR,
                "payload": {"message": "No tienes permiso para editar la pizarra."},
            }))
            return

        payload = data.get("payload", {})
        stage_id = data.get("stage_id") or payload.get("stage_id")
        if not stage_id:
            stage_id = await self._get_current_stage_id()
        if not stage_id:
            return

        delta_elements = payload.get("elements", []) or []
        app_state = payload.get("appState", {}) or {}

        # Subir imágenes nuevas a MinIO (convierte dataURL → s3://)
        files = payload.get("files", {}) or {}
        if files:
            files = await self._process_files_to_minio(files, str(self.session_id))

        # Fusionar el delta en el estado completo de la escena (last-write-wins por version)
        state = await self._get_stage_state(stage_id)
        from apps.board.crdt import apply_delta
        state["elements"] = apply_delta(state["elements"], delta_elements)
        if app_state:
            state["appState"] = app_state
        if files:
            # Conservar referencias s3:// ya conocidas. Si el cliente reenvía la
            # URL prefirmada (http) de una imagen existente, NO sobrescribir su
            # s3://: esa URL expira y la imagen se vería gris al reabrir la escena.
            for fid, fdata in files.items():
                url = (fdata or {}).get("dataURL", "")
                prev = state["files"].get(fid)
                if (
                    prev
                    and isinstance(url, str)
                    and not url.startswith("s3://")
                    and not url.startswith("data:")
                    and isinstance(prev.get("dataURL"), str)
                    and prev["dataURL"].startswith("s3://")
                ):
                    continue  # mantener el s3:// existente
                state["files"][fid] = fdata

        # Marcar la escena como pendiente de persistir. El guardado real lo hace
        # el loop diferido (debounce) — no bloqueamos el broadcast con un write/delta.
        self._dirty_stages.add(stage_id)

        # Broadcast SOLO del delta (en vivo) — con URLs prefirmadas para imágenes
        broadcast_files = await self._inject_presigned_urls(files) if files else {}
        try:
            await self.channel_layer.group_send(
                self.board_group,
                {
                    "type": "board.update",
                    "event": SCENE_UPDATE,
                    "payload": {
                        "elements": delta_elements,
                        "files": broadcast_files,
                        "stage_id": stage_id,
                    },
                    "sender_channel": self.channel_name,
                },
            )
            logger.info("board_broadcast_sent", session_id=self.session_id,
                        group=self.board_group, stage_id=str(stage_id),
                        n_elements=len(delta_elements))
        except Exception as e:
            logger.error("board_group_send_failed", error=str(e), session_id=self.session_id)

    # ── Group message handlers ─────────────────────────────────────────────────

    async def board_update(self, event):
        # No reenviar al emisor (su escena ya está actualizada localmente)
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

    # ── SCENE_INIT (full sync) ──────────────────────────────────────────────────

    async def _send_scene_init(self, stage_id: str):
        """Envía el estado completo de una escena a este cliente."""
        state = await self._get_stage_state(stage_id)
        files = await self._inject_presigned_urls(state["files"]) if state["files"] else {}
        # Diagnóstico imágenes: qué fileIds piden los elementos vs qué files hay.
        image_file_ids = [
            el.get("fileId") for el in state["elements"]
            if isinstance(el, dict) and el.get("type") == "image" and not el.get("isDeleted")
        ]
        logger.info(
            "board_scene_init_files",
            user_id=str(getattr(self, "user", None) and self.user.pk),
            stage_id=str(stage_id),
            image_file_ids=image_file_ids,
            raw_file_keys=list(state["files"].keys()),
            raw_url_prefixes={k: str(v.get("dataURL", ""))[:10] for k, v in state["files"].items()},
            signed_file_keys=list(files.keys()),
        )
        await self.send(text_data=json.dumps({
            "event": SCENE_INIT,
            "payload": {
                "elements": state["elements"],
                "appState": state["appState"],
                "files": files,
                "stage_id": stage_id,
            },
        }, default=str))

    # ── Persistencia diferida (debounce) ────────────────────────────────────────

    async def _periodic_save_loop(self):
        """Persiste las escenas con cambios pendientes cada SAVE_INTERVAL_SECONDS."""
        try:
            while True:
                await asyncio.sleep(self.SAVE_INTERVAL_SECONDS)
                await self._flush_dirty_stages()
        except asyncio.CancelledError:
            pass

    async def _flush_dirty_stages(self):
        """Guarda en BD el estado completo de las escenas marcadas como dirty."""
        if not self._dirty_stages:
            return
        stage_ids = list(self._dirty_stages)
        self._dirty_stages.clear()
        for stage_id in stage_ids:
            state = self._stage_states.get(stage_id)
            if state is not None:
                await self._save_board_snapshot(stage_id, state)

    # ── State management (in-memory cache + DB) ─────────────────────────────────

    async def _get_stage_state(self, stage_id: str) -> dict:
        """Devuelve el estado completo de una escena, cacheado en memoria."""
        if stage_id not in self._stage_states:
            self._stage_states[stage_id] = await self._load_state_for_stage(stage_id)
        return self._stage_states[stage_id]

    @database_sync_to_async
    def _load_state_for_stage(self, stage_id: str) -> dict:
        from apps.board.models import BoardSnapshot
        from apps.live_sessions.models import LiveSession, Stage
        empty = {"elements": [], "appState": {}, "files": {}}
        try:
            session = LiveSession.objects.get(pk=self.session_id)
            target_stage = None
            if stage_id:
                try:
                    target_stage = Stage.objects.get(pk=stage_id, session=session)
                except Stage.DoesNotExist:
                    pass
            if not target_stage:
                return empty
            snapshot = BoardSnapshot.objects.filter(
                session=session, stage=target_stage
            ).first()
            if not snapshot:
                if target_stage.initial_board_state:
                    ibs = target_stage.initial_board_state
                    app_state = ibs.get("appState", {}) or {}
                    files = ibs.get("files")
                    if not files and isinstance(app_state, dict):
                        files = app_state.get("files", {})
                    return {
                        "elements": ibs.get("elements", []) or [],
                        "appState": app_state,
                        "files": files or {},
                    }
                return empty
            app_state = snapshot.app_state if isinstance(snapshot.app_state, dict) else {}
            files = app_state.get("files", {}) if isinstance(app_state, dict) else {}
            return {
                "elements": snapshot.elements or [],
                "appState": app_state,
                "files": files or {},
            }
        except Exception:
            return empty

    @database_sync_to_async
    def _get_current_stage_id(self):
        from apps.live_sessions.models import LiveSession
        try:
            session = LiveSession.objects.select_related("current_stage").get(pk=self.session_id)
            if session.current_stage:
                return str(session.current_stage.pk)
        except Exception:
            pass
        return None

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
    def _save_board_snapshot(self, stage_id: str, state: dict):
        """Persiste el estado completo fusionado de la escena (RF-BOARD-02)."""
        from apps.board.models import BoardSnapshot
        from apps.live_sessions.models import LiveSession, Stage
        try:
            session = LiveSession.objects.get(pk=self.session_id)
            target_stage = None
            if stage_id:
                try:
                    target_stage = Stage.objects.get(pk=stage_id, session=session)
                except Stage.DoesNotExist:
                    pass
            if not target_stage:
                target_stage = session.current_stage

            if target_stage and target_stage.stage_type == "BOARD":
                app_state = state.get("appState", {}) or {}
                files = state.get("files", {}) or {}
                if files and isinstance(app_state, dict):
                    app_state = {**app_state, "files": files}

                BoardSnapshot.objects.update_or_create(
                    session=session,
                    stage=target_stage,
                    defaults={
                        "elements": state.get("elements", []),
                        "app_state": app_state,
                    },
                )
        except Exception as e:
            logger.error("failed_to_save_board_snapshot", error=str(e))

    # ── MinIO file handling ──────────────────────────────────────────────────────

    @database_sync_to_async
    def _process_files_to_minio(self, files: dict, session_id: str) -> dict:
        from apps.resources.storage import upload_file

        modified_files = {}
        for file_id, file_data in files.items():
            data_url = file_data.get("dataURL", "")

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

            s3_key = None
            if isinstance(data_url, str) and data_url.startswith("s3://"):
                s3_key = data_url.replace("s3://", "")
            elif isinstance(data_url, str) and not data_url.startswith("data:"):
                # Auto-recuperación: snapshots viejos guardaron una URL prefirmada
                # (http) ya expirada. La clave en MinIO es determinista, así que la
                # reconstruimos y re-firmamos en vez de mostrar la imagen en gris.
                s3_key = f"board_files/{self.session_id}/{file_id}"

            if s3_key:
                try:
                    presigned = generate_presigned_url(s3_key)
                    new_file_data["dataURL"] = presigned
                except Exception as e:
                    logger.error("failed_to_presign_board_file", file_id=file_id, error=str(e))

            injected_files[file_id] = new_file_data

        return injected_files
