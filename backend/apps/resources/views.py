"""
Resources views — RF-RES-01, RF-RES-02
"""
import uuid
import os
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser

from core.permissions import IsInstructor, IsParticipantOrInstructor
from .models import Resource, Snippet
from .serializers import ResourceSerializer, ResourceUploadSerializer, SnippetSerializer
from .storage import upload_file, generate_presigned_url, _get_s3_client


# Office/text documents that we render to PDF (via LibreOffice) for the viewer.
DOCUMENT_EXTENSIONS = {".docx", ".doc", ".xlsx", ".ods", ".odt", ".txt", ".md"}


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
    if resource_type == "DOCUMENT":
        ext = os.path.splitext(uploaded_file.name)[1].lower()
        if ext not in DOCUMENT_EXTENSIONS:
            allowed = ", ".join(sorted(DOCUMENT_EXTENSIONS))
            return Response(
                {"error": {"message": f"Tipo de documento no soportado. Formatos permitidos: {allowed}."}},
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

        # `?variant=pdf` serves the PDF rendered from a DOCUMENT resource (for the viewer).
        file_key = resource.file_key
        content_type = resource.content_type or "application/octet-stream"
        filename = resource.name
        if request.query_params.get("variant") == "pdf":
            if not resource.converted_pdf_key:
                return Response(
                    {"detail": "El documento aún se está convirtiendo."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            file_key = resource.converted_pdf_key
            content_type = "application/pdf"
            filename = f"{os.path.splitext(resource.name)[0]}.pdf"

        client = _get_s3_client()
        obj = client.get_object(Bucket=os.environ.get("MINIO_BUCKET_NAME", "tesseract"), Key=file_key)
        body = obj["Body"]
        response = StreamingHttpResponse(body.iter_chunks(), content_type=content_type)
        response["Content-Disposition"] = f'inline; filename="{filename}"'
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
            # PDFs and documents (rendered to PDF) are shown in the PDF viewer stage.
            if resource_type in ("PDF", "DOCUMENT") and (stage is None or stage.stage_type != "PDF"):
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
            if resource_type == "DOCUMENT":
                from apps.resources.tasks import convert_document_to_pdf
                convert_document_to_pdf.delay(str(resource.pk))
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

            # Pre-render documents to PDF so the asset is ready when a class starts.
            if resource_type == "DOCUMENT":
                from apps.resources.tasks import convert_document_to_pdf
                convert_document_to_pdf.delay(str(resource.pk))
        except Exception as e:
            Resource.objects.filter(stage=stage, file_key=object_key).delete()
            return Response({"error": {"message": str(e)}}, status=500)

        return Response(ResourceSerializer(resource).data, status=status.HTTP_201_CREATED)


# ── Entregables (RF-SUBMISSION) ─────────────────────────────────────────────────
#
# A "submission" is a regular Resource attached to a SUBMISSION-type Stage and
# owned by the student who uploaded it (``uploaded_by``). Office/text/ppt files
# are rendered to PDF (``converted_pdf_key``) so the instructor can project any
# submission through the same PDF viewer as the rest of the platform.


def _get_submission_stage(session_id, stage_id, user):
    """
    Resolve a SUBMISSION stage and the membership of ``user`` in its session.
    Returns (stage, session, is_instructor) or raises a ready-to-return Response
    via the sentinel tuple (None, error_response).
    """
    from apps.live_sessions.models import LiveSession, Stage

    try:
        session = LiveSession.objects.get(pk=session_id)
    except LiveSession.DoesNotExist:
        return None, Response({"error": {"message": "Sesión no encontrada."}}, status=status.HTTP_404_NOT_FOUND)

    stage = Stage.objects.filter(pk=stage_id, session=session, stage_type="SUBMISSION").first()
    if stage is None:
        return None, Response({"error": {"message": "Escena de entregables no encontrada."}}, status=status.HTTP_404_NOT_FOUND)

    is_instructor = session.instructor_id == user.id
    is_participant = session.participants.filter(user=user).exists()
    if not (is_instructor or is_participant):
        return None, Response({"detail": "No autorizado."}, status=status.HTTP_403_FORBIDDEN)

    return (stage, session, is_instructor), None


class SubmissionView(APIView):
    """
    GET/POST /api/v1/resources/sessions/<session_id>/stages/<stage_id>/submissions/

    GET  — instructor sees every submission; a student sees only their own.
    POST — a student (or the instructor) uploads/replaces a submission file.

    Membership is enforced explicitly in `_get_submission_stage`; IsAuthenticated
    guarantees a real user before that check runs.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]

    def get(self, request, session_id, stage_id):
        resolved, error = _get_submission_stage(session_id, stage_id, request.user)
        if error:
            return error
        stage, _session, is_instructor = resolved

        qs = Resource.objects.filter(stage=stage).select_related("uploaded_by").order_by("created_at")
        if not is_instructor:
            qs = qs.filter(uploaded_by=request.user)
        return Response(ResourceSerializer(qs, many=True).data)

    def post(self, request, session_id, stage_id):
        resolved, error = _get_submission_stage(session_id, stage_id, request.user)
        if error:
            return error
        stage, session, _is_instructor = resolved

        serializer = ResourceUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        error = _validate_upload(serializer)
        if error:
            return error

        uploaded_file = serializer.validated_data["file"]
        resource_type = serializer.validated_data["resource_type"]
        object_key = f"sessions/{session_id}/submissions/{uuid.uuid4()}{os.path.splitext(uploaded_file.name)[1]}"

        try:
            upload_file(uploaded_file, object_key, uploaded_file.content_type or "application/octet-stream")

            # One submission per student per stage: replace the previous file.
            Resource.objects.filter(stage=stage, uploaded_by=request.user).delete()

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

            # Render office/text/PPT submissions to PDF so they can be projected in
            # the shared PDF viewer (PDFs are already viewable as-is). We deliberately
            # do NOT build a collaborative slide deck for PPT submissions.
            if resource_type in ("DOCUMENT", "PRESENTATION"):
                from apps.resources.tasks import convert_document_to_pdf
                convert_document_to_pdf.delay(str(resource.pk))
        except Exception as e:
            Resource.objects.filter(stage=stage, file_key=object_key).delete()
            return Response({"error": {"message": str(e)}}, status=500)

        return Response(ResourceSerializer(resource).data, status=status.HTTP_201_CREATED)


class SubmissionDeleteView(APIView):
    """
    DELETE /api/v1/resources/sessions/<session_id>/submissions/<resource_id>/

    A student may remove their own submission; the instructor may remove any.
    """
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, session_id, resource_id):
        resource = Resource.objects.select_related("session", "stage").filter(
            pk=resource_id, session_id=session_id
        ).first()
        if resource is None or resource.session is None:
            return Response({"detail": "Entregable no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        is_instructor = resource.session.instructor_id == request.user.id
        if not (is_instructor or resource.uploaded_by_id == request.user.id):
            return Response({"detail": "No autorizado."}, status=status.HTTP_403_FORBIDDEN)

        resource.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
