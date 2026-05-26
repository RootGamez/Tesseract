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


def _get_s3_client(endpoint_url: str | None = None):
    """Return a boto3 S3 client configured for MinIO or AWS S3."""
    kwargs = {
        "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
        "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
        "config": Config(signature_version="s3v4"),
    }
    endpoint = endpoint_url or getattr(settings, "AWS_S3_ENDPOINT_URL", None)
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
        # Ensure bucket exists
        try:
            client.head_bucket(Bucket=bucket)
        except Exception:
            client.create_bucket(Bucket=bucket)

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

    public_endpoint = getattr(settings, "MINIO_PUBLIC_URL", None)
    client = _get_s3_client(public_endpoint)
    bucket = settings.AWS_STORAGE_BUCKET_NAME

    try:
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": object_key},
            ExpiresIn=ttl_seconds,
        )

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
    if resource.presigned_url and resource.url_expires_at and resource.url_expires_at > now:
        return resource.presigned_url

    url = generate_presigned_url(resource.file_key)
    resource.presigned_url = url
    resource.url_expires_at = now + timedelta(seconds=settings.PRESIGNED_URL_TTL)
    return url
