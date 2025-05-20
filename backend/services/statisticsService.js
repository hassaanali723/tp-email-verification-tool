const EmailResults = require('../models/EmailResults');
const EmailBatches = require('../models/EmailBatches');

class StatisticsService {
    /**
     * Initialize statistics object
     */
    _initializeStats() {
        return {
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
    }

    /**
     * Process validation results and update statistics
     */
    _processResults(results) {
        const stats = this._initializeStats();

        results.forEach(result => {
            switch (result.status) {
                case 'deliverable':
                    stats.deliverable.count++;
                    break;
                case 'undeliverable':
                    stats.undeliverable.count++;
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

        return stats;
    }

    /**
     * Get validation statistics for a file
     * @param {string} fileId - File ID
     * @param {string} userId - User ID
     */
    async getFileStats(fileId, userId) {
        // Check for multi-batch validation
        const multiBatch = await EmailBatches.findOne({ fileId, userId });
        
        if (multiBatch) {
            // Get all results for each batch
            const allResults = await EmailResults.find({
                batchId: { $in: multiBatch.batchIds },
                userId
            });

            // Combine all results
            const combinedResults = allResults.reduce((acc, curr) => {
                return acc.concat(curr.results);
            }, []);

            const stats = this._processResults(combinedResults);

            return {
                fileId,
                status: multiBatch.status,
                progress: {
                    total: multiBatch.totalEmails,
                    processed: multiBatch.processedEmails,
                    percentage: Math.round((multiBatch.processedEmails / multiBatch.totalEmails) * 100)
                },
                stats,
                lastUpdated: multiBatch.lastUpdated
            };
        }

        // Handle single batch
        const singleBatch = await EmailResults.findOne({ fileId, userId });
        if (!singleBatch) {
            throw new Error('No validation records found for this file');
        }

        const stats = this._processResults(singleBatch.results);

        return {
            fileId,
            status: singleBatch.status,
            progress: {
                total: singleBatch.totalEmails,
                processed: singleBatch.processedEmails,
                percentage: Math.round((singleBatch.processedEmails / singleBatch.totalEmails) * 100)
            },
            stats,
            lastUpdated: singleBatch.lastUpdated
        };
    }

    /**
     * Get paginated email validation results for a file
     * @param {string} fileId - File ID
     * @param {string} userId - User ID
     * @param {number} page - Page number
     * @param {number} limit - Items per page
     * @param {string} status - Filter by status
     */
    async getEmailList(fileId, userId, page = 1, limit = 50, status = null) {
        const query = { fileId, userId };
        if (status) {
            query['results.status'] = status;
        }

        // Get total count for pagination
        const totalCount = await EmailResults.aggregate([
            { $match: { fileId, userId } },
            { $unwind: '$results' },
            { $match: status ? { 'results.status': status } : {} },
            { $count: 'total' }
        ]);

        // Get paginated results
        const results = await EmailResults.aggregate([
            { $match: { fileId, userId } },
            { $unwind: '$results' },
            { $match: status ? { 'results.status': status } : {} },
            { $sort: { 'results.email': 1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    email: '$results.email',
                    status: '$results.status',
                    is_valid: '$results.is_valid',
                    risk_level: '$results.risk_level',
                    deliverability_score: '$results.deliverability_score',
                    details: '$results.details'
                }
            }
        ]);

        return {
            emails: results,
            pagination: {
                total: totalCount[0]?.total || 0,
                page,
                limit,
                pages: Math.ceil((totalCount[0]?.total || 0) / limit)
            }
        };
    }
}

module.exports = new StatisticsService(); 