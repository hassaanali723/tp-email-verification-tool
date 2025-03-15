const express = require('express');
const router = express.Router();
const emailValidationService = require('../services/emailValidationService');

/**
 * Validate a batch of emails
 * POST /api/email-validation/batch
 */
router.post('/batch', async (req, res) => {
    try {
        const { 
            emails,
            fileId,
            check_mx = true,
            check_smtp = true,
            check_disposable = true,
            check_catch_all = true,
            check_blacklist = true
        } = req.body;

        // Validate request
        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an array of emails'
            });
        }

        // Validate fileId
        if (!fileId) {
            return res.status(400).json({
                success: false,
                message: 'fileId is required for batch validation'
            });
        }

        // Start batch validation with all validation options
        const result = await emailValidationService.validateEmailBatch({
            emails,
            fileId,
            check_mx,
            check_smtp,
            check_disposable,
            check_catch_all,
            check_blacklist
        });
        
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
        const { 
            email,
            check_mx = true,
            check_smtp = true,
            check_disposable = true,
            check_catch_all = true,
            check_blacklist = true
        } = req.body;

        // Validate request
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address'
            });
        }

        // Validate single email with all validation options
        const result = await emailValidationService.validateSingleEmail({
            emails: [email], // FastAPI expects array even for single email
            check_mx,
            check_smtp,
            check_disposable,
            check_catch_all,
            check_blacklist
        });
        
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