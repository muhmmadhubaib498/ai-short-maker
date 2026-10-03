import { Router } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { db } from '../db';
import {
  hashPassword,
  comparePassword,
  generateToken,
  isOwnerEmail,
  syncOwnerPrivileges,
  requireAuth,
  AuthenticatedRequest,
} from '../auth';
import type { User, Subscription } from '../../src/types';

// Initialize Firebase Admin SDK for server-side ID token verification
if (!getApps().length) {
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  });
}

const router = Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    // SECURITY FIX: Block registration with OWNER_EMAIL via public signup
    if (isOwnerEmail(cleanEmail)) {
      return res.status(403).json({
        error: 'Public registration with the owner email address is strictly blocked. Please sign in using Google authentication.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existing = db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const passwordHash = await hashPassword(password);

    // Standard user role and demo plan for public signup
    const role = 'USER';
    const plan = 'FREE_DEMO';

    const newUser: User = {
      id: userId,
      name: name.trim(),
      email: cleanEmail,
      role,
      status: 'ACTIVE',
      demo_used: false,
      credits: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.insertUser(newUser, passwordHash);

    // Initial subscription
    const sub: Subscription = {
      id: `sub_${userId}`,
      user_id: userId,
      plan,
      status: 'ACTIVE',
      started_at: new Date().toISOString(),
      expires_at: null, // demo checked via demo_used
    };
    db.insertSubscription(sub);

    const token = generateToken(newUser);

    return res.status(201).json({
      user: newUser,
      token,
      subscription: sub,
      license: null,
    });
  } catch (err: any) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Failed to create account.' });
  }
});

// POST /api/auth/firebase-login
router.post('/firebase-login', async (req, res) => {
  try {
    const idToken =
      req.body.idToken ||
      req.body.token ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

    if (!idToken) {
      return res.status(400).json({ error: 'Firebase ID token is required for authentication.' });
    }

    // SECURITY FIX: Verify Firebase ID token cryptographically using verifyIdToken()
    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (verifyErr: any) {
      console.error('[Firebase Auth] verifyIdToken failed:', verifyErr.message || verifyErr);
      return res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
    }

    const uid = decodedToken.uid;
    const cleanEmail = (decodedToken.email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ error: 'Verified email is required from Firebase authentication.' });
    }

    const name = decodedToken.name || (req.body.name ? String(req.body.name).trim() : cleanEmail.split('@')[0] || 'User');

    let user = db.getUserByEmail(cleanEmail) || db.getUserById(uid);

    if (!user) {
      // Create new user from Firebase Auth
      const isOwner = isOwnerEmail(cleanEmail);
      const role = isOwner ? 'OWNER' : 'USER';
      const plan = isOwner ? 'OWNER_LIFETIME' : 'FREE_DEMO';

      user = {
        id: uid,
        name: (name || cleanEmail.split('@')[0] || 'User').trim(),
        email: cleanEmail,
        role,
        status: 'ACTIVE',
        demo_used: false,
        credits: isOwner ? 9999 : 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Random secure password hash for auth fallback
      const randomPassword = `fb_${Date.now()}_${Math.random().toString(36)}`;
      const passwordHash = await hashPassword(randomPassword);
      db.insertUser(user, passwordHash);

      // Initial subscription
      const sub: Subscription = {
        id: `sub_${user.id}`,
        user_id: user.id,
        plan,
        status: 'ACTIVE',
        started_at: new Date().toISOString(),
        expires_at: null,
      };
      db.insertSubscription(sub);
    } else {
      // If user was previously registered with a local ID, migrate ID to Firebase UID
      if (user.id !== uid) {
        const oldId = user.id;
        db.deleteUser(oldId);
        user.id = uid;
        user.updated_at = new Date().toISOString();
        const fallbackHash = await hashPassword(`fb_${Date.now()}`);
        db.insertUser(user, fallbackHash);

        // Migrate relations
        for (const s of db.getSubscriptions()) {
          if (s.user_id === oldId) db.updateSubscription(s.id, { user_id: uid });
        }
        for (const p of db.getProjects()) {
          if (p.user_id === oldId) db.updateProject(p.id, { user_id: uid });
        }
        for (const c of db.getClips()) {
          if (c.user_id === oldId) db.updateClip(c.id, { user_id: uid });
        }
        for (const pay of db.getPayments()) {
          if (pay.user_id === oldId) db.updatePayment(pay.id, { user_id: uid });
        }
      }

      // Sync owner privileges if email matches OWNER_EMAIL
      user = syncOwnerPrivileges(user);
    }

    const token = generateToken(user);
    const subscription = db.getSubscriptionByUserId(user.id) || null;
    const license = db.getLicenseByUserId(user.id) || null;

    return res.json({
      user,
      token,
      subscription,
      license,
    });
  } catch (err: any) {
    console.error('Firebase login error:', err);
    return res.status(500).json({ error: 'Failed to authenticate with Firebase.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = db.getUserByEmail(cleanEmail);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const hash = db.getUserPasswordHash(user.id);
    if (!hash) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const match = await comparePassword(password, hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Your account has been suspended by the administrator.' });
    }

    // Owner check and privilege sync
    user = syncOwnerPrivileges(user);
    if (user.role === 'OWNER') {
      user.credits = 9999;
    } else if (typeof user.credits !== 'number') {
      user.credits = user.demo_used ? 0 : 1;
      db.updateUser(user.id, { credits: user.credits });
    }

    const token = generateToken(user);
    const subscription = db.getSubscriptionByUserId(user.id) || null;
    const license = db.getLicenseByUserId(user.id) || null;

    return res.json({
      user,
      token,
      subscription,
      license,
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Failed to log in.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  let user = req.user!;
  user = syncOwnerPrivileges(user);

  if (user.role === 'OWNER') {
    user.credits = 9999;
  } else {
    // Normal user credit sync
    if (user.demo_used && (user.credits ?? 0) > 0) {
      user.credits = 0;
      db.updateUser(user.id, { credits: 0 });
    }
  }

  const subscription = db.getSubscriptionByUserId(user.id) || null;
  const license = db.getLicenseByUserId(user.id) || null;
  const notifications = db.getNotifications(user.id);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return res.json({
    user,
    subscription,
    license,
    unreadNotifications: unreadCount,
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = req.user!;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    const hash = db.getUserPasswordHash(user.id);
    if (!hash) {
      return res.status(400).json({ error: 'User record corrupted.' });
    }

    const valid = await comparePassword(currentPassword, hash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = await hashPassword(newPassword);
    db.setUserPasswordHash(user.id, newHash);

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err: any) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Failed to update password.' });
  }
});

export default router;
