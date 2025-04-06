const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    path: {
        type: String,
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    totalEmails: {
        type: Number,
        default: 0
    },
    processingProgress: {
        totalRows: {
            type: Number,
            default: 0
        },
        processedRows: {
            type: Number,
            default: 0
        },
        emailsFound: {
            type: Number,
            default: 0
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    },
    error: {
        message: String,
        code: String,
        timestamp: Date
    },
    validationResults: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EmailValidationResult'
    }]
}, {
    timestamps: true
});

// Indexes for better query performance
fileSchema.index({ filename: 1 });
fileSchema.index({ status: 1 });
fileSchema.index({ createdAt: -1 });

// Virtual for progress percentage
fileSchema.virtual('progressPercentage').get(function() {
    if (!this.processingProgress.totalRows) return 0;
    return Math.round((this.processingProgress.processedRows / this.processingProgress.totalRows) * 100);
});

module.exports = mongoose.model('File', fileSchema);
