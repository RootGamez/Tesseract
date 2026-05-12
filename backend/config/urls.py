"""
URL configuration — Tesseract Platform
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)

api_v1_patterns = [
    path("auth/", include("apps.authentication.urls")),
    path("sessions/", include("apps.sessions.urls")),
    path("board/", include("apps.board.urls")),
    path("gamification/", include("apps.gamification.urls")),
    path("chat/", include("apps.chat.urls")),
    path("resources/", include("apps.resources.urls")),
    path("ai/", include("apps.ai_copilot.urls")),
    path("analytics/", include("apps.analytics.urls")),
]

urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),
    # API v1
    path("api/v1/", include(api_v1_patterns)),
    # OpenAPI schema & docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    # Health checks (RNF-OBS-02)
    path("health/", include("core.health_urls")),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns = [path("__debug__/", include(debug_toolbar.urls))] + urlpatterns
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
