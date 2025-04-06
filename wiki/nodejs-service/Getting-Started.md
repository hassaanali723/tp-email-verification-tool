# Getting Started with Node.js Backend

[Previous sections remain the same...]

## Project Structure

```
backend/
├── app.js                 # Main application entry point
├── routes/
│   ├── emailValidation.js # Email validation endpoints
│   └── fileRoutes.js      # File upload and processing routes
├── services/
│   ├── emailValidationService.js # Email validation logic
│   ├── fileProcessingService.js  # File processing logic
│   ├── redisService.js          # Redis pub/sub handling
│   ├── statisticsService.js     # Statistics calculation
│   └── storageService.js        # File storage management
├── models/
│   ├── EmailResults.js    # Email validation results schema
│   ├── EmailBatches.js    # Batch processing schema
│   └── File.js           # File upload tracking and processing status
│                         # - Stores file metadata (name, size, type)
│                         # - Tracks processing progress
│                         # - Manages validation status and results
├── utils/
│   └── logger.js          # Winston logger configuration
└── uploads/               # File upload directory
```

## Database Models

### File Model
The `File.js` model manages uploaded file information and processing status:
```javascript
{
    filename: String,       // Stored filename
    originalName: String,   // Original uploaded filename
    mimeType: String,      // File type (csv, xlsx, etc.)
    size: Number,          // File size in bytes
    path: String,          // Storage path
    status: String,        // pending/processing/completed/failed
    totalEmails: Number,   // Total emails in file
    processingProgress: {
        totalRows: Number,
        processedRows: Number,
        emailsFound: Number,
        lastUpdated: Date
    },
    error: {              // Error tracking if failed
        message: String,
        code: String,
        timestamp: Date
    }
}
```

[Rest of the document remains the same...]