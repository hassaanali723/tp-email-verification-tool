"""
Custom authentication and authorization exceptions.

These exceptions provide structured error handling for authentication
and authorization failures with proper HTTP status codes and detailed
error messages for logging and debugging.
"""

from typing import Optional, Dict, Any


class AuthenticationError(Exception):
    """
    Raised when authentication fails.
    
    This exception indicates that the request could not be authenticated
    due to missing, invalid, or expired credentials.
    """
    
    def __init__(
        self, 
        message: str = "Authentication failed",
        details: Optional[Dict[str, Any]] = None,
        error_code: Optional[str] = None
    ) -> None:
        self.message = message
        self.details = details or {}
        self.error_code = error_code or "AUTH_FAILED"
        super().__init__(self.message)


class AuthorizationError(Exception):
    """
    Raised when authorization fails.
    
    This exception indicates that while the request was authenticated,
    the authenticated entity does not have permission to perform
    the requested operation.
    """
    
    def __init__(
        self, 
        message: str = "Insufficient permissions",
        details: Optional[Dict[str, Any]] = None,
        error_code: Optional[str] = None
    ) -> None:
        self.message = message
        self.details = details or {}
        self.error_code = error_code or "AUTH_INSUFFICIENT_PERMISSIONS"
        super().__init__(self.message)


class InvalidAPIKeyError(AuthenticationError):
    """Raised when an invalid API key is provided."""
    
    def __init__(self, message: str = "Invalid or missing API key") -> None:
        super().__init__(
            message=message,
            error_code="AUTH_INVALID_API_KEY"
        )


class MissingUserContextError(AuthenticationError):
    """Raised when required user context is missing from the request."""
    
    def __init__(self, message: str = "Missing user context") -> None:
        super().__init__(
            message=message,
            error_code="AUTH_MISSING_USER_CONTEXT"
        ) 