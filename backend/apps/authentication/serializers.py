"""
Authentication serializers — RF-AUTH-01, RF-AUTH-02, RF-AUTH-03
"""
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Organization, Invitation, PasswordResetToken

User = get_user_model()


# ── User serializers ───────────────────────────────────────────────────────────

class UserPublicSerializer(serializers.ModelSerializer):
    """Minimal public user info (used inside nested serializers)."""

    class Meta:
        model = User
        fields = ["id", "display_name", "avatar", "role"]
        read_only_fields = fields


class UserProfileSerializer(serializers.ModelSerializer):
    """Full profile for the authenticated user."""

    organization_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "display_name", "avatar",
            "role", "organization", "organization_name",
            "email_verified", "created_at",
        ]
        read_only_fields = ["id", "email", "role", "email_verified", "created_at"]


# ── Registration ──────────────────────────────────────────────────────────────

class RegisterSerializer(serializers.ModelSerializer):
    """User registration — creates account with hashed password."""

    password = serializers.CharField(write_only=True, min_length=8, style={"input_type": "password"})
    password_confirm = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["email", "display_name", "password", "password_confirm", "role"]
        extra_kwargs = {
            "role": {"required": False},
        }

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({"password_confirm": "Las contraseñas no coinciden."})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


# ── JWT custom claims ─────────────────────────────────────────────────────────

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Add extra claims (role, display_name) to the JWT payload."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["display_name"] = user.display_name
        token["email"] = user.email
        if user.organization_id:
            token["org_id"] = str(user.organization_id)
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserProfileSerializer(self.user).data
        return data


# ── Password Reset ────────────────────────────────────────────────────────────

class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        # Don't reveal whether the email exists
        return value.lower()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({"new_password_confirm": "Las contraseñas no coinciden."})
        try:
            reset_token = PasswordResetToken.objects.select_related("user").get(
                token=attrs["token"]
            )
        except PasswordResetToken.DoesNotExist:
            raise serializers.ValidationError({"token": "Token inválido o expirado."})
        if not reset_token.is_valid:
            raise serializers.ValidationError({"token": "Token inválido o expirado."})
        attrs["reset_token"] = reset_token
        return attrs

    def save(self):
        reset_token = self.validated_data["reset_token"]
        reset_token.user.set_password(self.validated_data["new_password"])
        reset_token.user.save(update_fields=["password"])
        reset_token.is_used = True
        reset_token.save(update_fields=["is_used"])


# ── Organization ──────────────────────────────────────────────────────────────

class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ["id", "name", "slug", "subdomain", "plan", "max_instructors", "logo", "is_active", "created_at"]
        read_only_fields = ["id", "slug", "created_at"]


# ── Invitation ────────────────────────────────────────────────────────────────

class InvitationSerializer(serializers.ModelSerializer):
    invited_by_name = serializers.CharField(source="invited_by.display_name", read_only=True)

    class Meta:
        model = Invitation
        fields = [
            "id", "email", "role", "organization", "invited_by_name",
            "expires_at", "is_accepted", "accepted_at",
        ]
        read_only_fields = ["id", "invited_by_name", "expires_at", "is_accepted", "accepted_at"]


class InvitationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invitation
        fields = ["email", "role"]

    def validate_email(self, value):
        org = self.context["organization"]
        if User.objects.filter(email=value, organization=org).exists():
            raise serializers.ValidationError("Este usuario ya pertenece a la organización.")
        if Invitation.objects.filter(
            email=value,
            organization=org,
            is_accepted=False,
            expires_at__gt=timezone.now(),
        ).exists():
            raise serializers.ValidationError("Ya existe una invitación pendiente para este email.")
        return value


class AcceptInvitationSerializer(serializers.Serializer):
    token = serializers.CharField()
    display_name = serializers.CharField(max_length=150)
    password = serializers.CharField(min_length=8, write_only=True)

    def validate_token(self, value):
        try:
            invitation = Invitation.objects.select_related("organization").get(token=value)
        except Invitation.DoesNotExist:
            raise serializers.ValidationError("Invitación no encontrada.")
        if not invitation.is_valid:
            raise serializers.ValidationError("La invitación ha expirado o ya fue aceptada.")
        self.invitation = invitation
        return value
