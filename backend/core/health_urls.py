"""
Health check URL patterns (RNF-OBS-02)
Endpoints: /health/ and /ready/
"""
from django.urls import path
from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache
import redis
from django.conf import settings


def health_check(request):
    """Basic liveness check — always returns 200 if process is running."""
    return JsonResponse({"status": "ok", "service": "acompanamiento-backend"})


def readiness_check(request):
    """
    Readiness check — verifies DB and Redis connectivity.
    Returns 200 if all dependencies are available, 503 otherwise.
    """
    checks = {}
    all_ok = True

    # DB check
    try:
        connection.ensure_connection()
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"
        all_ok = False

    # Redis check
    try:
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"
        all_ok = False

    status_code = 200 if all_ok else 503
    return JsonResponse({"status": "ready" if all_ok else "not_ready", "checks": checks}, status=status_code)


urlpatterns = [
    path("", health_check, name="health"),
    path("ready/", readiness_check, name="readiness"),
]
