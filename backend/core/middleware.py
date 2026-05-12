"""
Custom middleware — request-id, structured logging, JWT WebSocket auth.
"""
import uuid
import time
import logging
import structlog
from urllib.parse import parse_qs

from django.conf import settings
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser

logger = structlog.get_logger(__name__)
User = get_user_model()


class RequestIdMiddleware:
    """Attach a unique request-id to every request for tracing."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = str(uuid.uuid4())
        response = self.get_response(request)
        response["X-Request-Id"] = request.request_id
        return response


class StructuredLoggingMiddleware:
    """Emit structured JSON log for every HTTP request (RNF-OBS-01)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.monotonic()
        response = self.get_response(request)
        duration_ms = round((time.monotonic() - start) * 1000, 2)

        logger.info(
            "http_request",
            method=request.method,
            path=request.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            request_id=getattr(request, "request_id", None),
            user_id=str(request.user.pk) if request.user.is_authenticated else None,
        )
        return response


# ── WebSocket JWT Auth Middleware (RNF-SEC-01) ────────────────────────────────

@database_sync_to_async
def get_user_from_token(token_key: str):
    """Validate JWT token and return the corresponding user."""
    try:
        UntypedToken(token_key)
        from rest_framework_simplejwt.backends import TokenBackend
        from django.conf import settings as django_settings

        data = TokenBackend(
            algorithm=django_settings.SIMPLE_JWT["ALGORITHM"],
            signing_key=django_settings.SECRET_KEY,
        ).decode(token_key, verify=True)

        return User.objects.select_related("organization").get(pk=data["user_id"])
    except (InvalidToken, TokenError, User.DoesNotExist, Exception):
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Channels middleware that authenticates WebSocket connections via JWT.
    Token can be passed as query param: ?token=<access_token>
    """

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        params = parse_qs(query_string)
        token_list = params.get("token", [])

        if token_list:
            scope["user"] = await get_user_from_token(token_list[0])
        else:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    """Convenience wrapper, similar to AuthMiddlewareStack."""
    return JWTAuthMiddleware(inner)
