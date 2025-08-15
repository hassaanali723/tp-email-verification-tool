const mongoose = require('mongoose');
const UserCredits = require('../models/UserCredits');
const logger = require('../utils/logger');

/**
 * Enterprise-level Credit Service
 * Handles all credit operations with atomic transactions and proper error handling
 * Implements enterprise patterns: transactions, idempotency, audit trails
 */
class CreditService {
  constructor() {
    this.DEFAULT_NEW_USER_TRIAL_CREDITS = 1000;
    // In-memory store for reserved credits (in production, use Redis)
    this.reservedCredits = new Map(); // userId -> { reservations: [{ id, amount, timestamp }] }
  }

  /**
   * Get user's current credit balance
   * @param {String} userId - User ID
   * @returns {Promise<Object>} Credit balance and summary
   */
  async getBalance(userId) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const userCredits = await UserCredits.findOne({ userId });
      
      if (!userCredits) {
        return {
          balance: 0,
          totalPurchased: 0,
          totalConsumed: 0,
          lastTransactionAt: null,
          transactionCount: 0
        };
      }

      return {
        balance: userCredits.balance,
        totalPurchased: userCredits.totalPurchased,
        totalConsumed: userCredits.totalConsumed,
        lastTransactionAt: userCredits.lastTransactionAt,
        transactionCount: userCredits.transactions.length
      };
    } catch (error) {
      logger.error('Error getting credit balance:', { userId, error: error.message });
      throw new Error(`Failed to get credit balance: ${error.message}`);
    }
  }

  /**
   * Check if user has sufficient credits for an operation (including reserved credits)
   * @param {String} userId - User ID
   * @param {Number} requiredCredits - Credits needed
   * @returns {Promise<Boolean>} Whether user has sufficient credits
   */
  async hasSufficientCredits(userId, requiredCredits) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }
      
      if (!requiredCredits || requiredCredits <= 0) {
        throw new Error('Required credits must be a positive number');
      }

      const balance = await this.getBalance(userId);
      const reserved = this._getTotalReservedCredits(userId);
      const availableCredits = balance.balance - reserved;
      
      return availableCredits >= requiredCredits;
    } catch (error) {
      logger.error('Error checking sufficient credits:', { userId, requiredCredits, error: error.message });
      throw new Error(`Failed to check sufficient credits: ${error.message}`);
    }
  }

  /**
   * Reserve credits for a validation operation
   * @param {String} userId - User ID
   * @param {Number} amount - Credits to reserve
   * @param {String} reservationId - Unique identifier for this reservation
   * @param {String} description - Description of what credits are reserved for
   * @returns {Promise<Object>} Reservation details
   */
  async reserveCredits(userId, amount, reservationId, description) {
    try {
      if (!userId || !amount || !reservationId) {
        throw new Error('User ID, amount, and reservation ID are required');
      }

      // Check if user has sufficient credits (including existing reservations)
      const hasSufficient = await this.hasSufficientCredits(userId, amount);
      if (!hasSufficient) {
        const balance = await this.getBalance(userId);
        const reserved = this._getTotalReservedCredits(userId);
        throw new Error(`Insufficient credits. Available: ${balance.balance - reserved}, Required: ${amount}`);
      }

      // Create reservation
      const reservation = {
        id: reservationId,
        amount,
        description,
        timestamp: new Date(),
        status: 'active'
      };

      // Store reservation
      if (!this.reservedCredits.has(userId)) {
        this.reservedCredits.set(userId, { reservations: [] });
      }
      
      this.reservedCredits.get(userId).reservations.push(reservation);

      logger.info('Credits reserved:', { userId, amount, reservationId, description });

      return {
        reservationId,
        amount,
        description,
        timestamp: reservation.timestamp
      };
    } catch (error) {
      logger.error('Error reserving credits:', { userId, amount, reservationId, error: error.message });
      throw new Error(`Failed to reserve credits: ${error.message}`);
    }
  }

  /**
   * Consume reserved credits (convert reservation to actual consumption)
   * @param {String} userId - User ID
   * @param {String} reservationIdOrPattern - Reservation ID or pattern to consume
   * @param {String} reference - Transaction reference for audit trail
   * @param {Object} metadata - Additional transaction data
   * @returns {Promise<Object>} Transaction result
   */
  async consumeReservedCredits(userId, reservationIdOrPattern, reference, metadata = {}) {
    try {
      if (!userId || !reservationIdOrPattern || !reference) {
        throw new Error('User ID, reservation ID, and reference are required');
      }

      // Find and validate reservation
      const userReservations = this.reservedCredits.get(userId);
      if (!userReservations) {
        throw new Error('No reservations found for user');
      }

      let reservationIndex = -1;
      let reservation = null;

      // If it's a pattern (ends with *), find the first matching reservation
      if (reservationIdOrPattern.endsWith('*')) {
        const pattern = reservationIdOrPattern.slice(0, -1); // Remove the *
        reservationIndex = userReservations.reservations.findIndex(r => 
          r.id.startsWith(pattern) && r.status === 'active'
        );
      } else {
        // Exact match
        reservationIndex = userReservations.reservations.findIndex(r => r.id === reservationIdOrPattern);
      }

      if (reservationIndex === -1) {
        throw new Error(`Reservation ${reservationIdOrPattern} not found`);
      }

      reservation = userReservations.reservations[reservationIndex];
      if (reservation.status !== 'active') {
        throw new Error(`Reservation ${reservation.id} is not active`);
      }

      // Remove reservation from memory
      userReservations.reservations.splice(reservationIndex, 1);

      // Actually deduct credits from user account
      const result = await this.deductCredits(
        userId,
        reservation.amount,
        reference,
        `${reservation.description} (Reservation: ${reservation.id})`,
        { ...metadata, reservationId: reservation.id, originalDescription: reservation.description }
      );

      logger.info('Reserved credits consumed:', { 
        userId, 
        reservationId: reservation.id, 
        amount: reservation.amount,
        newBalance: result.balance 
      });

      return result;
    } catch (error) {
      logger.error('Error consuming reserved credits:', { userId, reservationIdOrPattern, error: error.message });
      throw new Error(`Failed to consume reserved credits: ${error.message}`);
    }
  }

  /**
   * Release reserved credits (cancel reservation)
   * @param {String} userId - User ID
   * @param {String} reservationIdOrPattern - Reservation ID or pattern to release
   * @param {String} reason - Reason for releasing credits
   * @returns {Promise<Object>} Release details
   */
  async releaseReservedCredits(userId, reservationIdOrPattern, reason) {
    try {
      if (!userId || !reservationIdOrPattern) {
        throw new Error('User ID and reservation ID are required');
      }

      // Find and remove reservation
      const userReservations = this.reservedCredits.get(userId);
      if (!userReservations) {
        throw new Error('No reservations found for user');
      }

      let reservationIndex = -1;
      let reservation = null;

      // If it's a pattern (ends with *), find the first matching reservation
      if (reservationIdOrPattern.endsWith('*')) {
        const pattern = reservationIdOrPattern.slice(0, -1); // Remove the *
        reservationIndex = userReservations.reservations.findIndex(r => 
          r.id.startsWith(pattern) && r.status === 'active'
        );
      } else {
        // Exact match
        reservationIndex = userReservations.reservations.findIndex(r => r.id === reservationIdOrPattern);
      }

      if (reservationIndex === -1) {
        throw new Error(`Reservation ${reservationIdOrPattern} not found`);
      }

      reservation = userReservations.reservations[reservationIndex];
      userReservations.reservations.splice(reservationIndex, 1);

      logger.info('Reserved credits released:', { 
        userId, 
        reservationId: reservation.id, 
        amount: reservation.amount,
        reason 
      });

      return {
        reservationId: reservation.id,
        amount: reservation.amount,
        reason,
        releasedAt: new Date()
      };
    } catch (error) {
      logger.error('Error releasing reserved credits:', { userId, reservationIdOrPattern, error: error.message });
      throw new Error(`Failed to release reserved credits: ${error.message}`);
    }
  }

  /**
   * Get total reserved credits for a user
   * @private
   */
  _getTotalReservedCredits(userId) {
    const userReservations = this.reservedCredits.get(userId);
    if (!userReservations) return 0;

    return userReservations.reservations
      .filter(r => r.status === 'active')
      .reduce((total, r) => total + r.amount, 0);
  }

  /**
   * Add credits to user account (for purchases, trial credits, refunds)
   * @param {String} userId - User ID
   * @param {Number} amount - Credits to add
   * @param {String} type - Transaction type (purchase, trial, refund)
   * @param {String} reference - Unique reference (stripeSessionId, etc.)
   * @param {String} description - Transaction description
   * @param {Object} metadata - Additional transaction data
   * @param {Object} session - MongoDB session for atomic operations
   * @returns {Promise<Object>} Updated balance and transaction
   */
  async addCredits(userId, amount, type, reference, description, metadata = {}, session = null) {
    try {
      // Validate inputs
      if (!userId) {
        throw new Error('User ID is required');
      }
      
      if (!amount || amount <= 0) {
        throw new Error('Amount must be a positive number');
      }
      
      if (!['purchase', 'trial', 'refund'].includes(type)) {
        throw new Error('Invalid transaction type for adding credits');
      }
      
      if (!reference) {
        throw new Error('Transaction reference is required');
      }
      
      if (!description) {
        throw new Error('Transaction description is required');
      }

      const shouldStartSession = !session;
      if (shouldStartSession) {
        session = await mongoose.startSession();
      }

      let result;

      if (shouldStartSession) {
        await session.withTransaction(async () => {
          result = await this._performAddCredits(userId, amount, type, reference, description, metadata, session);
        });
        await session.endSession();
      } else {
        result = await this._performAddCredits(userId, amount, type, reference, description, metadata, session);
      }

      logger.info('Credits added successfully:', {
        userId,
        amount,
        type,
        reference,
        newBalance: result.balance
      });

      return result;
    } catch (error) {
      logger.error('Error adding credits:', {
        userId,
        amount,
        type,
        reference,
        error: error.message
      });
      throw new Error(`Failed to add credits: ${error.message}`);
    }
  }

  /**
   * Deduct credits from user account (for consumption)
   * @param {String} userId - User ID
   * @param {Number} amount - Credits to deduct
   * @param {String} reference - Unique reference (fileId, validationId, etc.)
   * @param {String} description - Transaction description
   * @param {Object} metadata - Additional transaction data
   * @param {Object} session - MongoDB session for atomic operations
   * @returns {Promise<Object>} Updated balance and transaction
   */
  async deductCredits(userId, amount, reference, description, metadata = {}, session = null) {
    try {
      // Validate inputs
      if (!userId) {
        throw new Error('User ID is required');
      }
      
      if (!amount || amount <= 0) {
        throw new Error('Amount must be a positive number');
      }
      
      if (!reference) {
        throw new Error('Transaction reference is required');
      }
      
      if (!description) {
        throw new Error('Transaction description is required');
      }

      const shouldStartSession = !session;
      if (shouldStartSession) {
        session = await mongoose.startSession();
      }

      let result;

      if (shouldStartSession) {
        await session.withTransaction(async () => {
          result = await this._performDeductCredits(userId, amount, reference, description, metadata, session);
        });
        await session.endSession();
      } else {
        result = await this._performDeductCredits(userId, amount, reference, description, metadata, session);
      }

      logger.info('Credits deducted successfully:', {
        userId,
        amount,
        reference,
        newBalance: result.balance
      });

      return result;
    } catch (error) {
      logger.error('Error deducting credits:', {
        userId,
        amount,
        reference,
        error: error.message
      });
      throw new Error(`Failed to deduct credits: ${error.message}`);
    }
  }

  /**
   * Initialize new user with trial credits
   * @param {String} userId - User ID
   * @param {Number} trialAmount - Trial credits (default: 1000)
   * @returns {Promise<Object>} Created user credits with trial
   */
  async initializeNewUser(userId, trialAmount = null) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const session = await mongoose.startSession();
      let result;

      await session.withTransaction(async () => {
        // Check if user already has credits (prevent duplicate trial credits)
        const existingCredits = await UserCredits.findOne({ userId }).session(session);
        if (existingCredits) {
          throw new Error('User already has credit account initialized');
        }

        const amount = trialAmount || this.DEFAULT_NEW_USER_TRIAL_CREDITS;
        const reference = `new_user_trial_${userId}_${Date.now()}`;
        const description = `Free trial credits: ${amount} credits`;

        result = await this._performAddCredits(
          userId,
          amount,
          'trial',
          reference,
          description,
          { isTrialCredits: true },
          session
        );
      });

      await session.endSession();

      logger.info('New user initialized with trial credits:', {
        userId,
        trialAmount: trialAmount || this.DEFAULT_NEW_USER_TRIAL_CREDITS,
        balance: result.balance
      });

      return result;
    } catch (error) {
      logger.error('Error initializing new user:', {
        userId,
        trialAmount,
        error: error.message
      });
      throw new Error(`Failed to initialize new user: ${error.message}`);
    }
  }



  /**
   * Get transaction history for a user
   * @param {String} userId - User ID
   * @param {Object} options - Pagination and filter options
   * @returns {Promise<Object>} Paginated transaction history
   */
  async getTransactionHistory(userId, options = {}) {
    try {
      if (!userId) {
        throw new Error('User ID is required');
      }

      const { page = 1, limit = 20, type = null, startDate = null, endDate = null } = options;
      
      const userCredits = await this._findOrCreateUserCredits(userId);
      let transactions = [...userCredits.transactions];

      // Apply filters
      if (type) {
        transactions = transactions.filter(t => t.type === type);
      }
      
      if (startDate || endDate) {
        transactions = transactions.filter(t => {
          const transactionDate = t.timestamp;
          if (startDate && transactionDate < startDate) return false;
          if (endDate && transactionDate > endDate) return false;
          return true;
        });
      }

      // Sort by timestamp (newest first)
      transactions.sort((a, b) => b.timestamp - a.timestamp);

      // Paginate
      const total = transactions.length;
      const pages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const paginatedTransactions = transactions.slice(offset, offset + limit);

      return {
        transactions: paginatedTransactions,
        total,
        page,
        pages,
        hasMore: page < pages
      };
    } catch (error) {
      logger.error('Error getting transaction history:', { userId, error: error.message });
      throw new Error(`Failed to get transaction history: ${error.message}`);
    }
  }

  /**
   * Check if a transaction reference already exists (for idempotency)
   * @param {String} userId - User ID
   * @param {String} reference - Transaction reference
   * @returns {Promise<Boolean>} Whether reference exists
   */
  async transactionExists(userId, reference) {
    try {
      if (!userId || !reference) {
        throw new Error('User ID and reference are required');
      }

      const userCredits = await UserCredits.findOne({ userId });
      if (!userCredits) {
        return false;
      }

      return userCredits.transactions.some(t => t.reference === reference);
    } catch (error) {
      logger.error('Error checking transaction existence:', { userId, reference, error: error.message });
      throw new Error(`Failed to check transaction existence: ${error.message}`);
    }
  }

  /**
   * Private method to find or create user credits
   * @private
   */
  async _findOrCreateUserCredits(userId, session = null) {
    try {
      let userCredits = await UserCredits.findOne({ userId }).session(session);
      
      if (!userCredits) {
        userCredits = new UserCredits({
          userId,
          balance: 0,
          version: 0,
          transactions: []
        });
        
        if (session) {
          await userCredits.save({ session });
        } else {
          await userCredits.save();
        }
      }
      
      return userCredits;
    } catch (error) {
      if (error.code === 11000) {
        // Handle race condition - try to find again
        return await UserCredits.findOne({ userId }).session(session);
      }
      throw error;
    }
  }

  /**
   * Private method to add a transaction to user credits
   * @private
   */
  async _addTransactionToCredits(userCredits, transactionData, session = null) {
    const { type, amount, reference, description, metadata = {} } = transactionData;
    
    // Validate transaction data
    if (!type || !['purchase', 'consumption', 'trial', 'refund'].includes(type)) {
      throw new Error('Invalid transaction type');
    }
    
    if (!amount || amount === 0) {
      throw new Error('Invalid transaction amount');
    }
    
    if (!reference) {
      throw new Error('Transaction reference is required');
    }

    // Check for duplicate reference to ensure idempotency
    const existingTransaction = userCredits.transactions.find(t => t.reference === reference);
    if (existingTransaction) {
      throw new Error(`Transaction with reference ${reference} already exists`);
    }

    // Calculate new balance
    let balanceChange = 0;
    if (type === 'purchase' || type === 'trial') {
      balanceChange = Math.abs(amount);
    } else if (type === 'consumption' || type === 'refund') {
      balanceChange = -Math.abs(amount);
    }

    const newBalance = userCredits.balance + balanceChange;
    
    // Validate sufficient credits for consumption
    if (newBalance < 0) {
      throw new Error('Insufficient credits for this operation');
    }

    // Add transaction
    userCredits.transactions.push({
      type,
      amount: Math.abs(amount),
      reference,
      description,
      metadata,
      timestamp: new Date()
    });

    // Update balance and version for optimistic locking
    userCredits.balance = newBalance;
    userCredits.version += 1;

    // Save with session if provided
    if (session) {
      return await userCredits.save({ session });
    } else {
      return await userCredits.save();
    }
  }

  /**
   * Private method to perform credit addition
   * @private
   */
  async _performAddCredits(userId, amount, type, reference, description, metadata, session) {
    const userCredits = await this._findOrCreateUserCredits(userId, session);
    
    const updatedCredits = await this._addTransactionToCredits(userCredits, {
      type,
      amount,
      reference,
      description,
      metadata
    }, session);

    return {
      balance: updatedCredits.balance,
      transaction: updatedCredits.transactions[updatedCredits.transactions.length - 1],
      totalPurchased: updatedCredits.totalPurchased,
      totalConsumed: updatedCredits.totalConsumed
    };
  }

  /**
   * Private method to perform credit deduction
   * @private
   */
  async _performDeductCredits(userId, amount, reference, description, metadata, session) {
    const userCredits = await this._findOrCreateUserCredits(userId, session);
    
    // Check sufficient credits
    if (userCredits.balance < amount) {
      throw new Error(`Insufficient credits. Required: ${amount}, Available: ${userCredits.balance}`);
    }

    const updatedCredits = await this._addTransactionToCredits(userCredits, {
      type: 'consumption',
      amount,
      reference,
      description,
      metadata
    }, session);

    return {
      balance: updatedCredits.balance,
      transaction: updatedCredits.transactions[updatedCredits.transactions.length - 1],
      totalPurchased: updatedCredits.totalPurchased,
      totalConsumed: updatedCredits.totalConsumed
    };
  }
}

module.exports = new CreditService();