"""Board URL patterns"""
from django.urls import path
from .views import BoardSnapshotListView, BoardCollaboratorManageView

urlpatterns = [
    path("sessions/<uuid:session_id>/snapshots/", BoardSnapshotListView.as_view(), name="board-snapshots"),
    path("sessions/<uuid:session_id>/collaborators/", BoardCollaboratorManageView.as_view(), name="board-collaborators"),
]
