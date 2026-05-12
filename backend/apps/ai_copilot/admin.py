from django.contrib import admin
from .models import *
import django.apps

# Fallback registration for all models
try:
    app_models = django.apps.apps.get_app_config("ai_copilot").get_models()
    for model in app_models:
        try:
            admin.site.register(model)
        except admin.sites.AlreadyRegistered:
            pass
except Exception:
    pass
