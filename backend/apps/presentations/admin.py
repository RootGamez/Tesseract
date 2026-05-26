from django.contrib import admin

from .models import Presentation, PresentationSlide, PresentationAnnotation


@admin.register(Presentation)
class PresentationAdmin(admin.ModelAdmin):
    list_display = ("title", "session", "status", "total_slides", "current_slide_index", "created_at")
    list_filter = ("status",)
    search_fields = ("title", "session__title")


@admin.register(PresentationSlide)
class PresentationSlideAdmin(admin.ModelAdmin):
    list_display = ("presentation", "index", "mime_type", "width", "height")
    search_fields = ("presentation__title",)


@admin.register(PresentationAnnotation)
class PresentationAnnotationAdmin(admin.ModelAdmin):
    list_display = ("presentation", "slide", "revision", "updated_at")
    search_fields = ("presentation__title",)
