# Configuration Guide

This guide explains all configuration options available in the Email Validation Service.

## Environment Variables

The service uses environment variables for configuration. Create a `.env` file in the root directory with the following options:

### Core Settings

```env
# API Configuration
API_V1_STR=/api/v1
PROJECT_NAME=Email Validation Service
DEBUG=True
ENVIRONMENT=development  # development, staging, production

# Security
SECRET_KEY=your-secret-key
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ORIGINS=http://localhost:3000,http://localhost:8000
```

### Worker Configuration

```env
# Worker Settings
WORKER_COUNT=4                # Number of worker processes
WORKER_BATCH_SIZE=5          # Number of emails per batch
WORKER_PREFETCH_COUNT=1      # Number of messages to prefetch
MAX_RETRIES=3               # Maximum retry attempts for failed validations
RETRY_DELAY=5               # Delay between retries (seconds)
```

### Redis Configuration

```env
# Redis Settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=your_password
REDIS_RESULT_EXPIRY=3600    # Result cache expiry (seconds)
REDIS_SSL=False
REDIS_DECODE_RESPONSES=True
```

### RabbitMQ Configuration

```env
# RabbitMQ Settings
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASS=guest
RABBITMQ_VHOST=/
RABBITMQ_SSL=False
RABBITMQ_QUEUE_NAME=email_validation
RABBITMQ_EXCHANGE=email_validation_exchange
RABBITMQ_ROUTING_KEY=email_validation
```

### Email Validation Settings

```env
# Validation Settings
SMTP_TIMEOUT=10             # SMTP connection timeout (seconds)
DISPOSABLE_CHECK=True       # Enable disposable email check
CATCH_ALL_CHECK=True        # Enable catch-all domain check
MX_CHECK=True              # Enable MX record check
FORMAT_CHECK=True          # Enable email format check
```

### Rate Limiting

```env
# Rate Limiting
RATE_LIMIT_ENABLED=True
RATE_LIMIT_SINGLE=60       # Requests per minute for single validation
RATE_LIMIT_BATCH=10        # Requests per minute for batch validation
RATE_LIMIT_STATUS=120      # Requests per minute for status checks
```

### Logging Configuration

```env
# Logging
LOG_LEVEL=INFO             # DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_FORMAT=json            # json or text
LOG_FILE=app.log          # Log file path
```

## Configuration Precedence

1. Environment variables
2. `.env` file
3. Default values

## Advanced Configuration

### Circuit Breaker Settings

The circuit breaker prevents overloading SMTP servers:

```env
# Circuit Breaker
CB_FAILURE_THRESHOLD=5     # Number of failures before opening
CB_RECOVERY_TIMEOUT=60     # Time before attempting recovery (seconds)
CB_EXPECTED_EXCEPTION=SMTPException  # Exception types to count
```

### Cache Configuration

Configure caching behavior for validation results:

```env
# Cache Settings
CACHE_TYPE=redis           # redis or memory
CACHE_TTL=3600            # Cache TTL in seconds
CACHE_MAX_SIZE=10000      # Maximum cache entries
```

### Worker Queue Settings

Fine-tune worker queue behavior:

```env
# Queue Settings
QUEUE_MAX_PRIORITY=10     # Maximum message priority
QUEUE_DURABLE=True        # Persist queue across restarts
QUEUE_AUTO_DELETE=False   # Delete queue when unused
```

### Webhook Settings

Configure webhook notifications:

```env
# Webhook Settings
WEBHOOK_TIMEOUT=5         # Webhook request timeout
WEBHOOK_RETRY_COUNT=3     # Number of retry attempts
WEBHOOK_RETRY_DELAY=5     # Delay between retries (seconds)
```

## Environment-Specific Configurations

### Development

```env
DEBUG=True
ENVIRONMENT=development
LOG_LEVEL=DEBUG
CORS_ORIGINS=*
```

### Staging

```env
DEBUG=False
ENVIRONMENT=staging
LOG_LEVEL=INFO
CORS_ORIGINS=https://staging.yourdomain.com
```

### Production

```env
DEBUG=False
ENVIRONMENT=production
LOG_LEVEL=WARNING
CORS_ORIGINS=https://yourdomain.com
REDIS_SSL=True
RABBITMQ_SSL=True
```

## Security Recommendations

1. Always use strong passwords for Redis and RabbitMQ
2. Enable SSL in production
3. Restrict CORS origins
4. Use a secure SECRET_KEY
5. Enable rate limiting

## Monitoring Configuration

```env
# Monitoring
ENABLE_METRICS=True       # Enable Prometheus metrics
METRICS_PORT=9090        # Metrics server port
HEALTH_CHECK_INTERVAL=30 # Health check interval (seconds)
```

## Example Configurations

### Minimal Configuration

```env
API_V1_STR=/api/v1
REDIS_HOST=localhost
RABBITMQ_HOST=localhost
```

### Production Configuration

```env
API_V1_STR=/api/v1
ENVIRONMENT=production
DEBUG=False
LOG_LEVEL=WARNING

REDIS_HOST=redis.production
REDIS_SSL=True
REDIS_PASSWORD=strong-password

RABBITMQ_HOST=rabbitmq.production
RABBITMQ_SSL=True
RABBITMQ_USER=production-user
RABBITMQ_PASS=strong-password

WORKER_COUNT=8
RATE_LIMIT_ENABLED=True
```

## Troubleshooting

If you encounter issues:

1. Check log files for errors
2. Verify environment variables are set correctly
3. Ensure services (Redis, RabbitMQ) are running
4. Check connectivity and credentials
5. Verify SSL settings if enabled