"""
Authentication app config
"""
from django.apps import AppConfig


class AuthenticationConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.authentication"
    verbose_name = "Autenticación"

    def ready(self):
        import apps.authentication.signals  # noqa
