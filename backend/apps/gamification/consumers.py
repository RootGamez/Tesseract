"""
Gamification WebSocket Consumer
RF-GAME-01: SPINNER_RESULT — random participant selector
RF-GAME-02: POINTS_AWARDED — point assignment
RF-GAME-03: EMOJI_FIRED — emoji reactions with rate limiting
RF-GAME-04: TIMER_STARTED/PAUSED/CANCELLED
RF-GAME-05: QUIZ_LAUNCHED / QUIZ_RESULTS
"""
import json
import random
import structlog
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.utils import timezone
from django.core.cache import cache

from core.websocket_events import (
    POINTS_AWARDED, EMOJI_FIRED, TIMER_STARTED, TIMER_PAUSED, TIMER_CANCELLED,
    SPINNER_RESULT, QUIZ_LAUNCHED, QUIZ_RESULTS, QUIZ_RESPONSE, WS_ERROR,
    ROULETTE_OPEN, ROULETTE_SPIN, ROULETTE_CLOSE,
)
from core.throttling import EmojiRateLimit, WebSocketMessageThrottle

logger = structlog.get_logger(__name__)


class GamificationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for gamification events.
    URL: ws://host/ws/gamification/<session_id>/
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.session_id = None
        self.game_group = None
        self.throttle = WebSocketMessageThrottle()

    async def connect(self):
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.game_group = f"gamification_{self.session_id}"
        self.user = user
        self.participant = await self._get_participant()

        await self.channel_layer.group_add(self.game_group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if self.game_group:
            await self.channel_layer.group_discard(self.game_group, self.channel_name)

    async def receive(self, text_data):
        if not self.throttle.is_allowed():
            return

        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        event_type = data.get("event")
        payload = data.get("payload", {})
        is_instructor = await self._is_instructor()

        if event_type == EMOJI_FIRED:
            await self._handle_emoji(payload)

        elif event_type == QUIZ_RESPONSE:
            await self._handle_quiz_response(payload)

        elif is_instructor:
            # Instructor-only events
            if event_type == POINTS_AWARDED:
                await self._handle_points_awarded(payload)
            elif event_type == SPINNER_RESULT:
                await self._handle_spinner(payload)
            elif event_type == TIMER_STARTED:
                await self._handle_timer_started(payload)
            elif event_type == TIMER_PAUSED:
                await self._handle_timer_paused(payload)
            elif event_type == TIMER_CANCELLED:
                await self._handle_timer_cancelled(payload)
            elif event_type == QUIZ_LAUNCHED:
                await self._handle_quiz_launched(payload)
            elif event_type == ROULETTE_OPEN:
                await self._handle_roulette_open(payload)
            elif event_type == ROULETTE_SPIN:
                await self._handle_roulette_spin(payload)
            elif event_type == ROULETTE_CLOSE:
                await self._handle_roulette_close(payload)
        else:
            await self.send(text_data=json.dumps({
                "event": WS_ERROR,
                "payload": {"message": "Acción no autorizada."},
            }))

    # ── Event handlers ─────────────────────────────────────────────────────────

    async def _handle_emoji(self, payload):
        """RF-GAME-03: Rate-limited emoji reactions."""
        import redis as redis_lib
        from django.conf import settings
        r = redis_lib.from_url(settings.REDIS_URL)

        if not EmojiRateLimit.is_allowed(r, str(self.user.pk)):
            await self.send(text_data=json.dumps({
                "event": WS_ERROR,
                "payload": {"message": "Has enviado demasiados emojis. Espera un momento."},
            }))
            return

        await self.channel_layer.group_send(
            self.game_group,
            {
                "type": "emoji.fired",
                "event": EMOJI_FIRED,
                "payload": {
                    "emoji": payload.get("emoji", "👍"),
                    "student_id": str(self.user.pk),
                    "display_name": self.user.display_name,
                    "timestamp": timezone.now().isoformat(),
                },
            },
        )

    async def _handle_points_awarded(self, payload):
        """RF-GAME-02: Assign points to a participant."""
        participant_id = payload.get("participant_id")
        points = max(1, min(int(payload.get("points", 1)), 100))
        action_label = payload.get("action_label", "Participación")

        participant, new_total = await self._award_points(participant_id, points, action_label)
        if not participant:
            return

        await self.channel_layer.group_send(
            self.game_group,
            {
                "type": "points.awarded",
                "event": POINTS_AWARDED,
                "payload": {
                    "student_id": str(participant.user_id) if participant.user_id else None,
                    "participant_id": str(participant.pk),
                    "name": participant.display_name,
                    "points": points,
                    "total": new_total,
                    "action_label": action_label,
                },
            },
        )

    async def _handle_spinner(self, payload):
        """RF-GAME-01: Select random participant."""
        excluded = payload.get("excluded_ids", [])
        participant = await self._pick_random_participant(excluded)
        if not participant:
            return

        await self.channel_layer.group_send(
            self.game_group,
            {
                "type": "spinner.result",
                "event": SPINNER_RESULT,
                "payload": {
                    "participant_id": str(participant.pk),
                    "student_id": str(participant.user_id) if participant.user_id else None,
                    "name": participant.display_name,
                },
            },
        )

    async def _handle_timer_started(self, payload):
        """RF-GAME-04: Start synchronized timer."""
        import datetime
        duration = int(payload.get("duration_seconds", 60))
        label = payload.get("label", "Temporizador")
        end_time = timezone.now() + datetime.timedelta(seconds=duration)

        timer = await self._create_timer(label, duration, end_time)

        await self.channel_layer.group_send(
            self.game_group,
            {
                "type": "timer.started",
                "event": TIMER_STARTED,
                "payload": {
                    "timer_id": str(timer.pk),
                    "label": label,
                    "end_timestamp_utc": end_time.isoformat(),
                    "duration_seconds": duration,
                },
            },
        )

    async def _handle_timer_paused(self, payload):
        timer_id = payload.get("timer_id")
        timer = await self._update_timer_state(timer_id, "PAUSED")
        if timer:
            await self.channel_layer.group_send(
                self.game_group,
                {
                    "type": "timer.paused",
                    "event": TIMER_PAUSED,
                    "payload": {
                        "timer_id": timer_id,
                        "remaining_seconds": timer.remaining_seconds or 0
                    }
                },
            )

    async def _handle_timer_cancelled(self, payload):
        timer_id = payload.get("timer_id")
        await self._update_timer_state(timer_id, "CANCELLED")
        await self.channel_layer.group_send(
            self.game_group,
            {"type": "timer.cancelled", "event": TIMER_CANCELLED, "payload": {"timer_id": timer_id}},
        )

    async def _handle_quiz_launched(self, payload):
        """RF-GAME-05: Launch quiz to all participants."""
        question_id = payload.get("question_id")
        question = await self._get_question(question_id)
        if not question:
            logger.warning("quiz_launch_question_not_found",
                           session_id=self.session_id, question_id=str(question_id))
            await self.send(text_data=json.dumps({
                "event": WS_ERROR,
                "payload": {"message": "No se pudo lanzar la pregunta: no pertenece a esta sesión."},
            }))
            return
        await self._mark_question_launched(question)
        await self.channel_layer.group_send(
            self.game_group,
            {
                "type": "quiz.launched",
                "event": QUIZ_LAUNCHED,
                "payload": {
                    "question_id": str(question.pk),
                    "text": question.text,
                    "question_type": question.question_type,
                    "options": [
                        {"text": o["text"], "id": i} for i, o in enumerate(question.options)
                    ],
                    "duration_s": question.duration_seconds,
                },
            },
        )

    async def _handle_quiz_response(self, payload):
        """RF-GAME-05: Record student answer."""
        question_id = payload.get("question_id")
        answer_index = payload.get("answer_index", payload.get("answer", ""))
        await self._save_quiz_response(question_id, answer_index)
        # Broadcast aggregated results to instructor group
        results = await self._get_quiz_results(question_id)
        await self.channel_layer.group_send(
            self.game_group,
            {
                "type": "quiz.results",
                "event": QUIZ_RESULTS,
                "payload": results,
            },
        )

    async def _handle_roulette_open(self, payload):
        await self.channel_layer.group_send(
            self.game_group,
            {
                "type": "roulette.open",
                "event": ROULETTE_OPEN,
                "payload": payload,
            },
        )

    async def _handle_roulette_spin(self, payload):
        await self.channel_layer.group_send(
            self.game_group,
            {
                "type": "roulette.spin",
                "event": ROULETTE_SPIN,
                "payload": payload,
            },
        )

    async def _handle_roulette_close(self, payload):
        await self.channel_layer.group_send(
            self.game_group,
            {
                "type": "roulette.close",
                "event": ROULETTE_CLOSE,
                "payload": payload,
            },
        )

    # ── Group message handlers ─────────────────────────────────────────────────

    async def emoji_fired(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def points_awarded(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def spinner_result(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def timer_started(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def timer_paused(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def timer_cancelled(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def quiz_launched(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def quiz_results(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def roulette_open(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def roulette_spin(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    async def roulette_close(self, event):
        await self.send(text_data=json.dumps({"event": event["event"], "payload": event["payload"]}))

    # ── DB helpers ─────────────────────────────────────────────────────────────

    @database_sync_to_async
    def _get_participant(self):
        from apps.live_sessions.models import Participant
        try:
            return Participant.objects.get(session_id=self.session_id, user=self.user)
        except Participant.DoesNotExist:
            # Guest or instructor — try by display_name
            display_name = getattr(self.user, "display_name", None) or getattr(self.user, "username", None)
            if display_name:
                return Participant.objects.filter(
                    session_id=self.session_id, display_name=display_name
                ).first()
            return None
        except Exception:
            return None

    @database_sync_to_async
    def _is_instructor(self) -> bool:
        from apps.live_sessions.models import LiveSession
        try:
            return LiveSession.objects.filter(pk=self.session_id, instructor=self.user).exists()
        except Exception:
            return False

    @database_sync_to_async
    def _award_points(self, participant_id: str, points: int, label: str):
        from apps.live_sessions.models import Participant
        from apps.gamification.models import PointEvent
        try:
            participant = Participant.objects.get(pk=participant_id, session_id=self.session_id)
            PointEvent.objects.create(
                session_id=self.session_id,
                participant=participant,
                points=points,
                action_label=label,
                awarded_by=self.user,
            )
            participant.points += points
            participant.save(update_fields=["points"])
            return participant, participant.points
        except Exception:
            return None, 0

    @database_sync_to_async
    def _pick_random_participant(self, excluded_ids: list):
        from apps.live_sessions.models import LiveSession, Participant
        try:
            session = LiveSession.objects.get(pk=self.session_id)
            instructor_id = session.instructor_id
        except Exception:
            instructor_id = None
        qs = Participant.objects.filter(
            session_id=self.session_id,
            connection_status="ONLINE",
        ).exclude(pk__in=excluded_ids).exclude(user_id=instructor_id)
        participants = list(qs)
        return random.choice(participants) if participants else None

    @database_sync_to_async
    def _create_timer(self, label: str, duration: int, end_time):
        from apps.gamification.models import Timer
        return Timer.objects.create(
            session_id=self.session_id,
            label=label,
            duration_seconds=duration,
            end_timestamp_utc=end_time,
        )

    @database_sync_to_async
    def _update_timer_state(self, timer_id: str, state: str):
        from apps.gamification.models import Timer
        try:
            timer = Timer.objects.get(pk=timer_id, session_id=self.session_id)
            timer.state = state
            if state == "PAUSED":
                timer.paused_at = timezone.now()
                if timer.end_timestamp_utc:
                    delta = timer.end_timestamp_utc - timezone.now()
                    timer.remaining_seconds = max(0, int(delta.total_seconds()))
                timer.save(update_fields=["state", "paused_at", "remaining_seconds"])
            else:
                timer.save(update_fields=["state"])
            return timer
        except Timer.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_question(self, question_id: str):
        from apps.gamification.models import QuizQuestion
        try:
            return QuizQuestion.objects.get(pk=question_id, session_id=self.session_id)
        except QuizQuestion.DoesNotExist:
            return None

    @database_sync_to_async
    def _mark_question_launched(self, question):
        question.is_launched = True
        question.launched_at = timezone.now()
        question.save(update_fields=["is_launched", "launched_at"])

    @database_sync_to_async
    def _save_quiz_response(self, question_id: str, answer):
        from apps.gamification.models import QuizQuestion, QuizResponse
        participant = self.participant
        if not participant:
            logger.warning("quiz_response_no_participant", session_id=self.session_id)
            return
        try:
            question = QuizQuestion.objects.get(pk=question_id)
            QuizResponse.objects.update_or_create(
                question=question,
                participant=participant,
                defaults={"answer": str(answer)},
            )
            logger.info("quiz_response_saved", question_id=question_id, participant_id=str(participant.pk), answer=answer)
        except QuizQuestion.DoesNotExist:
            logger.warning("quiz_response_question_not_found", question_id=question_id)
        except Exception as e:
            logger.error("quiz_response_save_failed", error=str(e))

    @database_sync_to_async
    def _get_quiz_results(self, question_id: str) -> dict:
        from apps.gamification.models import QuizQuestion, QuizResponse
        try:
            question = QuizQuestion.objects.get(pk=question_id)
            responses = list(
                QuizResponse.objects.filter(question=question)
                .select_related("participant")
            )
            counts: dict = {}
            participants_responded = []
            for r in responses:
                key = str(r.answer)
                counts[key] = counts.get(key, 0) + 1
                participants_responded.append({
                    "participant_id": str(r.participant.pk),
                    "display_name": r.participant.display_name,
                    "answer_index": r.answer,
                })
            return {
                "question_id": str(question.pk),
                "counts": counts,
                "total_responses": len(participants_responded),
                "responses": participants_responded,
            }
        except Exception:
            return {"question_id": question_id, "counts": {}, "total_responses": 0, "responses": []}
