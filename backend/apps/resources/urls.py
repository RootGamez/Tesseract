"""Resources URL patterns"""
from django.urls import path
from .views import (
    ResourceListView, ResourceUploadView, SnippetListCreateView, ResourceDownloadView,
    TemplateResourceListView, TemplateResourceUploadView,
)

urlpatterns = [
    path("sessions/<uuid:session_id>/files/", ResourceListView.as_view(), name="resource-list"),
    path("sessions/<uuid:session_id>/upload/", ResourceUploadView.as_view(), name="resource-upload"),
    path("sessions/<uuid:session_id>/snippets/", SnippetListCreateView.as_view(), name="snippet-list"),
    path("templates/<uuid:template_id>/files/", TemplateResourceListView.as_view(), name="template-resource-list"),
    path("templates/<uuid:template_id>/upload/", TemplateResourceUploadView.as_view(), name="template-resource-upload"),
    path("<uuid:resource_id>/download/", ResourceDownloadView.as_view(), name="resource-download"),
]
