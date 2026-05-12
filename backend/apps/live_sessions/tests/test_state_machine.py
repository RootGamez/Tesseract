import pytest
from apps.live_sessions.state_machine import SessionStateMachine, SessionStateMachineError

@pytest.mark.django_db
class TestSessionStateMachine:
    def test_initial_state_is_scheduled(self, live_session):
        assert live_session.state == "SCHEDULED"

    def test_start_session(self, live_session):
        fsm = SessionStateMachine(live_session)
        fsm.start()
        
        assert live_session.state == "LIVE"
        assert live_session.started_at is not None

    def test_pause_session(self, live_session):
        fsm = SessionStateMachine(live_session)
        fsm.start()  # Must be LIVE first
        fsm.pause()
        
        assert live_session.state == "PAUSED"

    def test_end_session(self, live_session):
        fsm = SessionStateMachine(live_session)
        fsm.start()
        fsm.end()
        
        assert live_session.state == "ENDED"
        assert live_session.ended_at is not None

    def test_invalid_transition_raises_error(self, live_session):
        fsm = SessionStateMachine(live_session)
        # Cannot pause a SCHEDULED session
        with pytest.raises(SessionStateMachineError):
            fsm.pause()
