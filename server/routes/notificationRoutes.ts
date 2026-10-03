import { Router } from 'express';
import { db } from '../db';
import { requireAuth, AuthenticatedRequest } from '../auth';

const router = Router();

// GET /api/notifications
router.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const notifications = db.getNotifications(req.user!.id);
  return res.json({ notifications });
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  db.markNotificationRead(req.params.id, req.user!.id);
  return res.json({ success: true });
});

// POST /api/notifications/read-all
router.post('/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  db.markAllNotificationsRead(req.user!.id);
  return res.json({ success: true });
});

export default router;
