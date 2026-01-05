const express = require('express');
const Stripe = require('stripe');
const { requireAuth } = require('../middleware/auth');
const creditService = require('../services/creditService');
const logger = require('../utils/logger');
const UserCredits = require('../models/UserCredits');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
const StripeWebhookEvent = require('../models/StripeWebhookEvent');

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

  const eventId = event?.id;
  logger.info('Stripe webhook received', { eventId, type: event?.type });

  try {
    const existing = await StripeWebhookEvent.findOne({ eventId }).lean();
    if (existing && existing.status === 'processed') {
      logger.info('Stripe webhook already processed; skipping re-run', { eventId, type: event.type });
      return res.json({ received: true, duplicate: true });
    }

    // Persist the event for durability and idempotency
    const stored = await StripeWebhookEvent.findOneAndUpdate(
      { eventId },
      {
        $setOnInsert: { status: 'queued', attempts: 0 },
        $set: { lastReceivedAt: new Date(), type: event.type, payload: event },
      },
      { new: true, upsert: true }
    ).lean();

    // Process asynchronously; respond 200 immediately so Stripe doesn't retry for transient issues
    processStripeEvent(event, stored?.attempts || 0).catch((err) => {
      logger.error('Stripe webhook processing failed', { eventId, type: event.type, error: err.message });
    });

    return res.json({ received: true, queued: true });
  } catch (err) {
    logger.error('Error enqueueing Stripe webhook event', { eventId, type: event?.type, error: err.message });
    return res.status(500).send('Webhook handler error');
  }
}

async function processStripeEvent(event, priorAttempts = 0) {
  const eventId = event?.id;
  try {
    await StripeWebhookEvent.updateOne(
      { eventId },
      { $set: { status: 'processing', lastError: null }, $inc: { attempts: 1 } }
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const credits = Number(session.metadata?.credits || 0);
        const paymentIntentId = session.payment_intent;

        if (!userId || !credits) {
          logger.warn('Stripe webhook missing metadata or payment intent; skipping credit grant', {
            eventId,
            userId,
            credits,
            paymentIntentId,
          });
          break;
        }

        if (session.mode === 'subscription') {
          // Record linkage so future invoices can resolve the user even if metadata is missing
          try {
            await UserCredits.findOneAndUpdate(
              { userId },
              {
                $set: {
                  stripeCustomerId: session.customer || null,
                  lastSubscriptionId: session.subscription || null,
                  subscriptionCredits: credits || null,
                  lastTransactionAt: new Date(),
                }
              },
              { upsert: true }
            );
          } catch (e) {
            logger.warn('Failed to persist subscription linkage on checkout', { userId, error: e.message });
          }

          // Do NOT grant credits here to avoid double-grant with the first invoice.
          // Credits will be granted on invoice.payment_succeeded for each billing period.
          logger.info('Checkout completed for subscription; recorded linkage; credits on invoice', {
            eventId,
            userId,
            subscriptionId: session.subscription,
            customer: session.customer,
            checkoutSessionId: session.id,
          });
        } else if (paymentIntentId) {
          // One-time purchase
          const reference = `stripe:${paymentIntentId}`;
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
            }
          );
          logger.info('Credits granted for checkout.session.completed', { eventId, userId, credits, reference });
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        // Some Stripe API payloads omit invoice.subscription; fall back to line item subscription or stored linkage
        let subscriptionId = invoice.subscription
          || (invoice?.lines?.data?.[0]?.subscription || null);
        if (!subscriptionId) {
          try {
            const linked = await UserCredits.findOne({ stripeCustomerId: invoice.customer }).lean();
            if (linked?.lastSubscriptionId) subscriptionId = linked.lastSubscriptionId;
          } catch (e) {
            // ignore
          }
        }
        if (!subscriptionId) {
          logger.warn('Invoice missing subscription after fallbacks; skipping', { eventId, invoiceId: invoice.id, customer: invoice.customer });
          break;
        }

        // Retrieve subscription to access metadata (userId, credits)
        let subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
        } catch (e) {
          logger.error('Failed to retrieve subscription for invoice', { eventId, error: e.message, subscriptionId, invoiceId: invoice.id });
          break;
        }

        // Resolve user and credits from subscription metadata or previously persisted linkage
        let userId = subscription?.metadata?.userId || invoice?.metadata?.userId;
        let credits = Number(subscription?.metadata?.credits || invoice?.metadata?.credits || 0);
        if (!userId || !credits) {
          try {
            // Fallback to linkage stored on checkout
            const linked = await UserCredits.findOne({
              $or: [
                { lastSubscriptionId: subscriptionId },
                { stripeCustomerId: invoice.customer }
              ]
            }).lean();
            if (linked) {
              if (!userId) userId = linked.userId;
              if (!credits) credits = Number(linked.subscriptionCredits || 0);
            }
          } catch (e) {
            // ignore
          }
        }
        if (!userId || !credits) {
          logger.warn('Missing userId or credits on invoice metadata; skipping grant', { eventId, subscriptionId, invoiceId: invoice.id, userId, credits });
          break;
        }

        const reference = `stripe:invoice:${invoice.id}`;
        await creditService.addCredits(
          userId,
          credits,
          'purchase',
          reference,
          'Monthly subscription credits',
          {
            subscriptionId,
            invoiceId: invoice.id,
            customer: invoice.customer,
            period_start: invoice.lines?.data?.[0]?.period?.start || invoice.period_start || null,
            period_end: invoice.lines?.data?.[0]?.period?.end || invoice.period_end || null,
          }
        );
        try {
          await UserCredits.updateOne(
            { userId },
            {
              $set: {
                stripeCustomerId: invoice.customer || undefined,
                lastSubscriptionId: subscriptionId,
                subscriptionCredits: credits,
                lastTransactionAt: new Date(),
              }
            }
          );
        } catch (e) {
          // ignore linkage failure
        }
        logger.info('Credits granted for invoice.payment_succeeded', { eventId, userId, credits, reference });
        break;
      }
      default:
        // No-op for other events for now
        logger.info('Stripe webhook ignored event type', { eventId, type: event.type });
        break;
    }

    await StripeWebhookEvent.updateOne(
      { eventId },
      { $set: { status: 'processed', processedAt: new Date(), lastError: null } }
    );
  } catch (err) {
    await StripeWebhookEvent.updateOne(
      { eventId },
      { $set: { status: 'failed', lastError: err.message } }
    );
    throw err;
  }
}

module.exports = { router, handleStripeWebhook };

// =============================
// Additional Subscription APIs
// =============================

// Helper: find latest subscription transaction for a user (stores subscriptionId in reference or metadata)
async function getLatestSubscriptionInfo(userId) {
  const uc = await UserCredits.findOne({ userId }).lean();
  if (!uc || !Array.isArray(uc.transactions)) return null;

  // Find most recent transaction that relates to a subscription
  const subTx = [...uc.transactions]
    .filter(t => t && (String(t.reference || '').startsWith('stripe:sub:') || t?.metadata?.subscriptionId))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

  if (!subTx) return null;
  const fromRef = String(subTx.reference || '');
  const subId = subTx?.metadata?.subscriptionId || (fromRef.startsWith('stripe:sub:') ? fromRef.replace('stripe:sub:', '') : null);
  return subId ? { subscriptionId: subId, creditsPerMonth: Number(subTx.amount || 0), lastTransactionAt: subTx.timestamp } : null;
}

// Helper: find latest known Stripe customer id from transactions metadata
async function getLatestStripeCustomer(userId) {
  const uc = await UserCredits.findOne({ userId }).lean();
  if (!uc || !Array.isArray(uc.transactions)) return null;
  const tx = [...uc.transactions]
    .filter(t => t?.metadata?.customer)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  return tx?.metadata?.customer || null;
}

// GET /api/payments/subscription - current plan and subscription status
router.get('/subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;

    // Determine if user has an active Stripe subscription
    const latest = await getLatestSubscriptionInfo(userId);
    if (latest && latest.subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(latest.subscriptionId);
        const status = sub?.status || 'unknown';
        const currentPeriodStart = sub?.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null;
        const currentPeriodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

        if (status === 'active') {
          return res.json({
            success: true,
            data: {
              planType: 'subscription',
              status,
              cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
              currentPeriodStart,
              currentPeriodEnd,
              creditsPerMonth: latest.creditsPerMonth || null,
              subscriptionId: latest.subscriptionId,
            }
          });
        }
        // If not active, fall through to PAYG/Trial determination
        logger.info('Subscription is not active; falling back to payg/trial', { userId, status });
      } catch (e) {
        // If subscription retrieval fails, fall back to PAYG/Trial determination
        logger.warn('Stripe subscription retrieval failed; falling back', { userId, error: e.message });
      }
    }

    // Fallback: check Stripe by customer if we haven't recorded a subscription transaction yet
    const customerId = await getLatestStripeCustomer(userId);
    if (customerId) {
      try {
        const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 5 });
        const chosen = (list?.data || [])
          .filter(s => ['active', 'trialing', 'past_due'].includes(s.status))
          .sort((a, b) => (b.created || 0) - (a.created || 0))[0];
        if (chosen) {
          const currentPeriodStart = chosen?.current_period_start ? new Date(chosen.current_period_start * 1000).toISOString() : null;
          const currentPeriodEnd = chosen?.current_period_end ? new Date(chosen.current_period_end * 1000).toISOString() : null;
          const creditsPerMonth = Number(chosen?.metadata?.credits || 0) || null;
          return res.json({
            success: true,
            data: {
              planType: 'subscription',
              status: chosen.status,
              cancelAtPeriodEnd: !!chosen.cancel_at_period_end,
              currentPeriodStart,
              currentPeriodEnd,
              creditsPerMonth,
              subscriptionId: chosen.id,
            }
          });
        }
      } catch (e) {
        logger.warn('Stripe customer subscription lookup failed', { userId, customerId, error: e.message });
      }
    }

    // No active subscription detected, determine if Trial or Pay-as-you-go
    const balance = await creditService.getBalance(userId);
    const uc = await UserCredits.findOne({ userId }).lean();
    const txs = Array.isArray(uc?.transactions) ? uc.transactions : [];
    const hasTrial = txs.some(t => t.type === 'trial');
    const hasPurchase = txs.some(t => t.type === 'purchase');

    const planType = hasPurchase ? 'payg' : (hasTrial ? 'trial' : 'payg');

    return res.json({
      success: true,
      data: {
        planType,
        status: planType === 'trial' ? 'active' : 'none',
        balance: balance.balance,
      }
    });
  } catch (error) {
    logger.error('Error getting subscription status', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to get subscription status' });
  }
});

// GET /api/payments/billing-history - simplified billing history (purchases, trials, refunds)
router.get('/billing-history', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const { limit = 50 } = req.query;

    const uc = await UserCredits.findOne({ userId }).lean();
    const all = Array.isArray(uc?.transactions) ? uc.transactions : [];
    const filtered = all
      .filter(t => ['purchase', 'trial', 'refund'].includes(t.type))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, Math.min(200, Number(limit) || 50))
      .map(t => ({
        type: t.type,
        amount: Math.abs(t.amount || 0),
        reference: t.reference,
        description: t.description,
        timestamp: t.timestamp,
        metadata: t.metadata || {},
      }));

    return res.json({ success: true, data: { items: filtered, total: filtered.length } });
  } catch (error) {
    logger.error('Error getting billing history', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to get billing history' });
  }
});

// GET /api/payments/invoices - list Stripe invoices for the authenticated user
router.get('/invoices', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const uc = await UserCredits.findOne({ userId }).lean();
    const allCustomers = new Set();
    if (Array.isArray(uc?.transactions)) {
      for (const t of uc.transactions) {
        const cid = t?.metadata?.customer;
        if (cid) allCustomers.add(cid);
      }
    }

    const invoiceItems = [];
    for (const cid of Array.from(allCustomers)) {
      try {
        const list = await stripe.invoices.list({ customer: cid, limit: 100 });
        for (const inv of list?.data || []) {
          invoiceItems.push({
            kind: 'invoice',
            id: inv.id,
            number: inv.number,
            status: inv.status,
            amountDue: inv.amount_due,
            currency: inv.currency,
            created: inv.created ? new Date(inv.created * 1000).toISOString() : null,
            hostedInvoiceUrl: inv.hosted_invoice_url,
            invoicePdf: inv.invoice_pdf,
          });
        }
      } catch (e) {
        logger.warn('Failed to list invoices for customer', { customer: cid, error: e.message });
      }
    }

    // Include receipts for one-time Checkout payments (no invoice)
    const receiptItems = [];
    if (Array.isArray(uc?.transactions)) {
      const sessionIds = new Set(
        uc.transactions
          .filter(t => t?.type === 'purchase' && t?.metadata?.checkoutSessionId)
          .map(t => t.metadata.checkoutSessionId)
      );
      for (const sid of Array.from(sessionIds)) {
        try {
          const session = await stripe.checkout.sessions.retrieve(sid);
          const piId = session?.payment_intent;
          if (!piId) continue;
          // Expand latest_charge to reliably access receipt_url
          const pi = await stripe.paymentIntents.retrieve(
            typeof piId === 'string' ? piId : piId.id,
            { expand: ['latest_charge'] }
          );
          let receiptUrl = (pi && pi.latest_charge && pi.latest_charge.receipt_url) ? pi.latest_charge.receipt_url : null;
          if (!receiptUrl && Array.isArray(pi?.charges?.data) && pi.charges.data[0]) {
            receiptUrl = pi.charges.data[0].receipt_url || null;
          }
          if (!receiptUrl) {
            // Fallback: fetch charges explicitly
            try {
              const charges = await stripe.charges.list({ payment_intent: typeof piId === 'string' ? piId : piId.id, limit: 1 });
              receiptUrl = charges?.data?.[0]?.receipt_url || null;
            } catch (e) { /* ignore */ }
          }
          const friendlyNumber = `PAY-${(typeof piId === 'string' ? piId : piId.id).slice(-8)}`;
          receiptItems.push({
            kind: 'receipt',
            id: typeof piId === 'string' ? piId : piId.id,
            number: friendlyNumber,
            status: session?.payment_status || 'paid',
            amountDue: session?.amount_total ?? null,
            currency: session?.currency || 'usd',
            created: session?.created ? new Date(session.created * 1000).toISOString() : null,
            hostedInvoiceUrl: receiptUrl,
            invoicePdf: null,
          });
        } catch (e) {
          // ignore failures for old sessions
        }
      }
    }

    const combined = [...invoiceItems, ...receiptItems]
      .sort((a, b) => new Date(b.created || 0) - new Date(a.created || 0));
    return res.json({ success: true, data: combined });
  } catch (error) {
    logger.error('Error fetching invoices', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to list invoices' });
  }
});

// POST /api/payments/cancel-subscription - schedule cancellation at period end
router.post('/cancel-subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const latest = await getLatestSubscriptionInfo(userId);
    if (!latest?.subscriptionId) {
      return res.status(404).json({ success: false, message: 'No subscription found' });
    }

    const updated = await stripe.subscriptions.update(latest.subscriptionId, { cancel_at_period_end: true });
    return res.json({
      success: true,
      data: {
        subscriptionId: updated.id,
        status: updated.status,
        cancelAtPeriodEnd: !!updated.cancel_at_period_end,
        currentPeriodEnd: updated?.current_period_end ? new Date(updated.current_period_end * 1000).toISOString() : null,
      }
    });
  } catch (error) {
    logger.error('Error canceling subscription', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
  }
});

// POST /api/payments/resume-subscription - undo cancel at period end
router.post('/resume-subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const latest = await getLatestSubscriptionInfo(userId);
    if (!latest?.subscriptionId) {
      const customerId = await getLatestStripeCustomer(userId);
      if (customerId) {
        const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 5 });
        const chosen = (list?.data || []).sort((a, b) => (b.created || 0) - (a.created || 0))[0];
        if (chosen) {
          latest.subscriptionId = chosen.id;
        }
      }
    }
    if (!latest?.subscriptionId) {
      return res.status(404).json({ success: false, message: 'No subscription found' });
    }

    const updated = await stripe.subscriptions.update(latest.subscriptionId, { cancel_at_period_end: false });
    return res.json({ success: true, data: { subscriptionId: updated.id, status: updated.status, cancelAtPeriodEnd: !!updated.cancel_at_period_end } });
  } catch (error) {
    logger.error('Error resuming subscription', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to resume subscription' });
  }
});

// POST /api/payments/cancel-subscription-now - cancel immediately
router.post('/cancel-subscription-now', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const latest = await getLatestSubscriptionInfo(userId);
    if (!latest?.subscriptionId) {
      // Try by customer fallback
      const customerId = await getLatestStripeCustomer(userId);
      if (customerId) {
        const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 5 });
        const chosen = (list?.data || []).sort((a, b) => (b.created || 0) - (a.created || 0))[0];
        if (chosen) {
          latest.subscriptionId = chosen.id;
        }
      }
    }
    if (!latest?.subscriptionId) {
      return res.status(404).json({ success: false, message: 'No subscription found' });
    }

    const canceled = await stripe.subscriptions.cancel(latest.subscriptionId);
    // Optional: mark linkage as inactive
    try {
      await UserCredits.updateOne({ userId }, { $set: { lastSubscriptionId: null } });
    } catch (e) {}

    return res.json({ success: true, data: { subscriptionId: canceled.id, status: canceled.status } });
  } catch (error) {
    logger.error('Error canceling subscription immediately', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
  }
});

// POST /api/payments/create-billing-portal-session - returns Stripe Billing Portal URL
router.post('/create-billing-portal-session', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId;
    const customerId = await getLatestStripeCustomer(userId);
    if (!customerId) {
      return res.status(404).json({ success: false, message: 'No Stripe customer found' });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${FRONTEND_URL}/subscription`,
    });
    return res.json({ success: true, url: portal.url });
  } catch (error) {
    logger.error('Error creating billing portal session', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to create billing portal session' });
  }
});

