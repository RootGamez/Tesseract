"""
Resources views — RF-RES-01, RF-RES-02
"""
import uuid
import os
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser

from core.permissions import IsInstructor, IsParticipantOrInstructor
from .models import Resource, Snippet
from .serializers import ResourceSerializer, ResourceUploadSerializer, SnippetSerializer
from .storage import upload_file, generate_presigned_url, _get_s3_client


def _validate_upload(serializer):
    """Shared validation for uploaded files (type + size). Returns an error Response or None."""
    uploaded_file = serializer.validated_data["file"]
    resource_type = serializer.validated_data["resource_type"]

    if resource_type == "PRESENTATION":
        ext = os.path.splitext(uploaded_file.name)[1].lower()
        if ext not in {".ppt", ".pptx"}:
            return Response(
                {"error": {"message": "La presentación debe ser un archivo .ppt o .pptx."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
    if uploaded_file.size > 50 * 1024 * 1024:
        return Response(
            {"error": {"message": "El archivo excede el límite de 50MB."}},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


class ResourceListView(generics.ListAPIView):
    """GET /api/v1/resources/sessions/<id>/files/"""
    serializer_class = ResourceSerializer
    permission_classes = [IsParticipantOrInstructor]

    def get_queryset(self):
        return Resource.objects.filter(session_id=self.kwargs["session_id"])


class TemplateResourceListView(generics.ListAPIView):
    """GET /api/v1/resources/templates/<template_id>/files/ — assets stored on a template."""
    serializer_class = ResourceSerializer
    permission_classes = [IsInstructor]

    def get_queryset(self):
        from apps.live_sessions.models import ClassTemplate
        template = get_object_or_404(ClassTemplate, pk=self.kwargs["template_id"], owner=self.request.user)
        return Resource.objects.filter(stage__template=template)


class ResourceDownloadView(APIView):
    """GET /api/v1/resources/<resource_id>/download/"""
    permission_classes = [IsParticipantOrInstructor]

    def get(self, request, resource_id):
        resource = Resource.objects.select_related("session", "stage", "stage__template").get(pk=resource_id)
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        if not self._can_access(resource, request.user):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        client = _get_s3_client()
        obj = client.get_object(Bucket=os.environ.get("MINIO_BUCKET_NAME", "tesseract"), Key=resource.file_key)
        body = obj["Body"]
        response = StreamingHttpResponse(body.iter_chunks(), content_type=resource.content_type or "application/octet-stream")
        response["Content-Disposition"] = f'inline; filename="{resource.name}"'
        return response

    @staticmethod
    def _can_access(resource, user):
        if resource.session:
            if resource.session.instructor_id == user.id:
                return True
            return resource.session.participants.filter(user=user).exists()
        # Template asset: only the template owner can access it.
        if resource.stage and resource.stage.template:
            return resource.stage.template.owner_id == user.id
        return False


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

        error = _validate_upload(serializer)
        if error:
            return error

        uploaded_file = serializer.validated_data["file"]
        resource_type = serializer.validated_data["resource_type"]

        from django.db.models import Max
        from apps.live_sessions.models import LiveSession, Stage
        try:
            session = LiveSession.objects.get(pk=session_id, instructor=request.user)
        except LiveSession.DoesNotExist:
            return Response({"error": {"message": "Sesión no encontrada."}}, status=404)

        stage = None
        if "stage_id" in serializer.validated_data:
            stage = Stage.objects.filter(pk=serializer.validated_data["stage_id"], session=session).first()

        object_key = f"sessions/{session_id}/{uuid.uuid4()}{os.path.splitext(uploaded_file.name)[1]}"

        try:
            if resource_type == "PDF" and (stage is None or stage.stage_type != "PDF"):
                agg = Stage.objects.filter(session=session).aggregate(max_order=Max("order"))
                next_order = (agg["max_order"] + 1) if agg["max_order"] is not None else 0
                stage = Stage.objects.create(
                    session=session,
                    title=os.path.splitext(uploaded_file.name)[0],
                    stage_type="PDF",
                    order=next_order,
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

            if resource_type == "PRESENTATION":
                from apps.presentations.tasks import process_presentation_upload
                process_presentation_upload.delay(str(resource.pk))
            if resource_type == "PDF":
                from apps.ai_copilot.tasks import generate_questions_from_resource
                generate_questions_from_resource.delay(str(resource.pk))
        except Exception as e:
            Resource.objects.filter(session=session, file_key=object_key).delete()
            return Response({"error": {"message": str(e)}}, status=500)

        return Response(ResourceSerializer(resource).data, status=status.HTTP_201_CREATED)


class TemplateResourceUploadView(APIView):
    """
    POST /api/v1/resources/templates/<template_id>/upload/
    Stores a file as a reusable asset on a template stage. It is copied into the
    live session (with session-scoped processing) when a class is started.
    """
    permission_classes = [IsInstructor]
    parser_classes = [MultiPartParser]

    def post(self, request, template_id):
        serializer = ResourceUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        error = _validate_upload(serializer)
        if error:
            return error

        uploaded_file = serializer.validated_data["file"]
        resource_type = serializer.validated_data["resource_type"]

        from apps.live_sessions.models import ClassTemplate, Stage
        template = get_object_or_404(ClassTemplate, pk=template_id, owner=request.user)

        stage_id = serializer.validated_data.get("stage_id")
        stage = Stage.objects.filter(pk=stage_id, template=template).first() if stage_id else None
        if stage is None:
            return Response({"error": {"message": "Escena no encontrada en esta plantilla."}}, status=status.HTTP_404_NOT_FOUND)

        object_key = f"templates/{template_id}/{uuid.uuid4()}{os.path.splitext(uploaded_file.name)[1]}"

        try:
            upload_file(uploaded_file, object_key, uploaded_file.content_type or "application/octet-stream")

            # Replace any previous asset on this stage so re-uploads don't pile up.
            Resource.objects.filter(stage=stage, session__isnull=True).delete()

            resource = Resource.objects.create(
                session=None,
                stage=stage,
                uploaded_by=request.user,
                name=uploaded_file.name,
                resource_type=resource_type,
                file_key=object_key,
                size_bytes=uploaded_file.size,
                content_type=uploaded_file.content_type,
                presigned_url=generate_presigned_url(object_key),
                is_uploaded=True,
            )
        except Exception as e:
            Resource.objects.filter(stage=stage, file_key=object_key).delete()
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
