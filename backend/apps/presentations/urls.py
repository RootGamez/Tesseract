from django.urls import path

from .views import PresentationStateAPIView

urlpatterns = [
    path("sessions/<uuid:session_id>/annotations/", PresentationStateAPIView.as_view(), name="presentation-state"),
]
