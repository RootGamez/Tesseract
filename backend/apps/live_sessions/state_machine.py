"""
Session state machine — RF-SESSION-02
Transitions: SCHEDULED → LIVE → PAUSED → ENDED
All transitions controlled exclusively by the instructor.
"""
from django.utils import timezone
from django.db import transaction
import structlog

logger = structlog.get_logger(__name__)


class SessionStateMachineError(Exception):
    """Raised when an invalid state transition is attempted."""
    pass


# Valid transitions map
VALID_TRANSITIONS = {
    "SCHEDULED": ["LIVE"],
    "LIVE": ["PAUSED", "ENDED"],
    "PAUSED": ["LIVE", "ENDED"],
    "ENDED": [],  # Terminal state
}


class SessionStateMachine:
    """
    Manages LiveSession state transitions.
    All transitions persist to DB atomically and return the updated session.
    """

    def __init__(self, session):
        self.session = session

    def _can_transition(self, target_state: str) -> bool:
        return target_state in VALID_TRANSITIONS.get(self.session.state, [])

    def _transition(self, target_state: str, **timestamp_kwargs) -> "LiveSession":
        if not self._can_transition(target_state):
            raise SessionStateMachineError(
                f"Transición inválida: {self.session.state} → {target_state}"
            )
        with transaction.atomic():
            self.session.state = target_state
            update_fields = ["state"] + list(timestamp_kwargs.keys())
            for field, value in timestamp_kwargs.items():
                setattr(self.session, field, value)
            self.session.save(update_fields=update_fields)

        logger.info(
            "session_state_transition",
            session_id=str(self.session.pk),
            from_state=self.session.state,
            to_state=target_state,
        )
        return self.session

    def start(self):
        """SCHEDULED → LIVE"""
        return self._transition("LIVE", started_at=timezone.now(), paused_at=None)

    def pause(self):
        """LIVE → PAUSED"""
        return self._transition("PAUSED", paused_at=timezone.now())

    def resume(self):
        """PAUSED → LIVE"""
        return self._transition("LIVE", paused_at=None)

    def end(self):
        """LIVE|PAUSED → ENDED — triggers async post-class tasks."""
        session = self._transition("ENDED", ended_at=timezone.now())
        # Enqueue async post-class tasks (RF-AI-02, RF-ANA-02)
        from apps.live_sessions.tasks import handle_session_ended
        handle_session_ended.delay(str(session.pk))
        return session

    @property
    def available_transitions(self) -> list:
        return VALID_TRANSITIONS.get(self.session.state, [])
