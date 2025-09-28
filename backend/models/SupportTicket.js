const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  problem: { type: String, required: true },
  imageUrl: { type: String },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
}, { timestamps: true, collection: 'support_tickets' });

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);


