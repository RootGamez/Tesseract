"""
Presentations WebSocket consumer.
Handles instructor slide changes and collaborative canvas drawing.
"""
import json

import structlog
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser

from core.websocket_events import WS_ERROR, PDF_PAGE_CHANGED, VIDEO_STATE
from core.throttling import WebSocketMessageThrottle

logger = structlog.get_logger(__name__)


class PresentationConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.session_id = None
        self.presentation_group = None
        self.throttle = WebSocketMessageThrottle()

    async def connect(self):
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.presentation_group = f"presentation_{self.session_id}"
        self.user = user

        session = await self._get_session()
        if not session:
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.presentation_group, self.channel_name)
        await self.accept()

        await self._send_current_state()
        logger.info("presentation_ws_connected", session_id=self.session_id, user_id=str(user.pk))

    async def disconnect(self, close_code):
        if self.presentation_group:
            await self.channel_layer.group_discard(self.presentation_group, self.channel_name)

    async def receive(self, text_data):
        if not self.throttle.is_allowed():
            await self.send(text_data=json.dumps({"event": WS_ERROR, "payload": {"message": "Rate limit exceeded."}}))
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        event_type = data.get("event")
        payload = data.get("payload", {})

        if event_type == "slide.change":
            if not await self._is_instructor():
                await self.send(text_data=json.dumps({"event": WS_ERROR, "payload": {"message": "Acción no autorizada."}}))
                return
            await self._change_slide(payload)

        elif event_type == "canvas.draw":
            if not await self._can_draw():
                await self.send(text_data=json.dumps({"event": WS_ERROR, "payload": {"message": "No tienes permiso para dibujar."}}))
                return
            await self._update_canvas(payload)

        elif event_type == "PDF_PAGE_CHANGED":
            if not await self._is_instructor():
                await self.send(text_data=json.dumps({"event": WS_ERROR, "payload": {"message": "Acción no autorizada."}}))
                return
            page = int(payload.get("page", 1))
            stage_id = payload.get("stage_id", "")
            await self.channel_layer.group_send(
                self.presentation_group,
                {
                    "type": "pdf.page.changed",
                    "event": PDF_PAGE_CHANGED,
                    "payload": {"page": page, "stage_id": stage_id},
                },
            )

        elif event_type == "VIDEO_STATE":
            # Solo el instructor controla la reproducción; los estudiantes la siguen.
            if not await self._is_instructor():
                await self.send(text_data=json.dumps({"event": WS_ERROR, "payload": {"message": "Acción no autorizada."}}))
                return
            await self.channel_layer.group_send(
                self.presentation_group,
                {
                    "type": "video.state",
                    "event": VIDEO_STATE,
                    "payload": {
                        "stage_id": payload.get("stage_id", ""),
                        "video_id": payload.get("video_id", ""),
                        "status": payload.get("status", "paused"),  # 'playing' | 'paused'
                        "time": float(payload.get("time", 0) or 0),  # segundos de reproducción
                        "rate": float(payload.get("rate", 1) or 1),
                        "ts": payload.get("ts", 0),  # reloj del emisor (ms) para corregir deriva
                    },
                    "sender_channel": self.channel_name,
                },
            )

        elif event_type == "REQUEST_PRESENTATION_SYNC":
            await self._send_current_state()

    async def presentation_state(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def slide_change(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def canvas_draw(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def pdf_page_changed(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def video_state(self, event):
        # No reenviar al emisor (el instructor ya controla su propio reproductor).
        if event.get("sender_channel") != self.channel_name:
            await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    @database_sync_to_async
    def _get_session(self):
        from apps.live_sessions.models import LiveSession

        try:
            return LiveSession.objects.select_related("instructor", "current_stage").get(pk=self.session_id)
        except LiveSession.DoesNotExist:
            return None

    @database_sync_to_async
    def _is_instructor(self) -> bool:
        from apps.live_sessions.models import LiveSession

        try:
            session = LiveSession.objects.get(pk=self.session_id)
            return session.instructor_id == self.user.id
        except Exception:
            return False

    @database_sync_to_async
    def _can_draw(self) -> bool:
        from apps.live_sessions.models import LiveSession, Participant

        try:
            session = LiveSession.objects.get(pk=self.session_id)
            if session.instructor_id == self.user.id:
                return True
            participant = Participant.objects.get(session=session, user=self.user)
            return participant.can_draw
        except Exception:
            return False

    async def _change_slide(self, payload: dict):
        slide_index = int(payload.get("slide_index", 0))
        presentation = await self._get_presentation()
        if not presentation:
            return

        updated = await self._set_current_slide(presentation.pk, slide_index)
        if not updated:
            return

        await self.channel_layer.group_send(
            self.presentation_group,
            {
                "type": "slide.change",
                "event": "slide.change",
                "payload": {
                    "presentation_id": str(presentation.pk),
                    "slide_index": slide_index,
                    "changed_by": str(self.user.pk),
                },
            },
        )

        await self._send_current_state()

    async def _update_canvas(self, payload: dict):
        presentation = await self._get_presentation()
        if not presentation:
            return

        slide_index = int(payload.get("slide_index", presentation.current_slide_index))
        canvas_state = payload.get("canvas_state", {})
        annotation = await self._save_annotation(presentation.pk, slide_index, canvas_state)

        await self.channel_layer.group_send(
            self.presentation_group,
            {
                "type": "canvas.draw",
                "event": "canvas.draw",
                "payload": {
                    "presentation_id": str(presentation.pk),
                    "slide_index": slide_index,
                    "canvas_state": canvas_state,
                    "revision": annotation.revision if annotation else 1,
                    "updated_by": str(self.user.pk),
                },
            },
        )

    async def _send_current_state(self):
        presentation = await self._get_presentation()
        if not presentation:
            return

        slides = await self._get_slides(presentation.pk)
        annotation = await self._get_current_annotation(presentation.pk, presentation.current_slide_index)
        await self.send(text_data=json.dumps({
            "event": "PRESENTATION_STATE",
            "payload": {
                "presentation_id": str(presentation.pk),
                "title": presentation.title,
                "status": presentation.status,
                "current_slide_index": presentation.current_slide_index,
                "active_canvas_state": presentation.active_canvas_state or {},
                "slides": slides,
                "current_annotation": {
                    "id": str(annotation.pk) if annotation else None,
                    "revision": annotation.revision if annotation else 0,
                    "canvas_state": annotation.canvas_state if annotation else {},
                },
            },
        }, default=str))

    @database_sync_to_async
    def _get_presentation(self):
        from apps.presentations.models import Presentation

        try:
            return Presentation.objects.prefetch_related("slides", "annotations").get(session_id=self.session_id)
        except Presentation.DoesNotExist:
            return None

    @database_sync_to_async
    def _set_current_slide(self, presentation_id, slide_index: int):
        from apps.presentations.models import Presentation

        try:
            presentation = Presentation.objects.get(pk=presentation_id)
            presentation.current_slide_index = max(0, slide_index)
            presentation.save(update_fields=["current_slide_index", "updated_at"])
            return presentation
        except Presentation.DoesNotExist:
            return None

    @database_sync_to_async
    def _save_annotation(self, presentation_id, slide_index: int, canvas_state: dict):
        from apps.presentations.models import Presentation, PresentationAnnotation, PresentationSlide

        try:
            presentation = Presentation.objects.get(pk=presentation_id)
            slide = PresentationSlide.objects.get(presentation=presentation, index=slide_index)
            annotation, created = PresentationAnnotation.objects.get_or_create(
                presentation=presentation,
                slide=slide,
                defaults={
                    "canvas_state": canvas_state,
                    "created_by": self.user,
                },
            )
            if not created:
                annotation.revision += 1
                annotation.canvas_state = canvas_state
                annotation.created_by = self.user
                annotation.save(update_fields=["revision", "canvas_state", "created_by", "updated_at"])
            return annotation
        except Exception:
            return None

    @database_sync_to_async
    def _get_slides(self, presentation_id):
        from apps.presentations.models import PresentationSlide

        from apps.resources.storage import generate_presigned_url

        slides = PresentationSlide.objects.filter(presentation_id=presentation_id).order_by("index")
        return [
            {
                "id": str(slide.pk),
                "index": slide.index,
                "image_key": slide.image_key,
                "image_url": generate_presigned_url(slide.image_key) if slide.image_key else None,
                "thumbnail_key": slide.thumbnail_key,
                "mime_type": slide.mime_type,
                "width": slide.width,
                "height": slide.height,
                "render_metadata": slide.render_metadata,
            }
            for slide in slides
        ]

    @database_sync_to_async
    def _get_current_annotation(self, presentation_id, slide_index: int):
        from apps.presentations.models import Presentation, PresentationSlide, PresentationAnnotation

        try:
            presentation = Presentation.objects.get(pk=presentation_id)
            slide = PresentationSlide.objects.get(presentation=presentation, index=slide_index)
            return PresentationAnnotation.objects.filter(presentation=presentation, slide=slide).first()
        except Exception:
            return None
