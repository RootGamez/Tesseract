"""
Storage service — MinIO / S3 via boto3 (RF-RES-01, RNF-INFRA-02, RNF-SEC-02)
"""
import boto3
from botocore.config import Config
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
import structlog

logger = structlog.get_logger(__name__)


def _get_s3_client():
    """Return a boto3 S3 client configured for MinIO or AWS S3."""
    kwargs = {
        "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
        "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
        "config": Config(signature_version="s3v4"),
    }
    endpoint = getattr(settings, "AWS_S3_ENDPOINT_URL", None)
    if endpoint:
        kwargs["endpoint_url"] = endpoint

    region = getattr(settings, "AWS_S3_REGION_NAME", "us-east-1")
    kwargs["region_name"] = region

    return boto3.client("s3", **kwargs)


def upload_file(file_obj, object_key: str, content_type: str = "application/octet-stream") -> str:
    """
    Upload a file-like object to S3/MinIO.
    Returns the object key.
    Max size enforced at view level (50MB — RF-RES-01).
    """
    client = _get_s3_client()
    bucket = settings.AWS_STORAGE_BUCKET_NAME

    try:
        client.upload_fileobj(
            file_obj,
            bucket,
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
        logger.info("file_uploaded", bucket=bucket, key=object_key)
        return object_key
    except Exception as exc:
        logger.error("file_upload_failed", key=object_key, error=str(exc))
        raise


def generate_presigned_url(object_key: str, ttl_seconds: int = None) -> str:
    """
    Generate a pre-signed URL for private file access (RNF-SEC-02).
    Default TTL from settings.PRESIGNED_URL_TTL (24h).
    """
    if ttl_seconds is None:
        ttl_seconds = getattr(settings, "PRESIGNED_URL_TTL", 86400)

    from urllib.parse import urlparse, urlunparse

    client = _get_s3_client()
    bucket = settings.AWS_STORAGE_BUCKET_NAME

    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": object_key},
            ExpiresIn=ttl_seconds,
        )

        # Optionally rewrite internal MinIO host to a public URL for browser access.
        # Configure `MINIO_PUBLIC_URL` in environment if you need a custom host.
        public_base = getattr(settings, "MINIO_PUBLIC_URL", None)
        if public_base and settings.AWS_S3_ENDPOINT_URL:
            try:
                parsed = urlparse(url)
                public_parsed = urlparse(public_base)
                # replace scheme and netloc with public values
                new_parsed = parsed._replace(scheme=public_parsed.scheme or parsed.scheme, netloc=public_parsed.netloc or parsed.netloc)
                url = urlunparse(new_parsed)
            except Exception:
                # If anything fails, fall back to the original URL
                pass

        return url
    except Exception as exc:
        logger.error("presigned_url_generation_failed", key=object_key, error=str(exc))
        raise


def delete_file(object_key: str) -> bool:
    """Delete a file from S3/MinIO."""
    client = _get_s3_client()
    bucket = settings.AWS_STORAGE_BUCKET_NAME
    try:
        client.delete_object(Bucket=bucket, Key=object_key)
        logger.info("file_deleted", bucket=bucket, key=object_key)
        return True
    except Exception as exc:
        logger.error("file_delete_failed", key=object_key, error=str(exc))
        return False


def get_or_refresh_presigned_url(resource) -> str:
    """
    Return cached presigned URL or generate a new one if expired.
    Updates the resource model in-place but does NOT save to DB.
    """
    now = timezone.now()
    public_base = getattr(settings, "MINIO_PUBLIC_URL", None)

    def _rewrite(url: str) -> str:
        if not url or not public_base or not settings.AWS_S3_ENDPOINT_URL:
            return url
        try:
            from urllib.parse import urlparse, urlunparse
            parsed = urlparse(url)
            public_parsed = urlparse(public_base)
            new_parsed = parsed._replace(scheme=public_parsed.scheme or parsed.scheme, netloc=public_parsed.netloc or parsed.netloc)
            return urlunparse(new_parsed)
        except Exception:
            return url

    if resource.presigned_url and resource.url_expires_at and resource.url_expires_at > now:
        return _rewrite(resource.presigned_url)

    url = generate_presigned_url(resource.file_key)
    resource.presigned_url = url
    resource.url_expires_at = now + timedelta(seconds=settings.PRESIGNED_URL_TTL)
    return _rewrite(url)
