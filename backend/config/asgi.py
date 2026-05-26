"""
ASGI config — Tesseract Platform
Soporta HTTP (Django) y WebSocket (Django Channels) via Daphne.
"""
import os
import django
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
django.setup()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa
from channels.security.websocket import AllowedHostsOriginValidator  # noqa
from core.middleware import JWTAuthMiddlewareStack  # noqa

# Import all WebSocket URL patterns from each app
from apps.live_sessions.routing import websocket_urlpatterns as live_sessions_ws  # noqa
from apps.board.routing import websocket_urlpatterns as board_ws  # noqa
from apps.presentations.routing import websocket_urlpatterns as presentations_ws  # noqa
from apps.gamification.routing import websocket_urlpatterns as gamification_ws  # noqa
from apps.chat.routing import websocket_urlpatterns as chat_ws  # noqa

all_websocket_urlpatterns = (
    live_sessions_ws + board_ws + presentations_ws + gamification_ws + chat_ws
)

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(
            JWTAuthMiddlewareStack(
                URLRouter(all_websocket_urlpatterns)
            )
        ),
    }
)
