"""
Authentication signals — post-register hooks
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
import structlog

logger = structlog.get_logger(__name__)
User = get_user_model()


@receiver(post_save, sender=User)
def log_user_created(sender, instance, created, **kwargs):
    if created:
        logger.info(
            "user_created",
            user_id=str(instance.pk),
            email=instance.email,
            role=instance.role,
        )
