const mongoose = require('mongoose');

/**
 * Stripe webhook event persistence for durability and replay.
 * Stores the raw event payload and processing status so we can
 * retry safely and reconcile if anything fails.
 */
const StripeWebhookEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  type: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['queued', 'processing', 'processed', 'failed'], default: 'queued' },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  processedAt: { type: Date, default: null },
  lastReceivedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  collection: 'stripe_webhook_events',
});

module.exports = mongoose.model('StripeWebhookEvent', StripeWebhookEventSchema);

