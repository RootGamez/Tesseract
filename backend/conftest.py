import pytest
from rest_framework.test import APIClient
from apps.authentication.models import User, Organization
from apps.live_sessions.models import LiveSession

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def organization():
    return Organization.objects.create(
        name="Test University",
        slug="test-uni",
        subdomain="testuni"
    )

@pytest.fixture
def instructor(organization):
    user = User.objects.create_user(
        email="instructor@testuni.edu",
        password="testpassword123",
        display_name="Prof. Test",
        organization=organization,
        role="INSTRUCTOR"
    )
    return user

@pytest.fixture
def authenticated_client(api_client, instructor):
    api_client.force_authenticate(user=instructor)
    return api_client

@pytest.fixture
def live_session(instructor):
    return LiveSession.objects.create(
        title="Clase de Prueba",
        instructor=instructor,
        join_code="TEST12"
    )
