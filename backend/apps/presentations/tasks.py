"""
Celery tasks for collaborative presentations.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import structlog
from celery import shared_task
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

logger = structlog.get_logger(__name__)


def _convert_with_office(source_file_path: str, output_dir: str) -> list[Path]:
    commands = [
        ["soffice", "--headless", "--convert-to", "png", "--outdir", output_dir, source_file_path],
        ["unoconv", "-f", "png", "-o", output_dir, source_file_path],
    ]

    last_error: Exception | None = None
    for command in commands:
        try:
            completed = subprocess.run(command, capture_output=True, check=True, text=True)
            logger.info("presentation_convert_ok", command=" ".join(command), stdout=completed.stdout, stderr=completed.stderr)
            break
        except Exception as exc:
            last_error = exc
    else:
        raise RuntimeError(f"Could not convert presentation: {last_error}")

    return sorted(Path(output_dir).glob("*.png"))


def _store_slide_image(presentation_id: str, slide_index: int, image_path: Path) -> tuple[str, int, int, str]:
    try:
        from PIL import Image

        with Image.open(image_path) as image:
            width, height = image.size
            temp_output = image_path.with_suffix(".webp")
            image.save(temp_output, format="WEBP", quality=82, method=6)
            storage_name = f"presentations/{presentation_id}/slides/slide-{slide_index + 1}.webp"
            with open(temp_output, "rb") as file_handle:
                default_storage.save(storage_name, ContentFile(file_handle.read()))
            return storage_name, width, height, "image/webp"
    except Exception:
        with open(image_path, "rb") as file_handle:
            content = file_handle.read()
        storage_name = f"presentations/{presentation_id}/slides/slide-{slide_index + 1}.png"
        default_storage.save(storage_name, ContentFile(content))
        return storage_name, 0, 0, "image/png"


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def process_presentation_upload(self, resource_id: str, source_file_path: str | None = None):
    from apps.presentations.models import Presentation, PresentationSlide
    from apps.resources.models import Resource

    temp_dir = tempfile.mkdtemp(prefix="presentation-render-")
    downloaded_temp = None
    try:
        resource = Resource.objects.select_related("session", "uploaded_by").get(pk=resource_id)
        # If no local source file path provided (or file not accessible by worker),
        # download the file from default storage to a temp file so conversion can run.
        if not source_file_path or not Path(source_file_path).exists():
            fd, downloaded_temp = tempfile.mkstemp(suffix="." + (resource.name.rsplit('.', 1)[-1] if '.' in resource.name else 'tmp'))
            os.close(fd)
            with open(downloaded_temp, "wb") as out_f:
                with default_storage.open(resource.file_key, "rb") as in_f:
                    out_f.write(in_f.read())
            source_file_path = downloaded_temp
        presentation, _ = Presentation.objects.get_or_create(
            session=resource.session,
            defaults={
                "uploaded_by": resource.uploaded_by,
                "title": resource.name.rsplit(".", 1)[0],
                "source_file_key": resource.file_key,
                "status": Presentation.Status.PROCESSING,
            },
        )
        presentation.uploaded_by = resource.uploaded_by
        presentation.title = resource.name.rsplit(".", 1)[0]
        presentation.source_file_key = resource.file_key
        presentation.status = Presentation.Status.PROCESSING
        presentation.save(update_fields=["uploaded_by", "title", "source_file_key", "status", "updated_at"])

        slide_images = _convert_with_office(source_file_path, temp_dir)
        PresentationSlide.objects.filter(presentation=presentation).delete()

        for index, image_path in enumerate(slide_images):
            image_key, width, height, mime_type = _store_slide_image(str(presentation.pk), index, image_path)
            PresentationSlide.objects.create(
                presentation=presentation,
                index=index,
                image_key=image_key,
                mime_type=mime_type,
                width=width,
                height=height,
                render_metadata={"source": "libreoffice", "optimized": mime_type == "image/webp"},
            )

        presentation.total_slides = PresentationSlide.objects.filter(presentation=presentation).count()
        presentation.current_slide_index = 0
        presentation.status = Presentation.Status.READY
        presentation.save(update_fields=["total_slides", "current_slide_index", "status", "updated_at"])
        return {"presentation_id": str(presentation.pk), "slides": presentation.total_slides}
    except Exception as exc:
        logger.error("presentation_processing_failed", resource_id=resource_id, error=str(exc))
        try:
            Presentation.objects.filter(pk=resource_id).update(status=Presentation.Status.FAILED)
        except Exception:
            pass
        raise self.retry(exc=exc)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        if downloaded_temp and os.path.exists(downloaded_temp):
            try:
                os.remove(downloaded_temp)
            except Exception:
                pass
