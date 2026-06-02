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
    Default: max 100 messages/minute per connection (RNF-SEC-03).
    Applied inside consumers, not DRF middleware.

    High-frequency realtime channels (collaborative board, laser pointer)
    must raise the limit: a drawing stream emits ~10 scene updates/s plus
    ~33 cursor updates/s, well above the 100/min chat default.
    """

    LIMIT = 100
    WINDOW_SECONDS = 60

    def __init__(self, limit: int | None = None, window_seconds: int | None = None):
        self.limit = limit if limit is not None else self.LIMIT
        self.window_seconds = window_seconds if window_seconds is not None else self.WINDOW_SECONDS
        self._count = 0
        self._window_start = None

    def is_allowed(self) -> bool:
        import time

        now = time.monotonic()
        if self._window_start is None or (now - self._window_start) > self.window_seconds:
            self._window_start = now
            self._count = 0

        self._count += 1
        return self._count <= self.limit


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
