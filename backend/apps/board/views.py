"""Board views — RF-BOARD-02, RF-BOARD-04"""
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from core.permissions import IsInstructor, IsParticipantOrInstructor
from core.websocket_events import BOARD_PERMISSION_GRANTED, BOARD_PERMISSION_REVOKED
from .models import BoardSnapshot, BoardCollaborator
from .serializers import BoardSnapshotSerializer, BoardCollaboratorSerializer


class BoardSnapshotListView(generics.ListAPIView):
    """GET /api/v1/board/sessions/<session_id>/snapshots/ — All snapshots for replay."""
    serializer_class = BoardSnapshotSerializer
    permission_classes = [IsParticipantOrInstructor]

    def get_queryset(self):
        return BoardSnapshot.objects.filter(
            session_id=self.kwargs["session_id"]
        ).select_related("stage")


class BoardCollaboratorManageView(APIView):
    """
    POST /api/v1/board/sessions/<session_id>/collaborators/
    Grant or revoke drawing permissions (RF-BOARD-04).
    """
    permission_classes = [IsInstructor]

    def post(self, request, session_id):
        from apps.live_sessions.models import Participant
        participant_id = request.data.get("participant_id")
        grant = request.data.get("grant", True)

        try:
            participant = Participant.objects.get(pk=participant_id, session_id=session_id)
        except Participant.DoesNotExist:
            return Response({"error": {"message": "Participante no encontrado."}}, status=404)

        participant.can_draw = grant
        participant.save(update_fields=["can_draw"])

        event = BOARD_PERMISSION_GRANTED if grant else BOARD_PERMISSION_REVOKED
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"board_{session_id}",
            {
                "type": "board.permission_granted" if grant else "board.permission_revoked",
                "event": event,
                "payload": {
                    "participant_id": str(participant.pk),
                    "display_name": participant.display_name,
                    "can_draw": grant,
                },
            },
        )
        return Response({"participant_id": str(participant.pk), "can_draw": grant})
