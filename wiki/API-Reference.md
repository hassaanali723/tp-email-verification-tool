# API Reference

This document provides detailed information about the Email Validation Service API endpoints.

## Base URL

```
http://localhost:8000/api/v1
```

## Core Endpoints

### Single Email Validation

```http
POST /validate-email
```

Validates a single email address with customizable checks.

**Query Parameters**
```
email: string (required)
check_mx: boolean (default: true)
check_smtp: boolean (default: true)
check_disposable: boolean (default: true)
check_catch_all: boolean (default: true)
check_blacklist: boolean (default: true)
```

**Response**
```json
{
    "email": "test@example.com",
    "is_valid": true,
    "validation_results": {
        "format_valid": true,
        "mx_found": true,
        "smtp_check": true,
        "is_disposable": false,
        "is_catch_all": false,
        "is_blacklisted": false
    },
    "smtp_provider": "google",
    "mx_records": ["aspmx.l.google.com"],
    "processing_time": 1.5
}
```

### Batch Email Validation

```http
POST /validate-batch
```

Validates multiple email addresses with smart batch processing.

**Request Body**
```json
{
    "emails": [
        "test1@example.com",
        "test2@example.com"
    ],
    "check_mx": true,
    "check_smtp": true,
    "check_disposable": true,
    "check_catch_all": true,
    "check_blacklist": true
}
```

**Response Types**

1. Small Batches (≤5 emails):
```json
{
    "batchId": "uuid",
    "status": "completed",
    "totalEmails": 2,
    "processedEmails": 2,
    "results": [
        {
            "email": "test1@example.com",
            "is_valid": true,
            "validation_results": {}
        }
    ]
}
```

2. Medium Batches:
```json
{
    "batchId": "uuid",
    "status": "processing",
    "totalEmails": 100,
    "processedEmails": 0,
    "estimatedTime": "10 minutes"
}
```

3. Large Batches (Multi-Batch):
```json
{
    "requestId": "uuid",
    "batchIds": ["uuid1", "uuid2"],
    "status": "processing",
    "totalEmails": 1000,
    "processedEmails": 0,
    "estimatedTime": "30 minutes"
}
```

## Status Endpoints

### Single Batch Status

```http
GET /validation-status/{batch_id}
```

Get the status of a single batch validation request.

**Response**
```json
{
    "batchId": "uuid",
    "status": "completed|processing",
    "totalEmails": 100,
    "processedEmails": 50,
    "results": [],
    "lastUpdated": "2024-04-04T12:00:00Z"
}
```

### Multi-Batch Status

```http
GET /multi-validation-status/{request_id}
```

Get the aggregated status of a multi-batch validation request.

**Response**
```json
{
    "requestId": "uuid",
    "batchIds": ["uuid1", "uuid2"],
    "status": "processing|completed",
    "totalEmails": 1000,
    "processedEmails": 500,
    "progress": "500/1000 (50%)",
    "batches": [
        {
            "batchId": "uuid1",
            "status": "completed",
            "processedEmails": 200,
            "totalEmails": 200
        }
    ],
    "lastUpdated": "2024-04-04T12:00:00Z"
}
```

## Circuit Breaker Endpoints

### Get Circuit Breaker Status

```http
GET /circuit-breaker/status
```

Get the current status of the SMTP circuit breaker.

**Response**
```json
{
    "status": "open|closed",
    "consecutive_smtp_timeouts": 5,
    "timeout_threshold": 10,
    "is_open": true,
    "last_timeout": "2024-04-04T12:00:00Z",
    "total_timeouts": 15,
    "total_dns_fallbacks": 10,
    "dns_only_mode": false
}
```

### Reset Circuit Breaker

```http
POST /circuit-breaker/reset
```

Reset the circuit breaker to closed state.

**Response**
```json
{
    "status": "success",
    "message": "Circuit breaker reset successfully"
}
```

## Cache Management Endpoints

### View Cache

```http
GET /cache/view/{cache_type}
```

View cached results by type. Available types: `full`, `mx`, `blacklist`, `disposable`, `catch_all`

**Response**
```json
{
    "cache_type": "mx",
    "total_entries": 100,
    "entries": {
        "email_validation:mx:example.com": {
            "mx_records": ["mx.example.com"],
            "timestamp": "2024-04-04T12:00:00Z"
        }
    }
}
```

### Clear Cache

```http
DELETE /cache/clear/{cache_type}
```

Clear cache by type. Available types: `full`, `mx`, `blacklist`, `disposable`, `catch_all`, `all`

**Response**
```json
{
    "cache_type": "mx",
    "cleared_entries": 100,
    "message": "Successfully cleared 100 cache entries"
}
```

## Testing Endpoints

### Test DNS Validation

```http
POST /test-dns-validation
```

Test endpoint for DNS-only validation, bypassing SMTP checks.

**Query Parameters**
```
email: string (required)
```

**Response**
```json
{
    "email": "test@example.com",
    "is_valid": true,
    "validation_results": {
        "format_valid": true,
        "mx_found": true
    },
    "mx_records": ["mx.example.com"]
}
```

## Error Responses

Standard error response format:

```json
{
    "detail": "Error message"
}
```

Common status codes:
- `400 Bad Request`: Invalid input (e.g., no emails provided)
- `404 Not Found`: Batch or request ID not found
- `500 Internal Server Error`: Processing errors

## Batch Processing Details

The service automatically determines batch sizes based on total email count:
- ≤5 emails: Immediate processing
- ≤100 emails: Single batch
- ≤500 emails: 100 emails per batch
- ≤2000 emails: 200 emails per batch
- >2000 emails: 500 emails per batch

## Circuit Breaker Behavior

The circuit breaker protects the service from SMTP timeouts:
1. Opens after consecutive SMTP timeouts
2. Falls back to DNS-only validation when open
3. Automatically attempts recovery after timeout period
4. Can be manually reset via API endpoint

## Cache Types and TTLs

- Full Results: 24 hours
- MX Records: 48 hours
- Blacklist: 6 hours
- Disposable: 7 days
- Catch-all: 24 hours