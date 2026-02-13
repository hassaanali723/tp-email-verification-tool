const axios = require('axios');
const logger = require('../utils/logger');

class CryptoService {
  constructor() {
    this.apiKey = process.env.NOWPAYMENTS_API_KEY;
    this.baseUrl = process.env.NOWPAYMENTS_MODE === 'production' 
      ? 'https://api.nowpayments.io/v1' 
      : 'https://api-sandbox.nowpayments.io/v1';
    
    this.defaultHeaders = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get available currencies for payment
   */
  async getAvailableCurrencies() {
    try {
      const response = await axios.get(`${this.baseUrl}/currencies`, {
        headers: this.defaultHeaders
      });
      return response.data.currencies;
    } catch (error) {
      logger.error('Error fetching available currencies:', error.response?.data || error.message);
      throw new Error('Failed to fetch available currencies');
    }
  }

  /**
   * Get estimated crypto amount for USD payment
   */
  async getEstimatedPrice(amount, currency = 'usdt') {
    try {
      const currencyLower = currency.toLowerCase();
      const isStablecoin = ['usdt', 'usdc'].some((code) => currencyLower.startsWith(code));

      // Handle stablecoins (USDT, USDC) which are pegged to USD
      if (isStablecoin) {
        return {
          estimatedAmount: amount, // 1:1 ratio with USD
          currency: currencyLower.toUpperCase(),
          usdAmount: amount
        };
      }

      const response = await axios.get(`${this.baseUrl}/estimate`, {
        headers: this.defaultHeaders,
        params: {
          amount: amount,
          currency_from: 'usd',
          currency_to: currency.toLowerCase()
        }
      });
      
      return {
        estimatedAmount: response.data.estimated_amount,
        currency: currency.toUpperCase(),
        usdAmount: amount
      };
    } catch (error) {
      logger.error('Error getting price estimate:', error.response?.data || error.message);
      throw new Error('Failed to get price estimate');
    }
  }

  /**
   * Create a payment invoice
   */
  async createPayment(paymentData) {
    try {
      const payCurrency = paymentData.payCurrency?.toLowerCase() || 'usdt';
      const isStablecoin = ['usdt', 'usdc'].some((code) => payCurrency.startsWith(code));
      
      const payload = {
        price_amount: paymentData.priceAmount,
        price_currency: isStablecoin ? payCurrency : 'usd',
        pay_currency: payCurrency,
        ipn_callback_url: process.env.NOWPAYMENTS_CALLBACK_URL,
        order_id: paymentData.orderId,
        order_description: `Email Validation Credits - ${paymentData.credits} credits`,
        success_url: process.env.NOWPAYMENTS_SUCCESS_URL,
        cancel_url: process.env.NOWPAYMENTS_CANCEL_URL,
        customer_email: paymentData.customerEmail,
        is_fixed_rate: true,
        is_fee_paid_by_user: true
      };

      const response = await axios.post(`${this.baseUrl}/payment`, payload, {
        headers: this.defaultHeaders
      });

      logger.info(`Crypto payment created - Invoice ID: ${response.data.payment_id}`, {
        orderId: paymentData.orderId,
        amount: paymentData.priceAmount,
        currency: paymentData.payCurrency
      });

      return {
        paymentId: response.data.payment_id,
        paymentStatus: response.data.payment_status,
        payAddress: response.data.pay_address,
        payAmount: response.data.pay_amount,
        priceAmount: response.data.price_amount,
        priceCurrency: response.data.price_currency,
        payCurrency: response.data.pay_currency,
        orderId: response.data.order_id,
        paymentUrl: response.data.invoice_url,
        network: response.data.network,
        expirationEstimateDate: response.data.expiration_estimate_date
      };
    } catch (error) {
      logger.error('Error creating payment:', error.response?.data || error.message);
      
      // Handle specific NOWPayments errors
      if (error.response?.data?.code === 'CURRENCY_UNAVAILABLE') {
        throw new Error(`${payCurrency.toUpperCase()} is temporarily unavailable. Try BTC or ETH instead.`);
      }
      
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      
      throw new Error('Failed to create payment');
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId) {
    try {
      const response = await axios.get(`${this.baseUrl}/payment/${paymentId}`, {
        headers: this.defaultHeaders
      });

      return {
        paymentId: response.data.payment_id,
        paymentStatus: response.data.payment_status,
        payAddress: response.data.pay_address,
        payAmount: response.data.pay_amount,
        actuallyPaid: response.data.actually_paid,
        priceAmount: response.data.price_amount,
        priceCurrency: response.data.price_currency,
        payCurrency: response.data.pay_currency,
        orderId: response.data.order_id,
        outcome: response.data.outcome,
        txnHash: response.data.outcome?.hash,
        confirmations: response.data.outcome?.confirmations,
        network: response.data.network,
        createdAt: response.data.created_at,
        updatedAt: response.data.updated_at
      };
    } catch (error) {
      logger.error('Error fetching payment status:', error.response?.data || error.message);
      throw new Error('Failed to fetch payment status');
    }
  }

  /**
   * Verify IPN webhook signature
   */
  verifyIPNSignature(receivedData, receivedSignature) {
    try {
      const crypto = require('crypto');
      const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
      
      if (!ipnSecret) {
        throw new Error('IPN Secret not configured');
      }

      const hmac = crypto.createHmac('sha512', ipnSecret);
      if (Buffer.isBuffer(receivedData)) {
        hmac.update(receivedData);
      } else if (typeof receivedData === 'string') {
        hmac.update(receivedData);
      } else {
        hmac.update(JSON.stringify(receivedData));
      }
      const calculatedSignature = hmac.digest('hex');
      
      return calculatedSignature === receivedSignature;
    } catch (error) {
      logger.error('Error verifying IPN signature:', error.message);
      return false;
    }
  }

  /**
   * Get minimum payment amount for currency
   */
  async getMinimumAmount(currency = 'usdt') {
    try {
      const currencyLower = currency.toLowerCase();
      const isStablecoin = ['usdt', 'usdc'].some((code) => currencyLower.startsWith(code));
      const currencyFrom = isStablecoin ? currencyLower : 'usd';

      const response = await axios.get(`${this.baseUrl}/min-amount`, {
        headers: this.defaultHeaders,
        params: {
          currency_from: currencyFrom,
          currency_to: currencyLower
        }
      });
      
      return {
        minAmount: response.data.min_amount,
        currency: currencyLower.toUpperCase()
      };
    } catch (error) {
      logger.error('Error fetching minimum amount:', error.response?.data || error.message);
      return { minAmount: 1, currency: currency.toUpperCase() }; // Fallback
    }
  }
}

module.exports = new CryptoService();