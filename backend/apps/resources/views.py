"""
Resources views — RF-RES-01, RF-RES-02
"""
import uuid
import tempfile
import os
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser

from core.permissions import IsInstructor, IsParticipantOrInstructor
from .models import Resource, Snippet
from .serializers import ResourceSerializer, ResourceUploadSerializer, SnippetSerializer


class ResourceListView(generics.ListAPIView):
    """GET /api/v1/resources/sessions/<id>/files/"""
    serializer_class = ResourceSerializer
    permission_classes = [IsParticipantOrInstructor]

    def get_queryset(self):
        return Resource.objects.filter(session_id=self.kwargs["session_id"])


class ResourceUploadView(APIView):
    """
    POST /api/v1/resources/sessions/<id>/upload/
    Upload file up to 50MB (RF-RES-01).
    """
    permission_classes = [IsInstructor]
    parser_classes = [MultiPartParser]

    def post(self, request, session_id):
        serializer = ResourceUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        upload_file = serializer.validated_data["file"]
        
        if upload_file.size > 50 * 1024 * 1024:
            return Response(
                {"error": {"message": "El archivo excede el límite de 50MB."}},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.sessions.models import LiveSession, Stage
        try:
            session = LiveSession.objects.get(pk=session_id, instructor=request.user)
        except LiveSession.DoesNotExist:
            return Response({"error": {"message": "Sesión no encontrada."}}, status=404)

        stage = None
        if "stage_id" in serializer.validated_data:
            try:
                stage = Stage.objects.get(pk=serializer.validated_data["stage_id"])
            except Stage.DoesNotExist:
                pass

        ext = os.path.splitext(upload_file.name)[1]
        object_key = f"sessions/{session_id}/{uuid.uuid4()}{ext}"

        resource = Resource.objects.create(
            session=session,
            stage=stage,
            uploaded_by=request.user,
            name=upload_file.name,
            resource_type=serializer.validated_data["resource_type"],
            file_key=object_key,
            size_bytes=upload_file.size,
            content_type=upload_file.content_type,
            is_dry_run_temp=session.is_dry_run,
        )

        # Save to temp file for Celery
        fd, temp_path = tempfile.mkstemp()
        try:
            with os.fdopen(fd, "wb") as f:
                for chunk in upload_file.chunks():
                    f.write(chunk)
            
            # Dispatch async upload (RF-RES-01)
            from .tasks import upload_resource_to_storage
            upload_resource_to_storage.delay(str(resource.pk), temp_path)
        except Exception as e:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            resource.delete()
            return Response({"error": {"message": str(e)}}, status=500)

        return Response(ResourceSerializer(resource).data, status=status.HTTP_202_ACCEPTED)


class SnippetListCreateView(generics.ListCreateAPIView):
    """GET/POST /api/v1/resources/sessions/<id>/snippets/ — RF-RES-02"""
    serializer_class = SnippetSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsInstructor()]
        return [IsParticipantOrInstructor()]

    def get_queryset(self):
        return Snippet.objects.filter(session_id=self.kwargs["session_id"])

    def perform_create(self, serializer):
        serializer.save(
            session_id=self.kwargs["session_id"],
            created_by=self.request.user
        )
