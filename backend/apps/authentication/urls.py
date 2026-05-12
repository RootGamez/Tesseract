"""
Authentication URL patterns
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView,
    LoginView,
    LogoutView,
    MeView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    OrganizationCreateView,
    OrganizationDetailView,
    InvitationListCreateView,
    AcceptInvitationView,
)

urlpatterns = [
    # Core auth
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
    # Password reset
    path("password-reset/", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    # Organizations
    path("organizations/", OrganizationCreateView.as_view(), name="auth-org-create"),
    path("organizations/<uuid:pk>/", OrganizationDetailView.as_view(), name="auth-org-detail"),
    # Invitations
    path("invitations/", InvitationListCreateView.as_view(), name="auth-invitations"),
    path("invitations/accept/", AcceptInvitationView.as_view(), name="auth-invitation-accept"),
]
