# Node.js Backend Architecture Overview

## System Architecture

The Node.js backend service is designed to handle email validation results processing and real-time updates. Here's a detailed overview of its architecture:

### Core Components

1. **Express Server**
   - Handles HTTP requests
   - Provides REST API endpoints
   - Manages routing and middleware

2. **Redis Service**
   - Manages pub/sub communication
   - Handles real-time updates
   - Processes batch updates

3. **Statistics Service**
   - Calculates validation statistics
   - Provides email list retrieval
   - Handles data aggregation

4. **MongoDB Integration**
   - Stores email validation results
   - Manages batch processing data
   - Handles data persistence

### Data Flow

1. **Batch Processing**
   ```mermaid
   graph LR
   A[Redis Message] --> B[Redis Service]
   B --> C[Update DB]
   C --> D[Calculate Stats]
   D --> E[Publish Updates]
   ```

2. **Real-time Updates**
   ```mermaid
   graph LR
   A[Batch Update] --> B[Get Stats]
   B --> C[Publish Stats]
   A --> D[Get Email List]
   D --> E[Publish List]
   ```

### Database Schema

1. **EmailResults Collection**
   ```javascript
   {
       batchId: String,
       fileId: String,
       status: String,
       processedEmails: Number,
       results: [
           {
               email: String,
               status: String,
               is_valid: Boolean,
               risk_level: String,
               details: Object
           }
       ]
   }
   ```

2. **EmailBatches Collection**
   ```javascript
   {
       fileId: String,
       totalBatches: Number,
       completedBatches: Number,
       status: String
   }
   ```

### Service Integration

The Node.js backend integrates with:
1. FastAPI service for email validation
2. Redis for real-time messaging
3. MongoDB for data persistence
4. Frontend for user interface

### Real-time Communication

1. **Redis Channels**
   - `file_stats:{fileId}`: Statistics updates
   - `file_emails:{fileId}`: Email list updates

2. **Update Flow**
   ```mermaid
   sequenceDiagram
   Redis->>RedisService: Batch Update
   RedisService->>MongoDB: Update Results
   RedisService->>StatsService: Get Stats
   StatsService->>Redis: Publish Stats
   RedisService->>StatsService: Get Emails
   StatsService->>Redis: Publish Emails
   ```