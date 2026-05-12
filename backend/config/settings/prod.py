from .base import *  # noqa
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.redis import RedisIntegration

DEBUG = False
USE_S3 = True

SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
X_FRAME_OPTIONS = "DENY"

# ── Sentry ────────────────────────────────────────────────────────────────────
if SENTRY_DSN:  # noqa
    sentry_sdk.init(
        dsn=SENTRY_DSN,  # noqa
        integrations=[
            DjangoIntegration(transaction_style="url"),
            CeleryIntegration(),
            RedisIntegration(),
        ],
        traces_sample_rate=0.2,
        send_default_pii=False,
        environment="production",
    )

# ── Anymail (Sendgrid) ────────────────────────────────────────────────────────
EMAIL_BACKEND = "anymail.backends.sendgrid.EmailBackend"
ANYMAIL = {
    "SENDGRID_API_KEY": SENDGRID_API_KEY,  # noqa
}
