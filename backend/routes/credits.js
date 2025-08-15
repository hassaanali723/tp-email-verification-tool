const express = require('express');
const router = express.Router();
const creditService = require('../services/creditService');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * Credit Management Routes
 * Enterprise-level API endpoints for credit operations
 * All routes require authentication
 */

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * @route GET /api/credits/balance
 * @desc Get user's current credit balance and summary
 * @access Private
 */
router.get('/balance', async (req, res) => {
  try {
    const userId = req.auth.userId;
    
    const balance = await creditService.getBalance(userId);
    // Auto-initialize trial credits for brand new users (no account yet)
    if ((balance.balance === 0) && (balance.transactionCount === 0)) {
      try {
        // Use the existing initialize endpoint logic
        await creditService.initializeNewUser(userId);
        // Re-fetch balance after initialization
        const updatedBalance = await creditService.getBalance(userId);
        return res.json({
          success: true,
          data: updatedBalance,
          message: 'Credit balance retrieved successfully'
        });
      } catch (e) {
        // If already initialized by a race, ignore and return original balance
        logger.info('User already initialized or initialization failed:', { userId, error: e.message });
      }
    }
    
    res.json({
      success: true,
      data: balance,
      message: 'Credit balance retrieved successfully'
    });
  } catch (error) {
    logger.error('Error getting credit balance:', {
      userId: req.auth?.userId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get credit balance',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route POST /api/credits/check-sufficient
 * @desc Check if user has sufficient credits for an operation
 * @access Private
 * @body { requiredCredits: number }
 */
router.post('/check-sufficient', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { requiredCredits } = req.body;
    
    // Validate input
    if (!requiredCredits || requiredCredits <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Required credits must be a positive number'
      });
    }
    
    const hasSufficient = await creditService.hasSufficientCredits(userId, requiredCredits);
    const balance = await creditService.getBalance(userId);
    
    res.json({
      success: true,
      data: {
        hasSufficientCredits: hasSufficient,
        requiredCredits,
        currentBalance: balance.balance,
        shortfall: hasSufficient ? 0 : (requiredCredits - balance.balance)
      },
      message: hasSufficient ? 'Sufficient credits available' : 'Insufficient credits'
    });
  } catch (error) {
    logger.error('Error checking sufficient credits:', {
      userId: req.auth?.userId,
      requiredCredits: req.body?.requiredCredits,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to check credit sufficiency',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route POST /api/credits/consume
 * @desc Consume credits for validation or other operations
 * @access Private
 * @body { amount: number, reference: string, description: string, metadata?: object }
 */
router.post('/consume', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { amount, reference, description, metadata = {} } = req.body;
    
    // Validate input
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }
    
    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required'
      });
    }
    
    if (!description) {
      return res.status(400).json({
        success: false,
        message: 'Transaction description is required'
      });
    }
    
    // Check for duplicate transaction (idempotency)
    const exists = await creditService.transactionExists(userId, reference);
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Transaction with this reference already exists'
      });
    }
    
    const result = await creditService.deductCredits(
      userId,
      amount,
      reference,
      description,
      metadata
    );
    
    res.json({
      success: true,
      data: result,
      message: `Successfully consumed ${amount} credits`
    });
  } catch (error) {
    logger.error('Error consuming credits:', {
      userId: req.auth?.userId,
      amount: req.body?.amount,
      reference: req.body?.reference,
      error: error.message,
      stack: error.stack
    });
    
    // Handle specific error types
    if (error.message.includes('Insufficient credits')) {
      return res.status(402).json({
        success: false,
        message: error.message,
        errorCode: 'INSUFFICIENT_CREDITS'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to consume credits',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route POST /api/credits/initialize
 * @desc Initialize new user with trial credits
 * @access Private
 * @body { trialAmount?: number }
 */
router.post('/initialize', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { trialAmount } = req.body;
    
    const result = await creditService.initializeNewUser(userId, trialAmount);
    
    res.status(201).json({
      success: true,
      data: result,
      message: `Welcome! You've received ${result.transaction.amount} free trial credits`
    });
  } catch (error) {
    logger.error('Error initializing user credits:', {
      userId: req.auth?.userId,
      trialAmount: req.body?.trialAmount,
      error: error.message,
      stack: error.stack
    });
    
    // Handle specific error types
    if (error.message.includes('already has credit account')) {
      return res.status(409).json({
        success: false,
        message: 'User credit account already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to initialize user credits',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route GET /api/credits/history
 * @desc Get user's credit transaction history
 * @access Private
 * @query { page?: number, limit?: number, type?: string, startDate?: string, endDate?: string }
 */
router.get('/history', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const {
      page = 1,
      limit = 20,
      type,
      startDate,
      endDate
    } = req.query;
    
    // Validate pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid pagination parameters. Page must be >= 1, limit must be 1-100'
      });
    }
    
    // Validate type if provided
    if (type && !['purchase', 'consumption', 'trial', 'refund'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction type'
      });
    }
    
    // Parse dates if provided
    let parsedStartDate = null;
    let parsedEndDate = null;
    
    if (startDate) {
      parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid start date format'
        });
      }
    }
    
    if (endDate) {
      parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid end date format'
        });
      }
    }
    
    const options = {
      page: pageNum,
      limit: limitNum,
      type,
      startDate: parsedStartDate,
      endDate: parsedEndDate
    };
    
    const history = await creditService.getTransactionHistory(userId, options);
    
    res.json({
      success: true,
      data: history,
      message: 'Transaction history retrieved successfully'
    });
  } catch (error) {
    logger.error('Error getting transaction history:', {
      userId: req.auth?.userId,
      query: req.query,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to get transaction history',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

/**
 * @route POST /api/credits/add
 * @desc Add credits to user account (for testing/admin purposes)
 * @access Private
 * @body { amount: number, type: string, reference: string, description: string, metadata?: object }
 * @note In production, this would typically be restricted to admin users or used only by payment webhooks
 */
router.post('/add', async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { amount, type, reference, description, metadata = {} } = req.body;
    
    // Validate input
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive number'
      });
    }
    
    if (!['purchase', 'trial', 'refund'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction type for adding credits'
      });
    }
    
    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required'
      });
    }
    
    if (!description) {
      return res.status(400).json({
        success: false,
        message: 'Transaction description is required'
      });
    }
    
    // Check for duplicate transaction (idempotency)
    const exists = await creditService.transactionExists(userId, reference);
    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'Transaction with this reference already exists'
      });
    }
    
    const result = await creditService.addCredits(
      userId,
      amount,
      type,
      reference,
      description,
      metadata
    );
    
    res.status(201).json({
      success: true,
      data: result,
      message: `Successfully added ${amount} credits`
    });
  } catch (error) {
    logger.error('Error adding credits:', {
      userId: req.auth?.userId,
      amount: req.body?.amount,
      type: req.body?.type,
      reference: req.body?.reference,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to add credits',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;