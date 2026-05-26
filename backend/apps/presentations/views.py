from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Presentation, PresentationAnnotation
from .serializers import PresentationSerializer


class PresentationStateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, session_id):
        presentation = (
            Presentation.objects.select_related("session")
            .prefetch_related("slides", "annotations")
            .filter(session_id=session_id)
            .order_by("-created_at")
            .first()
        )
        if not presentation:
            return Response({"detail": "No presentation found for this session."}, status=404)

        slide = presentation.slides.order_by("index").filter(index=presentation.current_slide_index).first()
        annotation = None
        if slide:
            annotation = PresentationAnnotation.objects.filter(presentation=presentation, slide=slide).first()

        payload = PresentationSerializer(presentation).data
        payload["current_slide"] = {
            "id": str(slide.id) if slide else None,
            "index": slide.index if slide else presentation.current_slide_index,
            "image_key": slide.image_key if slide else None,
            "thumbnail_key": slide.thumbnail_key if slide else None,
            "mime_type": slide.mime_type if slide else None,
        }
        payload["current_annotation"] = {
            "id": str(annotation.id) if annotation else None,
            "revision": annotation.revision if annotation else 0,
            "canvas_state": annotation.canvas_state if annotation else {},
        }
        return Response(payload)
