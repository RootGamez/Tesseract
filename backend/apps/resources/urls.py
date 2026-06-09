"""Resources URL patterns"""
from django.urls import path
from .views import (
    ResourceListView, ResourceUploadView, SnippetListCreateView, ResourceDownloadView,
    TemplateResourceListView, TemplateResourceUploadView,
    SubmissionView, SubmissionDeleteView,
)

urlpatterns = [
    path("sessions/<uuid:session_id>/files/", ResourceListView.as_view(), name="resource-list"),
    path("sessions/<uuid:session_id>/upload/", ResourceUploadView.as_view(), name="resource-upload"),
    path("sessions/<uuid:session_id>/snippets/", SnippetListCreateView.as_view(), name="snippet-list"),
    path(
        "sessions/<uuid:session_id>/stages/<uuid:stage_id>/submissions/",
        SubmissionView.as_view(),
        name="submission-list",
    ),
    path(
        "sessions/<uuid:session_id>/submissions/<uuid:resource_id>/",
        SubmissionDeleteView.as_view(),
        name="submission-delete",
    ),
    path("templates/<uuid:template_id>/files/", TemplateResourceListView.as_view(), name="template-resource-list"),
    path("templates/<uuid:template_id>/upload/", TemplateResourceUploadView.as_view(), name="template-resource-upload"),
    path("<uuid:resource_id>/download/", ResourceDownloadView.as_view(), name="resource-download"),
]
