from pydantic_settings import BaseSettings
from typing import Optional, List
from pydantic import Field, validator

class Settings(BaseSettings):
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Email Validation Service"
    
    # Authentication & Security Settings
    API_KEY: str = Field(
        ...,
        description="Shared API key for authenticating requests from Node.js backend",
        min_length=32
    )
    API_KEY_HEADER: str = Field(
        default="X-API-Key",
        description="HTTP header name for API key authentication"
    )
    USER_ID_HEADER: str = Field(
        default="X-User-ID", 
        description="HTTP header name for user ID context"
    )
    CLIENT_ID_HEADER: str = Field(
        default="X-Client-ID",
        description="HTTP header name for client identifier"
    )
    ENABLE_AUTH: bool = Field(
        default=True,
        description="Feature flag to enable/disable authentication (use False only in development)"
    )
    AUTH_BYPASS_ENDPOINTS: List[str] = Field(
        default=["/health", "/", "/docs", "/openapi.json"],
        description="Endpoints that bypass authentication"
    )
    REQUEST_TIMEOUT_SECONDS: int = Field(
        default=300,
        description="Maximum age of request in seconds before considering it expired"
    )
    
    # Validation Settings
    DNS_TIMEOUT: int = 10
    SMTP_TIMEOUT: int = 5
    MAX_CONCURRENT_VALIDATIONS: int = 5
    
    # SMTP Settings
    SMTP_PORT: int = 25  # Default SMTP port
    SMTP_USE_TLS: bool = False  # Whether to use TLS
    SMTP_FALLBACK_PORTS: List[int] = [587, 465]  # Fallback ports if primary fails
    
    # Circuit Breaker Settings
    SMTP_CIRCUIT_BREAKER_THRESHOLD: int = 10  # Number of failures before opening circuit
    SMTP_CIRCUIT_BREAKER_TIMEOUT: int = 300   # Seconds to wait before attempting recovery
    SMTP_ERROR_THRESHOLD_PERCENTAGE: int = 30  # Percentage of errors to trigger circuit
    DNS_ONLY_MODE_ENABLED: bool = False       # Emergency switch for DNS-only mode
    
    # Cache Settings
    CATCH_ALL_CACHE_TTL: int = 3600  # 1 hour
    
    # Cache TTL Settings (in seconds)
    CACHE_TTL_FULL_RESULT: int = 86400        # 24 hours
    CACHE_TTL_MX_RECORDS: int = 172800        # 48 hours
    CACHE_TTL_BLACKLIST: int = 21600          # 6 hours
    CACHE_TTL_DISPOSABLE: int = 604800        # 7 days
    CACHE_TTL_CATCH_ALL: int = 86400          # 24 hours
    
    # Cache Keys Prefix
    CACHE_KEY_PREFIX: str = "email_validation:"
    
    # Cache Control
    ENABLE_RESULT_CACHE: bool = True
    ENABLE_MX_CACHE: bool = True
    ENABLE_BLACKLIST_CACHE: bool = True
    ENABLE_DISPOSABLE_CACHE: bool = True
    ENABLE_CATCH_ALL_CACHE: bool = True
    
    # RabbitMQ settings
    RABBITMQ_HOST: str
    RABBITMQ_PORT: int = 5672
    RABBITMQ_USER: str
    RABBITMQ_PASS: str
    RABBITMQ_VHOST: str = "/"
    RABBITMQ_QUEUE: str = "email_validation"
    RABBITMQ_DLQ: str = "email_validation_dlq"
    
    # Redis settings
    REDIS_HOST: str
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: Optional[str] = None
    REDIS_RESULT_EXPIRY: int = 3600
    
    # For smaller batches, process directly
    SMALL_BATCH_THRESHOLD: int = 1

    # Worker settings
    WORKER_COUNT: int = 3           # Number of worker processes to run
    WORKER_BATCH_SIZE: int = 5
    WORKER_PREFETCH_COUNT: int = 1
    MAX_RETRIES: int = 3

    @validator('API_KEY')
    def validate_api_key(cls, v: str) -> str:
        """Validate API key strength."""
        if len(v) < 32:
            raise ValueError("API key must be at least 32 characters long")
        return v

    class Config:
        env_file = ".env"
        # Require these environment variables to be set
        env_required = [
            "RABBITMQ_HOST",
            "RABBITMQ_USER", 
            "RABBITMQ_PASS",
            "REDIS_HOST",
            "API_KEY"
        ]

settings = Settings() 