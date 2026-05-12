"""
Sessions Celery tasks — post-session processing
"""
from celery import shared_task
import structlog

logger = structlog.get_logger(__name__)


@shared_task(bind=True, max_retries=3)
def handle_session_ended(self, session_id: str):
    """
    Triggered when a session transitions to ENDED.
    Orchestrates: AI summary, analytics aggregation, board snapshot finalization.
    RF-AI-02, RF-ANA-02
    """
    try:
        logger.info("session_ended_processing_start", session_id=session_id)

        # Generate AI summary (RF-AI-02)
        from apps.ai_copilot.tasks import generate_session_summary
        generate_session_summary.delay(session_id)

        # Aggregate analytics (RF-ANA-02)
        from apps.analytics.tasks import aggregate_session_analytics
        aggregate_session_analytics.delay(session_id)

        logger.info("session_ended_processing_done", session_id=session_id)
    except Exception as exc:
        logger.error("session_ended_processing_failed", session_id=session_id, error=str(exc))
        raise self.retry(exc=exc, countdown=30)


@shared_task
def cleanup_dry_run_session(session_id: str):
    """
    Remove temporary data from dry-run sessions (RF-SESSION-03).
    Participants, board snapshots, and resources created during dry-run
    are purged without affecting permanent storage quota.
    """
    from apps.live_sessions.models import LiveSession
    from apps.board.models import BoardSnapshot
    from apps.resources.models import Resource

    try:
        session = LiveSession.objects.get(pk=session_id, is_dry_run=True)
        # Delete associated temporary data
        BoardSnapshot.objects.filter(session=session).delete()
        Resource.objects.filter(session=session, is_dry_run_temp=True).delete()
        session.participants.all().delete()
        logger.info("dry_run_cleanup_done", session_id=session_id)
    except LiveSession.DoesNotExist:
        logger.warning("dry_run_session_not_found", session_id=session_id)
    except Exception as exc:
        logger.error("dry_run_cleanup_failed", session_id=session_id, error=str(exc))


@shared_task
def expire_join_code(session_id: str):
    """Invalidate join code when a session ends (RF-AUTH-02)."""
    from apps.live_sessions.models import LiveSession
    import random
    import string
    try:
        session = LiveSession.objects.get(pk=session_id)
        # Rotate code so it can no longer be reused
        session.join_code = "__EXPIRED_" + "".join(random.choices(string.ascii_uppercase, k=3))
        session.save(update_fields=["join_code"])
    except LiveSession.DoesNotExist:
        pass
