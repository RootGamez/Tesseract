"""
Django settings — PRODUCTION
Tesseract — Real-Time Interactive Platform

Diseñado para correr detrás de un reverse proxy externo (Nginx Proxy Manager)
que termina TLS y enruta, en un solo dominio:
  https://<dominio>/        → frontend (SPA)
  https://<dominio>/api/    → este backend (Django/Daphne)
  https://<dominio>/ws/     → WebSockets (Channels/Daphne)
  https://s3.<dominio>/     → MinIO (almacenamiento S3-compatible)

Todos los valores específicos del dominio se inyectan por variables de entorno
(ver .env.prod.example). El almacenamiento (MinIO vs AWS S3) lo decide USE_S3,
evaluada en base.py. Por defecto se usa el MinIO embebido en el compose.
"""
from .base import *  # noqa
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.redis import RedisIntegration

DEBUG = False

# ── Estáticos servidos por WhiteNoise ─────────────────────────────────────────
# Con DEBUG=False Django no sirve /static/. WhiteNoise lo hace desde el propio
# proceso ASGI (Daphne), así el reverse proxy externo sólo necesita enrutar.
MIDDLEWARE = list(MIDDLEWARE)  # noqa: F405
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # tras SecurityMiddleware
STATICFILES_STORAGE = "whitenoise.storage.CompressedStaticFilesStorage"

# ── Proxy / TLS ───────────────────────────────────────────────────────────────
# Nginx termina TLS y reenvía en claro al contenedor. Sin esto Django no sabe
# que la petición original fue HTTPS y SECURE_SSL_REDIRECT entraría en bucle.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)  # noqa: F405
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"

# Orígenes confiables para CSRF (Django 4+ exige el esquema). Configúralo por
# entorno, p. ej.: CSRF_TRUSTED_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
CSRF_TRUSTED_ORIGINS = config(  # noqa: F405
    "CSRF_TRUSTED_ORIGINS",
    default="https://localhost",
    cast=Csv(),  # noqa: F405
)

# ── Sentry ────────────────────────────────────────────────────────────────────
if SENTRY_DSN:  # noqa: F405
    sentry_sdk.init(
        dsn=SENTRY_DSN,  # noqa: F405
        integrations=[
            DjangoIntegration(transaction_style="url"),
            CeleryIntegration(),
            RedisIntegration(),
        ],
        traces_sample_rate=0.2,
        send_default_pii=False,
        environment="production",
    )

# ── Email ─────────────────────────────────────────────────────────────────────
# Usa Anymail/SendGrid sólo si hay API key; en caso contrario conserva el backend
# heredado de base.py (consola) para no romper el arranque sin credenciales.
if SENDGRID_API_KEY:  # noqa: F405
    EMAIL_BACKEND = "anymail.backends.sendgrid.EmailBackend"
    ANYMAIL = {
        "SENDGRID_API_KEY": SENDGRID_API_KEY,  # noqa: F405
    }
