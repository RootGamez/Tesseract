"""
Custom DRF permissions for role-based access control.
RF-AUTH-01 — roles: INSTRUCTOR, STUDENT, ADMIN
"""
from rest_framework.permissions import BasePermission


class IsInstructor(BasePermission):
    """Allow access only to users with role INSTRUCTOR."""

    message = "Se requiere rol de Instructor."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "INSTRUCTOR"
        )


class IsStudent(BasePermission):
    """Allow access only to users with role STUDENT."""

    message = "Se requiere rol de Estudiante."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "STUDENT"
        )


class IsAdmin(BasePermission):
    """Allow access only to users with role ADMIN."""

    message = "Se requiere rol de Administrador."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == "ADMIN"
        )


class IsInstructorOrAdmin(BasePermission):
    """Allow access to INSTRUCTOR or ADMIN roles."""

    message = "Se requiere rol de Instructor o Administrador."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ("INSTRUCTOR", "ADMIN")
        )


class IsSessionInstructor(BasePermission):
    """
    Object-level permission: only the instructor of a specific
    LiveSession can perform write actions on it.
    """

    message = "Solo el instructor de esta sesión puede realizar esta acción."

    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        session = getattr(obj, "session", obj)
        return session.instructor == request.user


class IsParticipantOrInstructor(BasePermission):
    """Allow access to participants or the instructor of a session."""

    def has_object_permission(self, request, view, obj):
        session = getattr(obj, "session", obj)
        is_instructor = session.instructor == request.user
        is_participant = session.participants.filter(user=request.user).exists()
        return is_instructor or is_participant
