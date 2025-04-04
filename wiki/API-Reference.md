# API Reference

This document provides detailed information about the Email Validation Service API endpoints based on the actual implementation.

## Base URL

```
http://localhost:8000/api/v1
```

## Email Validation Constants

The service maintains several predefined lists for validation:

### Free Email Providers
- gmail.com, yahoo.com, hotmail.com, outlook.com, aol.com
- icloud.com, protonmail.com, zoho.com, yandex.com

### Role-Based Email Prefixes
Common role-based prefixes that are flagged:
- admin, administrator, support, help, info, contact
- sales, marketing, billing, accounts, abuse, postmaster

### Disposable Email Domains
Extensive list including:
- mailinator.com (and variants)
- guerrillamail.com (and variants)
- tempmail.com, throwawaymail.com
- And many others

## Endpoints

### Single Email Validation

```http
POST /validate
```

Validates a single email address with customizable checks.

**Request Body**
```json
{
    "emails": ["test@example.com"],
    "check_mx": true,
    "check_smtp": true,
    "check_disposable": true,
    "check_catch_all": true,
    "check_blacklist": true
}
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

Validates multiple email addresses with smart batch processing:
- Small batches (≤5 emails): Processed immediately
- Medium batches (≤100 emails): Single batch processing
- Large batches (>100 emails): Multi-batch parallel processing

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

**Response for Small Batches (≤5 emails)**
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

**Response for Medium/Large Batches**
```json
{
    "batchId": "uuid",
    "status": "processing",
    "totalEmails": 100,
    "processedEmails": 0,
    "estimatedTime": "10 minutes"
}
```

**Response for Multi-Batch Processing**
```json
{
    "requestId": "uuid",
    "status": "processing",
    "totalEmails": 1000,
    "totalBatches": 5,
    "batchIds": ["uuid1", "uuid2", "..."],
    "estimatedTime": "30 minutes"
}
```

### Batch Processing Details

The service automatically determines batch sizes based on total email count:
- ≤100 emails: Single batch
- ≤500 emails: 100 emails per batch
- ≤2000 emails: 200 emails per batch
- >2000 emails: 500 emails per batch

### Status Checking

```http
GET /validation-status/{batch_id}
```

Get the status of a batch validation request.

**Response**
```json
{
    "batchId": "uuid",
    "status": "processing|completed",
    "totalEmails": 100,
    "processedEmails": 50,
    "progress": "50/100 (50%)",
    "results": [
        {
            "email": "test@example.com",
            "is_valid": true,
            "validation_results": {}
        }
    ]
}
```

### Multi-Batch Status

```http
GET /multi-validation-status/{request_id}
```

Get the status of a multi-batch validation request.

**Response**
```json
{
    "requestId": "uuid",
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
        },
        {
            "batchId": "uuid2",
            "status": "processing",
            "processedEmails": 150,
            "totalEmails": 200
        }
    ]
}
```

## Error Handling

The service uses standard HTTP status codes:

- `400 Bad Request`: Invalid input (e.g., no emails provided)
- `500 Internal Server Error`: Processing errors (e.g., queue connection failed)

Error Response Format:
```json
{
    "detail": "Error message"
}
```

## Circuit Breaker

The service implements a circuit breaker pattern for SMTP operations:
- Prevents overloading SMTP servers
- Automatically switches to DNS-only mode when needed
- Configurable thresholds and timeouts

## Caching

The service implements multi-level caching:
- Full validation results
- MX records
- Blacklist status
- Disposable domain status
- Catch-all domain status

Each cache type has its own TTL and can be independently enabled/disabled.

## Dependencies

The service relies on:
- Redis for caching and result storage
- RabbitMQ for task queuing
- DNS servers for MX record validation
- SMTP servers for email validation