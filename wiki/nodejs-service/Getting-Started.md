# Getting Started with Node.js Backend

## Prerequisites

1. **Required Software**
   - Node.js (v14 or higher)
   - MongoDB (v4.4 or higher)
   - Redis (v6 or higher)
   - npm or yarn package manager

2. **System Requirements**
   - Memory: 2GB RAM minimum
   - Storage: 1GB free space
   - CPU: 1 core minimum

## Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-repo/email-verification-tool.git
   cd email-verification-tool/backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

## Running the Service

1. **Development Mode**
   ```bash
   npm run dev
   # or
   yarn dev
   ```

2. **Production Mode**
   ```bash
   npm start
   # or
   yarn start
   ```

## Testing

1. **Run Tests**
   ```bash
   npm test
   # or
   yarn test
   ```

2. **Test Coverage**
   ```bash
   npm run coverage
   # or
   yarn coverage
   ```

## Development Setup

1. **Code Linting**
   ```bash
   npm run lint
   # or
   yarn lint
   ```

2. **Code Formatting**
   ```bash
   npm run format
   # or
   yarn format
   ```

## Directory Structure

```
backend/
├── config/
│   ├── database.js
│   └── redis.js
├── models/
│   ├── EmailResults.js
│   └── EmailBatches.js
├── routes/
│   └── emailValidation.js
├── services/
│   ├── redisService.js
│   └── statisticsService.js
├── utils/
│   └── logger.js
├── app.js
└── package.json
```

## Quick Start Guide

1. **Start Required Services**
   ```bash
   # Start MongoDB
   mongod

   # Start Redis
   redis-server
   ```

2. **Run the Application**
   ```bash
   npm run dev
   ```

3. **Verify Installation**
   ```bash
   curl http://localhost:3000/health
   # Should return: {"status":"ok"}
   ```

## Common Issues

1. **MongoDB Connection**
   - Ensure MongoDB is running
   - Check connection string in .env
   - Verify network connectivity

2. **Redis Connection**
   - Ensure Redis server is running
   - Check Redis URL in .env
   - Verify port availability

3. **Port Conflicts**
   - Check if port 3000 is available
   - Configure different port in .env if needed