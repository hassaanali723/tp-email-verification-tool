require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const logger = require('./utils/logger');
const redisService = require('./services/redisService');
const fileRoutes = require('./routes/fileRoutes');
const emailValidationRoutes = require("./routes/emailValidation");

const app = express();

// Middleware
app.use(express.json());

// Enable CORS for all origins
app.use(cors());

// Routes
app.use('/api/files', fileRoutes);
app.use('/api/email-validation', emailValidationRoutes);

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/email-verification';

// Initialize services and start server
async function initializeApp() {
    try {
        // Connect to MongoDB
        await mongoose.connect(MONGODB_URI);
        logger.info('Connected to MongoDB successfully');

        // Initialize Redis service
        await redisService.initialize();
        logger.info('Redis service initialized successfully');

        // Start server
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => logger.info(`Server is running on port ${PORT}`));
    } catch (error) {
        logger.error('Failed to initialize services:', error);
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received. Starting graceful shutdown...');
    await cleanup();
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received. Starting graceful shutdown...');
    await cleanup();
});

// Cleanup function
async function cleanup() {
    try {
        // Cleanup Redis connections
        await redisService.cleanup();
        logger.info('Redis connections closed');

        // Close MongoDB connection
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');

        process.exit(0);
    } catch (error) {
        logger.error('Error during cleanup:', error);
        process.exit(1);
    }
}

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal Server Error'
    });
});

// Start the application
initializeApp().catch(error => {
    logger.error('Failed to start application:', error);
    process.exit(1);
});

module.exports = app;
