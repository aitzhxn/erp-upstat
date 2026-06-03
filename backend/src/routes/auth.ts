import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/auth';
import {
  getUserByEmailForLogin,
  getUserById,
  getAdminAssignedAt,
} from '../db';

const router = Router();

function getJwtSecret(): string {
  return process.env.JWT_SECRET!;
}

/** Login: verify password and issue JWT. */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = await getUserByEmailForLogin(email.trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const adminAssignedAt = user.role === 'Admin' ? await getAdminAssignedAt(user.id) : null;

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId, postId: user.postId },
    getJwtSecret(),
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: 'Main Organization',
      postId: user.postId,
      ...(adminAssignedAt != null ? { adminAssignedAt } : {}),
    },
  });
});

router.get('/me', authenticate, async (req: any, res) => {
  const dbUser = await getUserById(req.user.id);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  const adminAssignedAt = dbUser.role === 'Admin' ? await getAdminAssignedAt(dbUser.id) : null;
  res.json({
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      organizationId: dbUser.organizationId,
      organizationName: 'Main Organization',
      postId: dbUser.postId,
      adminAssignedAt: adminAssignedAt ?? undefined,
    },
  });
});

export default router;
