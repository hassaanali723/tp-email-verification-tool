const Redis = require('ioredis');
const winston = require('winston');
const EmailBatches = require('../models/EmailBatches');
const EmailResults = require('../models/EmailResults');
const statisticsService = require('./statisticsService');
const { sendSseEvent } = require('../routes/events');
const creditService = require('./creditService');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
            const extras = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '';
            return `${timestamp} ${level}: ${message} ${extras}`;
        })
    ),
    transports: [
        // Always log to console
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // Also log to files
        new winston.transports.File({ filename: 'logs/redis-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/redis.log' })
    ]
});

class RedisService {
    constructor() {
        this.subscriber = null;
        this.publisher = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            await this._setupRedisConnections();
            await this._setupSubscriptions();
            this.isInitialized = true;
        } catch (error) {
            logger.error('Redis service initialization failed:', error);
            throw error;
        }
    }

    async _setupRedisConnections() {
        const redisConfig = {
            host: 'localhost',
            port: process.env.REDIS_PORT,
            password: process.env.REDIS_PASSWORD,
            retryStrategy: times => Math.min(times * 50, 2000),
            maxRetriesPerRequest: null
        };

        this.subscriber = new Redis({
            ...redisConfig,
            enableReadyCheck: true,
            autoResubscribe: true
        });

        this.publisher = new Redis(redisConfig);

        this._setupConnectionEventHandlers();
    }

    _setupConnectionEventHandlers() {
        const events = ['connect', 'ready', 'error', 'close', 'reconnecting'];
        events.forEach(event => {
            this.subscriber.on(event, (err) => {
                if (err) {
                    logger.error(`Redis subscriber ${event}:`, err);
                }
            });
        });

        this.subscriber.on('message', this._handleMessage.bind(this));
    }

    async _setupSubscriptions() {
        try {
            await this.subscriber.subscribe('email_validation_results');
        } catch (error) {
            logger.error('Failed to subscribe to channels:', error);
            throw error;
        }
    }

    async _handleMessage(channel, message) {
        try {
            const data = JSON.parse(message);
            if (!data || !data.batchId) {
                logger.error('Invalid message data:', { message });
                return;
            }
            await this._processBatchUpdate(data);
        } catch (error) {
            logger.error('Message processing failed:', { 
                error: error.message,
                stack: error.stack,
                message 
            });
        }
    }

    async _processBatchUpdate(data) {
        try {
            logger.info(`Processing batch ${data.batchId}`, {
                isComplete: data.isComplete,
                processedCount: data.processedCount,
                totalEmails: data.totalEmails
            });

            // First update EmailResults
            await this._updateEmailResults(data);

            // Get fileId and userId from EmailResults to compute stats and stream consumption
            const emailResult = await EmailResults.findOne({ batchId: data.batchId }, { fileId: 1, userId: 1 });
            if (emailResult && emailResult.fileId) {
                const fileId = emailResult.fileId;
                const userId = emailResult.userId;

                // Get fresh stats after results update
                const stats = await statisticsService.getFileStats(fileId, userId);

                // Incremental credit consumption BEFORE updating batches/completion and before notifying clients
                try {
                    const processed = Number(stats?.progress?.processed || 0);
                    const consumedKey = `consumed:${userId}:${fileId}`;
                    const lastConsumed = Number(await this.publisher.get(consumedKey)) || 0;
                    const delta = Math.max(0, processed - lastConsumed);
                    if (delta > 0) {
                        const transactionRef = `progress:${fileId}:${processed}`;
                        await creditService.deductCredits(
                            userId,
                            delta,
                            transactionRef,
                            `Progress credits for file ${fileId} (+${delta})`,
                            { fileId, type: 'validation_progress', processed }
                        );
                        await this.publisher.set(consumedKey, String(processed));
                    }
                } catch (incErr) {
                    logger.error('Incremental credit consumption error:', {
                        batchId: data.batchId,
                        error: incErr.message
                    });
                }

                // Publish stats and first-page emails for live UI update
                await this.publisher.publish(`file_stats:${fileId}`, JSON.stringify(stats));
                const emailList = await statisticsService.getEmailList(fileId, userId);
                await this.publisher.publish(`file_emails:${fileId}`, JSON.stringify(emailList));
                sendSseEvent(fileId, 'validationUpdate', { fileId, stats });
                logger.info(`Published stats and email list for fileId: ${fileId}`);
            }

            // Finally, update EmailBatches which may trigger completion handling
            await this._updateEmailBatches(data);
            
        } catch (error) {
            logger.error('Batch update processing failed:', { 
                batchId: data.batchId,
                error: error.message,
                stack: error.stack,
                data: JSON.stringify(data)
            });
        }
    }

    async _updateEmailResults(data) {
        try {
            const resultsUpdate = {
                batchId: data.batchId,
                status: data.isComplete ? 'completed' : 'processing',
                processedEmails: data.processedCount || 0,
                totalEmails: data.totalEmails || 0,
                results: this._mapValidationResults(data.validatedEmails),
                lastUpdated: new Date()
            };

            const updatedResult = await EmailResults.findOneAndUpdate(
                { batchId: data.batchId },
                { $set: resultsUpdate },
                { upsert: true, new: true }
            );

            // Check if this is a single batch completion (not part of multi-batch)
            if (data.isComplete && updatedResult) {
                // Check if this batch is NOT part of a multi-batch validation
                const isPartOfMultiBatch = await EmailBatches.findOne({ 
                    batchIds: data.batchId 
                });

                if (!isPartOfMultiBatch && updatedResult.reservationId) {
                    // This is a single batch completion - handle credit consumption
                    await this._handleSingleBatchCompletion(updatedResult);
                }
            }
        } catch (error) {
            logger.error('Failed to update EmailResults:', {
                batchId: data.batchId,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    _mapValidationResults(validatedEmails) {
        if (!Array.isArray(validatedEmails)) return [];
        
        return validatedEmails.map(email => ({
            email: email.email,
            is_valid: email.is_valid,
            status: email.status,
            risk_level: email.risk_level,
            deliverability_score: email.deliverability_score,
            details: {
                general: {
                    domain: email.details?.general?.domain || null,
                    reason: email.details?.general?.reason || null,
                    validation_method: email.details?.general?.validation_method || null
                },
                attributes: {
                    free_email: email.details?.attributes?.free_email || false,
                    role_account: email.details?.attributes?.role_account || false,
                    disposable: email.details?.attributes?.disposable || false,
                    catch_all: email.details?.attributes?.catch_all || false,
                    has_plus_tag: email.details?.attributes?.has_plus_tag || false,
                    mailbox_full: email.details?.attributes?.mailbox_full || false,
                    no_reply: email.details?.attributes?.no_reply || false
                },
                mail_server: {
                    smtp_provider: email.details?.mail_server?.smtp_provider || null,
                    mx_record: email.details?.mail_server?.mx_record || null,
                    implicit_mx: email.details?.mail_server?.implicit_mx || null
                },
                blacklist: {
                    is_blacklisted: email.details?.blacklist?.is_blacklisted || false,
                    blacklists_found: email.details?.blacklist?.blacklists_found || [],
                    blacklist_reasons: email.details?.blacklist?.blacklist_reasons || [],
                    reputation_score: email.details?.blacklist?.reputation_score || 100,
                    last_checked: email.details?.blacklist?.last_checked || null
                },
                sub_status: email.details?.sub_status || null
            }
        }));
    }

    async _updateEmailBatches(data) {
        try {
            // Prefer mapping if available, but fall back to direct lookup by batchId
            const requestId = await this.publisher.get(`batch_parent:${data.batchId}`).catch(() => null);

            let emailBatches = null;
            if (requestId) {
                emailBatches = await EmailBatches.findOne({ requestId }).exec();
            }
            if (!emailBatches) {
                emailBatches = await EmailBatches.findOne({ batchIds: data.batchId }).exec();
            }
            if (!emailBatches) {
                logger.error('EmailBatches document not found:', { requestId, batchId: data.batchId });
                return;
            }

            const batchIndex = emailBatches.batches.findIndex(b => b.batchId === data.batchId);
            if (batchIndex === -1) {
                logger.error('Batch not found in EmailBatches document:', { 
                    requestId, 
                    batchId: data.batchId,
                    availableBatches: emailBatches.batches.map(b => b.batchId)
                });
                return;
            }

            emailBatches.batches[batchIndex] = {
                batchId: data.batchId,
                status: data.isComplete ? "completed" : "processing",
                processedEmails: data.processedCount,
                totalEmails: data.totalEmails
            };

            const { totalProcessed, totalEmails } = this._calculateProgress(emailBatches.batches);
            const allComplete = emailBatches.batches.every(batch => batch.status === "completed");
            const wasNotComplete = emailBatches.status !== "completed";

            // Check if any batch failed
            const hasFailed = emailBatches.batches.some(batch => batch.status === "failed");
            const overallStatus = hasFailed ? "failed" : (allComplete ? "completed" : "processing");

            Object.assign(emailBatches, {
                processedEmails: totalProcessed,
                totalEmails,
                status: overallStatus,
                progress: `${totalProcessed}/${totalEmails}`,
                lastUpdated: new Date()
            });

            await emailBatches.save();

            // Handle credit operations based on status change
            if (allComplete && wasNotComplete) {
                await this._handleValidationComplete(emailBatches);
            } else if (hasFailed && emailBatches.status !== "failed") {
                await this._handleValidationFailed(emailBatches);
            }
        } catch (error) {
            logger.error('Failed to update EmailBatches:', {
                batchId: data.batchId,
                requestId: await this.publisher.get(`batch_parent:${data.batchId}`).catch(() => null),
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    _calculateProgress(batches) {
        return batches.reduce((acc, batch) => ({
            totalProcessed: acc.totalProcessed + (batch.processedEmails || 0),
            totalEmails: acc.totalEmails + (batch.totalEmails || 0)
        }), { totalProcessed: 0, totalEmails: 0 });
    }

    /**
     * Handle validation completion - convert reservation to consumption
     * @private
     */
    async _handleValidationComplete(emailBatches) {
        try {
            const { fileId, userId, totalEmails } = emailBatches;
            
            logger.info('Validation completed, converting reserved credits to consumption:', {
                fileId,
                userId,
                totalEmails
            });

            // Determine how many credits remain unconsumed using authoritative history
            const consumedKey = `consumed:${userId}:${fileId}`;
            const consumedRedis = Number(await this.publisher.get(consumedKey)) || 0;
            const consumedActual = await creditService.getConsumedForFile(userId, fileId);
            const consumedSoFar = Math.max(consumedRedis, consumedActual);
            const remaining = Math.max(0, Number(totalEmails || 0) - consumedSoFar);

            // Always attempt to release any reservation; we'll directly deduct remaining if needed
            try {
                const reservationPattern = `validation_${fileId}_*`;
                await creditService.releaseReservedCredits(userId, reservationPattern, 'Release after streaming consumption');
            } catch (e) {
                logger.warn('Releasing reservation failed (may not exist):', { fileId, error: e.message });
            }

            if (remaining > 0) {
                const transactionRef = `completed_remaining_${fileId}_${Date.now()}`;
                try {
                    await creditService.deductCredits(
                        userId,
                        remaining,
                        transactionRef,
                        `Completion credits for file ${fileId} (+${remaining})`,
                        { fileId, type: 'validation_completion_remaining' }
                    );
                    await this.publisher.set(consumedKey, String(consumedSoFar + remaining));
                } catch (finalErr) {
                    logger.error('Final credit deduction failed:', { fileId, remaining, error: finalErr.message });
                }
            }

        } catch (error) {
            logger.error('Error handling validation completion:', {
                fileId: emailBatches.fileId,
                userId: emailBatches.userId,
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Handle validation failure - release reserved credits
     * @private
     */
    async _handleValidationFailed(emailBatches) {
        try {
            const { fileId, userId, totalEmails } = emailBatches;
            
            logger.info('Validation failed, releasing reserved credits:', {
                fileId,
                userId,
                totalEmails
            });

            // Generate the same reservation ID pattern that was used during validation start
            const reservationPattern = `validation_${fileId}_*`;
            
            try {
                await creditService.releaseReservedCredits(
                    userId,
                    reservationPattern,
                    `Validation failed for file ${fileId}`
                );

                logger.info('Reserved credits released successfully due to validation failure:', {
                    userId,
                    fileId,
                    emailCount: totalEmails
                });

            } catch (releaseError) {
                // If release fails, it might mean the reservation was already consumed or doesn't exist
                logger.warn('Could not release reserved credits (might not exist):', {
                    userId,
                    fileId,
                    emailCount: totalEmails,
                    error: releaseError.message
                });
            }

        } catch (error) {
            logger.error('Error handling validation failure:', {
                fileId: emailBatches.fileId,
                userId: emailBatches.userId,
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Handle single batch completion - consume reserved credits
     * @private
     */
    async _handleSingleBatchCompletion(emailResult) {
        try {
            const { fileId, userId, totalEmails, reservationId } = emailResult;
            
            logger.info('Single batch validation completed, consuming credits:', {
                fileId,
                userId,
                totalEmails,
                reservationId
            });

            // Generate transaction reference for the consumption
            const transactionRef = `completed_validation_${fileId}_${Date.now()}`;
            
            try {
                // Try to consume the specific reserved credits
                await creditService.consumeReservedCredits(
                    userId,
                    reservationId,
                    transactionRef,
                    { 
                        fileId, 
                        emailCount: totalEmails,
                        completedAt: new Date(),
                        type: 'single_batch_completion'
                    }
                );

                logger.info('Reserved credits consumed successfully for single batch:', {
                    userId,
                    fileId,
                    emailCount: totalEmails,
                    reservationId
                });

            } catch (creditError) {
                // If reservation consumption fails, fall back to direct deduction
                logger.warn('Failed to consume reserved credits for single batch, attempting direct deduction:', {
                    userId,
                    fileId,
                    emailCount: totalEmails,
                    reservationId,
                    error: creditError.message
                });

                try {
                    await creditService.deductCredits(
                        userId,
                        totalEmails,
                        transactionRef,
                        `Single batch validation completed for file ${fileId} (${totalEmails} emails) - Fallback`,
                        { 
                            fileId, 
                            emailCount: totalEmails,
                            completedAt: new Date(),
                            type: 'single_batch_completion',
                            fallback: true
                        }
                    );

                    logger.info('Fallback credit deduction successful for single batch:', {
                        userId,
                        fileId,
                        emailCount: totalEmails
                    });

                } catch (fallbackError) {
                    logger.error('Both reserved and direct credit consumption failed for single batch:', {
                        userId,
                        fileId,
                        emailCount: totalEmails,
                        error: fallbackError.message
                    });
                }
            }

        } catch (error) {
            logger.error('Error handling single batch completion:', {
                fileId: emailResult.fileId,
                userId: emailResult.userId,
                error: error.message,
                stack: error.stack
            });
        }
    }

    async cleanup() {
        const connections = [this.subscriber, this.publisher].filter(Boolean);
        await Promise.all(connections.map(conn => conn.quit().catch(err => 
            logger.error('Connection cleanup failed:', err)
        )));
    }
}

// Export singleton instanceimage.png
module.exports = new RedisService(); 