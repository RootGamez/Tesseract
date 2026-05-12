"""
Authentication app — Models
RF-AUTH-01, RF-AUTH-02, RF-AUTH-03

Models:
- User: Custom user model with role-based access (INSTRUCTOR/STUDENT/ADMIN)
- Organization: Multi-tenant support for educational institutions
- Invitation: Email-based instructor invitations
"""
import uuid
import secrets
import string
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models
from django.utils import timezone
from django.conf import settings

from core.models import BaseModel


# ── Roles ─────────────────────────────────────────────────────────────────────

class UserRole(models.TextChoices):
    INSTRUCTOR = "INSTRUCTOR", "Instructor"
    STUDENT = "STUDENT", "Estudiante"
    ADMIN = "ADMIN", "Administrador"


# ── Organization (multi-tenant RF-AUTH-03) ────────────────────────────────────

class Organization(BaseModel):
    """
    Educational institution (multi-tenant root).
    Each org can have multiple instructors, students and an admin.
    """

    class Plan(models.TextChoices):
        FREE = "FREE", "Gratuito"
        PRO = "PRO", "Pro"
        ENTERPRISE = "ENTERPRISE", "Empresarial"

    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, max_length=100)
    subdomain = models.CharField(max_length=100, blank=True, unique=True, null=True)
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.FREE)
    max_instructors = models.PositiveIntegerField(default=5)
    logo = models.ImageField(upload_to="organizations/logos/", blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Organización"
        verbose_name_plural = "Organizaciones"

    def __str__(self):
        return self.name


# ── User Manager ──────────────────────────────────────────────────────────────

class UserManager(BaseUserManager):
    def create_user(self, email: str, password: str = None, **extra_fields):
        if not email:
            raise ValueError("El email es obligatorio.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str, **extra_fields):
        extra_fields.setdefault("role", UserRole.ADMIN)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


# ── User ──────────────────────────────────────────────────────────────────────

class User(AbstractBaseUser, PermissionsMixin, BaseModel):
    """
    Custom user model with email login and role-based access control.
    RF-AUTH-01: roles INSTRUCTOR, STUDENT, ADMIN.
    """

    email = models.EmailField(unique=True, db_index=True)
    display_name = models.CharField(max_length=150)
    avatar = models.ImageField(upload_to="users/avatars/", blank=True, null=True)
    role = models.CharField(
        max_length=20,
        choices=UserRole.choices,
        default=UserRole.STUDENT,
        db_index=True,
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="members",
    )
    # OAuth2
    google_uid = models.CharField(max_length=255, blank=True, null=True, unique=True)
    # Flags
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    email_verified = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["display_name"]

    class Meta:
        verbose_name = "Usuario"
        verbose_name_plural = "Usuarios"

    def __str__(self):
        return f"{self.display_name} <{self.email}>"

    @property
    def is_instructor(self):
        return self.role == UserRole.INSTRUCTOR

    @property
    def is_student(self):
        return self.role == UserRole.STUDENT

    @property
    def is_org_admin(self):
        return self.role == UserRole.ADMIN


# ── Password Reset Token ──────────────────────────────────────────────────────

class PasswordResetToken(BaseModel):
    """Single-use token for password recovery (RF-AUTH-01)."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reset_tokens")
    token = models.CharField(max_length=64, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Token de recuperación"

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = secrets.token_urlsafe(48)
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(hours=1)
        super().save(*args, **kwargs)

    @property
    def is_valid(self) -> bool:
        return not self.is_used and timezone.now() < self.expires_at


# ── Organization Invitation ───────────────────────────────────────────────────

def _generate_invite_token():
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(32))


class Invitation(BaseModel):
    """
    Email invitation for instructors to join an organization.
    RF-AUTH-03: admins invite instructors by email.
    """

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="invitations"
    )
    email = models.EmailField(db_index=True)
    role = models.CharField(max_length=20, choices=UserRole.choices, default=UserRole.INSTRUCTOR)
    token = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        default=_generate_invite_token,
    )
    invited_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sent_invitations",
    )
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    is_accepted = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Invitación"
        verbose_name_plural = "Invitaciones"
        unique_together = [("organization", "email")]

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(days=7)
        super().save(*args, **kwargs)

    @property
    def is_valid(self) -> bool:
        return not self.is_accepted and timezone.now() < self.expires_at
