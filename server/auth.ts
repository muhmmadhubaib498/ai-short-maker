import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { db } from './db';
import type { User, Subscription } from '../src/types';

const JWT_SECRET = process.env.JWT_SECRET || 'ai-shorts-maker-super-secret-key-change-in-production';
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'muhmmadhubaib498@gmail.com').toLowerCase();

export interface AuthenticatedRequest extends Request {
  user?: User;
  subscription?: Subscription;
}

export function isOwnerEmail(email?: string): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function syncOwnerPrivileges(user: User): User {
  if (isOwnerEmail(user.email)) {
    let updated = false;
    if (user.role !== 'OWNER') {
      user.role = 'OWNER';
      updated = true;
    }
    if (user.status !== 'ACTIVE') {
      user.status = 'ACTIVE';
      updated = true;
    }
    if (user.credits !== 9999) {
      user.credits = 9999;
      updated = true;
    }
    if (updated) {
      db.updateUser(user.id, { role: 'OWNER', status: 'ACTIVE', credits: 9999 });
    }

    // Ensure Lifetime Subscription
    let sub = db.getSubscriptionByUserId(user.id);
    if (!sub || sub.plan !== 'OWNER_LIFETIME' || sub.status !== 'ACTIVE') {
      const lifetimeSub: Subscription = {
        id: sub?.id || `sub_owner_${user.id}`,
        user_id: user.id,
        plan: 'OWNER_LIFETIME',
        status: 'ACTIVE',
        started_at: sub?.started_at || new Date().toISOString(),
        expires_at: null,
      };
      db.insertSubscription(lifetimeSub);
    }
  }
  return user;
}

/**
 * Strict Pro Access & Expiry Checker:
 * - Owner always has full lifetime access (bypass all limits).
 * - Regular users must have an ACTIVE Pro subscription (MONTHLY, YEARLY, FRIEND_PASS) with a valid non-expired date.
 * - FREE_DEMO is explicitly NOT a Pro plan.
 */
export function hasValidProAccess(userId: string): { isPro: boolean; isOwner: boolean; sub: Subscription | null } {
  const user = db.getUserById(userId);
  if (!user) {
    return { isPro: false, isOwner: false, sub: null };
  }

  // 1. Owner account privilege: Full lifetime bypass
  if (user.role === 'OWNER' || isOwnerEmail(user.email)) {
    return { isPro: true, isOwner: true, sub: db.getSubscriptionByUserId(userId) || null };
  }

  const sub = db.getSubscriptionByUserId(userId);
  if (!sub) {
    return { isPro: false, isOwner: false, sub: null };
  }

  // 2. Active status check
  if (sub.status !== 'ACTIVE') {
    return { isPro: false, isOwner: false, sub };
  }

  // 3. FREE_DEMO is not Pro access
  if (sub.plan === 'FREE_DEMO') {
    return { isPro: false, isOwner: false, sub };
  }

  if (sub.plan === 'OWNER_LIFETIME') {
    return { isPro: true, isOwner: true, sub };
  }

  // 4. Strict Expiration Date Check on every attempt
  if (!sub.expires_at) {
    return { isPro: false, isOwner: false, sub };
  }

  const now = new Date();
  const expiry = new Date(sub.expires_at);
  if (expiry <= now) {
    // Automatically flag subscription as EXPIRED in DB
    db.updateSubscription(sub.id, { status: 'EXPIRED' });
    sub.status = 'EXPIRED';
    return { isPro: false, isOwner: false, sub };
  }

  return { isPro: true, isOwner: false, sub };
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && typeof req.query?.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    let user = db.getUserById(payload.userId);
    if (!user) {
      return next();
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'Your account has been suspended by the administrator.' });
    }

    user = syncOwnerPrivileges(user);
    if (user.role === 'OWNER') {
      user.credits = 9999;
    } else {
      const { isPro } = hasValidProAccess(user.id);
      if (isPro) {
        user.credits = 9999;
      } else {
        if (typeof user.credits !== 'number') {
          user.credits = user.demo_used ? 0 : 1;
          db.updateUser(user.id, { credits: user.credits });
        } else if (user.demo_used && user.credits > 0) {
          user.credits = 0;
          db.updateUser(user.id, { credits: 0 });
        }
      }
    }
    req.user = user;
    req.subscription = db.getSubscriptionByUserId(user.id);
    next();
  } catch (err) {
    return next();
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  next();
}

export function requireOwner(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role !== 'OWNER' && !isOwnerEmail(req.user.email)) {
    return res.status(403).json({ error: 'Access denied. Owner privileges required.' });
  }
  next();
}

export function requireAdminOrOwner(permission?: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role === 'OWNER' || isOwnerEmail(req.user.email)) {
      return next();
    }
    if (req.user.role === 'ADMIN') {
      if (!permission) return next();
      const perms = db.getAdminPermissions(req.user.id);
      if (perms.includes(permission)) {
        return next();
      }
      return res.status(403).json({ error: `Admin access denied: missing '${permission}' permission.` });
    }
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  };
}

export function checkSubscriptionOrDemo(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  // Owner always has full lifetime access
  const { isPro, isOwner } = hasValidProAccess(req.user.id);
  if (isOwner || isPro) {
    return next();
  }

  // Normal user demo check with fresh DB record:
  const freshUser = db.getUserById(req.user.id) || req.user;
  const credits = typeof freshUser.credits === 'number' ? freshUser.credits : (freshUser.demo_used ? 0 : 1);
  if (freshUser.demo_used || credits <= 0) {
    return res.status(402).json({
      code: 'FREE_LIMIT_REACHED',
      error: 'Free demo video limit reached (0 credits remaining). Please upgrade to Pro or redeem a License Key to continue.',
      demo_used: true,
      credits: 0,
    });
  }

  return next();
}

/**
 * Atomic Credit Reservation & Demo Burn:
 * - Owner: unlimited access (9999).
 * - Active Pro Subscription: unlimited access (9999).
 * - Regular Free Demo User:
 *   * If credits <= 0 or demo_used === true -> reject with error.
 *   * If 1st video -> Immediately set user.credits = 0 and user.demo_used = true in DB.
 */
export function reserveUserCredit(userId: string): { success: boolean; remainingCredits: number; error?: string } {
  const user = db.getUserById(userId);
  if (!user) {
    return { success: false, remainingCredits: 0, error: 'User not found.' };
  }

  // Owner bypass
  const { isPro, isOwner } = hasValidProAccess(userId);
  if (isOwner || isPro) {
    return { success: true, remainingCredits: 9999 };
  }

  // Regular user demo verification
  const credits = typeof user.credits === 'number' ? user.credits : (user.demo_used ? 0 : 1);
  if (user.demo_used || credits <= 0) {
    return {
      success: false,
      remainingCredits: 0,
      error: 'Free demo video limit reached (0 credits remaining). Please upgrade to Pro or redeem a License Key to continue.',
    };
  }

  // Immediately set credits = 0 and demo_used = true in the database upon 1st video start
  db.updateUser(user.id, {
    credits: 0,
    demo_used: true,
  });

  return { success: true, remainingCredits: 0 };
}
