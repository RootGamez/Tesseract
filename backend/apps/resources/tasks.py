"""
Resources Celery tasks — async file upload to MinIO/S3
RF-RES-01: Async upload with RESOURCE_ADDED WebSocket notification
RF-AI-01: Trigger AI question generation after PDF upload
"""
import os
import uuid
from celery import shared_task
import structlog
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from core.websocket_events import RESOURCE_ADDED

logger = structlog.get_logger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def upload_resource_to_storage(self, resource_id: str, temp_file_path: str):
    """
    Upload a resource file to MinIO/S3 asynchronously.
    After upload, notify all session participants via WebSocket.
    RF-RES-01
    """
    from apps.resources.models import Resource
    from apps.resources.storage import upload_file, generate_presigned_url
    from django.utils import timezone
    from datetime import timedelta
    from django.conf import settings

    try:
        resource = Resource.objects.select_related("session").get(pk=resource_id)

        with open(temp_file_path, "rb") as f:
            upload_file(f, resource.file_key, resource.content_type or "application/octet-stream")

        # Generate initial presigned URL
        presigned = generate_presigned_url(resource.file_key)
        resource.presigned_url = presigned
        resource.url_expires_at = timezone.now() + timedelta(seconds=settings.PRESIGNED_URL_TTL)
        resource.is_uploaded = True
        resource.save(update_fields=["presigned_url", "url_expires_at", "is_uploaded"])

        # Notify session via WebSocket
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"session_{resource.session_id}",
            {
                "type": "resource.added",
                "event": RESOURCE_ADDED,
                "payload": {
                    "resource_id": str(resource.pk),
                    "name": resource.name,
                    "url": presigned,
                    "type": resource.resource_type,
                    "size_bytes": resource.size_bytes,
                },
            },
        )

        logger.info("resource_uploaded", resource_id=resource_id, key=resource.file_key)

        # Trigger AI question generation for PDFs (RF-AI-01)
        if resource.resource_type == "PDF":
            from apps.ai_copilot.tasks import generate_questions_from_resource
            generate_questions_from_resource.delay(resource_id)

    except Exception as exc:
        logger.error("resource_upload_failed", resource_id=resource_id, error=str(exc))
        raise self.retry(exc=exc)
    finally:
        # Clean up temp file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


@shared_task
def refresh_expiring_presigned_urls():
    """
    Periodic task: refresh presigned URLs expiring in < 2 hours.
    Should be scheduled every hour via Celery Beat.
    """
    from apps.resources.models import Resource
    from apps.resources.storage import generate_presigned_url
    from django.utils import timezone
    from datetime import timedelta
    from django.conf import settings

    threshold = timezone.now() + timedelta(hours=2)
    expiring = Resource.objects.filter(
        is_uploaded=True,
        url_expires_at__lt=threshold,
    )

    updated = 0
    for resource in expiring:
        try:
            url = generate_presigned_url(resource.file_key)
            resource.presigned_url = url
            resource.url_expires_at = timezone.now() + timedelta(seconds=settings.PRESIGNED_URL_TTL)
            resource.save(update_fields=["presigned_url", "url_expires_at"])
            updated += 1
        except Exception as exc:
            logger.error("url_refresh_failed", resource_id=str(resource.pk), error=str(exc))

    logger.info("presigned_urls_refreshed", count=updated)
