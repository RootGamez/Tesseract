"""
Authentication Celery tasks — email sending
"""
from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.contrib.auth import get_user_model
import structlog

logger = structlog.get_logger(__name__)
User = get_user_model()


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_password_reset_email(self, user_id: str, token: str):
    """Send password reset email (RF-AUTH-01)."""
    try:
        user = User.objects.get(pk=user_id)
        reset_url = f"{settings.FRONTEND_URL}/auth/password-reset/confirm?token={token}"
        send_mail(
            subject="Restablecer tu contraseña — Plataforma Acompañamiento",
            message=f"Haz clic en el siguiente enlace para restablecer tu contraseña:\n{reset_url}\n\nEste enlace expira en 1 hora.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        logger.info("password_reset_email_sent", user_id=str(user_id))
    except User.DoesNotExist:
        logger.error("password_reset_user_not_found", user_id=str(user_id))
    except Exception as exc:
        logger.error("password_reset_email_failed", error=str(exc), user_id=str(user_id))
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_invitation_email(self, invitation_id: str):
    """Send organization invitation email (RF-AUTH-03)."""
    try:
        from .models import Invitation
        invitation = Invitation.objects.select_related("organization", "invited_by").get(pk=invitation_id)
        accept_url = f"{settings.FRONTEND_URL}/auth/invitations/accept?token={invitation.token}"
        send_mail(
            subject=f"Invitación a {invitation.organization.name} — Plataforma Acompañamiento",
            message=(
                f"Hola,\n\n"
                f"{invitation.invited_by.display_name} te ha invitado a unirte a {invitation.organization.name} "
                f"como {invitation.get_role_display()}.\n\n"
                f"Acepta la invitación aquí:\n{accept_url}\n\n"
                f"Esta invitación expira el {invitation.expires_at.strftime('%d/%m/%Y')}."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[invitation.email],
            fail_silently=False,
        )
        logger.info("invitation_email_sent", invitation_id=str(invitation_id))
    except Exception as exc:
        logger.error("invitation_email_failed", error=str(exc), invitation_id=str(invitation_id))
        raise self.retry(exc=exc)
