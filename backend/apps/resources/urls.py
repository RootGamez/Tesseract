"""Resources URL patterns"""
from django.urls import path
from .views import ResourceListView, ResourceUploadView, SnippetListCreateView, ResourceDownloadView

urlpatterns = [
    path("sessions/<uuid:session_id>/files/", ResourceListView.as_view(), name="resource-list"),
    path("sessions/<uuid:session_id>/upload/", ResourceUploadView.as_view(), name="resource-upload"),
    path("sessions/<uuid:session_id>/snippets/", SnippetListCreateView.as_view(), name="snippet-list"),
    path("<uuid:resource_id>/download/", ResourceDownloadView.as_view(), name="resource-download"),
]
