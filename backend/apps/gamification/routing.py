"""Gamification WebSocket routing"""
from django.urls import re_path
from .consumers import GamificationConsumer

websocket_urlpatterns = [
    re_path(r"^ws/gamification/(?P<session_id>[0-9a-f-]+)/$", GamificationConsumer.as_asgi(), name="ws-gamification"),
]
