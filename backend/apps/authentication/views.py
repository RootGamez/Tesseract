"""
Authentication views — RF-AUTH-01, RF-AUTH-02, RF-AUTH-03
"""
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import generics, status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken

from core.permissions import IsInstructorOrAdmin, IsAdmin

from .models import Organization, Invitation, PasswordResetToken
from .serializers import (
    RegisterSerializer,
    CustomTokenObtainPairSerializer,
    UserProfileSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    OrganizationSerializer,
    InvitationSerializer,
    InvitationCreateSerializer,
    AcceptInvitationSerializer,
)
from .tasks import send_password_reset_email, send_invitation_email

User = get_user_model()


# ── Auth core ─────────────────────────────────────────────────────────────────

class RegisterView(generics.CreateAPIView):
    """POST /api/v1/auth/register/ — Create new user account."""

    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserProfileSerializer(user).data,
                "tokens": {
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                },
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    """POST /api/v1/auth/login/ — JWT login with custom claims."""

    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [permissions.AllowAny]


class LogoutView(APIView):
    """POST /api/v1/auth/logout/ — Blacklist refresh token."""

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"detail": "Sesión cerrada exitosamente."})
        except Exception:
            return Response(
                {"error": {"message": "Token inválido o ya revocado."}},
                status=status.HTTP_400_BAD_REQUEST,
            )


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/auth/me/ — Authenticated user profile."""

    serializer_class = UserProfileSerializer

    def get_object(self):
        return self.request.user


# ── Password Reset ────────────────────────────────────────────────────────────

class PasswordResetRequestView(APIView):
    """POST /api/v1/auth/password-reset/ — Request password reset email."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        try:
            user = User.objects.get(email=email, is_active=True)
            token_obj = PasswordResetToken.objects.create(user=user)
            send_password_reset_email.delay(user.id, token_obj.token)
        except User.DoesNotExist:
            pass  # Don't reveal existence
        # Always return success to prevent email enumeration
        return Response({"detail": "Si el email existe, recibirás instrucciones en breve."})


class PasswordResetConfirmView(APIView):
    """POST /api/v1/auth/password-reset/confirm/ — Set new password."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Contraseña actualizada exitosamente."})


# ── Organization ──────────────────────────────────────────────────────────────

class OrganizationCreateView(generics.CreateAPIView):
    """POST /api/v1/auth/organizations/ — Create new org (Admin only)."""

    serializer_class = OrganizationSerializer
    permission_classes = [IsAdmin]

    def perform_create(self, serializer):
        import re
        name = serializer.validated_data["name"]
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        serializer.save(slug=slug)


class OrganizationDetailView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/v1/auth/organizations/<pk>/ — Org detail."""

    serializer_class = OrganizationSerializer
    permission_classes = [IsAdmin]
    queryset = Organization.objects.all()


# ── Invitations ───────────────────────────────────────────────────────────────

class InvitationListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/v1/auth/invitations/ — List org invitations.
    POST /api/v1/auth/invitations/ — Invite instructor by email.
    RF-AUTH-03
    """

    permission_classes = [IsInstructorOrAdmin]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return InvitationCreateSerializer
        return InvitationSerializer

    def get_queryset(self):
        return Invitation.objects.filter(organization=self.request.user.organization)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["organization"] = self.request.user.organization
        return ctx

    def perform_create(self, serializer):
        invitation = serializer.save(
            organization=self.request.user.organization,
            invited_by=self.request.user,
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        send_invitation_email.delay(invitation.id)


class AcceptInvitationView(APIView):
    """POST /api/v1/auth/invitations/accept/ — Accept invitation & create account."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = AcceptInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = serializer.invitation

        user = User.objects.create_user(
            email=invitation.email,
            display_name=serializer.validated_data["display_name"],
            password=serializer.validated_data["password"],
            role=invitation.role,
            organization=invitation.organization,
            email_verified=True,
        )
        invitation.is_accepted = True
        invitation.accepted_at = timezone.now()
        invitation.save(update_fields=["is_accepted", "accepted_at"])

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserProfileSerializer(user).data,
                "tokens": {
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                },
            },
            status=status.HTTP_201_CREATED,
        )
