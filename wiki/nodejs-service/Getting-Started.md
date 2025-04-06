# Getting Started with Node.js Backend

## Prerequisites

1. **Required Software**
   - Node.js (v14 or higher)
   - MongoDB (v4.4 or higher)
   - Redis (v6 or higher)
   - Python (v3.8 or higher) - Required for email validation service

2. **System Requirements**
   - Memory: 2GB RAM minimum
   - Storage: 1GB free space
   - Network: Internet connection for email validation

## Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/hassaanali723/tp-email-verification-tool.git
   cd email-verification-tool/backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env` file based on `.env.example`:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # MongoDB Configuration
   MONGO_URI=mongodb://localhost:27017/email-validator

   # Storage Configuration
   UPLOAD_DIR=./uploads
   MAX_FILE_SIZE=10485760 # 10MB in bytes
   ALLOWED_FILE_TYPES=.csv,.xlsx,.xls,.txt

   # Email Validation Service
   EMAIL_VALIDATION_API_URL=http://localhost:8000/api/v1 

   # Redis Configuration
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   REDIS_CHANNEL_VALIDATION=email_validation_results
   ```

## Running the Service

1. **Start Required Services**
   ```bash
   # Start MongoDB
   mongod

   # Start Redis
   redis-server

   # Start FastAPI Email Validation Service
   # (Follow FastAPI service setup instructions)
   ```

2. **Start the Application**
   ```bash
   # Development mode with auto-reload
   npm run dev

   # Production mode
   npm start
   ```

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

### EmailResults Model
Stores individual email validation results:
```javascript
{
    batchId: String,
    fileId: String,
    status: String,
    processedEmails: Number,
    results: [{
        email: String,
        status: String,
        is_valid: Boolean,
        risk_level: String,
        details: Object
    }]
}
```

### EmailBatches Model
Tracks batch processing status:
```javascript
{
    fileId: String,
    totalBatches: Number,
    completedBatches: Number,
    status: String
}
```

## Key Features

1. **File Processing**
   - Supports CSV, Excel, and text files
   - Handles large file uploads
   - Processes emails in batches

2. **Email Validation**
   - Real-time validation status
   - Batch processing support
   - Detailed validation results

3. **Real-time Updates**
   - Redis pub/sub for live updates
   - Progress tracking
   - Statistics calculation

## Available Scripts

- `npm start`: Run in production mode
- `npm run dev`: Run in development mode with nodemon

## Dependencies

Key packages used:
- `express`: Web framework
- `mongoose`: MongoDB ODM
- `ioredis`: Redis client
- `multer`: File upload handling
- `csv-parser` & `xlsx`: File parsing
- `winston`: Logging
- `bull`: Job queue (if implemented)

## Common Issues & Solutions

1. **MongoDB Connection Issues**
   - Ensure MongoDB is running: `mongod`
   - Check MongoDB URI in `.env`
   - Verify MongoDB port is available (default: 27017)

2. **Redis Connection Issues**
   - Ensure Redis server is running: `redis-server`
   - Check Redis configuration in `.env`
   - Verify Redis port is available (default: 6379)

3. **File Upload Issues**
   - Check upload directory permissions
   - Verify file size limits
   - Ensure supported file types

4. **Email Validation Service Connection**
   - Verify FastAPI service is running
   - Check EMAIL_VALIDATION_API_URL in `.env`
   - Ensure network connectivity

## Next Steps

1. Set up the FastAPI email validation service
2. Configure MongoDB and Redis
3. Test file upload functionality
4. Monitor real-time updates

For more detailed information, refer to:
- [API Reference](./API-Reference.md)
- [Architecture Overview](./Architecture-Overview.md)
- [Configuration Guide](./Configuration-Guide.md)