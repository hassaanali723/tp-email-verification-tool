"""
Authentication dependencies for FastAPI dependency injection.

Simple, clean implementation focused on API key validation and user context.
"""

from fastapi import Header, HTTPException, Depends
from typing import Optional
import logging

from ..config import settings
from .models import AuthContext
from .exceptions import InvalidAPIKeyError, MissingUserContextError

logger = logging.getLogger(__name__)


async def verify_api_key_and_user(
    x_api_key: Optional[str] = Header(None, alias=settings.API_KEY_HEADER),
    x_user_id: Optional[str] = Header(None, alias=settings.USER_ID_HEADER),
    x_client_id: Optional[str] = Header(None, alias=settings.CLIENT_ID_HEADER)
) -> AuthContext:
    """
    Verify API key and extract user context from headers.
    
    Args:
        x_api_key: API key from request header
        x_user_id: User ID from request header  
        x_client_id: Optional client identifier
        
    Returns:
        AuthContext: Validated authentication context
        
    Raises:
        HTTPException: 401 for invalid/missing API key, 400 for missing user ID
    """
    
    # Skip auth in development if disabled
    if not settings.ENABLE_AUTH:
        logger.warning("Authentication is disabled - development mode")
        return AuthContext(
            user_id=x_user_id or "dev-user",
            client_identifier="development"
        )
    
    # Validate API key
    if not x_api_key:
        logger.warning("Missing API key in request")
        raise HTTPException(
            status_code=401,
            detail="Missing API key"
        )
    
    if x_api_key != settings.API_KEY:
        logger.warning("Invalid API key provided")
        raise HTTPException(
            status_code=401, 
            detail="Invalid API key"
        )
    
    # Validate user context
    if not x_user_id:
        logger.warning("Missing user ID in authenticated request")
        raise HTTPException(
            status_code=400,
            detail="Missing user ID"
        )
    
    # Create auth context
    auth_context = AuthContext(
        user_id=x_user_id,
        client_identifier=x_client_id or "unknown-client"
    )
    
    logger.info(f"Request authenticated for user: {x_user_id}")
    return auth_context


# Alias for cleaner route definitions
RequireAuth = Depends(verify_api_key_and_user) 