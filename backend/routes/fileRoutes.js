const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const storageService = require('../services/storageService');
const fileProcessingService = require('../services/fileProcessingService');
const statisticsService = require('../services/statisticsService');
const File = require('../models/File');
const EmailResults = require('../models/EmailResults');
const EmailBatches = require('../models/EmailBatches');

// Apply auth middleware to all routes
router.use(requireAuth);

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: process.env.MAX_FILE_SIZE || 10 * 1024 * 1024 // 10MB default
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = (process.env.ALLOWED_FILE_TYPES || '.csv,.xlsx,.xls').split(',');
        const fileExt = '.' + file.originalname.split('.').pop().toLowerCase();
        
        if (allowedTypes.includes(fileExt)) {
            cb(null, true);
        } else {
            cb(new Error(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`));
        }
    }
});

/**
 * Upload and process file
 * POST /api/files/upload
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        // Get user ID from Clerk auth
        const userId = req.auth.userId;

        // Save file using storage service
        const fileData = await storageService.saveFile(
            req.file.buffer,
            req.file.originalname,
            userId  // Pass userId to storage service
        );

        // Process file and extract emails
        const result = await fileProcessingService.processFile(fileData, userId);

        res.json({
            success: true,
            data: {
                fileId: result.fileId,
                totalEmails: result.totalEmails,
                message: 'File uploaded and processing started'
            }
        });
    } catch (error) {
        console.error('Error in file upload:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error processing file upload'
        });
    }
});

/**
 * Get file processing status
 * GET /api/files/:fileId/status
 */
router.get('/:fileId/status', async (req, res) => {
    try {
        const userId = req.auth.userId;
        const file = await File.findOne({ 
            _id: req.params.fileId,
            userId: userId
        });
        
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        res.json({
            success: true,
            data: {
                status: file.status,
                progress: {
                    totalRows: file.processingProgress.totalRows,
                    processedRows: file.processingProgress.processedRows,
                    emailsFound: file.processingProgress.emailsFound,
                    percentage: file.progressPercentage
                },
                error: file.error,
                lastUpdated: file.processingProgress.lastUpdated
            }
        });
    } catch (error) {
        console.error('Error getting file status:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error getting file status'
        });
    }
});

/**
 * Get list of files
 * GET /api/files
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.auth.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const files = await File.find({ userId: userId })
            .select('-path') // Exclude sensitive path information
            .sort({ uploadedAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await File.countDocuments({ userId: userId });

        // Transform the data to match frontend requirements
        const transformedFiles = await Promise.all(files.map(async file => {
            const baseInfo = {
                id: file._id,
                filename: file.originalName,
                uploadedAt: file.uploadedAt,
                totalEmails: file.processingProgress?.emailsFound || 0
            };

            // First check if it's a multi-batch case
            const batchRecord = await EmailBatches.findOne({ 
                fileId: file._id,
                userId: userId
            });

            if (batchRecord) {
                // Multi-batch case - use batch status
                if (batchRecord.status === 'processing') {
                    const stats = await statisticsService.getFileStats(file._id, userId);
                    return { ...baseInfo, status: 'processing', ...stats };
                }
                if (batchRecord.status === 'completed') {
                    const stats = await statisticsService.getFileStats(file._id, userId);
                    return { ...baseInfo, status: 'verified', ...stats };
                }
            } else {
                // Single batch case
                const validationResult = await EmailResults.findOne({ 
                    fileId: file._id,
                    userId: userId
                }).sort({ updatedAt: -1 });
                
                if (!validationResult) {
                    // No validation started
                    return { ...baseInfo, status: 'unverified', emailsReady: file.processingProgress?.emailsFound || 0 };
                }

                // For single batch, we can trust the status directly
                const stats = await statisticsService.getFileStats(file._id, userId);
                return { 
                    ...baseInfo, 
                    status: validationResult.status === 'completed' ? 'verified' : 'processing',
                    ...stats 
                };
            }

            // If we get here, something went wrong
            return {
                ...baseInfo,
                status: 'error',
                message: 'Unable to determine file status'
            };
        }));

        res.json({
            success: true,
            data: {
                files: transformedFiles,
                pagination: {
                    total,
                    page,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Error getting files list:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error getting file list'
        });
    }
});

/**
 * Delete file
 * DELETE /api/files/:fileId
 */
router.delete('/:fileId', async (req, res) => {
    try {
        const userId = req.auth.userId;
        const file = await File.findOne({ 
            _id: req.params.fileId,
            userId: userId
        });
        
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Delete file from storage if it exists
        if (file.filename) {
            try {
                await storageService.deleteFile(file.filename, userId);
            } catch (error) {
                console.warn(`Storage file not found for ${file.filename}:`, error);
            }
        }

        // Delete file record from database
        await File.findOneAndDelete({ 
            _id: req.params.fileId,
            userId: userId
        });

        res.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error deleting file'
        });
    }
});

/**
 * Get extracted emails from a file
 * GET /api/files/:fileId/emails
 */
router.get('/:fileId/emails', async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.auth.userId;
        
        // Check if file exists and is processed
        const file = await File.findOne({ 
            _id: fileId,
            userId: userId
        });
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        if (file.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'File processing not completed'
            });
        }

        // Get emails from temporary storage
        const emails = await fileProcessingService.getExtractedEmails(fileId, userId);

        res.json({
            success: true,
            data: {
                fileId,
                totalEmails: emails.length,
                emails
            }
        });
    } catch (error) {
        if (error.isExpected || error.name === 'EmailsExpiredError') {
            console.warn(`Emails expired or not found for fileId: ${req.params.fileId}`);
        } else {
            console.error('Error getting extracted emails:', error);
        }
        res.status(500).json({
            success: false,
            message: error.message || 'Error retrieving emails'
        });
    }
});

module.exports = router;
