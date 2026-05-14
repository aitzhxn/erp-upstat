import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { getAuditLogByPostId, getRecentAuditLog, getAllowListForUser } from '../db';

const router = Router();

/** Get recent audit log (for Dashboard). Limit default 10. */
router.get('/recent', authenticate, async (req: AuthRequest, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || 10), 10)));
  const allowed = await getAllowListForUser(req.user);
  const list = await getRecentAuditLog(limit, allowed);
  res.json(list);
});

/** Get audit log by postId. Department Head / Section Head only for posts in their subtree. */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  const postId = req.query.postId as string;
  if (!postId) {
    return res.status(400).json({ error: 'postId required' });
  }
  const allowed = await getAllowListForUser(req.user);
  if (allowed != null && !allowed.includes(postId)) {
    return res.status(403).json({ error: 'Forbidden: post not in your department' });
  }
  const list = await getAuditLogByPostId(postId);
  res.json(list);
});

export default router;
