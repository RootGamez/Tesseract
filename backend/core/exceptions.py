"""
Custom exception handler for DRF.
Returns consistent error format across all endpoints.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
import structlog

logger = structlog.get_logger(__name__)


def custom_exception_handler(exc, context):
    """
    Wrap DRF exception responses in a consistent envelope:
    {
        "error": {
            "code": "...",
            "message": "...",
            "details": {...}
        }
    }
    """
    response = exception_handler(exc, context)

    if response is not None:
        request = context.get("request")
        logger.warning(
            "api_exception",
            exc_type=type(exc).__name__,
            status_code=response.status_code,
            path=request.path if request else None,
            user_id=str(request.user.pk) if request and request.user.is_authenticated else None,
        )
        response.data = {
            "error": {
                "code": type(exc).__name__,
                "message": _get_message(response.data),
                "details": response.data,
            }
        }

    return response


def _get_message(data) -> str:
    if isinstance(data, dict):
        if "detail" in data:
            return str(data["detail"])
        return "Se produjo un error en la solicitud."
    if isinstance(data, list):
        return str(data[0]) if data else "Error desconocido."
    return str(data)


class ServiceUnavailableError(Exception):
    """Raised when an external service (AI, S3) is unavailable."""
    pass
