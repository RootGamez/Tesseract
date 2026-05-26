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
def process_presentation_upload(self, presentation_id: str, source_file_path: str):
    from apps.presentations.models import Presentation, PresentationSlide

    temp_dir = tempfile.mkdtemp(prefix="presentation-render-")
    try:
        presentation = Presentation.objects.get(pk=presentation_id)
        presentation.status = Presentation.Status.PROCESSING
        presentation.save(update_fields=["status", "updated_at"])

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
        logger.error("presentation_processing_failed", presentation_id=presentation_id, error=str(exc))
        Presentation.objects.filter(pk=presentation_id).update(status=Presentation.Status.FAILED)
        raise self.retry(exc=exc)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
