"""
Analytics views — RF-ANA-01, RF-ANA-02, RF-ANA-03
"""
import csv
import io
from django.http import HttpResponse
from rest_framework import generics, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from core.permissions import IsInstructor
from .models import StageMetric, SessionSummaryMetric
from .serializers import (
    StageMetricSerializer,
    SessionSummaryMetricSerializer,
    SessionReplaySerializer,
)


class SessionAnalyticsDashboardView(APIView):
    """
    GET /api/v1/analytics/sessions/<session_id>/dashboard/
    RF-ANA-02: Full analytics dashboard for a session.
    """

    permission_classes = [IsInstructor]

    def get(self, request, session_id):
        from apps.live_sessions.models import LiveSession
        session = generics.get_object_or_404(
            LiveSession, pk=session_id, instructor=request.user
        )

        # Stage metrics
        stage_metrics = StageMetric.objects.filter(session=session).select_related("stage")
        # Summary
        try:
            summary = session.summary_metric
            summary_data = SessionSummaryMetricSerializer(summary).data
        except SessionSummaryMetric.DoesNotExist:
            summary_data = {}

        # Leaderboard (top 10)
        leaderboard = list(
            session.participants.filter(
                points__gt=0
            ).order_by("-points").values(
                "display_name", "points"
            )[:10]
        )

        return Response({
            "session_id": str(session_id),
            "stage_metrics": StageMetricSerializer(stage_metrics, many=True).data,
            "summary": summary_data,
            "leaderboard": leaderboard,
        })


class SessionAnalyticsCSVExportView(APIView):
    """
    GET /api/v1/analytics/sessions/<session_id>/export/
    RF-ANA-02: Export session analytics to CSV.
    """

    permission_classes = [IsInstructor]

    def get(self, request, session_id):
        from apps.live_sessions.models import LiveSession, Participant
        session = generics.get_object_or_404(
            LiveSession, pk=session_id, instructor=request.user
        )

        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(["Participante", "Puntos", "Respuestas Quiz", "Emojis enviados"])

        participants = Participant.objects.filter(session=session).prefetch_related(
            "quiz_responses", "point_events"
        )
        for p in participants:
            writer.writerow([
                p.display_name,
                p.points,
                p.quiz_responses.count(),
                0,  # emoji count placeholder
            ])

        output.seek(0)
        response = HttpResponse(output, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="sesion_{session_id}_analitica.csv"'
        return response


class SessionReplayView(APIView):
    """
    GET /api/v1/analytics/sessions/<session_id>/replay/
    RF-ANA-01: Async replay — all board snapshots, resources, snippets per stage.
    """

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def get(self, request, session_id):
        from apps.live_sessions.models import LiveSession
        from apps.board.models import BoardSnapshot
        from apps.resources.models import Resource, Snippet
        from apps.resources.storage import get_or_refresh_presigned_url

        session = generics.get_object_or_404(LiveSession, pk=session_id)

        # Access control: instructor or verified participant
        is_instructor = session.instructor == request.user
        is_participant = session.participants.filter(user=request.user).exists()

        if not session.is_replay_public and not is_instructor and not is_participant:
            return Response({"error": {"message": "Acceso denegado."}}, status=403)

        stages = list(session.template.stages.all()) if session.template else []
        replay_data = []

        for stage in stages:
            snapshot = BoardSnapshot.objects.filter(session=session, stage=stage).first()
            resources = Resource.objects.filter(session=session, stage=stage, is_uploaded=True)

            # Refresh presigned URLs
            resource_list = []
            for r in resources:
                url = get_or_refresh_presigned_url(r)
                r.save(update_fields=["presigned_url", "url_expires_at"])
                resource_list.append({"id": str(r.pk), "name": r.name, "url": url, "type": r.resource_type})

            snippets = Snippet.objects.filter(session=session, stage=stage)

            replay_data.append({
                "stage_id": str(stage.pk),
                "stage_title": stage.title,
                "stage_type": stage.stage_type,
                "board_snapshot": {
                    "elements": snapshot.elements,
                    "app_state": snapshot.app_state,
                } if snapshot else None,
                "resources": resource_list,
                "snippets": [
                    {"id": str(s.pk), "language": s.language, "content": s.content, "title": s.title}
                    for s in snippets
                ],
            })

        return Response({
            "session_title": session.title,
            "instructor": session.instructor.display_name,
            "ended_at": session.ended_at,
            "ai_summary": session.ai_summary,
            "stages": replay_data,
        })


class InstructorSessionHistoryView(generics.ListAPIView):
    """
    GET /api/v1/analytics/history/
    RF-ANA-03: Instructor session history with aggregated stats.
    """

    permission_classes = [IsInstructor]

    def get(self, request, *args, **kwargs):
        from apps.live_sessions.models import LiveSession
        from django.db.models import Count, Avg

        sessions = LiveSession.objects.filter(
            instructor=request.user,
            state="ENDED",
        ).annotate(
            participant_count=Count("participants"),
        ).order_by("-ended_at")

        data = []
        for s in sessions:
            data.append({
                "id": str(s.pk),
                "title": s.title,
                "ended_at": s.ended_at,
                "duration_minutes": int((s.duration_seconds or 0) / 60),
                "participant_count": s.participant_count,
                "is_replay_public": s.is_replay_public,
            })

        return Response({"sessions": data, "total": len(data)})
