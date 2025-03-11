const express = require('express');
const router = express.Router();
const emailValidationService = require('../services/emailValidationService');

/**
 * Validate a batch of emails
 * POST /api/email-validation/batch
 */
router.post('/batch', async (req, res) => {
    try {
        const { emails } = req.body;

        // Validate request
        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an array of emails'
            });
        }

        // Start batch validation
        const result = await emailValidationService.validateEmailBatch(emails);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error in batch validation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error processing batch validation'
        });
    }
});

/**
 * Get batch validation status
 * GET /api/email-validation/batch/:batchId/status
 */
router.get('/batch/:batchId/status', async (req, res) => {
    try {
        const { batchId } = req.params;

        // Validate batchId
        if (!batchId) {
            return res.status(400).json({
                success: false,
                message: 'Batch ID is required'
            });
        }

        // Get batch status
        const status = await emailValidationService.getBatchStatus(batchId);
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error getting batch status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error getting batch status'
        });
    }
});

/**
 * Validate a single email
 * POST /api/email-validation/single
 */
router.post('/single', async (req, res) => {
    try {
        const { email } = req.body;

        // Validate request
        if (!email || typeof email !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address'
            });
        }

        // Validate single email
        const result = await emailValidationService.validateSingleEmail(email);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error in single email validation:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error validating email'
        });
    }
});

module.exports = router; 