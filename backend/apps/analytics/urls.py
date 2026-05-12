"""Analytics URL patterns"""
from django.urls import path
from .views import (
    SessionAnalyticsDashboardView,
    SessionAnalyticsCSVExportView,
    SessionReplayView,
    InstructorSessionHistoryView,
)

urlpatterns = [
    path("sessions/<uuid:session_id>/dashboard/", SessionAnalyticsDashboardView.as_view(), name="analytics-dashboard"),
    path("sessions/<uuid:session_id>/export/", SessionAnalyticsCSVExportView.as_view(), name="analytics-export-csv"),
    path("sessions/<uuid:session_id>/replay/", SessionReplayView.as_view(), name="analytics-replay"),
    path("history/", InstructorSessionHistoryView.as_view(), name="analytics-history"),
]
