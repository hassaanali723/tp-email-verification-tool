const express = require('express');
const router = express.Router();
const multer = require('multer');
const storageService = require('../services/storageService');
const fileProcessingService = require('../services/fileProcessingService');
const File = require('../models/File');
const EmailResults = require('../models/EmailResults');

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

        // Save file using storage service
        const fileData = await storageService.saveFile(
            req.file.buffer,
            req.file.originalname
        );

        // Process file and extract emails
        const result = await fileProcessingService.processFile(fileData);

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
        const file = await File.findById(req.params.fileId);
        
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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const files = await File.find()
            .select('-path') // Exclude sensitive path information
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await File.countDocuments();

        // Transform the data to match frontend requirements
        const transformedFiles = await Promise.all(files.map(async file => {
            const baseInfo = {
                id: file._id,
                filename: file.originalName,
                uploadedAt: file.uploadedAt
            };

            // Find the latest completed validation result for this file
            const validationResult = await EmailResults.findOne({
                fileId: file._id,
                status: 'completed'
            }).sort({ updatedAt: -1 });

            // If no completed validation found, return as unverified
            if (!validationResult) {
                return {
                    ...baseInfo,
                    status: 'unverified',
                    emailsReady: file.processingProgress?.emailsFound || 0
                };
            }

            // Get the statistics from the validation result
            const stats = validationResult.statistics;
            const total = stats.deliverable.count + 
                         stats.undeliverable.count + 
                         stats.risky.count + 
                         stats.unknown.count;
            
            return {
                ...baseInfo,
                status: 'verified',
                validationResults: {
                    deliverable: ((stats.deliverable.count || 0) / total * 100).toFixed(1),
                    risky: ((stats.risky.count || 0) / total * 100).toFixed(1),
                    undeliverable: ((stats.undeliverable.count || 0) / total * 100).toFixed(1),
                    unknown: ((stats.unknown.count || 0) / total * 100).toFixed(1),
                    totalEmails: total
                }
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
        const file = await File.findById(req.params.fileId);
        
        if (!file) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }

        // Delete file from storage if it exists
        if (file.filename) {
            try {
                await storageService.deleteFile(file.filename);
            } catch (error) {
                console.warn(`Storage file not found for ${file.filename}`);
            }
        }

        // Delete file record from database
        await File.findByIdAndDelete(req.params.fileId);

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
        
        // Check if file exists and is processed
        const file = await File.findById(fileId);
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
        const emails = await fileProcessingService.getExtractedEmails(fileId);

        res.json({
            success: true,
            data: {
                fileId,
                totalEmails: emails.length,
                emails
            }
        });
    } catch (error) {
        console.error('Error getting extracted emails:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error retrieving emails'
        });
    }
});

module.exports = router;
