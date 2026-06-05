"""
Sessions app — Views
RF-SESSION-01: CRUD completo de plantillas
RF-SESSION-02: Motor de estados de sesión
RF-SESSION-03: Modo dry-run
RF-SESSION-04: Panel Director de Orquesta
"""
from django.db import transaction
from django.db.models import Max, Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from core.permissions import IsInstructor, IsInstructorOrAdmin, IsParticipantOrInstructor
from core.websocket_events import SESSION_STATE, STAGE_CHANGED

from apps.board.models import BoardSnapshot
from .models import ClassTemplate, LiveSession, Participant, SessionState, Stage
from .serializers import (
    ClassTemplateSerializer,
    ClassTemplateCreateSerializer,
    LiveSessionSerializer,
    LiveSessionCreateSerializer,
    JoinSessionSerializer,
    SessionStateTransitionSerializer,
    ParticipantSerializer,
    StageSerializer,
)
from .state_machine import SessionStateMachine, SessionStateMachineError


# ── Reusable stage management ───────────────────────────────────────────────────

# Fields a client may modify on an existing stage; stage_type and order are
# managed by the system (order via the dedicated reorder endpoint).
EDITABLE_STAGE_FIELDS = {"title", "duration_estimated_minutes", "config", "initial_board_state"}


def _resequence_stage_orders(stages):
    """
    Persist sequential 0..n-1 orders for the given ordered list of stages.
    Done in two passes (shift to a safe offset, then to the final values) so the
    unique (parent, order) constraint is never violated mid-update.
    """
    if not stages:
        return
    offset = len(stages) + 1
    for i, stage in enumerate(stages):
        stage.order = offset + i
    Stage.objects.bulk_update(stages, ["order"])
    for i, stage in enumerate(stages):
        stage.order = i
    Stage.objects.bulk_update(stages, ["order"])


class StageManagementMixin:
    """
    Reusable add/update/delete/reorder stage actions for any viewset whose detail
    object owns an ordered set of Stages (a ClassTemplate or a LiveSession).

    Subclasses implement `stage_parent_filter()` to return the kwargs that bind a
    Stage to its parent, e.g. ``{"template": obj}`` or ``{"session": obj}``.
    """

    def stage_parent_filter(self, obj):
        raise NotImplementedError

    def _stages_qs(self, obj):
        return Stage.objects.filter(**self.stage_parent_filter(obj))

    @action(detail=True, methods=["post"], url_path="stages/add")
    def add_stage(self, request, pk=None):
        """Body: {"title": "...", "stage_type": "BOARD", "duration_estimated_minutes": 10, "config": {...}}"""
        obj = self.get_object()
        serializer = StageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            agg = self._stages_qs(obj).aggregate(max_order=Max("order"))
            new_order = (agg["max_order"] + 1) if agg["max_order"] is not None else 0
            stage = serializer.save(order=new_order, **self.stage_parent_filter(obj))
        return Response(StageSerializer(stage).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="stages/update")
    def update_stage(self, request, pk=None):
        """Body: {"stage_id": "<uuid>", "title": "...", "config": {...}, "initial_board_state": {...}}"""
        obj = self.get_object()
        stage_id = request.data.get("stage_id")
        if not stage_id:
            return Response({"detail": "stage_id es requerido."}, status=status.HTTP_400_BAD_REQUEST)

        stage = get_object_or_404(Stage, pk=stage_id, **self.stage_parent_filter(obj))
        update_data = {k: v for k, v in request.data.items() if k in EDITABLE_STAGE_FIELDS}

        serializer = StageSerializer(stage, data=update_data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="stages/delete")
    def delete_stage(self, request, pk=None):
        """Body: {"stage_id": "<uuid>"}"""
        obj = self.get_object()
        stage_id = request.data.get("stage_id")
        if not stage_id:
            return Response({"detail": "stage_id es requerido."}, status=status.HTTP_400_BAD_REQUEST)

        stage = get_object_or_404(Stage, pk=stage_id, **self.stage_parent_filter(obj))
        with transaction.atomic():
            stage.delete()
            _resequence_stage_orders(list(self._stages_qs(obj).order_by("order")))
        return Response({"detail": "Etapa eliminada."})

    @action(detail=True, methods=["put", "patch"], url_path="stages/reorder")
    def reorder_stages(self, request, pk=None):
        """Body: {"stage_ids": ["uuid1", "uuid2", ...]} — full ordered list."""
        obj = self.get_object()
        stage_ids = request.data.get("stage_ids", [])
        if not stage_ids:
            return Response({"detail": "stage_ids es requerido."}, status=status.HTTP_400_BAD_REQUEST)

        stage_map = {str(s.pk): s for s in self._stages_qs(obj)}
        if any(sid not in stage_map for sid in stage_ids):
            return Response({"detail": "Algunas etapas no pertenecen a este recurso."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            _resequence_stage_orders([stage_map[sid] for sid in stage_ids])
        return Response({"detail": "Orden actualizado."})


# ── Class Templates ───────────────────────────────────────────────────────────

class ClassTemplateViewSet(StageManagementMixin, ModelViewSet):
    """
    CRUD + clone for ClassTemplate.
    RF-SESSION-01
    """

    def stage_parent_filter(self, obj):
        return {"template": obj}

    def get_queryset(self):
        user = self.request.user
        if user.role == "INSTRUCTOR":
            return ClassTemplate.objects.filter(owner=user).prefetch_related(Prefetch('stages', queryset=Stage.objects.order_by('order')))
        if user.role == "ADMIN":
            return ClassTemplate.objects.all().prefetch_related("stages")
        return ClassTemplate.objects.filter(is_public=True).prefetch_related("stages")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ClassTemplateCreateSerializer
        return ClassTemplateSerializer

    def get_permissions(self):
        if self.action in (
            "create", "update", "partial_update", "destroy", "clone",
            "add_stage", "update_stage", "delete_stage", "reorder_stages",
        ):
            return [IsInstructor()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def create(self, request, *args, **kwargs):
        # Use the write serializer for input, but return the full read
        # representation (incl. id, owner, stages) so the client can navigate
        # to the new template immediately.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        response_serializer = ClassTemplateSerializer(
            serializer.instance, context=self.get_serializer_context()
        )
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        # Same rationale: respond with the full read representation.
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if getattr(instance, "_prefetched_objects_cache", None):
            # Invalidate prefetch cache so the read serializer reflects fresh data.
            instance._prefetched_objects_cache = {}

        response_serializer = ClassTemplateSerializer(
            serializer.instance, context=self.get_serializer_context()
        )
        return Response(response_serializer.data)

    @action(detail=True, methods=["post"], url_path="clone")
    def clone(self, request, pk=None):
        """POST /api/v1/sessions/templates/<pk>/clone/ — Duplicate a template."""
        template = self.get_object()
        new_template = template.clone(new_owner=request.user)
        return Response(
            ClassTemplateSerializer(new_template).data,
            status=status.HTTP_201_CREATED,
        )


# ── Live Sessions ─────────────────────────────────────────────────────────────

class LiveSessionViewSet(StageManagementMixin, ModelViewSet):
    """CRUD for LiveSession — instructor only."""

    def stage_parent_filter(self, obj):
        return {"session": obj}

    def get_queryset(self):
        user = self.request.user
        if user.role == "INSTRUCTOR":
            return LiveSession.objects.filter(instructor=user).select_related(
                "instructor", "current_stage", "template"
            )
        return LiveSession.objects.filter(participants__user=user).select_related(
            "instructor", "current_stage"
        )

    def get_object(self):
        return super().get_object()

    def get_serializer_class(self):
        if self.action == "create":
            return LiveSessionCreateSerializer
        return LiveSessionSerializer

    def get_permissions(self):
        if self.action in (
            "create", "destroy", "update", "partial_update", "transition", "change_stage",
            "add_stage", "update_stage", "delete_stage", "reorder_stages",
        ):
            return [IsInstructor()]
        return [permissions.IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        response_serializer = LiveSessionSerializer(serializer.instance, context=self.get_serializer_context())
        headers = self.get_success_headers(response_serializer.data)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save(instructor=self.request.user)
            # Copy template stages into the session so the live class is fully
            # editable without ever touching the original template.
            instance.populate_stages_from_template()
            first_stage = instance.stages.order_by("order").first()
            if first_stage:
                instance.current_stage = first_stage
                instance.save(update_fields=["current_stage"])

    @action(detail=True, methods=["post"], url_path="transition")
    def transition(self, request, pk=None):
        """
        POST /api/v1/sessions/live/<pk>/transition/
        Body: {"action": "start" | "pause" | "resume" | "end"}
        RF-SESSION-02
        """
        session = get_object_or_404(LiveSession, pk=pk, instructor=request.user)
        serializer = SessionStateTransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        action_name = serializer.validated_data["action"]
        fsm = SessionStateMachine(session)

        try:
            updated_session = getattr(fsm, action_name)()
        except SessionStateMachineError as e:
            return Response(
                {"error": {"message": str(e)}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Broadcast SESSION_STATE via WebSocket (RF-SESSION-02)
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"session_{session.pk}",
            {
                "type": "session.state_changed",
                "event": SESSION_STATE,
                "payload": {"state": updated_session.state},
            },
        )

        return Response(LiveSessionSerializer(updated_session).data)

    @action(detail=True, methods=["post"], url_path="change-stage")
    def change_stage(self, request, pk=None):
        """
        POST /api/v1/sessions/live/<pk>/change-stage/
        Body: {"stage_id": "<uuid>"}
        RF-SESSION-04: Advance/go back stage from Conductor panel.
        """
        session = get_object_or_404(LiveSession, pk=pk, instructor=request.user)
        stage_id = request.data.get("stage_id")

        try:
            stage = Stage.objects.get(pk=stage_id, session=session)
        except Stage.DoesNotExist:
            return Response(
                {"error": {"message": "Etapa no encontrada en esta sesión."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Note: board snapshot is saved continuously via WebSocket (RF-BOARD-02).
        # We do NOT overwrite here with REST data to avoid race conditions.
        # The WS auto-save already keeps the snapshot up-to-date.

        session.current_stage = stage
        session.save(update_fields=["current_stage"])

        # Broadcast STAGE_CHANGED
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"session_{session.pk}",
            {
                "type": "session.stage_changed",
                "event": STAGE_CHANGED,
                "payload": {
                    "stage_id": str(stage.pk),
                    "type": stage.stage_type,
                    "data": stage.config,
                    "initial_board_state": stage.initial_board_state,
                },
            },
        )

        # Nota: NO se emite el BOARD_UPDATE legacy (snapshot completo) al cambiar
        # de escena. La pizarra pide su estado vía REQUEST_BOARD_SYNC → SCENE_INIT
        # al montar, y ese camino re-firma las URLs de MinIO correctamente
        # (incluyendo auto-recuperación). El BOARD_UPDATE competía con SCENE_INIT
        # y, al no re-firmar URLs no-s3://, dejaba imágenes en gris en el emisor.

        return Response(LiveSessionSerializer(session).data)

    @action(detail=True, methods=["get"], url_path="participants")
    def participants(self, request, pk=None):
        """GET /api/v1/sessions/live/<pk>/participants/ — List participants."""
        session = self.get_object()
        qs = session.participants.select_related("user").exclude(user=session.instructor)
        return Response(ParticipantSerializer(qs, many=True).data)


# ── Join Session (students) ───────────────────────────────────────────────────

class JoinSessionView(APIView):
    """
    POST /api/v1/sessions/join/
    Students join a live session with a 6-char code. RF-AUTH-02.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = JoinSessionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session = serializer.session

        display_name = serializer.validated_data.get(
            "display_name", request.user.display_name
        )
        participant, created = Participant.objects.get_or_create(
            session=session,
            user=request.user,
            defaults={
                "display_name": display_name,
                "is_guest": False,
                "connected_at": timezone.now(),
                "connection_status": "ONLINE",
            },
        )
        if not created:
            participant.connection_status = "ONLINE"
            participant.connected_at = timezone.now()
            participant.save(update_fields=["connection_status", "connected_at"])

        return Response(
            {
                "session": LiveSessionSerializer(session).data,
                "participant": ParticipantSerializer(participant).data,
            },
            status=status.HTTP_200_OK,
        )


class GuestJoinSessionView(APIView):
    """
    POST /api/v1/sessions/join/guest/
    Anonymous guest joins a session (RF-AUTH-02: guest with display name).
    Returns a temporary anonymous JWT.
    """

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        join_code = request.data.get("join_code", "").upper()
        display_name = request.data.get("display_name", "").strip()

        if not display_name:
            return Response(
                {"error": {"message": "El nombre para mostrar es obligatorio."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            session = LiveSession.objects.get(
                join_code=join_code, state__in=[SessionState.LIVE, SessionState.PAUSED]
            )
        except LiveSession.DoesNotExist:
            return Response(
                {"error": {"message": "Código inválido o sesión no activa."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        participant = Participant.objects.create(
            session=session,
            user=None,
            is_guest=True,
            display_name=display_name,
            connected_at=timezone.now(),
            connection_status="ONLINE",
        )
        return Response(
            {
                "session": LiveSessionSerializer(session).data,
                "participant": ParticipantSerializer(participant).data,
            },
            status=status.HTTP_201_CREATED,
        )
