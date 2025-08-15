const express = require('express');
const Stripe = require('stripe');
const { requireAuth } = require('../middleware/auth');
const creditService = require('../services/creditService');
const logger = require('../utils/logger');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });

// Dynamic tiered pricing (cents per credit). Highest threshold <= credits wins.
const PRICING_TIERS_CENTS = [
  { threshold: 2000, unitCents: Math.round(0.0075 * 100) },
  { threshold: 5000, unitCents: Math.round(0.0060 * 100) },
  { threshold: 10000, unitCents: Math.round(0.0055 * 100) },
  { threshold: 25000, unitCents: Math.round(0.0050 * 100) },
  { threshold: 50000, unitCents: Math.round(0.0045 * 100) },
  { threshold: 100000, unitCents: Math.round(0.0040 * 100) },
  { threshold: 250000, unitCents: Math.round(0.0035 * 100) },
  { threshold: 500000, unitCents: Math.round(0.0030 * 100) },
  { threshold: 1000000, unitCents: Math.round(0.0025 * 100) },
];

function getUnitAmountCents(credits, mode) {
  const sorted = [...PRICING_TIERS_CENTS].sort((a, b) => a.threshold - b.threshold);
  let selected = sorted[0];
  for (const tier of sorted) {
    if (credits >= tier.threshold) selected = tier; else break;
  }
  let unit = selected.unitCents;
  if (mode === 'subscription') {
    unit = Math.round(unit * 0.95); // 5% discount for subscriptions
  }
  return unit;
}

const DEFAULT_UNIT_CENTS = Number(process.env.PRICE_PER_CREDIT_CENTS || 1); // fallback 1 cent
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Standard router for JSON endpoints
const router = express.Router();

// Create a Checkout Session for purchasing credits
router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { credits, mode } = req.body;

    const creditsInt = Number(credits);
    if (!Number.isFinite(creditsInt) || creditsInt <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid credits amount' });
    }

    const unitAmount = getUnitAmountCents(creditsInt, mode) || DEFAULT_UNIT_CENTS;
    const totalCents = unitAmount * creditsInt;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Email Verification Credits',
              description: 'Pay-as-you-go credits for email validation',
            },
            unit_amount: unitAmount, // cents per credit
          },
          quantity: creditsInt,
        },
      ],
      success_url: `${FRONTEND_URL}/dashboard?payment=success`,
      cancel_url: `${FRONTEND_URL}/dashboard?payment=cancel`,
      metadata: {
        userId,
        credits: String(creditsInt),
        mode: mode || 'payg',
      },
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

        if (userId && credits > 0 && paymentIntentId) {
          // Idempotent add using payment intent as reference
          await creditService.addCredits(
            userId,
            credits,
            'purchase',
            `stripe:${paymentIntentId}`,
            'Stripe Checkout purchase',
            {
              checkoutSessionId: session.id,
              customer: session.customer,
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

