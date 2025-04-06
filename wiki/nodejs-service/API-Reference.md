# Node.js Backend API Reference

## Overview
This document describes the REST APIs provided by the Node.js backend service for email validation.

## Endpoints

### 1. Validate Email Batch
**Endpoint:** `POST /api/validate-batch`

**Description:**  
Submits a batch of emails for validation.

**Request Body:**
```json
{
    "emails": ["email1@domain.com", "email2@domain.com"],
    "fileId": "unique-file-id",
    "validationFlags": {
        // Optional validation configuration
    }
}
```

**Response:**
```json
{
    "batchId": "unique-batch-id",
    "status": "processing",
    "message": "Validation started"
}
```

### 2. Get Email Validation Statistics
**Endpoint:** `GET /api/email-validation/email-validation-stats/:fileId`

**Description:**  
Retrieves validation statistics for a specific file.

**Parameters:**
- `fileId`: Unique identifier for the file

**Response:**
```json
{
    "totalEmails": 100,
    "processedEmails": 75,
    "validEmails": 60,
    "invalidEmails": 10,
    "riskyEmails": 5,
    "progress": 75,
    "status": "processing"
}
```

### 3. Get Email List
**Endpoint:** `GET /api/email-validation/email-list/:fileId`

**Description:**  
Retrieves a paginated list of validated emails for a specific file.

**Parameters:**
- `fileId`: Unique identifier for the file

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50)
- `status`: Filter by status (optional: valid, invalid, risky, unknown)

**Response:**
```json
{
    "emails": [
        {
            "email": "example@domain.com",
            "status": "valid",
            "is_valid": true,
            "risk_level": "low",
            "deliverability_score": 0.95,
            "details": {
                "general": {
                    "domain": "domain.com",
                    "reason": null,
                    "validation_method": "smtp"
                },
                "attributes": {
                    "free_email": false,
                    "role_account": false,
                    "disposable": false,
                    "catch_all": false
                },
                "mail_server": {
                    "smtp_provider": "Google",
                    "mx_record": true,
                    "implicit_mx": false
                }
            }
        }
    ],
    "pagination": {
        "total": 100,
        "page": 1,
        "limit": 50,
        "pages": 2
    }
}
```

## Real-time Updates
The service uses Redis pub/sub to provide real-time updates:

### Channels
1. `file_stats:{fileId}`: Publishes updated statistics
2. `file_emails:{fileId}`: Publishes updated email list

### Message Format
The messages follow the same format as their respective REST API responses.