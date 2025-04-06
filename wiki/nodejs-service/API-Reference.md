# API Reference

This document provides detailed information about all available API endpoints in the Email Verification Tool's Node.js backend service.

## Base URL

All API endpoints are prefixed with `/api`.

## Response Format

Most endpoints follow this general response format:

```json
{
    "success": true|false,
    "data": {
        // Response data specific to each endpoint
    },
    "message": "Optional message string"
}
```

## Authentication

Currently, the API does not require authentication. However, rate limiting and security measures are in place.

## File Management Endpoints

### Upload File
- **Endpoint**: `POST /api/files/upload`
- **Content-Type**: `multipart/form-data`
- **Body Parameters**:
  - `file`: File to upload (Required)
    - Supported formats: CSV, XLSX, XLS
    - Max size: 10MB (configurable)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "fileId": "string",
      "totalEmails": number,
      "message": "File uploaded and processing started"
    }
  }
  ```
- **Error Responses**:
  - `400`: No file uploaded or invalid file type
  - `500`: Server error during upload

### Get File Status
- **Endpoint**: `GET /api/files/:fileId/status`
- **URL Parameters**:
  - `fileId`: File identifier (Required)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "status": "pending|processing|completed|failed",
      "progress": {
        "totalRows": number,
        "processedRows": number,
        "emailsFound": number,
        "percentage": number
      },
      "error": {
        "message": "string",
        "code": "string",
        "timestamp": "date"
      },
      "lastUpdated": "date"
    }
  }
  ```
- **Error Responses**:
  - `404`: File not found
  - `500`: Server error

### List Files
- **Endpoint**: `GET /api/files`
- **Query Parameters**:
  - `page`: Page number (Default: 1)
  - `limit`: Items per page (Default: 10)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "files": [{
        "id": "string",
        "filename": "string",
        "uploadedAt": "date",
        "status": "unverified|verified",
        "emailsReady": number,
        "validationResults": {
          "deliverable": "string",
          "risky": "string",
          "undeliverable": "string",
          "unknown": "string",
          "totalEmails": number
        }
      }],
      "pagination": {
        "total": number,
        "page": number,
        "pages": number
      }
    }
  }
  ```

### Delete File
- **Endpoint**: `DELETE /api/files/:fileId`
- **URL Parameters**:
  - `fileId`: File identifier (Required)
- **Response**:
  ```json
  {
    "success": true,
    "message": "File deleted successfully"
  }
  ```
- **Error Responses**:
  - `404`: File not found
  - `500`: Error during deletion

### Get Extracted Emails
- **Endpoint**: `GET /api/files/:fileId/emails`
- **URL Parameters**:
  - `fileId`: File identifier (Required)
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "emails": ["string"]
    }
  }
  ```
- **Error Responses**:
  - `404`: File not found
  - `400`: File processing not completed

## Email Validation Endpoints

### Validate Email Batch
- **Endpoint**: `POST /api/validate-batch`
- **Content-Type**: `application/json`
- **Body Parameters**:
  ```json
  {
    "emails": ["string"],
    "fileId": "string",
    "validationFlags": {
      // Optional validation configuration
    }
  }
  ```
- **Response**: Returns validation results for the batch
- **Error Responses**:
  - `400`: Invalid or empty emails array
  - `500`: Validation service error

### Get Validation Statistics
- **Endpoint**: `GET /api/email-validation/email-validation-stats/:fileId`
- **URL Parameters**:
  - `fileId`: File identifier (Required)
- **Response**:
  ```json
  {
    "totalEmails": number,
    "processed": number,
    "statistics": {
      "deliverable": {
        "count": number,
        "percentage": number
      },
      "undeliverable": {
        "count": number,
        "percentage": number
      },
      "risky": {
        "count": number,
        "percentage": number
      },
      "unknown": {
        "count": number,
        "percentage": number
      }
    }
  }
  ```
- **Error Responses**:
  - `404`: No validation records found
  - `500`: Server error

### Get Email List
- **Endpoint**: `GET /api/email-validation/email-list/:fileId`
- **URL Parameters**:
  - `fileId`: File identifier (Required)
- **Query Parameters**:
  - `page`: Page number (Default: 1)
  - `limit`: Items per page (Default: 50)
  - `status`: Filter by status (Optional: valid, invalid, risky, unknown)
- **Response**:
  ```json
  {
    "emails": [{
      "email": "string",
      "status": "string",
      "is_valid": boolean,
      "risk_level": "string",
      "details": {
        // Validation details specific to each email
      }
    }],
    "pagination": {
      "total": number,
      "page": number,
      "pages": number
    }
  }
  ```
- **Error Responses**:
  - `500`: Server error

## Real-time Updates

The service uses Redis pub/sub for real-time updates. Clients can subscribe to the following channels:

1. **File Progress Updates**:
   - Channel: `file_progress:${fileId}`
   - Message Format:
     ```json
     {
       "type": "progress",
       "data": {
         "totalRows": number,
         "processedRows": number,
         "emailsFound": number,
         "percentage": number
       }
     }
     ```

2. **Validation Results**:
   - Channel: `email_validation_results:${fileId}`
   - Message Format:
     ```json
     {
       "type": "validation_result",
       "data": {
         "batchId": "string",
         "results": [{
           "email": "string",
           "status": "string",
           "details": {}
         }]
       }
     }
     ```

## Rate Limiting

- File uploads: 10 requests per minute
- API endpoints: 100 requests per minute
- Configurable through environment variables

## Error Codes

Common error codes and their meanings:

- `FILE_NOT_FOUND`: Requested file does not exist
- `INVALID_FILE_TYPE`: Unsupported file format
- `FILE_TOO_LARGE`: File exceeds size limit
- `PROCESSING_ERROR`: Error during file processing
- `VALIDATION_ERROR`: Error during email validation
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Internal server error