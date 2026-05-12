"""
Sessions URL patterns
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ClassTemplateViewSet, LiveSessionViewSet, JoinSessionView, GuestJoinSessionView

router = DefaultRouter()
router.register("templates", ClassTemplateViewSet, basename="session-template")
router.register("live", LiveSessionViewSet, basename="session-live")

urlpatterns = [
    path("", include(router.urls)),
    path("join/", JoinSessionView.as_view(), name="session-join"),
    path("join/guest/", GuestJoinSessionView.as_view(), name="session-join-guest"),
]
