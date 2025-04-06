# Configuration Guide

This guide explains all configuration options available in the Email Validation Service based on the actual implementation.

## Environment Variables

The service uses environment variables for configuration. Create a `.env` file in the root directory with the following options:

### Core API Settings

```env
API_V1_STR=/api/v1
PROJECT_NAME=Email Validation Service
```

### Email Validation Settings

```env
# DNS and SMTP Timeouts
DNS_TIMEOUT=10              # DNS lookup timeout in seconds
SMTP_TIMEOUT=5             # SMTP connection timeout in seconds
MAX_CONCURRENT_VALIDATIONS=5

# SMTP Configuration
SMTP_PORT=25               # Default SMTP port
SMTP_USE_TLS=False        # Whether to use TLS
SMTP_FALLBACK_PORTS=587,465  # Fallback ports if primary fails
```

### Circuit Breaker Settings

```env
# Circuit Breaker Configuration
SMTP_CIRCUIT_BREAKER_THRESHOLD=10   # Number of failures before opening circuit
SMTP_CIRCUIT_BREAKER_TIMEOUT=300    # Seconds to wait before attempting recovery
SMTP_ERROR_THRESHOLD_PERCENTAGE=30   # Percentage of errors to trigger circuit
DNS_ONLY_MODE_ENABLED=False         # Emergency switch for DNS-only mode
```

### Cache Settings

```env
# Cache TTLs (in seconds)
CACHE_TTL_FULL_RESULT=86400     # 24 hours
CACHE_TTL_MX_RECORDS=172800     # 48 hours
CACHE_TTL_BLACKLIST=21600       # 6 hours
CACHE_TTL_DISPOSABLE=604800     # 7 days
CACHE_TTL_CATCH_ALL=86400       # 24 hours
CATCH_ALL_CACHE_TTL=3600        # 1 hour

# Cache Control Flags
ENABLE_RESULT_CACHE=True
ENABLE_MX_CACHE=True
ENABLE_BLACKLIST_CACHE=True
ENABLE_DISPOSABLE_CACHE=True
ENABLE_CATCH_ALL_CACHE=True

# Cache Keys
CACHE_KEY_PREFIX=email_validation:
```

### RabbitMQ Configuration

```env
# Required Settings
RABBITMQ_HOST=localhost          # Required
RABBITMQ_PORT=5672
RABBITMQ_USER=guest             # Required
RABBITMQ_PASS=guest             # Required
RABBITMQ_VHOST=/
RABBITMQ_QUEUE=email_validation
RABBITMQ_DLQ=email_validation_dlq  # Dead Letter Queue
```

### Redis Configuration

```env
# Required Settings
REDIS_HOST=localhost            # Required
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=                 # Optional
REDIS_RESULT_EXPIRY=3600       # 1 hour
```

### Worker Configuration

```env
WORKER_COUNT=3                  # Number of worker processes
WORKER_BATCH_SIZE=5            # Emails per batch
WORKER_PREFETCH_COUNT=1        # Messages to prefetch
MAX_RETRIES=3                  # Maximum retry attempts
```

## Configuration Precedence

The service uses pydantic-settings for configuration management. The precedence order is:

1. Environment variables
2. `.env` file
3. Default values specified in the Settings class

## Required Environment Variables

The following environment variables MUST be set:
- `RABBITMQ_HOST`
- `RABBITMQ_USER`
- `RABBITMQ_PASS`
- `REDIS_HOST`

## Cache System

The service implements a sophisticated caching system with different TTLs for various types of data:

1. **Full Result Cache** (24 hours)
   - Stores complete validation results
   - Helps avoid redundant validations

2. **MX Records Cache** (48 hours)
   - Caches DNS MX record lookups
   - Reduces DNS query load

3. **Blacklist Cache** (6 hours)
   - Stores known invalid domains
   - Quick rejection of invalid emails

4. **Disposable Email Cache** (7 days)
   - Caches disposable email domain checks
   - Long TTL due to infrequent changes

5. **Catch-All Domain Cache** (24 hours)
   - Stores catch-all domain status
   - Balanced TTL for accuracy and performance

## Circuit Breaker Implementation

The service includes a circuit breaker pattern for SMTP operations:

1. **Threshold**: Opens after 10 failures
2. **Recovery**: 5-minute timeout before recovery attempt
3. **Error Rate**: Triggers at 30% error rate
4. **DNS Fallback**: Can switch to DNS-only mode in emergencies

## SMTP Configuration

The service uses a multi-port strategy for SMTP connections:

1. Primary port: 25 (default SMTP)
2. Fallback ports: 587 (submission), 465 (SMTPS)
3. TLS support can be enabled/disabled

## Worker Configuration

Worker settings are optimized for balanced performance:

1. **Concurrency**: 3 worker processes by default
2. **Batch Processing**: 5 emails per batch
3. **Message Prefetch**: 1 message at a time
4. **Retry Logic**: Maximum 3 retry attempts

## Environment-Specific Recommendations

### Development
```env
DNS_TIMEOUT=20
SMTP_TIMEOUT=10
ENABLE_RESULT_CACHE=False
```

### Production
```env
DNS_TIMEOUT=10
SMTP_TIMEOUT=5
SMTP_CIRCUIT_BREAKER_THRESHOLD=10
ENABLE_RESULT_CACHE=True
```

### High-Load Production
```env
WORKER_COUNT=6
WORKER_BATCH_SIZE=10
MAX_CONCURRENT_VALIDATIONS=10
```