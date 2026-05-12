"""
Custom DRF throttle classes (RNF-SEC-03, RNF-PERF-03).
"""
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle


class AIEndpointThrottle(UserRateThrottle):
    """Strict rate limit for IA endpoints to control LLM costs."""
    scope = "ai_endpoints"


class WebSocketMessageThrottle:
    """
    In-memory per-connection throttle for WebSocket messages.
    Enforces max 100 messages/minute per connection (RNF-SEC-03).
    Applied inside consumers, not DRF middleware.
    """

    LIMIT = 100
    WINDOW_SECONDS = 60

    def __init__(self):
        self._count = 0
        self._window_start = None

    def is_allowed(self) -> bool:
        import time

        now = time.monotonic()
        if self._window_start is None or (now - self._window_start) > self.WINDOW_SECONDS:
            self._window_start = now
            self._count = 0

        self._count += 1
        return self._count <= self.LIMIT


class EmojiRateLimit:
    """
    Redis-backed rate limiter for emoji reactions (RF-GAME-03).
    Max 3 emojis per student per 10 seconds.
    """

    LIMIT = 3
    WINDOW_SECONDS = 10

    @staticmethod
    def is_allowed(redis_client, user_id: str) -> bool:
        import time

        key = f"emoji_rate:{user_id}:{int(time.time() // EmojiRateLimit.WINDOW_SECONDS)}"
        current = redis_client.incr(key)
        if current == 1:
            redis_client.expire(key, EmojiRateLimit.WINDOW_SECONDS * 2)
        return current <= EmojiRateLimit.LIMIT
