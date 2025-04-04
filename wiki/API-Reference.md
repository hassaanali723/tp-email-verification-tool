# API Reference

This document provides detailed information about the Email Validation Service API endpoints.

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

Currently, the API does not require authentication. However, rate limiting is implemented to prevent abuse.

## Endpoints

### Health Check

```http
GET /health
```

Returns the service health status.

**Response**
```json
{
    "status": "ok",
    "message": "Service is running"
}
```

### Single Email Validation

```http
POST /validate-email
```

Validates a single email address.

**Request Body**
```json
{
    "email": "test@example.com"
}
```

**Response**
```json
{
    "request_id": "string",
    "email": "test@example.com",
    "is_valid": true,
    "checks": {
        "format": true,
        "mx_record": true,
        "smtp_check": true,
        "disposable": false,
        "catch_all": false
    },
    "details": {
        "domain": "example.com",
        "mx_records": ["mx.example.com"],
        "smtp_response": "250 OK",
        "processing_time": 1.5
    }
}
```

### Batch Email Validation

```http
POST /validate-emails
```

Validates multiple email addresses in a batch.

**Request Body**
```json
{
    "emails": [
        "test1@example.com",
        "test2@example.com"
    ],
    "batch_size": 5
}
```

**Response**
```json
{
    "batch_id": "string",
    "total_emails": 2,
    "status": "processing"
}
```

### Multi-Batch Validation Status

```http
GET /multi-validation-status/{request_id}
```

Get the status of a multi-batch validation request.

**Response**
```json
{
    "request_id": "string",
    "total_batches": 5,
    "completed_batches": 3,
    "total_emails": 100,
    "processed_emails": 60,
    "status": "processing",
    "results": {
        "valid_emails": ["test1@example.com"],
        "invalid_emails": ["invalid@example.com"],
        "error_emails": []
    }
}
```

### Single Batch Validation Status

```http
GET /validation-status/{batch_id}
```

Get the status of a single batch validation request.

**Response**
```json
{
    "batch_id": "string",
    "total_emails": 20,
    "processed_emails": 15,
    "status": "processing",
    "results": {
        "valid_emails": ["test1@example.com"],
        "invalid_emails": ["invalid@example.com"],
        "error_emails": []
    }
}
```

## Response Status Codes

- `200 OK`: Request successful
- `202 Accepted`: Request accepted, processing in progress
- `400 Bad Request`: Invalid request parameters
- `404 Not Found`: Resource not found
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

## Rate Limiting

- Single validation: 60 requests per minute
- Batch validation: 10 requests per minute
- Status checks: 120 requests per minute

## Error Responses

Standard error response format:

```json
{
    "error": {
        "code": "string",
        "message": "string",
        "details": {}
    }
}
```

Common error codes:
- `INVALID_EMAIL`: Email format is invalid
- `BATCH_TOO_LARGE`: Batch size exceeds limit
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `PROCESSING_ERROR`: Error during validation
- `BATCH_NOT_FOUND`: Batch ID not found

## Webhook Notifications

For batch processing, you can optionally receive webhook notifications when processing is complete.

To enable webhooks, include a `webhook_url` in your batch validation request:

```json
{
    "emails": ["test@example.com"],
    "batch_size": 5,
    "webhook_url": "https://your-domain.com/webhook"
}
```

Webhook payload format:
```json
{
    "batch_id": "string",
    "status": "completed",
    "total_emails": 5,
    "processed_emails": 5,
    "results": {
        "valid_emails": [],
        "invalid_emails": [],
        "error_emails": []
    }
}
```