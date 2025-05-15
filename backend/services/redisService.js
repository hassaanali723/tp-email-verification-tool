const Redis = require('ioredis');
const winston = require('winston');
const EmailBatches = require('../models/EmailBatches');
const EmailResults = require('../models/EmailResults');
const statisticsService = require('./statisticsService');
const { sendSseEvent } = require('../routes/events');

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
            
            // Then update EmailBatches
            await this._updateEmailBatches(data);

            // Get fileId from EmailResults
            const emailResult = await EmailResults.findOne({ batchId: data.batchId }, { fileId: 1 });
            if (emailResult && emailResult.fileId) {
                const fileId = emailResult.fileId;
                
                // Get and publish stats
                const stats = await statisticsService.getFileStats(fileId);
                await this.publisher.publish(`file_stats:${fileId}`, JSON.stringify(stats));

                // Get and publish email list (first page)
                const emailList = await statisticsService.getEmailList(fileId);
                await this.publisher.publish(`file_emails:${fileId}`, JSON.stringify(emailList));
                
                logger.info(`Published stats and email list for fileId: ${fileId}`);

                // Notify SSE clients for this fileId
                sendSseEvent(fileId, 'validationUpdate', { fileId, stats });
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

            await EmailResults.findOneAndUpdate(
                { batchId: data.batchId },
                { $set: resultsUpdate },
                { upsert: true }
            );
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
            const requestId = await this.publisher.get(`batch_parent:${data.batchId}`);
            if (!requestId) {
                logger.error('No parent requestId found for batch:', { batchId: data.batchId });
                return;
            }

            const emailBatches = await EmailBatches.findOne({ requestId }).exec();
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

            Object.assign(emailBatches, {
                processedEmails: totalProcessed,
                totalEmails,
                status: allComplete ? "completed" : "processing",
                progress: `${totalProcessed}/${totalEmails}`,
                lastUpdated: new Date()
            });

            await emailBatches.save();
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

    async cleanup() {
        const connections = [this.subscriber, this.publisher].filter(Boolean);
        await Promise.all(connections.map(conn => conn.quit().catch(err => 
            logger.error('Connection cleanup failed:', err)
        )));
    }
}

// Export singleton instanceimage.png
module.exports = new RedisService(); 