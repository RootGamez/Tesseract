from django.urls import re_path

from .consumers import PresentationConsumer

websocket_urlpatterns = [
    re_path(r"ws/presentations/(?P<session_id>[0-9a-f-]+)/$", PresentationConsumer.as_asgi()),
]
