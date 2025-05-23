"""
Authentication data models and schemas.

This module defines the data structures used for authentication and
authorization throughout the application, following Pydantic best
practices for data validation and serialization.
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, validator
from datetime import datetime


class AuthContext(BaseModel):
    """
    Authentication context containing validated user information.
    
    This model represents the authenticated user context that is
    available throughout the request lifecycle after successful
    authentication.
    """
    
    user_id: str = Field(
        ..., 
        description="Unique identifier for the authenticated user",
        min_length=1,
        max_length=255
    )
    
    request_timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp when the request was authenticated"
    )
    
    client_identifier: Optional[str] = Field(
        default=None,
        description="Identifier for the client making the request"
    )
    
    additional_context: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional context information"
    )
    
    @validator('user_id')
    def validate_user_id(cls, v: str) -> str:
        """Validate user ID format and content."""
        if not v or not v.strip():
            raise ValueError("User ID cannot be empty or whitespace")
        return v.strip()
    
    class Config:
        """Pydantic configuration."""
        
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
        
        schema_extra = {
            "example": {
                "user_id": "user_1234567890",
                "request_timestamp": "2024-01-01T12:00:00Z",
                "client_identifier": "nodejs-backend",
                "additional_context": {}
            }
        }


class AuthenticatedRequest(BaseModel):
    """
    Base model for requests that require authentication.
    
    This model serves as a base class for request models that
    include authentication context.
    """
    
    auth_context: AuthContext = Field(
        ...,
        description="Authentication context for the request"
    )
    
    class Config:
        """Pydantic configuration."""
        
        schema_extra = {
            "example": {
                "auth_context": {
                    "user_id": "user_1234567890",
                    "request_timestamp": "2024-01-01T12:00:00Z",
                    "client_identifier": "nodejs-backend"
                }
            }
        }


class APIKeyValidationResult(BaseModel):
    """
    Result of API key validation.
    
    This model represents the outcome of validating an API key,
    including success status and any relevant metadata.
    """
    
    is_valid: bool = Field(
        ...,
        description="Whether the API key is valid"
    )
    
    user_id: Optional[str] = Field(
        default=None,
        description="User ID associated with the request"
    )
    
    validation_timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="When the validation occurred"
    )
    
    error_message: Optional[str] = Field(
        default=None,
        description="Error message if validation failed"
    )
    
    class Config:
        """Pydantic configuration."""
        
        json_encoders = {
            datetime: lambda v: v.isoformat()
        } 