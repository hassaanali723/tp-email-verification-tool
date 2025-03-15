const axios = require('axios');
const winston = require('winston');
const EmailValidationResult = require('../models/EmailValidationResult');
const { ObjectId } = require('mongoose').Types;
const File = require('../models/File');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/email-validation-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/email-validation.log' })
    ]
});

// Add console transport for development environment
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

/**
 * Email Validation Service
 * Handles all communication with the FastAPI email validation microservice
 */
class EmailValidationService {
    constructor() {
        this.apiUrl = process.env.EMAIL_VALIDATION_API_URL;
        this.client = axios.create({
            baseURL: this.apiUrl,
            timeout: 30000 // 30 seconds timeout
        });
    }

    /**
     * Validates a batch of emails
     * @param {Object} options - Validation options
     * @param {string[]} options.emails - Array of email addresses to validate
     * @param {string} options.fileId - ID of the file being validated
     * @param {boolean} [options.check_mx=true] - Whether to check MX records
     * @param {boolean} [options.check_smtp=true] - Whether to check SMTP
     * @param {boolean} [options.check_disposable=true] - Whether to check if disposable
     * @param {boolean} [options.check_catch_all=true] - Whether to check catch-all
     * @param {boolean} [options.check_blacklist=true] - Whether to check blacklist
     * @returns {Promise<Object>} - Batch validation response
     * @throws {Error} - If the validation request fails
     */
    async validateEmailBatch(options) {
        try {
            const { emails, fileId } = options;
            
            if (!fileId) {
                throw new Error('fileId is required for batch validation');
            }

            logger.info(`Starting batch validation for ${emails.length} emails, fileId: ${fileId}`);
            
            const response = await this.client.post('/validate-batch', {
                emails: emails,
                check_mx: options.check_mx !== false,
                check_smtp: options.check_smtp !== false,
                check_disposable: options.check_disposable !== false,
                check_catch_all: options.check_catch_all !== false,
                check_blacklist: options.check_blacklist !== false
            });

            // Create initial validation result record
            const validationResult = await EmailValidationResult.create({
                batchId: response.data.batchId,
                fileId: fileId.toString(),
                status: 'processing',
                totalEmails: emails.length,
                processedEmails: 0,
                startTime: new Date()
            });

            // Update the File document to include this validation result
            await File.findByIdAndUpdate(fileId, {
                $push: { validationResults: validationResult._id }
            });

            logger.info(`Successfully initiated batch validation. Batch ID: ${response.data.batchId}, File ID: ${fileId}`);
            return response.data;
        } catch (error) {
            logger.error('Error in batch email validation:', error);
            throw this._formatError(error);
        }
    }

    /**
     * Gets the status of a batch validation
     * @param {string} batchId - The ID of the batch to check
     * @returns {Promise<Object>} - Batch status response
     * @throws {Error} - If the status check fails
     */
    async getBatchStatus(batchId) {
        try {
            logger.info(`Checking status for batch: ${batchId}`);
            const response = await this.client.get(`/validation-status/${batchId}`);
            const formattedStatus = this._formatBatchStatus(response.data);

            // Only save results when validation is completed
            if (formattedStatus.status === 'completed') {
                await EmailValidationResult.findOneAndUpdate(
                    { batchId: batchId },
                    { 
                        $set: {
                            status: 'completed',
                            processedEmails: formattedStatus.processedEmails,
                            totalEmails: formattedStatus.totalEmails,
                            results: formattedStatus.results,
                            statistics: formattedStatus.statistics,
                            completedTime: new Date()
                        }
                    },
                    { new: true }
                );
            }

            return {
                success: true,
                data: formattedStatus
            };
        } catch (error) {
            logger.error('Error checking batch status:', error);
            throw this._formatError(error);
        }
    }

    /**
     * Validates a single email address
     * @param {Object} options - Validation options
     * @param {string[]} options.emails - Array containing single email address
     * @param {boolean} [options.check_mx=true] - Whether to check MX records
     * @param {boolean} [options.check_smtp=true] - Whether to check SMTP
     * @param {boolean} [options.check_disposable=true] - Whether to check if disposable
     * @param {boolean} [options.check_catch_all=true] - Whether to check catch-all
     * @param {boolean} [options.check_blacklist=true] - Whether to check blacklist
     * @returns {Promise<Object>} - Validation result
     * @throws {Error} - If the validation fails
     */
    async validateSingleEmail(options) {
        try {
            logger.info(`Validating single email: ${options.emails[0]}`);
            const response = await this.client.post('/validate', {
                emails: options.emails,
                check_mx: options.check_mx !== false,
                check_smtp: options.check_smtp !== false,
                check_disposable: options.check_disposable !== false,
                check_catch_all: options.check_catch_all !== false,
                check_blacklist: options.check_blacklist !== false
            });
            return this._formatValidationResult(response.data);
        } catch (error) {
            logger.error('Error in single email validation:', {
                error: error.message,
                email: options.emails[0]
            });
            throw this._formatError(error);
        }
    }

    /**
     * Formats the validation result to match frontend expectations
     * @private
     * @param {Object} result - Raw validation result from API
     * @returns {Object} - Formatted validation result
     */
    _formatValidationResult(result) {
        return {
            email: result.email,
            is_valid: result.is_valid,
            status: result.status,
            risk_level: result.risk_level,
            deliverability_score: result.deliverability_score,
            details: {
                general: {
                    domain: result.details.general.domain,
                    reason: result.details.general.reason,
                    validation_method: result.details.general.validation_method
                },
                attributes: {
                    free_email: result.details.attributes.free_email,
                    role_account: result.details.attributes.role_account,
                    disposable: result.details.attributes.disposable,
                    catch_all: result.details.attributes.catch_all,
                    has_plus_tag: result.details.attributes.has_plus_tag,
                    mailbox_full: result.details.attributes.mailbox_full,
                    no_reply: result.details.attributes.no_reply
                },
                mail_server: {
                    smtp_provider: result.details.mail_server.smtp_provider,
                    mx_record: result.details.mail_server.mx_record,
                    implicit_mx: result.details.mail_server.implicit_mx
                },
                blacklist: {
                    is_blacklisted: result.details.blacklist.is_blacklisted,
                    blacklists_found: result.details.blacklist.blacklists_found,
                    blacklist_reasons: result.details.blacklist.blacklist_reasons,
                    reputation_score: result.details.blacklist.reputation_score,
                    last_checked: result.details.blacklist.last_checked
                },
                sub_status: result.details.sub_status
            }
        };
    }

    /**
     * Formats batch status response
     * @private
     * @param {Object} status - Raw batch status from API
     * @returns {Object} - Formatted batch status
     */
    _formatBatchStatus(status) {
        // Initialize statistics
        const stats = {
            deliverable: {
                count: 0
            },
            undeliverable: {
                count: 0,
                categories: {
                    invalid_email: 0,
                    invalid_domain: 0,
                    rejected_email: 0,
                    invalid_smtp: 0
                }
            },
            risky: {
                count: 0,
                categories: {
                    low_quality: 0,
                    low_deliverability: 0
                }
            },
            unknown: {
                count: 0,
                categories: {
                    no_connect: 0,
                    timeout: 0,
                    unavailable_smtp: 0,
                    unexpected_error: 0
                }
            }
        };

        // Calculate statistics if results are available
        if (status.results) {
            status.results.forEach(result => {
                switch (result.status) {
                    case 'deliverable':
                        stats.deliverable.count++;
                        break;
                    case 'undeliverable':
                        stats.undeliverable.count++;
                        // Categorize based on sub_status or reason
                        if (result.details.sub_status === 'Invalid Email') {
                            stats.undeliverable.categories.invalid_email++;
                        } else if (result.details.sub_status === 'Invalid Domain') {
                            stats.undeliverable.categories.invalid_domain++;
                        } else if (result.details.sub_status === 'Rejected Email') {
                            stats.undeliverable.categories.rejected_email++;
                        } else if (result.details.sub_status === 'Invalid SMTP') {
                            stats.undeliverable.categories.invalid_smtp++;
                        }
                        break;
                    case 'risky':
                        stats.risky.count++;
                        if (result.details.sub_status === 'Low Quality') {
                            stats.risky.categories.low_quality++;
                        } else if (result.details.sub_status === 'Low Deliverability') {
                            stats.risky.categories.low_deliverability++;
                        }
                        break;
                    default:
                        stats.unknown.count++;
                        // Categorize unknown cases
                        if (result.details.sub_status === 'No Connect') {
                            stats.unknown.categories.no_connect++;
                        } else if (result.details.sub_status === 'Timeout') {
                            stats.unknown.categories.timeout++;
                        } else if (result.details.sub_status === 'Unavailable SMTP') {
                            stats.unknown.categories.unavailable_smtp++;
                        } else {
                            stats.unknown.categories.unexpected_error++;
                        }
                }
            });
        }

        return {
            batchId: status.batchId,
            status: status.status,
            totalEmails: status.totalEmails,
            processedEmails: status.processedEmails,
            estimatedTime: status.estimatedTime,
            results: status.results,
            statistics: stats
        };
    }

    /**
     * Formats error responses
     * @private
     * @param {Error} error - Error object from axios
     * @returns {Error} - Formatted error
     */
    _formatError(error) {
        if (error.response) {
            // API responded with error status
            return new Error(`API Error: ${error.response.data.detail || error.response.data.message || 'Unknown error'}`);
        } else if (error.request) {
            // Request made but no response received
            return new Error('No response received from validation service');
        } else {
            // Error in request setup
            return new Error(`Request Error: ${error.message}`);
        }
    }
}

module.exports = new EmailValidationService(); 