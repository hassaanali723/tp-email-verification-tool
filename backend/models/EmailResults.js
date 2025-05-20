const mongoose = require('mongoose');

const emailDetailsSchema = new mongoose.Schema({
    email: String,
    is_valid: Boolean,
    status: {
        type: String,
        enum: ['deliverable', 'undeliverable', 'risky', 'unknown']
    },
    risk_level: {
        type: String,
        enum: ['none', 'low', 'medium', 'high']
    },
    deliverability_score: Number,
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

const emailResultsSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    batchId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    fileId: {
        type: String,
        required: true,
        index: true
    },
    requestId: {
        type: String,
        sparse: true,
        index: true
    },
    status: {
        type: String,
        enum: ['processing', 'completed', 'failed'],
        default: 'processing'
    },
    totalEmails: {
        type: Number,
        required: true
    },
    processedEmails: {
        type: Number,
        default: 0
    },
    results: [emailDetailsSchema],
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const EmailResults = mongoose.model('EmailResults', emailResultsSchema);

module.exports = EmailResults; 