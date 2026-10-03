import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { requireAuth, AuthenticatedRequest } from '../auth';
import type { License, Subscription, Notification } from '../../src/types';

const router = Router();

// Helper to generate cryptographically secure formatted license keys
export function generateLicenseKey(prefix = 'LIMA'): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const segment = (len = 4) => {
    const bytes = crypto.randomBytes(len);
    let s = '';
    for (let i = 0; i < len; i++) {
      s += chars[bytes[i] % chars.length];
    }
    return s;
  };
  return `${prefix}-${segment(4)}-${segment(4)}`;
}

// GET /api/licenses/my
router.get('/my', requireAuth, (req: AuthenticatedRequest, res) => {
  const license = db.getLicenseByUserId(req.user!.id) || null;
  const subscription = db.getSubscriptionByUserId(req.user!.id) || null;
  return res.json({ license, subscription });
});

// POST /api/licenses/redeem
router.post('/redeem', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const rawCode = (req.body.code || '').trim().toUpperCase();

  if (!rawCode) {
    return res.status(400).json({ error: 'Please enter a License or Free Pass code.' });
  }

  // 1. Check if it's a Friend Pass Code
  const freePass = db.getFreePassCode(rawCode);
  if (freePass) {
    if (freePass.status === 'REVOKED') {
      return res.status(400).json({ error: 'This license/pass has been revoked.' });
    }
    if (freePass.status === 'EXPIRED') {
      return res.status(400).json({ error: 'This license/pass has expired.' });
    }
    if (freePass.status === 'USED' || freePass.redeemed_by) {
      return res.status(400).json({ error: 'This code has already been redeemed and cannot be reused.' });
    }

    // Activate 30-Day Premium access for user with accurate extension calculation
    const now = new Date();
    const existingSub = db.getSubscriptionByUserId(user.id);
    const baseDate =
      existingSub &&
      existingSub.status === 'ACTIVE' &&
      existingSub.expires_at &&
      new Date(existingSub.expires_at) > now
        ? new Date(existingSub.expires_at)
        : now;
    const expiry = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Update code record
    db.updateFreePassCode(freePass.id, {
      status: 'USED',
      redeemed_by: user.id,
      redeemed_by_email: user.email,
      redeemed_at: now.toISOString(),
      expires_at: expiry.toISOString(),
    });

    // Update / insert user subscription
    const sub: Subscription = {
      id: existingSub?.id || `sub_${user.id}`,
      user_id: user.id,
      plan: 'MONTHLY',
      status: 'ACTIVE',
      started_at: existingSub && new Date(existingSub.expires_at || '') > now ? existingSub.started_at : now.toISOString(),
      expires_at: expiry.toISOString(),
    };
    db.insertSubscription(sub);

    // Instantly unlock Pro mode & unlimited video generation
    db.updateUser(user.id, {
      credits: 9999,
      demo_used: true,
    });

    // Insert license record for user
    const license: License = {
      id: `lic_${Date.now()}_${crypto.randomUUID()}`,
      license_key: freePass.code,
      user_id: user.id,
      plan: 'MONTHLY',
      license_type: 'FRIEND_PASS',
      status: 'ACTIVE',
      created_at: freePass.created_at,
      activated_at: now.toISOString(),
      expires_at: expiry.toISOString(),
      payment_id: null,
    };
    db.insertLicense(license);

    // Notification
    const notif: Notification = {
      id: `notif_${Date.now()}_${crypto.randomUUID()}`,
      user_id: user.id,
      title: 'Friend Pass Activated!',
      message: `You successfully activated Friend Pass code ${freePass.code}. Enjoy 30 days of full Premium access!`,
      type: 'success',
      read: false,
      created_at: now.toISOString(),
    };
    db.insertNotification(notif);

    return res.json({
      success: true,
      message: 'Friend Pass activated! You now have 30 days of full premium access.',
      subscription: sub,
      license,
    });
  }

  // 2. Check if it's an existing generated paid License Key
  const license = db.getLicenseByKey(rawCode);
  if (license) {
    if (license.status === 'REVOKED') {
      return res.status(400).json({ error: 'This license/pass has been revoked.' });
    }
    if (license.status === 'EXPIRED') {
      return res.status(400).json({ error: 'This license/pass has expired.' });
    }

    // Reject license if already bound to another user or already activated
    if (license.activated_at && license.user_id && license.user_id !== user.id) {
      return res.status(400).json({ error: 'This license key has already been redeemed and is bound to another account.' });
    }
    if (license.status === 'ACTIVE' && license.activated_at) {
      return res.status(400).json({ error: 'This license key is already active and cannot be re-redeemed.' });
    }

    // Activate license with accurate subscription extension calculation
    const now = new Date();
    const durationDays = license.duration_days || (license.plan === 'YEARLY' ? 365 : 30);
    const existingSub = db.getSubscriptionByUserId(user.id);
    const baseDate =
      existingSub &&
      existingSub.status === 'ACTIVE' &&
      existingSub.expires_at &&
      new Date(existingSub.expires_at) > now
        ? new Date(existingSub.expires_at)
        : now;
    const expiry = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    db.updateLicense(license.id, {
      user_id: user.id,
      status: 'ACTIVE',
      activated_at: now.toISOString(),
      expires_at: expiry.toISOString(),
    });

    const sub: Subscription = {
      id: existingSub?.id || `sub_${user.id}`,
      user_id: user.id,
      plan: license.plan,
      status: 'ACTIVE',
      started_at: existingSub && new Date(existingSub.expires_at || '') > now ? existingSub.started_at : now.toISOString(),
      expires_at: expiry.toISOString(),
    };
    db.insertSubscription(sub);

    // Instantly unlock Pro mode & unlimited video generation
    db.updateUser(user.id, {
      credits: 9999,
      demo_used: true,
    });

    // In-app Notification
    const notif: Notification = {
      id: `notif_${Date.now()}_${crypto.randomUUID()}`,
      user_id: user.id,
      title: 'Pro Mode Unlocked!',
      message: `License key ${license.license_key} was successfully redeemed. Your ${license.plan} Pro subscription is now active for ${durationDays} days.`,
      type: 'success',
      read: false,
      created_at: now.toISOString(),
    };
    db.insertNotification(notif);

    return res.json({
      success: true,
      message: `License key activated! Pro mode unlocked for ${durationDays} days.`,
      subscription: sub,
      license: {
        ...license,
        status: 'ACTIVE',
        user_id: user.id,
        activated_at: now.toISOString(),
        expires_at: expiry.toISOString(),
      },
    });
  }

  return res.status(404).json({ error: 'Invalid license or Friend Pass code. Please double-check and try again.' });
});

export default router;
