"""
Test: Authentication models
"""
import pytest
from django.utils import timezone
from apps.authentication.models import User, Organization, Invitation, PasswordResetToken


@pytest.mark.django_db
class TestUserModel:
    def test_create_user(self):
        user = User.objects.create_user(
            email="test@example.com",
            display_name="Test User",
            password="securepassword",
            role="STUDENT",
        )
        assert user.email == "test@example.com"
        assert user.role == "STUDENT"
        assert user.check_password("securepassword")
        assert not user.is_staff

    def test_create_superuser(self):
        user = User.objects.create_superuser(
            email="admin@example.com",
            password="adminpass",
            display_name="Admin",
        )
        assert user.is_staff
        assert user.is_superuser
        assert user.role == "ADMIN"

    def test_user_str(self):
        user = User(email="a@b.com", display_name="Alice")
        assert "Alice" in str(user)
        assert "a@b.com" in str(user)

    def test_instructor_property(self):
        user = User(role="INSTRUCTOR")
        assert user.is_instructor
        assert not user.is_student

    def test_student_property(self):
        user = User(role="STUDENT")
        assert user.is_student
        assert not user.is_instructor


@pytest.mark.django_db
class TestOrganizationModel:
    def test_create_organization(self):
        org = Organization.objects.create(
            name="Universidad Test",
            slug="universidad-test",
            plan="PRO",
        )
        assert org.name == "Universidad Test"
        assert org.plan == "PRO"
        assert org.is_active

    def test_organization_str(self):
        org = Organization(name="Mi Org")
        assert str(org) == "Mi Org"


@pytest.mark.django_db
class TestPasswordResetToken:
    def test_token_is_valid(self):
        user = User.objects.create_user(
            email="reset@example.com",
            password="pass",
            display_name="Reset User",
        )
        token = PasswordResetToken.objects.create(user=user)
        assert token.is_valid
        assert len(token.token) > 20

    def test_expired_token_is_invalid(self):
        user = User.objects.create_user(
            email="expired@example.com",
            password="pass",
            display_name="Expired User",
        )
        token = PasswordResetToken.objects.create(
            user=user,
            expires_at=timezone.now() - timezone.timedelta(hours=2),
        )
        assert not token.is_valid


@pytest.mark.django_db
class TestInvitation:
    def test_invitation_is_valid(self):
        org = Organization.objects.create(name="Test Org", slug="test-org")
        admin = User.objects.create_user(email="admin@test.com", password="pass", display_name="Admin", role="ADMIN")
        invitation = Invitation.objects.create(
            organization=org,
            email="new@instructor.com",
            role="INSTRUCTOR",
            invited_by=admin,
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )
        assert invitation.is_valid

    def test_invitation_expired(self):
        org = Organization.objects.create(name="Org", slug="org")
        admin = User.objects.create_user(email="adm@test.com", password="pass", display_name="Adm", role="ADMIN")
        invitation = Invitation.objects.create(
            organization=org,
            email="old@instructor.com",
            role="INSTRUCTOR",
            invited_by=admin,
            expires_at=timezone.now() - timezone.timedelta(days=1),
        )
        assert not invitation.is_valid
