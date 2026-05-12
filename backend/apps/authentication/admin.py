"""
Authentication admin registration
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User, Organization, Invitation, PasswordResetToken


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["email", "display_name", "role", "organization", "is_active", "created_at"]
    list_filter = ["role", "is_active", "email_verified"]
    search_fields = ["email", "display_name"]
    ordering = ["-created_at"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Información personal", {"fields": ("display_name", "avatar", "role", "organization")}),
        ("OAuth2", {"fields": ("google_uid",)}),
        ("Permisos", {"fields": ("is_active", "is_staff", "is_superuser", "email_verified", "groups", "user_permissions")}),
        ("Fechas", {"fields": ("last_login",)}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "display_name", "role", "password1", "password2"),
        }),
    )


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "plan", "max_instructors", "is_active", "created_at"]
    list_filter = ["plan", "is_active"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Invitation)
class InvitationAdmin(admin.ModelAdmin):
    list_display = ["email", "organization", "role", "is_accepted", "expires_at", "invited_by"]
    list_filter = ["role", "is_accepted"]
    search_fields = ["email"]
    raw_id_fields = ["organization", "invited_by"]


@admin.register(PasswordResetToken)
class PasswordResetTokenAdmin(admin.ModelAdmin):
    list_display = ["user", "is_used", "expires_at", "created_at"]
    list_filter = ["is_used"]
    raw_id_fields = ["user"]
