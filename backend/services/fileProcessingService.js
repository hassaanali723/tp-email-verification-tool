const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs').promises;
const createReadStream = require('fs').createReadStream;
const Redis = require('ioredis');
const storageService = require('./storageService');
const File = require('../models/File');

// Initialize Redis client (prefer REDIS_URL, else host/port/password)
const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { keyPrefix: 'email_extractor:' })
    : new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD,
        // Key prefix for easier identification
        keyPrefix: 'email_extractor:'
    });

class EmailsExpiredError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EmailsExpiredError';
        this.isExpected = true;
    }
}

class FileProcessingService {
    /**
     * Process uploaded file and extract emails
     * @param {Object} fileData - File metadata from storage service
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Processing result with extracted emails
     */
    async processFile(fileData, userId) {
        try {
            // Create file record in database
            const fileRecord = await File.create({
                userId,
                filename: fileData.filename,
                originalName: fileData.originalName,
                mimeType: fileData.mimeType,
                size: fileData.size,
                path: fileData.path,
                status: 'processing',
                processingProgress: {
                    totalRows: 0,
                    processedRows: 0,
                    emailsFound: 0
                }
            });

            // Start processing in the background
            this._processFileInBackground(fileData, fileRecord._id, userId);

            // Return immediately with the file ID
            return {
                fileId: fileRecord._id,
                totalEmails: 0,
                message: 'File upload successful. Processing started.'
            };
        } catch (error) {
            throw new Error(`Error processing file: ${error.message}`);
        }
    }

    /**
     * Process file in the background
     * @private
     * @param {Object} fileData - File metadata
     * @param {string} fileId - File record ID
     * @param {string} userId - User ID
     */
    async _processFileInBackground(fileData, fileId, userId) {
        try {
            // Get total rows count first
            const totalRows = await this._getTotalRows(fileData);
            await File.findByIdAndUpdate(fileId, {
                'processingProgress.totalRows': totalRows
            });

            // Extract emails based on file type
            const { emails, processedRows } = await this._extractEmails(fileData, fileId);

            // Store emails in Redis with 1-week expiration (so users can validate later)
            const redisKey = `emails:${userId}:${fileId}`;
            const pipeline = redis.pipeline();
            const ONE_WEEK_SECONDS = 7 * 24 * 60 * 60; // 604800 seconds
            
            // Store each email in a Redis list
            if (emails.length > 0) {
                pipeline.del(redisKey); // Clear any existing data
                pipeline.rpush(redisKey, emails);
                pipeline.expire(redisKey, ONE_WEEK_SECONDS); // Expire after 1 week
                await pipeline.exec();
            }

            // Update file record with final counts
            await File.findByIdAndUpdate(fileId, {
                totalEmails: emails.length,
                status: 'completed',
                processingProgress: {
                    totalRows,
                    processedRows,
                    emailsFound: emails.length,
                    lastUpdated: new Date()
                }
            });

            // Delete the original file as we don't need it anymore
            await storageService.deleteFile(fileData.filename, userId);

        } catch (error) {
            console.error('Background processing error:', error);
            await File.findByIdAndUpdate(fileId, {
                status: 'failed',
                error: {
                    message: error.message,
                    timestamp: new Date()
                }
            });
        }
    }

    /**
     * Get extracted emails from Redis
     * @param {string} fileId - File ID
     * @param {string} userId - User ID
     * @returns {Promise<string[]>} Array of extracted emails
     */
    async getExtractedEmails(fileId, userId) {
        const redisKey = `emails:${userId}:${fileId}`;
        const emails = await redis.lrange(redisKey, 0, -1);
        
        if (!emails || emails.length === 0) {
            throw new EmailsExpiredError('Extracted emails have expired or were not found');
        }
        
        return emails;
    }

    /**
     * Get total number of rows in file
     * @private
     * @param {Object} fileData - File metadata
     * @returns {Promise<number>} Total number of rows
     */
    async _getTotalRows(fileData) {
        if (fileData.mimeType.includes('csv')) {
            return new Promise((resolve, reject) => {
                let rows = 0;
                createReadStream(fileData.path)
                    .pipe(csv())
                    .on('data', () => rows++)
                    .on('end', () => resolve(rows))
                    .on('error', reject);
            });
        } else {
            const workbook = xlsx.readFile(fileData.path);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = xlsx.utils.sheet_to_json(worksheet);
            return data.length;
        }
    }

    /**
     * Extract emails from file
     * @private
     * @param {Object} fileData - File metadata
     * @param {string} fileId - File record ID
     * @returns {Promise<{emails: string[], processedRows: number}>} Array of extracted emails and processed rows count
     */
    async _extractEmails(fileData, fileId) {
        const extension = fileData.mimeType.includes('csv') ? 'csv' : 'excel';
        return extension === 'csv' 
            ? await this._extractEmailsFromCSV(fileData.path, fileId)
            : await this._extractEmailsFromExcel(fileData.path, fileId);
    }

    /**
     * Extract emails from CSV file
     * @private
     * @param {string} filePath - Path to CSV file
     * @param {string} fileId - File record ID
     * @returns {Promise<{emails: string[], processedRows: number}>} Extracted emails and processed rows count
     */
    async _extractEmailsFromCSV(filePath, fileId) {
        return new Promise((resolve, reject) => {
            const emails = new Set();
            let processedRows = 0;
            let lastUpdateTime = Date.now();
            const updateInterval = 1000; // Update progress every 1 second

            createReadStream(filePath)
                .pipe(csv())
                .on('data', async (row) => {
                    processedRows++;
                    
                    // Try to find email column
                    const potentialEmail = this._findEmailInRow(row);
                    if (potentialEmail) {
                        emails.add(potentialEmail.toLowerCase());
                    }

                    // Update progress periodically
                    const currentTime = Date.now();
                    if (currentTime - lastUpdateTime >= updateInterval) {
                        await File.findByIdAndUpdate(fileId, {
                            'processingProgress.processedRows': processedRows,
                            'processingProgress.emailsFound': emails.size
                        });
                        lastUpdateTime = currentTime;
                    }
                })
                .on('end', () => resolve({ emails: Array.from(emails), processedRows }))
                .on('error', reject);
        });
    }

    /**
     * Extract emails from Excel file
     * @private
     * @param {string} filePath - Path to Excel file
     * @param {string} fileId - File record ID
     * @returns {Promise<{emails: string[], processedRows: number}>} Extracted emails and processed rows count
     */
    async _extractEmailsFromExcel(filePath, fileId) {
        const workbook = xlsx.readFile(filePath);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(worksheet, { raw: false, defval: '' });
        
        const emails = new Set();
        let processedRows = 0;
        let lastUpdateTime = Date.now();
        const updateInterval = 1000; // Update progress every 1 second

        for (const row of data) {
            processedRows++;
            
            const potentialEmail = this._findEmailInRow(row);
            if (potentialEmail) {
                emails.add(potentialEmail.toLowerCase());
            }

            // Update progress periodically
            const currentTime = Date.now();
            if (currentTime - lastUpdateTime >= updateInterval) {
                await File.findByIdAndUpdate(fileId, {
                    'processingProgress.processedRows': processedRows,
                    'processingProgress.emailsFound': emails.size
                });
                lastUpdateTime = currentTime;
            }
        }

        return { emails: Array.from(emails), processedRows };
    }

    /**
     * Find email in a row by checking common column names and validating format
     * @private
     * @param {Object} row - Row data
     * @returns {string|null} Found email or null
     */
    _findEmailInRow(row) {
        // Common variations of email column names
        const emailColumnNames = [
            'email', 'email_address', 'emailaddress', 'mail',
            'e-mail', 'e_mail', 'email_id', 'emailid',
            'Email', 'EMAIL', 'Email Address', 'EMAIL ADDRESS'
        ];

        // First try to find by common column names
        for (const columnName of emailColumnNames) {
            if (row[columnName] && typeof row[columnName] === 'string') {
                return row[columnName].trim();
            }
        }

        // If no email column found, check all columns for potential email addresses
        for (const key in row) {
            const value = row[key];
            if (typeof value === 'string' && value.includes('@')) {
                return value.trim();
            }
        }

        return null;
    }
}

module.exports = new FileProcessingService(); 