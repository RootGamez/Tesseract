from .base import *  # noqa

DEBUG = True

# ── Debug toolbar ─────────────────────────────────────────────────────────────
INSTALLED_APPS += ["debug_toolbar"]  # noqa
MIDDLEWARE.insert(0, "debug_toolbar.middleware.DebugToolbarMiddleware")  # noqa
INTERNAL_IPS = ["127.0.0.1"]

# ── Email override en dev ─────────────────────────────────────────────────────
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
