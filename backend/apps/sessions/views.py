"""
Sessions app — Views
RF-SESSION-01: CRUD completo de plantillas
RF-SESSION-02: Motor de estados de sesión
RF-SESSION-03: Modo dry-run
RF-SESSION-04: Panel Director de Orquesta
"""
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from core.permissions import IsInstructor, IsInstructorOrAdmin, IsParticipantOrInstructor
from core.websocket_events import SESSION_STATE, STAGE_CHANGED

from .models import ClassTemplate, Stage, LiveSession, Participant, SessionState
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


# ── Class Templates ───────────────────────────────────────────────────────────

class ClassTemplateViewSet(ModelViewSet):
    """
    CRUD + clone for ClassTemplate.
    RF-SESSION-01
    """

    def get_queryset(self):
        user = self.request.user
        if user.role == "INSTRUCTOR":
            return ClassTemplate.objects.filter(owner=user).prefetch_related("stages")
        if user.role == "ADMIN":
            return ClassTemplate.objects.all().prefetch_related("stages")
        return ClassTemplate.objects.filter(is_public=True).prefetch_related("stages")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ClassTemplateCreateSerializer
        return ClassTemplateSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "clone"):
            return [IsInstructor()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=["post"], url_path="clone")
    def clone(self, request, pk=None):
        """POST /api/v1/sessions/templates/<pk>/clone/ — Duplicate a template."""
        template = self.get_object()
        new_template = template.clone(new_owner=request.user)
        return Response(
            ClassTemplateSerializer(new_template).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["put", "patch"], url_path="stages/reorder")
    def reorder_stages(self, request, pk=None):
        """
        PATCH /api/v1/sessions/templates/<pk>/stages/reorder/
        Accepts: {"stage_ids": ["uuid1", "uuid2", ...]} ordered list.
        """
        template = self.get_object()
        stage_ids = request.data.get("stage_ids", [])
        stages = Stage.objects.filter(template=template)
        stage_map = {str(s.pk): s for s in stages}

        for i, stage_id in enumerate(stage_ids):
            if stage_id in stage_map:
                stage_map[stage_id].order = i
                stage_map[stage_id].save(update_fields=["order"])

        return Response({"detail": "Orden actualizado."})


# ── Live Sessions ─────────────────────────────────────────────────────────────

class LiveSessionViewSet(ModelViewSet):
    """CRUD for LiveSession — instructor only."""

    def get_queryset(self):
        user = self.request.user
        if user.role == "INSTRUCTOR":
            return LiveSession.objects.filter(instructor=user).select_related(
                "instructor", "current_stage", "template"
            )
        return LiveSession.objects.filter(participants__user=user).select_related(
            "instructor", "current_stage"
        )

    def get_serializer_class(self):
        if self.action == "create":
            return LiveSessionCreateSerializer
        return LiveSessionSerializer

    def get_permissions(self):
        if self.action == "create":
            return [IsInstructor()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(instructor=self.request.user)

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
            stage = Stage.objects.get(pk=stage_id, template=session.template)
        except Stage.DoesNotExist:
            return Response(
                {"error": {"message": "Etapa no encontrada en esta sesión."}},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Save board snapshot before changing (RF-BOARD-02)
        from apps.board.models import BoardSnapshot
        board_data = request.data.get("board_snapshot")
        if board_data and session.current_stage:
            BoardSnapshot.objects.update_or_create(
                session=session,
                stage=session.current_stage,
                defaults={"elements": board_data.get("elements", []), "app_state": board_data.get("appState", {})},
            )

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
        return Response(LiveSessionSerializer(session).data)

    @action(detail=True, methods=["get"], url_path="participants")
    def participants(self, request, pk=None):
        """GET /api/v1/sessions/live/<pk>/participants/ — List participants."""
        session = self.get_object()
        qs = session.participants.select_related("user")
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
