"""
Simple rate limiter for API endpoints.
Clean implementation using slowapi and Redis.
"""

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
import redis

from ..config import settings

# Simple rate limiter configuration
def get_user_id(request: Request) -> str:
    """
    Extract user ID for rate limiting.
    Falls back to IP address if no user context.
    """
    # Try to get user ID from auth headers
    user_id = request.headers.get(settings.USER_ID_HEADER)
    if user_id:
        return f"user:{user_id}"
    
    # Fallback to IP address
    return get_remote_address(request)

# Create Redis connection for rate limiter
redis_client = redis.from_url(
    f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
    password=settings.REDIS_PASSWORD,
    db=settings.REDIS_DB,
    decode_responses=True
)

# Create limiter instance
limiter = Limiter(
    key_func=get_user_id,
    storage_uri=f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}",
    storage_options={"password": settings.REDIS_PASSWORD, "db": settings.REDIS_DB}
)

# Rate limit configurations
RATE_LIMITS = {
    "batch_validation": "40/minute",      # Main validation endpoint
    "single_validation": "40/minute",    # Single email validation  
    "status_check": "50/minute",         # Status endpoints
    "admin": "50/minute",                 # Admin endpoints
} 