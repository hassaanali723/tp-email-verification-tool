const mongoose = require('mongoose');

const CryptoWebhookEventSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  orderId: {
    type: String,
    required: true,
    index: true
  },
  paymentStatus: {
    type: String,
    required: true,
    enum: ['waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired']
  },
  priceAmount: {
    type: Number,
    required: true
  },
  priceCurrency: {
    type: String,
    required: true,
    default: 'usd'
  },
  payAmount: {
    type: Number,
    required: true
  },
  actuallyPaid: {
    type: Number,
    default: 0
  },
  payCurrency: {
    type: String,
    required: true
  },
  payAddress: {
    type: String,
    required: true
  },
  outcome: {
    hash: String,
    confirmations: Number,
    amount: Number
  },
  network: String,
  userId: {
    type: String,
    required: true,
    index: true
  },
  credits: {
    type: Number,
    required: true
  },
  processedStatus: {
    type: String,
    enum: ['queued', 'processing', 'processed', 'failed'],
    default: 'queued',
    index: true
  },
  errorDetails: {
    message: String,
    timestamp: Date,
    attempts: {
      type: Number,
      default: 0
    }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
CryptoWebhookEventSchema.index({ processedStatus: 1, createdAt: 1 });
CryptoWebhookEventSchema.index({ userId: 1, paymentStatus: 1 });
CryptoWebhookEventSchema.index({ orderId: 1, paymentStatus: 1 });

// Static method to find pending events
CryptoWebhookEventSchema.statics.findPendingEvents = function() {
  return this.find({
    processedStatus: { $in: ['queued', 'failed'] },
    'errorDetails.attempts': { $lt: 5 }
  }).sort({ createdAt: 1 });
};

// Instance method to mark as processed
CryptoWebhookEventSchema.methods.markAsProcessed = function() {
  this.processedStatus = 'processed';
  return this.save();
};

// Instance method to mark as failed
CryptoWebhookEventSchema.methods.markAsFailed = function(errorMessage) {
  this.processedStatus = 'failed';
  this.errorDetails = {
    message: errorMessage,
    timestamp: new Date(),
    attempts: (this.errorDetails?.attempts || 0) + 1
  };
  return this.save();
};

module.exports = mongoose.model('CryptoWebhookEvent', CryptoWebhookEventSchema);