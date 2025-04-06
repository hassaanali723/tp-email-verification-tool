const express = require('express');
const router = express.Router();
const emailValidationService = require('../services/emailValidationService');
const statisticsService = require('../services/statisticsService');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/routes-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/routes.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

/**
 * Validate a batch of emails
 * POST /api/validate-batch
 * @body {Object} request
 * @body {string[]} request.emails - Array of email addresses to validate
 * @body {string} request.fileId - Unique identifier for the file
 * @body {Object} [request.validationFlags] - Optional validation configuration
 */
router.post('/validate-batch', async (req, res) => {
    try {
        const { emails, fileId, validationFlags } = req.body;

        // Input validation
        if (!Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty emails array' });
        }
        if (!fileId) {
            return res.status(400).json({ error: 'fileId is required' });
        }

        // Forward to FastAPI service and get response
        const response = await emailValidationService.validateEmailBatch({
            emails,
            fileId,
            validationFlags
        });

        res.json(response);
    } catch (error) {
        logger.error('Error in validate-batch endpoint:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get validation statistics for a file
 * GET /api/email-validation/email-validation-stats/:fileId
 * @param {string} fileId - Unique identifier for the file
 * @returns {Object} Statistics and progress information for the file
 */
router.get('/email-validation-stats/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const stats = await statisticsService.getFileStats(fileId);
        res.json(stats);
    } catch (error) {
        logger.error('Error fetching validation statistics:', error);
        res.status(error.message.includes('No validation records found') ? 404 : 500)
           .json({ error: error.message });
    }
});

module.exports = router; 