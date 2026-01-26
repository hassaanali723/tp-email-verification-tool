const mongoose = require('mongoose');

const batchStatusSchema = new mongoose.Schema({
    batchId: String,
    status: {
        type: String,
        enum: ['processing', 'completed', 'failed'],
        default: 'processing'
    },
    processedEmails: {
        type: Number,
        default: 0
    },
    totalEmails: {
        type: Number,
        default: 0
    }
});

const emailBatchesSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    requestId: {
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
    batchIds: [{
        type: String
    }],
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
    progress: {
        type: String,
        default: '0%'
    },
    isMultiBatch: {
        type: Boolean,
        default: true
    },
    batches: [batchStatusSchema],
    version: {
        type: Number,
        default: 0,
        required: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const EmailBatches = mongoose.model('EmailBatches', emailBatchesSchema);

module.exports = EmailBatches; 