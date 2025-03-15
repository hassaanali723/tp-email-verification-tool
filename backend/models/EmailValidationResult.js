const mongoose = require('mongoose');

const validationResultSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true
    },
    is_valid: {
        type: Boolean,
        required: true
    },
    status: {
        type: String,
        enum: ['deliverable', 'undeliverable', 'risky', 'unknown'],
        required: true
    },
    risk_level: {
        type: String,
        enum: ['low', 'medium', 'high', null],
        default: null
    },
    deliverability_score: {
        type: Number,
        min: 0,
        max: 100
    },
    details: {
        general: {
            domain: String,
            reason: String,
            validation_method: String
        },
        attributes: {
            free_email: Boolean,
            role_account: Boolean,
            disposable: Boolean,
            catch_all: Boolean,
            has_plus_tag: Boolean,
            mailbox_full: Boolean,
            no_reply: Boolean
        },
        mail_server: {
            smtp_provider: String,
            mx_record: String,
            implicit_mx: String
        },
        blacklist: {
            is_blacklisted: Boolean,
            blacklists_found: [String],
            blacklist_reasons: [String],
            reputation_score: Number,
            last_checked: Date
        },
        sub_status: String
    }
}, { _id: false });

const statisticsSchema = new mongoose.Schema({
    deliverable: {
        count: { type: Number, default: 0 }
    },
    undeliverable: {
        count: { type: Number, default: 0 },
        categories: {
            invalid_email: { type: Number, default: 0 },
            invalid_domain: { type: Number, default: 0 },
            rejected_email: { type: Number, default: 0 },
            invalid_smtp: { type: Number, default: 0 }
        }
    },
    risky: {
        count: { type: Number, default: 0 },
        categories: {
            low_quality: { type: Number, default: 0 },
            low_deliverability: { type: Number, default: 0 }
        }
    },
    unknown: {
        count: { type: Number, default: 0 },
        categories: {
            no_connect: { type: Number, default: 0 },
            timeout: { type: Number, default: 0 },
            unavailable_smtp: { type: Number, default: 0 },
            unexpected_error: { type: Number, default: 0 }
        }
    }
}, { _id: false });

const emailValidationResultSchema = new mongoose.Schema({
    batchId: {
        type: String,
        required: true,
        unique: true
    },
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'File',
        required: true
    },
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed'],
        default: 'queued'
    },
    totalEmails: {
        type: Number,
        required: true
    },
    processedEmails: {
        type: Number,
        default: 0
    },
    estimatedTime: {
        type: String
    },
    startTime: {
        type: Date
    },
    completedTime: {
        type: Date
    },
    error: {
        message: String,
        code: String,
        timestamp: Date
    },
    statistics: {
        type: statisticsSchema,
        default: () => ({})
    },
    results: [validationResultSchema]
}, {
    timestamps: true
});

// Indexes for better query performance
emailValidationResultSchema.index({ fileId: 1 });
emailValidationResultSchema.index({ status: 1 });
emailValidationResultSchema.index({ createdAt: -1 });

// Compound indexes for common queries
emailValidationResultSchema.index({ fileId: 1, status: 1 });
emailValidationResultSchema.index({ fileId: 1, createdAt: -1 });

module.exports = mongoose.model('EmailValidationResult', emailValidationResultSchema, 'email-validation-results'); 