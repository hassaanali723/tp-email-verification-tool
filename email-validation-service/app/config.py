from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Email Validation Service"
    
    # Validation Settings
    DNS_TIMEOUT: int = 10
    SMTP_TIMEOUT: int = 30
    MAX_CONCURRENT_VALIDATIONS: int = 5
    
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
    
    # Worker settings
    WORKER_BATCH_SIZE: int = 5
    WORKER_PREFETCH_COUNT: int = 1
    MAX_RETRIES: int = 3

    class Config:
        env_file = ".env"
        # Require these environment variables to be set
        env_required = [
            "RABBITMQ_HOST",
            "RABBITMQ_USER",
            "RABBITMQ_PASS",
            "REDIS_HOST"
        ]

settings = Settings() 