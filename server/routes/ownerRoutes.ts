import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { requireOwner, requireAdminOrOwner, hashPassword, AuthenticatedRequest } from '../auth';
import { generateLicenseKey } from './licenseRoutes';
import type {
  User,
  Subscription,
  License,
  FreePassCode,
  Notification,
  PaymentMethodConfig,
  PlanType,
} from '../../src/types';

const router = Router();

// Protect ALL routes in this file with owner or admin authorization
router.use(requireAdminOrOwner());

// GET /api/owner/metrics
router.get('/metrics', (req, res) => {
  const users = db.getUsers();
  const subscriptions = db.getSubscriptions();
  const payments = db.getPayments();
  const licenses = db.getLicenses();
  const freePasses = db.getFreePassCodes();
  const projects = db.getProjects();
  const clips = db.getClips();
  const jobs = db.getJobs();

  const now = new Date();

  // User & Sub stats
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === 'ACTIVE').length;
  const suspendedUsers = users.filter((u) => u.status === 'SUSPENDED').length;
  const demoUsers = users.filter((u) => u.role === 'USER' && !u.demo_used).length;

  const monthlySubs = subscriptions.filter(
    (s) => s.plan === 'MONTHLY' && s.status === 'ACTIVE' && (s.expires_at == null || new Date(s.expires_at) > now)
  ).length;

  const yearlySubs = subscriptions.filter(
    (s) => s.plan === 'YEARLY' && s.status === 'ACTIVE' && (s.expires_at == null || new Date(s.expires_at) > now)
  ).length;

  const expiredSubs = subscriptions.filter(
    (s) => s.status === 'EXPIRED' || (s.expires_at && new Date(s.expires_at) <= now)
  ).length;

  // Payments
  const pendingPayments = payments.filter((p) => p.status === 'PENDING').length;
  const approvedPayments = payments.filter((p) => p.status === 'APPROVED').length;
  const rejectedPayments = payments.filter((p) => p.status === 'REJECTED').length;
  const totalRevenue = payments
    .filter((p) => p.status === 'APPROVED')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  // Licenses
  const activeLicenses = licenses.filter((l) => l.status === 'ACTIVE').length;
  const expiredLicenses = licenses.filter((l) => l.status === 'EXPIRED').length;

  // Free Passes
  const freePassTotal = freePasses.length;
  const freePassUnused = freePasses.filter((f) => f.status === 'UNUSED').length;
  const freePassUsed = freePasses.filter((f) => f.status === 'USED').length;
  const freePassRevoked = freePasses.filter((f) => f.status === 'REVOKED').length;

  // Jobs
  const activeJobs = jobs.filter((j) => !['COMPLETED', 'FAILED'].includes(j.status)).length;
  const failedJobs = jobs.filter((j) => j.status === 'FAILED').length;
  const completedJobs = jobs.filter((j) => j.status === 'COMPLETED').length;

  return res.json({
    metrics: {
      totalUsers,
      activeUsers,
      suspendedUsers,
      demoUsers,
      monthlySubs,
      yearlySubs,
      expiredSubs,
      pendingPayments,
      approvedPayments,
      rejectedPayments,
      totalRevenue,
      activeLicenses,
      expiredLicenses,
      freePassTotal,
      freePassUnused,
      freePassUsed,
      freePassRevoked,
      totalProjects: projects.length,
      totalClips: clips.length,
      activeJobs,
      failedJobs,
      completedJobs,
    },
    recentUsers: users.slice(-5).reverse(),
    recentPayments: payments.slice(0, 5),
    recentJobs: jobs.slice(0, 5),
  });
});

// GET /api/owner/users
router.get('/users', (req, res) => {
  const users = db.getUsers();
  const subscriptions = db.getSubscriptions();
  const licenses = db.getLicenses();

  const enriched = users.map((u) => {
    const sub = subscriptions.find((s) => s.user_id === u.id);
    const lic = licenses.find((l) => l.user_id === u.id);
    return {
      ...u,
      subscription: sub || null,
      license: lic || null,
    };
  });

  return res.json({ users: enriched });
});

// PATCH /api/owner/users/:id
router.patch('/users/:id', requireOwner, (req, res) => {
  const user = db.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const { status, role, demo_used, subscription_plan, extend_days } = req.body;

  const updates: Partial<User> = {};
  if (status && ['ACTIVE', 'SUSPENDED'].includes(status)) updates.status = status;
  if (role && ['USER', 'ADMIN', 'OWNER'].includes(role)) updates.role = role;
  if (demo_used !== undefined) updates.demo_used = Boolean(demo_used);

  const updatedUser = db.updateUser(user.id, updates);

  // Extend or update subscription
  if (subscription_plan || extend_days) {
    const currentSub = db.getSubscriptionByUserId(user.id);
    const now = new Date();
    let expiresAt = currentSub?.expires_at ? new Date(currentSub.expires_at) : now;
    if (expiresAt < now) expiresAt = now;

    if (extend_days && Number(extend_days) > 0) {
      expiresAt = new Date(expiresAt.getTime() + Number(extend_days) * 24 * 60 * 60 * 1000);
    }

    const newSub: Subscription = {
      id: currentSub?.id || `sub_${user.id}`,
      user_id: user.id,
      plan: subscription_plan || currentSub?.plan || 'MONTHLY',
      status: 'ACTIVE',
      started_at: currentSub?.started_at || now.toISOString(),
      expires_at: subscription_plan === 'OWNER_LIFETIME' ? null : expiresAt.toISOString(),
    };
    db.insertSubscription(newSub);
  }

  return res.json({ user: updatedUser, message: 'User updated successfully.' });
});

// DELETE /api/owner/users/:id
router.delete('/users/:id', requireOwner, (req, res) => {
  const user = db.getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (user.role === 'OWNER') {
    return res.status(400).json({ error: 'Cannot delete the system Owner account.' });
  }

  db.deleteUser(user.id);
  return res.json({ success: true, message: 'User deleted.' });
});

// GET /api/owner/payments
router.get('/payments', (req, res) => {
  const payments = db.getPayments();
  return res.json({ payments });
});

// POST /api/owner/payments/:id/approve
router.post('/payments/:id/approve', requireOwner, (req: AuthenticatedRequest, res) => {
  const payment = db.getPaymentById(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });

  // SECURITY & BILLING FIX: Restrict payment approvals strictly to PENDING state
  if (payment.status !== 'PENDING') {
    return res.status(400).json({
      error: `Payment cannot be approved because its current status is "${payment.status}". Only payments in PENDING state can be approved.`,
    });
  }

  const now = new Date();
  const settings = db.getSettings();
  const durationDays = payment.plan === 'YEARLY' ? settings.pricing_yearly_duration : settings.pricing_monthly_duration;

  // BILLING FIX: Calculate subscription extension accurately from existing expiry if currently active
  const existingSub = db.getSubscriptionByUserId(payment.user_id);
  const baseDate =
    existingSub &&
    existingSub.status === 'ACTIVE' &&
    existingSub.expires_at &&
    new Date(existingSub.expires_at) > now
      ? new Date(existingSub.expires_at)
      : now;
  const expiry = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // Generate unique license key
  const prefix = payment.plan === 'YEARLY' ? 'YEAR' : 'LIMA';
  const licenseKey = generateLicenseKey(prefix);

  const license: License = {
    id: `lic_${Date.now()}_${crypto.randomUUID()}`,
    license_key: licenseKey,
    user_id: payment.user_id,
    plan: payment.plan,
    license_type: 'PURCHASED',
    status: 'ACTIVE',
    created_at: now.toISOString(),
    activated_at: now.toISOString(),
    expires_at: expiry.toISOString(),
    payment_id: payment.id,
  };
  db.insertLicense(license);

  // Update Subscription preserving initial started_at if extending active subscription
  const sub: Subscription = {
    id: existingSub?.id || `sub_${payment.user_id}`,
    user_id: payment.user_id,
    plan: payment.plan,
    status: 'ACTIVE',
    started_at: existingSub && existingSub.expires_at && new Date(existingSub.expires_at) > now ? existingSub.started_at : now.toISOString(),
    expires_at: expiry.toISOString(),
  };
  db.insertSubscription(sub);

  // Update Payment record
  const updatedPayment = db.updatePayment(payment.id, {
    status: 'APPROVED',
    reviewed_at: now.toISOString(),
    reviewed_by: req.user!.email,
    rejection_reason: null,
  });

  // Send in-app notification
  const notif: Notification = {
    id: `notif_${Date.now()}_${crypto.randomUUID()}`,
    user_id: payment.user_id,
    title: 'Payment Approved! Subscription Activated',
    message: `Your payment of $${payment.amount} for ${payment.plan} plan has been approved. License: ${licenseKey}. Valid for ${durationDays} days.`,
    type: 'success',
    read: false,
    created_at: now.toISOString(),
  };
  db.insertNotification(notif);

  return res.json({
    payment: updatedPayment,
    license,
    subscription: sub,
    message: `Payment approved! License ${licenseKey} issued and subscription activated for ${durationDays} days.`,
  });
});

// POST /api/owner/payments/:id/reject
router.post('/payments/:id/reject', requireOwner, (req: AuthenticatedRequest, res) => {
  const payment = db.getPaymentById(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });

  // SECURITY & BILLING FIX: Restrict payment rejections strictly to PENDING state
  if (payment.status !== 'PENDING') {
    return res.status(400).json({
      error: `Payment cannot be rejected because its current status is "${payment.status}". Only payments in PENDING state can be rejected.`,
    });
  }

  const reason = (req.body.rejection_reason || 'Transaction could not be verified on the specified account.').trim();

  const now = new Date();
  const updatedPayment = db.updatePayment(payment.id, {
    status: 'REJECTED',
    reviewed_at: now.toISOString(),
    reviewed_by: req.user!.email,
    rejection_reason: reason,
  });

  // Notify user
  const notif: Notification = {
    id: `notif_${Date.now()}_${crypto.randomUUID()}`,
    user_id: payment.user_id,
    title: 'Payment Rejected',
    message: `Your payment verification request (Trx: ${payment.transaction_id}) was rejected: "${reason}". Please verify payment details and re-submit.`,
    type: 'error',
    read: false,
    created_at: now.toISOString(),
  };
  db.insertNotification(notif);

  return res.json({ payment: updatedPayment, message: 'Payment marked as rejected.' });
});

// GET /api/owner/licenses
router.get('/licenses', (req, res) => {
  const licenses = db.getLicenses().map((lic) => {
    if (lic.user_id) {
      const u = db.getUserById(lic.user_id);
      return {
        ...lic,
        user_email: u?.email || null,
        user_name: u?.name || null,
      };
    }
    return lic;
  });
  return res.json({ licenses });
});

// POST /api/owner/licenses/generate
// Allows Owner to generate standalone redeemable license keys for ANY custom number of days
router.post('/licenses/generate', requireOwner, (req, res) => {
  const { plan = 'MONTHLY', duration_days } = req.body;
  const customDays = Math.max(1, parseInt(String(duration_days || (plan === 'YEARLY' ? 365 : 30)), 10) || 30);
  const validPlan: PlanType = customDays >= 365 || plan === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  
  // Prefix formatting: 'YEAR' for 365 days, 'LIMA' for 30 days, or 'PRO' for custom days
  const prefix = customDays === 365 ? 'YEAR' : customDays === 30 ? 'LIMA' : `PRO${customDays}`.slice(0, 5);
  const key = generateLicenseKey(prefix);

  const newLicense: License = {
    id: `lic_${Date.now()}_${crypto.randomUUID()}`,
    license_key: key,
    user_id: '',
    plan: validPlan,
    duration_days: customDays,
    license_type: 'PURCHASED',
    status: 'PENDING',
    created_at: new Date().toISOString(),
    activated_at: '',
    expires_at: null,
    payment_id: null,
  };

  db.insertLicense(newLicense);
  return res.status(201).json({
    license: newLicense,
    message: `License key ${key} generated successfully (${customDays} days Pro).`,
  });
});

// DELETE /api/owner/licenses/:id
// Completely deletes license and instantly revokes user's Pro status if currently active
router.delete('/licenses/:id', requireOwner, (req, res) => {
  const license = db.getLicenseById(req.params.id);
  if (!license) return res.status(404).json({ error: 'License key not found.' });

  // If bound to a user, revoke active Pro status and restore paywall
  if (license.user_id) {
    const userSub = db.getSubscriptionByUserId(license.user_id);
    if (userSub) {
      db.updateSubscription(userSub.id, {
        status: 'CANCELLED',
        expires_at: new Date().toISOString(),
      });
    }

    // Instantly reset user credits to 0 and mark demo_used = true (restoring paywall)
    db.updateUser(license.user_id, {
      credits: 0,
      demo_used: true,
    });

    // Notify the user in-app
    const notif: Notification = {
      id: `notif_${Date.now()}_${crypto.randomUUID()}`,
      user_id: license.user_id,
      title: 'License Key Revoked',
      message: `Your license key (${license.license_key}) has been deleted by the administrator. Pro access has ended.`,
      type: 'error',
      read: false,
      created_at: new Date().toISOString(),
    };
    db.insertNotification(notif);
  }

  db.deleteLicense(license.id);

  return res.json({
    success: true,
    message: `License key ${license.license_key} was deleted successfully.${license.user_id ? ' Bound user Pro access revoked.' : ''}`,
  });
});

// POST /api/owner/licenses/:id/revoke
// Marks license as REVOKED and revokes user Pro status immediately
router.post('/licenses/:id/revoke', requireOwner, (req, res) => {
  const license = db.getLicenseById(req.params.id);
  if (!license) return res.status(404).json({ error: 'License key not found.' });

  if (license.user_id) {
    const userSub = db.getSubscriptionByUserId(license.user_id);
    if (userSub) {
      db.updateSubscription(userSub.id, {
        status: 'CANCELLED',
        expires_at: new Date().toISOString(),
      });
    }

    db.updateUser(license.user_id, {
      credits: 0,
      demo_used: true,
    });

    const notif: Notification = {
      id: `notif_${Date.now()}_${crypto.randomUUID()}`,
      user_id: license.user_id,
      title: 'License Key Revoked',
      message: `Your license key (${license.license_key}) has been revoked by the administrator. Pro access has ended.`,
      type: 'error',
      read: false,
      created_at: new Date().toISOString(),
    };
    db.insertNotification(notif);
  }

  const updated = db.updateLicense(license.id, { status: 'REVOKED' });

  return res.json({
    success: true,
    license: updated,
    message: `License key ${license.license_key} has been revoked.`,
  });
});

// PATCH /api/owner/licenses/:id
router.patch('/licenses/:id', requireOwner, (req, res) => {
  const license = db.getLicenseById(req.params.id);
  if (!license) return res.status(404).json({ error: 'License not found.' });

  const { status, extend_days } = req.body;
  const updates: Partial<License> = {};

  if (status && ['ACTIVE', 'EXPIRED', 'REVOKED'].includes(status)) {
    updates.status = status;
    if (status === 'REVOKED' && license.user_id) {
      const userSub = db.getSubscriptionByUserId(license.user_id);
      if (userSub) {
        db.updateSubscription(userSub.id, {
          status: 'CANCELLED',
          expires_at: new Date().toISOString(),
        });
      }
      db.updateUser(license.user_id, {
        credits: 0,
        demo_used: true,
      });
    }
  }

  if (extend_days && Number(extend_days) > 0) {
    const now = new Date();
    let currentExpiry = license.expires_at ? new Date(license.expires_at) : now;
    if (currentExpiry < now) currentExpiry = now;
    const newExpiry = new Date(currentExpiry.getTime() + Number(extend_days) * 24 * 60 * 60 * 1000);
    updates.expires_at = newExpiry.toISOString();

    // Also sync with bound user's subscription if applicable
    if (license.user_id) {
      const userSub = db.getSubscriptionByUserId(license.user_id);
      if (userSub) {
        db.insertSubscription({
          ...userSub,
          status: 'ACTIVE',
          expires_at: newExpiry.toISOString(),
        });
      }
    }
  }

  const updated = db.updateLicense(license.id, updates);
  return res.json({ license: updated, message: 'License updated successfully.' });
});

// POST /api/owner/free-passes/generate
router.post('/free-passes/generate', requireOwner, (req: AuthenticatedRequest, res) => {
  const quantity = Math.min(100, Math.max(1, Number(req.body.quantity) || 5));
  const newCodes: FreePassCode[] = [];
  const now = new Date();

  for (let i = 0; i < quantity; i++) {
    const code = generateLicenseKey('FRIEND');
    newCodes.push({
      id: `pass_${Date.now()}_${i}_${crypto.randomUUID()}`,
      code,
      type: 'FRIEND_PASS_30_DAYS',
      status: 'UNUSED',
      created_by: req.user!.email,
      created_at: now.toISOString(),
      redeemed_by: null,
      redeemed_at: null,
      expires_at: null,
      revoked_at: null,
    });
  }

  db.insertFreePassCodes(newCodes);

  return res.status(201).json({
    codes: newCodes,
    message: `Generated ${newCodes.length} unique Friend Pass codes.`,
  });
});

// GET /api/owner/free-passes
router.get('/free-passes', (req, res) => {
  const codes = db.getFreePassCodes();
  return res.json({ codes });
});

// POST /api/owner/free-passes/:id/revoke
router.post('/free-passes/:id/revoke', requireOwner, (req, res) => {
  const pass = db.getFreePassCodes().find((p) => p.id === req.params.id);
  if (!pass) return res.status(404).json({ error: 'Code not found.' });

  const updated = db.updateFreePassCode(pass.id, {
    status: 'REVOKED',
    revoked_at: new Date().toISOString(),
  });

  return res.json({ code: updated, message: 'Code has been revoked.' });
});

// GET & POST /api/owner/pricing
router.get('/pricing', (req, res) => {
  const settings = db.getSettings();
  return res.json({
    pricing_monthly_amount: settings.pricing_monthly_amount,
    pricing_monthly_duration: settings.pricing_monthly_duration,
    pricing_yearly_amount: settings.pricing_yearly_amount,
    pricing_yearly_duration: settings.pricing_yearly_duration,
    demo_max_projects: settings.demo_max_projects,
    demo_max_video_duration_minutes: settings.demo_max_video_duration_minutes,
    demo_max_clips: settings.demo_max_clips,
    max_upload_size_mb: settings.max_upload_size_mb,
  });
});

router.post('/pricing', requireOwner, (req, res) => {
  const {
    pricing_monthly_amount,
    pricing_monthly_duration,
    pricing_yearly_amount,
    pricing_yearly_duration,
    demo_max_projects,
    demo_max_video_duration_minutes,
    demo_max_clips,
    max_upload_size_mb,
  } = req.body;

  const updated = db.updateSettings({
    pricing_monthly_amount: Number(pricing_monthly_amount) || 10,
    pricing_monthly_duration: Number(pricing_monthly_duration) || 30,
    pricing_yearly_amount: Number(pricing_yearly_amount) || 50,
    pricing_yearly_duration: Number(pricing_yearly_duration) || 365,
    demo_max_projects: Number(demo_max_projects) || 1,
    demo_max_video_duration_minutes: Number(demo_max_video_duration_minutes) || 5,
    demo_max_clips: Number(demo_max_clips) || 3,
    max_upload_size_mb: Number(max_upload_size_mb) || 500,
  });

  return res.json({ settings: updated, message: 'Pricing and demo limits updated.' });
});

// GET & POST /api/owner/payment-settings
router.get('/payment-settings', (req, res) => {
  const settings = db.getPaymentSettings();
  return res.json({ settings });
});

router.post('/payment-settings', requireOwner, (req, res) => {
  const updated = db.updatePaymentSettings(req.body);
  return res.json({ settings: updated, message: 'Payment settings and pricing updated successfully.' });
});

// GET & POST /api/owner/payment-methods
router.get('/payment-methods', (req, res) => {
  const settings = db.getSettings();
  return res.json({ methods: settings.payment_methods || [] });
});

router.post('/payment-methods', requireOwner, (req, res) => {
  const { methods } = req.body;
  if (!Array.isArray(methods)) {
    return res.status(400).json({ error: 'Methods array required.' });
  }

  const updated = db.updateSettings({ payment_methods: methods });
  return res.json({ methods: updated.payment_methods, message: 'Payment methods updated.' });
});

// GET & POST /api/owner/settings
router.get('/settings', (req, res) => {
  const settings = db.getSettings();
  return res.json({ settings });
});

router.post('/settings', requireOwner, (req, res) => {
  const { app_name, support_email } = req.body;
  const updated = db.updateSettings({
    app_name: app_name || 'AI SHORTS MAKER',
    support_email: support_email || 'support@aishortsmaker.com',
  });
  return res.json({ settings: updated, message: 'Settings saved successfully.' });
});

// GET & POST /api/owner/admins
router.get('/admins', requireOwner, (req, res) => {
  const users = db.getUsers().filter((u) => u.role === 'ADMIN');
  const enriched = users.map((u) => ({
    ...u,
    permissions: db.getAdminPermissions(u.id),
  }));
  return res.json({ admins: enriched });
});

router.post('/admins', requireOwner, async (req, res) => {
  const { name, email, password, permissions } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (db.getUserByEmail(cleanEmail)) {
    return res.status(400).json({ error: 'A user with this email already exists.' });
  }

  const userId = `adm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const passwordHash = await hashPassword(password);

  const newAdmin: User = {
    id: userId,
    name: name.trim(),
    email: cleanEmail,
    role: 'ADMIN',
    status: 'ACTIVE',
    demo_used: true,
    credits: 9999,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.insertUser(newAdmin, passwordHash);
  db.setAdminPermissions(userId, Array.isArray(permissions) ? permissions : ['users', 'payments', 'licenses']);

  return res.status(201).json({
    admin: { ...newAdmin, permissions: db.getAdminPermissions(userId) },
    message: 'Admin account created successfully.',
  });
});

// GET /api/owner/jobs
router.get('/jobs', (req, res) => {
  const jobs = db.getJobs();
  return res.json({ jobs });
});

export default router;
