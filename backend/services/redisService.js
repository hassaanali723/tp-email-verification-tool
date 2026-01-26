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
            host: process.env.REDIS_HOST || 'localhost',
            port: Number(process.env.REDIS_PORT) || 6379,
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

            // Get fileId and userId BEFORE updating (needed for credit deduction)
            const emailResult = await EmailResults.findOne({ batchId: data.batchId }, { fileId: 1, userId: 1, processedEmails: 1 });
            if (!emailResult || !emailResult.fileId) {
                logger.error('EmailResult not found for batch:', { batchId: data.batchId });
                return;
            }

            const fileId = emailResult.fileId;
            const userId = emailResult.userId;
            
            // Update EmailResults FIRST (so we have the latest processedEmails for credit calculation)
            await this._updateEmailResults(data);
            
            // Read the UPDATED processedEmails count to calculate delta correctly (prevents race conditions)
            const updatedEmailResult = await EmailResults.findOne({ batchId: data.batchId }, { processedEmails: 1 });
            const currentBatchCount = updatedEmailResult?.processedEmails || 0;
            const previousBatchCount = emailResult.processedEmails || 0;
            
            // Deduct credits ONLY when batch is complete (prevents over-deduction from intermediate updates)
            try {
                if (data.isComplete) {
                    const batchEmails = data.processedCount;
                    const transactionRef = `batch:${data.batchId}:complete:${batchEmails}`;
                    
                    // Check if this batch's credits were already deducted (idempotency)
                    const alreadyDeducted = await creditService.transactionExists(userId, transactionRef);
                    if (alreadyDeducted) {
                        logger.info('Credits already deducted for completed batch (idempotent skip):', {
                            batchId: data.batchId,
                            transactionRef
                        });
                    } else {
                        // Deduct credits for the ENTIRE batch when it completes
                        await creditService.deductCredits(
                            userId,
                            batchEmails,
                            transactionRef,
                            `Batch validation completed for file ${fileId} (${batchEmails} emails)`,
                            { fileId, batchId: data.batchId, type: 'validation_batch_complete', processed: batchEmails }
                        );
                        logger.info('Credits deducted for completed batch:', {
                            batchId: data.batchId,
                            batchEmails,
                            transactionRef
                        });
                    }
                } else {
                    logger.debug('Batch not complete yet, skipping credit deduction:', {
                        batchId: data.batchId,
                        processedCount: data.processedCount,
                        isComplete: data.isComplete
                    });
                }
            } catch (incErr) {
                logger.error('Credit deduction error:', {
                    batchId: data.batchId,
                    error: incErr.message
                });
            }

            // Update EmailBatches FIRST (this updates progress and status)
            await this._updateEmailBatches(data);

            // Publish stats IMMEDIATELY after update for real-time progress updates
            // This ensures frontend gets updates even if batch isn't complete yet
            try {
                // Get fresh stats AFTER EmailBatches update (so progress/status are correct)
                const stats = await statisticsService.getFileStats(fileId, userId);

                // Publish stats and first-page emails for live UI update
                await this.publisher.publish(`file_stats:${fileId}`, JSON.stringify(stats));
                const emailList = await statisticsService.getEmailList(fileId, userId);
                await this.publisher.publish(`file_emails:${fileId}`, JSON.stringify(emailList));
                sendSseEvent(fileId, 'validationUpdate', { fileId, stats });
                
                logger.info(`Published stats and email list for fileId: ${fileId}`, {
                    status: stats.status,
                    progress: stats.progress,
                    batchId: data.batchId
                });
            } catch (pubErr) {
                logger.error('Failed to publish stats:', {
                    fileId,
                    batchId: data.batchId,
                    error: pubErr.message
                });
            }
            
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
        const MAX_RETRIES = 5;
        let attempts = 0;

        while (attempts < MAX_RETRIES) {
            try {
                // Find EmailBatches document
                const requestId = await this.publisher.get(`batch_parent:${data.batchId}`).catch(() => null);
                let emailBatches = null;
                
                if (requestId) {
                    emailBatches = await EmailBatches.findOne({ requestId }).lean();
                }
                if (!emailBatches) {
                    emailBatches = await EmailBatches.findOne({ batchIds: data.batchId }).lean();
                }
                if (!emailBatches) {
                    logger.error('EmailBatches document not found:', { requestId, batchId: data.batchId });
                    return;
                }

                // Calculate delta for atomic increment
                const batchIndex = emailBatches.batches.findIndex(b => b.batchId === data.batchId);
                if (batchIndex === -1) {
                    logger.error('Batch not found in EmailBatches document:', { 
                        requestId, 
                        batchId: data.batchId,
                        availableBatches: emailBatches.batches.map(b => b.batchId)
                    });
                    return;
                }

                // Atomic update with optimistic locking
                // First, update the specific batch in array
                const updateResult = await EmailBatches.findOneAndUpdate(
                    { 
                        _id: emailBatches._id,
                        version: emailBatches.version  // Optimistic locking
                    },
                    {
                        $set: {
                            [`batches.$[batch].status`]: data.isComplete ? "completed" : "processing",
                            [`batches.$[batch].processedEmails`]: data.processedCount,
                            [`batches.$[batch].totalEmails`]: data.totalEmails,
                            lastUpdated: new Date()
                        },
                        $inc: { version: 1 }
                    },
                    {
                        arrayFilters: [{ "batch.batchId": data.batchId }],
                        new: true
                    }
                );

                if (!updateResult) {
                    // Version conflict - retry
                    attempts++;
                    if (attempts >= MAX_RETRIES) {
                        logger.error('EmailBatches update failed after max retries', {
                            batchId: data.batchId,
                            fileId: emailBatches.fileId,
                            version: emailBatches.version
                        });
                        break;
                    }
                    const delay = Math.pow(2, attempts) * 50;
                    logger.warn(`Version conflict for EmailBatches update. Retrying in ${delay}ms (attempt ${attempts}/${MAX_RETRIES})`, {
                        batchId: data.batchId,
                        fileId: emailBatches.fileId,
                        currentVersion: emailBatches.version
                    });
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Recalculate progress and status from updated batches (read fresh from database)
                const updatedBatches = updateResult.batches;
                const totalProcessed = updatedBatches.reduce((sum, b) => sum + (b.processedEmails || 0), 0);
                const allComplete = updatedBatches.every(b => b.status === "completed");
                const hasFailed = updatedBatches.some(b => b.status === "failed");
                const overallStatus = hasFailed ? "failed" : (allComplete ? "completed" : "processing");
                const progress = `${totalProcessed}/${updateResult.totalEmails}`;

                // Atomic update of calculated fields
                const finalResult = await EmailBatches.findOneAndUpdate(
                    { _id: updateResult._id, version: updateResult.version },
                    {
                        $set: {
                            processedEmails: totalProcessed,
                            status: overallStatus,
                            progress: progress,
                            lastUpdated: new Date()
                        },
                        $inc: { version: 1 }
                    },
                    { new: true }
                );

                if (!finalResult) {
                    // Version conflict on second update - retry entire operation
                    attempts++;
                    if (attempts >= MAX_RETRIES) {
                        logger.error('EmailBatches final update failed after max retries', {
                            batchId: data.batchId,
                            fileId: updateResult.fileId
                        });
                        break;
                    }
                    const delay = Math.pow(2, attempts) * 50;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Log successful update for debugging
                logger.info('EmailBatches updated successfully:', {
                    batchId: data.batchId,
                    fileId: finalResult.fileId,
                    processedEmails: finalResult.processedEmails,
                    totalEmails: finalResult.totalEmails,
                    progress: finalResult.progress,
                    status: finalResult.status,
                    version: finalResult.version,
                    allComplete: allComplete,
                    hasFailed: hasFailed,
                    batchesStatus: updatedBatches.map(b => ({ batchId: b.batchId, status: b.status }))
                });

                // Check if we should trigger completion handler
                const wasNotComplete = emailBatches.status !== "completed";
                const isNowComplete = finalResult.status === "completed";

                // Handle completion - if all batches are complete
                if (allComplete && wasNotComplete) {
                    // ALWAYS force status to "completed" when all batches are complete (ensures it persists)
                    let completedResult = finalResult;
                    if (!isNowComplete || finalResult.status !== "completed") {
                        logger.warn('All batches complete but status not "completed", forcing update:', {
                            fileId: finalResult.fileId,
                            currentStatus: finalResult.status,
                            allComplete: allComplete,
                            isNowComplete: isNowComplete
                        });
                        
                        // Use findOneAndUpdate with version check to ensure atomic update
                        const forcedUpdate = await EmailBatches.findOneAndUpdate(
                            { _id: finalResult._id, version: finalResult.version },
                            {
                                $set: { status: "completed", lastUpdated: new Date() },
                                $inc: { version: 1 }
                            },
                            { new: true }
                        );
                        
                        if (forcedUpdate) {
                            completedResult = forcedUpdate;
                            logger.info('Status forced to "completed":', {
                                fileId: finalResult.fileId,
                                previousStatus: finalResult.status,
                                newStatus: completedResult.status,
                                version: completedResult.version
                            });
                            // Small delay to ensure the update is fully persisted before stats fetch
                            await new Promise(resolve => setTimeout(resolve, 50));
                        } else {
                            // Version conflict - retry by fetching fresh
                            logger.warn('Version conflict during forced status update, fetching fresh:', {
                                fileId: finalResult.fileId
                            });
                            await new Promise(resolve => setTimeout(resolve, 50));
                            const freshResult = await EmailBatches.findById(finalResult._id);
                            if (freshResult && freshResult.status === "completed") {
                                completedResult = freshResult;
                                logger.info('Status already "completed" (from fresh fetch):', { fileId: finalResult.fileId });
                            }
                        }
                    }
                    
                    logger.info('All batches complete, calling completion handler:', {
                        fileId: completedResult.fileId,
                        batchesCount: updatedBatches.length,
                        previousStatus: emailBatches.status,
                        newStatus: completedResult.status
                    });
                    await this._handleValidationComplete(completedResult);
                } else if (hasFailed && finalResult.status === "failed" && emailBatches.status !== "failed") {
                    logger.info('Validation failed, calling failure handler:', {
                        fileId: finalResult.fileId
                    });
                    await this._handleValidationFailed(finalResult);
                }

                return; // Success

            } catch (error) {
                if (error.message.includes('Write conflict') || error.message.includes('version') || error.code === 112) {
                    attempts++;
                    const delay = Math.pow(2, attempts) * 50;
                    logger.warn(`Write conflict for EmailBatches update. Retrying in ${delay}ms (attempt ${attempts}/${MAX_RETRIES})`, {
                        batchId: data.batchId,
                        error: error.message
                    });
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                
                logger.error('Failed to update EmailBatches:', {
                    batchId: data.batchId,
                    requestId: await this.publisher.get(`batch_parent:${data.batchId}`).catch(() => null),
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        }

        throw new Error(`Failed to update EmailBatches after ${MAX_RETRIES} attempts due to write conflicts`);
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
            
            // Credits are now deducted when each batch completes (not here)
            // This handler is only for cleanup and logging
            logger.info('Validation completion handler called (credits already deducted per batch):', {
                fileId,
                userId,
                totalEmails
            });

            // Always attempt to release any reservation
            try {
                const reservationPattern = `validation_${fileId}_*`;
                await creditService.releaseReservedCredits(userId, reservationPattern, 'Release after validation completion');
            } catch (e) {
                logger.warn('Releasing reservation failed (may not exist):', { fileId, error: e.message });
            }

            // No additional credit deduction needed - credits are deducted when each batch completes

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