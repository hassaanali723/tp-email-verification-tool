"""
Authentication module for Email Validation Service.

This module provides enterprise-grade authentication and authorization
functionality for securing API endpoints.

Components:
- models: Authentication data models and schemas
- dependencies: FastAPI dependency injection for auth
- exceptions: Custom authentication exceptions
- config: Authentication-specific configuration
"""

from .models import AuthContext, AuthenticatedRequest
from .exceptions import AuthenticationError, AuthorizationError
from .dependencies import RequireAuth, verify_api_key_and_user

__all__ = [
    "AuthContext",
    "AuthenticatedRequest", 
    "AuthenticationError",
    "AuthorizationError",
    "RequireAuth",
    "verify_api_key_and_user",
] 