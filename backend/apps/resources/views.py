"""
Resources views — RF-RES-01, RF-RES-02
"""
import uuid
import os
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser

from core.permissions import IsInstructor, IsParticipantOrInstructor
from .models import Resource, Snippet
from .serializers import ResourceSerializer, ResourceUploadSerializer, SnippetSerializer
from .storage import upload_file, generate_presigned_url


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

        uploaded_file = serializer.validated_data["file"]
        resource_type = serializer.validated_data["resource_type"]

        if resource_type == "PRESENTATION":
            allowed_extensions = {".ppt", ".pptx"}
            ext = os.path.splitext(uploaded_file.name)[1].lower()
            if ext not in allowed_extensions:
                return Response(
                    {"error": {"message": "La presentación debe ser un archivo .ppt o .pptx."}},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        
        if uploaded_file.size > 50 * 1024 * 1024:
            return Response(
                {"error": {"message": "El archivo excede el límite de 50MB."}},
                status=status.HTTP_400_BAD_REQUEST
            )

        from apps.live_sessions.models import LiveSession, Stage
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

        ext = os.path.splitext(uploaded_file.name)[1]
        object_key = f"sessions/{session_id}/{uuid.uuid4()}{ext}"

        try:
            if resource_type == "PDF" and (stage is None or stage.stage_type != "PDF"):
                template = session.template
                if template is not None:
                    stage = Stage.objects.create(
                        template=template,
                        title=os.path.splitext(uploaded_file.name)[0],
                        stage_type="PDF",
                        order=Stage.objects.filter(template=template).count(),
                        duration_estimated_minutes=10,
                        config={},
                    )
                    session.current_stage = stage
                    session.save(update_fields=["current_stage"])

            upload_file(uploaded_file, object_key, uploaded_file.content_type or "application/octet-stream")

            resource = Resource.objects.create(
                session=session,
                stage=stage,
                uploaded_by=request.user,
                name=uploaded_file.name,
                resource_type=resource_type,
                file_key=object_key,
                size_bytes=uploaded_file.size,
                content_type=uploaded_file.content_type,
                presigned_url=generate_presigned_url(object_key),
                is_uploaded=True,
                is_dry_run_temp=session.is_dry_run,
            )

            # Dispatch presentation processing using the storage-backed file.
            if resource_type == "PRESENTATION":
                from apps.presentations.tasks import process_presentation_upload
                process_presentation_upload.delay(str(resource.pk))

            # Trigger AI question generation for PDFs (RF-AI-01)
            if resource_type == "PDF":
                from apps.ai_copilot.tasks import generate_questions_from_resource
                generate_questions_from_resource.delay(str(resource.pk))
        except Exception as e:
            Resource.objects.filter(session=session, file_key=object_key).delete()
            return Response({"error": {"message": str(e)}}, status=500)

        return Response(ResourceSerializer(resource).data, status=status.HTTP_201_CREATED)


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
