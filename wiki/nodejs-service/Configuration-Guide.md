# Node.js Backend Configuration Guide

## Environment Setup

1. **Environment Variables**
   Create a `.env` file in the backend directory with the following variables:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/email_validation
   REDIS_URL=redis://localhost:6379
   LOG_LEVEL=info
   ```

2. **Redis Configuration**
   The service requires Redis for real-time updates:
   ```javascript
   // Redis connection options
   const redisOptions = {
       host: process.env.REDIS_HOST || 'localhost',
       port: process.env.REDIS_PORT || 6379,
       retryStrategy: times => Math.min(times * 50, 2000)
   };
   ```

3. **MongoDB Setup**
   Configure MongoDB connection:
   ```javascript
   // MongoDB connection options
   const mongoOptions = {
       useNewUrlParser: true,
       useUnifiedTopology: true
   };
   ```

## Logging Configuration

1. **Winston Logger Setup**
   ```javascript
   const winston = require('winston');
   
   const logger = winston.createLogger({
       level: process.env.LOG_LEVEL || 'info',
       format: winston.format.combine(
           winston.format.timestamp(),
           winston.format.json()
       ),
       transports: [
           new winston.transports.File({ 
               filename: 'logs/error.log', 
               level: 'error' 
           }),
           new winston.transports.File({ 
               filename: 'logs/combined.log' 
           })
       ]
   });
   ```

## API Rate Limiting

1. **Express Rate Limiter**
   ```javascript
   const rateLimit = require('express-rate-limit');
   
   const limiter = rateLimit({
       windowMs: 15 * 60 * 1000, // 15 minutes
       max: 100 // limit each IP to 100 requests per windowMs
   });
   ```

## CORS Configuration

1. **CORS Setup**
   ```javascript
   const cors = require('cors');
   
   app.use(cors({
       origin: process.env.FRONTEND_URL || 'http://localhost:4200',
       methods: ['GET', 'POST'],
       allowedHeaders: ['Content-Type', 'Authorization']
   }));
   ```

## Error Handling

1. **Global Error Handler**
   ```javascript
   app.use((err, req, res, next) => {
       logger.error('Unhandled error:', err);
       res.status(500).json({
           error: 'Internal server error',
           message: err.message
       });
   });
   ```

## Service Dependencies

1. **Required NPM Packages**
   ```json
   {
       "dependencies": {
           "express": "^4.17.1",
           "mongoose": "^6.0.0",
           "ioredis": "^4.27.7",
           "winston": "^3.3.3",
           "cors": "^2.8.5",
           "dotenv": "^10.0.0",
           "express-rate-limit": "^5.3.0"
       }
   }
   ```