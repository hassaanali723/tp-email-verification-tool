const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const emailValidationService = require('../services/emailValidationService');
const statisticsService = require('../services/statisticsService');
const EmailResults = require('../models/EmailResults');
const winston = require('winston');
const File = require('../models/File');
const creditService = require('../services/creditService');

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

// Apply auth middleware to all routes
router.use(requireAuth);

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
        const userId = req.auth.userId;
        const emailCount = emails.length;

        // Input validation
        if (!Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty emails array' });
        }
        if (!fileId) {
            return res.status(400).json({ error: 'fileId is required' });
        }

        // Verify file ownership
        const file = await File.findOne({ _id: fileId, userId });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Check if user has sufficient credits
        const hasSufficientCredits = await creditService.hasSufficientCredits(userId, emailCount);
        if (!hasSufficientCredits) {
            const balance = await creditService.getBalance(userId);
            return res.status(402).json({ 
                error: 'Insufficient credits',
                required: emailCount,
                available: balance.balance,
                message: `You need ${emailCount} credits but only have ${balance.balance} available`
            });
        }

        // Reserve credits for this validation
        const reservationId = `validation_${fileId}_${Date.now()}`;
        const reservationDescription = `Email validation for file ${fileId} (${emailCount} emails)`;
        
        await creditService.reserveCredits(userId, emailCount, reservationId, reservationDescription);

        logger.info('Credits reserved for validation:', { 
            userId, 
            fileId, 
            emailCount, 
            reservationId 
        });

        try {
            // Forward to FastAPI service and get response
            const response = await emailValidationService.validateEmailBatch({
                emails,
                fileId,
                userId,
                validationFlags,
                reservationId // Pass reservation ID to track this validation
            });

            // Add reservation info to response for tracking
            response.creditReservation = {
                reservationId,
                amount: emailCount,
                status: 'reserved'
            };

            res.json(response);
        } catch (validationError) {
            // If FastAPI call fails, release the reserved credits
            logger.error('FastAPI validation failed, releasing reserved credits:', {
                userId,
                fileId,
                reservationId,
                error: validationError.message
            });

            await creditService.releaseReservedCredits(
                userId, 
                reservationId, 
                `Validation failed: ${validationError.message}`
            );

            throw validationError;
        }
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
        const userId = req.auth.userId;

        // Verify file ownership
        const file = await File.findOne({ _id: fileId, userId });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        const stats = await statisticsService.getFileStats(fileId, userId);
        res.json(stats);
    } catch (error) {
        logger.error('Error fetching validation statistics:', error);
        res.status(error.message.includes('No validation records found') ? 404 : 500)
           .json({ error: error.message });
    }
});

/**
 * Get paginated email validation results for a file
 * GET /api/email-validation/email-list/:fileId
 * @param {string} fileId - Unique identifier for the file
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 50)
 * @query {string} status - Filter by status (optional: valid, invalid, risky, unknown)
 * @returns {Object} Paginated list of email validation results
 */
router.get('/email-list/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.auth.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const status = req.query.status;

        // Verify file ownership
        const file = await File.findOne({ _id: fileId, userId });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        const results = await statisticsService.getEmailList(fileId, userId, page, limit, status);
        res.json(results);
    } catch (error) {
        logger.error('Error fetching email list:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Download email validation results as CSV
 * GET /api/email-validation/download/:fileId
 * @param {string} fileId - Unique identifier for the file
 * @query {string} status - Filter by status (optional: deliverable, undeliverable, risky, unknown)
 * @returns {File} CSV file with email validation results
 */
router.get('/download/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.auth.userId;
        const status = req.query.status || ''; // Filter parameter

        // Verify file ownership
        const file = await File.findOne({ _id: fileId, userId });
        if (!file) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Get all emails (no pagination for download)
        const results = await statisticsService.getEmailList(fileId, userId, 1, 999999, status);
        
        if (!results.emails || results.emails.length === 0) {
            return res.status(404).json({ error: 'No emails found for download' });
        }

        // Generate CSV content
        const csvContent = generateCSV(results.emails);
        
        // Set headers for file download
        const filterSuffix = status ? `_${status}` : '';
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const filename = `email_validation_results_${fileId}${filterSuffix}_${timestamp}.csv`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));
        
        res.send(csvContent);
        
    } catch (error) {
        logger.error('Error downloading email results:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Generate CSV content from email results
 * @param {Array} emails - Array of email validation results
 * @returns {string} CSV formatted string
 */
function generateCSV(emails) {
    // CSV headers
    const headers = [
        'Email',
        'Status', 
        'Valid',
        'Deliverability Score',
        'Risk Level',
        'Domain',
        'Reason',
        'Validation Method',
        'Free Email',
        'Role Account',
        'Disposable',
        'Catch All',
        'Has Plus Tag',
        'Mailbox Full',
        'No Reply',
        'SMTP Provider',
        'MX Record',
        'Is Blacklisted',
        'Reputation Score',
        'Sub Status'
    ];
    
    // Convert emails to CSV rows
    const rows = emails.map(email => [
        `"${email.email || ''}"`,
        `"${email.status || ''}"`,
        email.is_valid ? 'Yes' : 'No',
        email.deliverability_score || 0,
        `"${email.risk_level || ''}"`,
        `"${email.details?.general?.domain || ''}"`,
        `"${email.details?.general?.reason || ''}"`,
        `"${email.details?.general?.validation_method || ''}"`,
        email.details?.attributes?.free_email ? 'Yes' : 'No',
        email.details?.attributes?.role_account ? 'Yes' : 'No',
        email.details?.attributes?.disposable ? 'Yes' : 'No',
        email.details?.attributes?.catch_all ? 'Yes' : 'No',
        email.details?.attributes?.has_plus_tag ? 'Yes' : 'No',
        email.details?.attributes?.mailbox_full ? 'Yes' : 'No',
        email.details?.attributes?.no_reply ? 'Yes' : 'No',
        `"${email.details?.mail_server?.smtp_provider || ''}"`,
        `"${email.details?.mail_server?.mx_record || ''}"`,
        email.details?.blacklist?.is_blacklisted ? 'Yes' : 'No',
        email.details?.blacklist?.reputation_score || 100,
        `"${email.details?.sub_status || ''}"`
    ]);
    
    // Combine headers and rows
    const csvLines = [headers.join(','), ...rows.map(row => row.join(','))];
    return csvLines.join('\n');
}

module.exports = router; 