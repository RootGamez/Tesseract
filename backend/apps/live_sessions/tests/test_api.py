import pytest
from django.urls import reverse
from rest_framework import status
from apps.live_sessions.models import LiveSession

@pytest.mark.django_db
class TestLiveSessionAPI:
    def test_create_session(self, authenticated_client, instructor):
        url = reverse("session-live-list")
        data = {
            "title": "Clase de Programación",
            "description": "Introducción a Python",
            "scheduled_at": "2026-06-01T10:00:00Z"
        }
        response = authenticated_client.post(url, data)
        print("RESPONSE:", response.data)
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["title"] == "Clase de Programación"
        
        # Verify it was saved to DB
        session = LiveSession.objects.get(title="Clase de Programación")
        assert session.join_code is not None

    def test_unauthenticated_cannot_create_session(self, api_client):
        url = reverse("session-live-list")
        response = api_client.post(url, {"title": "Clase Secreta"})
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
