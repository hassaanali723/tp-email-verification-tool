const express = require('express');
const Stripe = require('stripe');
const { requireAuth } = require('../middleware/auth');
const creditService = require('../services/creditService');
const logger = require('../utils/logger');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

// Match frontend pricing exactly (USD per credit). Highest threshold <= credits wins.
// Keep these numbers in sync with frontend/src/constants/pricing.ts
const PRICING_TIERS_USD = [
  { threshold: 2000, pricePerCredit: 0.0075 },
  { threshold: 5000, pricePerCredit: 0.0060 },
  { threshold: 10000, pricePerCredit: 0.0055 },
  { threshold: 25000, pricePerCredit: 0.0050 },
  { threshold: 50000, pricePerCredit: 0.0045 },
  { threshold: 100000, pricePerCredit: 0.0040 },
  { threshold: 250000, pricePerCredit: 0.0035 },
  { threshold: 500000, pricePerCredit: 0.0030 },
  { threshold: 1000000, pricePerCredit: 0.0025 },
];

function getPricePerCreditUSD(credits, mode) {
  const sorted = [...PRICING_TIERS_USD].sort((a, b) => a.threshold - b.threshold);
  let selected = sorted[0];
  for (const tier of sorted) {
    if (credits >= tier.threshold) selected = tier; else break;
  }
  let price = selected.pricePerCredit; // USD per credit
  if (mode === 'subscription') {
    price = price * 0.95; // 5% discount for subscriptions
  }
  return price;
}

const DEFAULT_PRICE_PER_CREDIT_USD = Number(process.env.PRICE_PER_CREDIT_USD || 0.01);
const PRICE_PER_CREDIT_CENTS = Math.round((PRICING_TIERS_USD[0]?.pricePerCredit || DEFAULT_PRICE_PER_CREDIT_USD) * 100);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Standard router for JSON endpoints
const router = express.Router();

// Create a Checkout Session for purchasing credits or subscriptions
router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { credits, mode } = req.body;

    const creditsInt = Number(credits);
    if (!Number.isFinite(creditsInt) || creditsInt <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid credits amount' });
    }

    const pricePerCreditUSD = getPricePerCreditUSD(creditsInt, mode) || DEFAULT_PRICE_PER_CREDIT_USD;
    const totalCents = Math.round(pricePerCreditUSD * creditsInt * 100); // USD -> cents

    const isSubscription = mode === 'subscription';

    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: isSubscription
                ? `Subscription – ${creditsInt.toLocaleString()} credits / month`
                : `${creditsInt.toLocaleString()} credits` ,
              description: isSubscription
                ? `Monthly package of ${creditsInt.toLocaleString()} credits`
                : 'Pay-as-you-go credits for email validation',
            },
            // Use total amount in cents to avoid fractional cent pricing
            unit_amount: totalCents,
            ...(isSubscription ? { recurring: { interval: 'month' } } : {}),
          },
          quantity: 1,
        },
      ],
      success_url: `${FRONTEND_URL}/dashboard?payment=success`,
      cancel_url: `${FRONTEND_URL}/dashboard?payment=cancel`,
      metadata: {
        userId,
        credits: String(creditsInt),
        mode: mode || 'payg',
      },
      ...(isSubscription
        ? { subscription_data: { metadata: { userId, credits: String(creditsInt) } } }
        : {}),
    });

    return res.json({ success: true, url: session.url });
  } catch (error) {
    logger.error('Failed to create Stripe checkout session', error);
    return res.status(500).json({ success: false, message: 'Failed to create checkout session' });
  }
});

// Optional helper to expose publishable key and price for frontend
router.get('/config', requireAuth, (req, res) => {
  return res.json({
    success: true,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    pricePerCreditCents: PRICE_PER_CREDIT_CENTS,
    currency: 'usd',
  });
});

// Webhook handler must be registered with express.raw in app.js
async function handleStripeWebhook(req, res) {
  const signature = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const credits = Number(session.metadata?.credits || 0);
        const paymentIntentId = session.payment_intent;

        if (userId && credits > 0 && (paymentIntentId || session.mode === 'subscription')) {
          // For one-time payments use payment_intent; for subscriptions use subscription id
          const reference = session.mode === 'subscription'
            ? `stripe:sub:${session.subscription}`
            : `stripe:${paymentIntentId}`;

          // Idempotent add using reference
          await creditService.addCredits(
            userId,
            credits,
            'purchase',
            reference,
            'Stripe Checkout purchase',
            {
              checkoutSessionId: session.id,
              customer: session.customer,
              mode: session.mode,
              subscriptionId: session.subscription || null,
            }
          );
        } else {
          logger.warn('Stripe webhook missing metadata or payment intent; skipping credit grant', {
            userId,
            credits,
            paymentIntentId,
          });
        }
        break;
      }
      default:
        // No-op for other events for now
        break;
    }
  } catch (err) {
    logger.error('Error handling Stripe webhook event', { error: err });
    return res.status(500).send('Webhook handler error');
  }

  return res.json({ received: true });
}

module.exports = { router, handleStripeWebhook };

