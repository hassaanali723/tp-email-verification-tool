const axios = require('axios');
const winston = require('winston');
const EmailBatches = require('../models/EmailBatches');
const EmailResults = require('../models/EmailResults');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/validation-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/validation.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

class EmailValidationService {
    constructor() {
        this.apiUrl = process.env.EMAIL_VALIDATION_API_URL;
        this.client = axios.create({
            baseURL: this.apiUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Validates a batch of emails
     * @param {Object} options - Validation options
     * @param {string[]} options.emails - Array of email addresses
     * @param {string} options.fileId - ID of the file being validated
     * @param {string} options.userId - User ID
     * @param {Object} options.validationFlags - Optional validation flags
     * @returns {Promise<Object>} FastAPI response
     */
    async validateEmailBatch(options) {
        const { emails, fileId, userId, validationFlags = {} } = options;

        try {
            logger.info(`Starting validation for ${emails.length} emails, fileId: ${fileId}`);

            // Send request to FastAPI
            const response = await this.client.post('/validate-batch', {
                emails,
                check_mx: validationFlags.check_mx !== false,
                check_smtp: validationFlags.check_smtp !== false,
                check_disposable: validationFlags.check_disposable !== false,
                check_catch_all: validationFlags.check_catch_all !== false,
                check_blacklist: validationFlags.check_blacklist !== false
            });
            // Create appropriate records based on response type
            const isMultiBatch = response.data.requestId !== undefined;

            if (isMultiBatch) {
                await this.createMultiBatchRecord(response.data, fileId, userId);
            } else {
                await this.createSingleBatchRecord(response.data, fileId, userId);
            }

            return response.data;

        } catch (error) {
            logger.error('Error in email validation:', error);
            throw this.formatError(error);
        }
    }

    /**
     * Calculates batch size based on total email count, matching FastAPI logic
     * @private
     */
    _calculateBatchSize(totalEmails) {
        if (totalEmails <= 10) return totalEmails;
        if (totalEmails <= 50) return 10;
        if (totalEmails <= 100) return 20;
        if (totalEmails <= 200) return 30;
        if (totalEmails <= 500) return 50;
        if (totalEmails <= 1000) return 100;
        return 150;
    }

    /**
     * Creates initial record for multi-batch validation
     * @private
     */
    async createMultiBatchRecord(data, fileId, userId) {
        try {

            // Calculate batch size and create batches array
            const batchSize = this._calculateBatchSize(data.totalEmails);
            const batches = data.batchIds.map((batchId, index, array) => {
                // For the last batch, handle remaining emails
                const isLastBatch = index === array.length - 1;
                const batchEmails = isLastBatch 
                    ? data.totalEmails - (batchSize * (array.length - 1))
                    : batchSize;

                return {
                    batchId,
                    status: 'processing',
                    processedEmails: 0,
                    totalEmails: batchEmails
                };
            });

            // Create the main batch record
            const mainRecord = {
                requestId: data.requestId,
                fileId,
                userId,
                batchIds: data.batchIds,
                status: 'processing',
                totalEmails: data.totalEmails,
                processedEmails: 0,
                progress: '0%',
                isMultiBatch: true,
                batches,
                lastUpdated: new Date()
            };

            logger.info('Creating main record with data:', mainRecord);
            await EmailBatches.create(mainRecord);

            // Create individual batch records
            const batchRecords = batches.map(batch => ({
                batchId: batch.batchId,
                fileId,
                userId,
                requestId: data.requestId,
                status: 'processing',
                totalEmails: batch.totalEmails,
                processedEmails: 0,
                results: [],
                lastUpdated: new Date()
            }));

            logger.info('Creating batch records:', batchRecords);
            await Promise.all(batchRecords.map(record => EmailResults.create(record)));

            logger.info(`Created multi-batch records for requestId: ${data.requestId}`);
        } catch (error) {
            logger.error('Error creating multi-batch records:', error);
            throw error;
        }
    }

    /**
     * Creates initial record for single batch validation
     * @private
     */
    async createSingleBatchRecord(data, fileId, userId) {
        try {
            await EmailResults.create({
                batchId: data.batchId,
                fileId,
                userId,
                status: 'processing',
                totalEmails: data.totalEmails,
                processedEmails: 0,
                results: [],
                lastUpdated: new Date()
            });

            logger.info(`Created single batch record for batchId: ${data.batchId}`);
        } catch (error) {
            logger.error('Error creating single batch record:', error);
            throw error;
        }
    }

    /**
     * Formats error responses
     * @private
     */
    formatError(error) {
        if (error.response) {
            return new Error(`API Error: ${error.response.data.detail || error.response.data.message || 'Unknown error'}`);
        } else if (error.request) {
            return new Error('No response received from validation service');
        }
        return new Error(`Request Error: ${error.message}`);
    }
}

// Export singleton instance
module.exports = new EmailValidationService(); 