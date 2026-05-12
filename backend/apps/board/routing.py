"""Board WebSocket URL routing"""
from django.urls import re_path
from .consumers import BoardConsumer

websocket_urlpatterns = [
    re_path(r"^ws/board/(?P<session_id>[0-9a-f-]+)/$", BoardConsumer.as_asgi(), name="ws-board"),
]
