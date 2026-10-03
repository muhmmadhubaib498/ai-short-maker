import { Router } from 'express';
import { db } from '../db';
import { requireAuth, AuthenticatedRequest } from '../auth';
import type { Payment, Notification } from '../../src/types';

const router = Router();

// GET /api/payments/settings
// Public / User accessible - returns dynamic pricing in USD/PKR, payment methods & account info
router.get('/settings', (req, res) => {
  const paymentSettings = db.getPaymentSettings();
  const settings = db.getSettings();
  const enabled = (settings.payment_methods || []).filter((m) => m.enabled);
  return res.json({
    settings: paymentSettings,
    methods: enabled,
  });
});

// GET /api/payments/methods
// Public/User accessible - returns only enabled payment methods
router.get('/methods', (req, res) => {
  const settings = db.getSettings();
  const enabled = (settings.payment_methods || []).filter((m) => m.enabled);
  return res.json({ methods: enabled });
});

// GET /api/payments/my
router.get('/my', requireAuth, (req: AuthenticatedRequest, res) => {
  const payments = db.getPaymentsByUserId(req.user!.id);
  return res.json({ payments });
});

// POST /api/payments/submit
router.post('/submit', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const { plan, payment_method, transaction_id } = req.body;

  if (!plan || !payment_method || !transaction_id) {
    return res.status(400).json({ error: 'Plan, payment method, and transaction ID are required.' });
  }

  if (plan !== 'MONTHLY' && plan !== 'YEARLY') {
    return res.status(400).json({ error: 'Invalid plan selected. Choose MONTHLY or YEARLY.' });
  }

  const cleanTrxId = String(transaction_id).trim();
  if (cleanTrxId.length < 4) {
    return res.status(400).json({ error: 'Please enter a valid Transaction/Reference ID.' });
  }

  // Prevent duplicate pending transaction IDs
  const existingPending = db.getPayments().find(
    (p) => p.transaction_id.toLowerCase() === cleanTrxId.toLowerCase() && p.status === 'PENDING'
  );
  if (existingPending) {
    return res.status(400).json({
      error: 'A pending payment verification request with this Transaction ID is already under review.',
    });
  }

  const settings = db.getSettings();
  const paymentSettings = db.getPaymentSettings();

  // Validate payment methods server-side against configured enabled methods or dynamic methods
  const enabledMethods = (settings.payment_methods || []).filter((m) => m.enabled);
  let matchedName = String(payment_method).trim();
  const matchedMethod = enabledMethods.find(
    (m) =>
      m.id.toLowerCase() === matchedName.toLowerCase() ||
      m.name.toLowerCase() === matchedName.toLowerCase() ||
      matchedName.toLowerCase().includes(m.name.toLowerCase())
  );
  if (matchedMethod) {
    matchedName = matchedMethod.name;
  } else {
    // Check supported dynamic multi-payment channels
    const lower = matchedName.toLowerCase();
    if (lower.includes('easypaisa')) matchedName = 'Easypaisa';
    else if (lower.includes('jazzcash')) matchedName = 'JazzCash';
    else if (lower.includes('bank') || lower.includes('meezan') || lower.includes('hbl') || lower.includes('iban')) matchedName = 'Bank Transfer';
    else if (lower.includes('paypal')) matchedName = 'PayPal';
    else if (lower.includes('payoneer')) matchedName = 'Payoneer';
    else if (lower.includes('card') || lower.includes('stripe') || lower.includes('visa') || lower.includes('mastercard')) matchedName = 'Card Payment';
    else {
      return res.status(400).json({
        error: 'Invalid or unsupported payment method. Please select an active payment method from the available list.',
      });
    }
  }

  const amount = plan === 'MONTHLY' ? paymentSettings.pricing_monthly_usd : paymentSettings.pricing_yearly_usd;

  const payment: Payment = {
    id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    plan,
    amount,
    currency: 'USD',
    payment_method: matchedName,
    transaction_id: cleanTrxId,
    status: 'PENDING',
    created_at: new Date().toISOString(),
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
  };

  db.insertPayment(payment);

  // Send in-app notification to user
  const notif: Notification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    user_id: user.id,
    title: 'Payment Submitted (Pending Review)',
    message: `Your payment of $${amount} for ${plan} plan (Trx: ${cleanTrxId}) has been submitted. Our team will verify and activate your license shortly.`,
    type: 'info',
    read: false,
    created_at: new Date().toISOString(),
  };
  db.insertNotification(notif);

  return res.status(201).json({
    payment,
    message: 'Payment request submitted successfully. It will be reviewed by the Owner/Admin shortly.',
  });
});

export default router;
