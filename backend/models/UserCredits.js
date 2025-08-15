const mongoose = require('mongoose');

/**
 * Transaction Schema for embedded credit transactions
 * Provides complete audit trail for all credit operations
 */
const TransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['purchase', 'consumption', 'trial', 'refund'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    validate: {
      validator: function(value) {
        return value !== 0;
      },
      message: 'Transaction amount cannot be zero'
    }
  },
  reference: {
    type: String,
    required: true,
    index: true // For efficient lookups by reference (stripeSessionId, fileId, etc.)
  },
  description: {
    type: String,
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  _id: true // Each transaction gets its own ID
});

/**
 * UserCredits Schema - Single source of truth for user credit management
 * Uses embedded transactions for atomic operations and complete audit trail
 */
const UserCreditsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: function(value) {
        return Number.isInteger(value) && value >= 0;
      },
      message: 'Balance must be a non-negative integer'
    }
  },
  version: {
    type: Number,
    required: true,
    default: 0
  },
  transactions: [TransactionSchema],
  // Derived fields for quick access (updated atomically)
  totalPurchased: {
    type: Number,
    default: 0,
    min: 0
  },
  totalConsumed: {
    type: Number,
    default: 0,
    min: 0
  },
  lastTransactionAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'user_credits'
});

// Indexes for performance
// Note: userId index is automatically created by unique: true constraint
// Note: transactions.reference index is automatically created by index: true in TransactionSchema
UserCreditsSchema.index({ 'transactions.type': 1 });
UserCreditsSchema.index({ lastTransactionAt: -1 });

/**
 * Pre-save middleware to validate balance consistency
 * Ensures balance matches transaction history
 */
UserCreditsSchema.pre('save', function(next) {
  try {
    // Calculate balance from transactions for consistency check
    const calculatedBalance = this.transactions.reduce((sum, transaction) => {
      if (transaction.type === 'purchase' || transaction.type === 'trial') {
        return sum + Math.abs(transaction.amount);
      } else if (transaction.type === 'consumption' || transaction.type === 'refund') {
        return sum - Math.abs(transaction.amount);
      }
      return sum;
    }, 0);

    // Update derived fields
    this.totalPurchased = this.transactions
      .filter(t => t.type === 'purchase' || t.type === 'trial')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    this.totalConsumed = this.transactions
      .filter(t => t.type === 'consumption')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Validate consistency (allow small discrepancies for floating point)
    if (Math.abs(this.balance - calculatedBalance) > 0.01) {
      const error = new Error(`Balance inconsistency detected. Balance: ${this.balance}, Calculated: ${calculatedBalance}`);
      error.name = 'BalanceInconsistencyError';
      return next(error);
    }

    // Update last transaction timestamp
    if (this.transactions.length > 0) {
      this.lastTransactionAt = this.transactions[this.transactions.length - 1].timestamp;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// No instance methods or static methods - pure model definition

module.exports = mongoose.model('UserCredits', UserCreditsSchema);