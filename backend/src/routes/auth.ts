import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/auth';
import { sanitizeString } from '../middleware/sanitize';
import {
  getUserByEmailForLogin,
  getUserById,
  getAdminAssignedAt,
  createUser,
} from '../db';

const router = Router();

function getJwtSecret(): string {
  return process.env.JWT_SECRET!;
}

function userPayload(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  postId: string | null;
}, adminAssignedAt?: string | null) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    organizationName: 'Main Organization',
    postId: user.postId,
    ...(adminAssignedAt != null ? { adminAssignedAt } : {}),
  };
}

/** Signup: create user and return JWT (no email verification). */
router.post('/signup', async (req, res) => {
  const { email, name, password } = req.body;
  if (!email?.trim() || !name?.trim() || !password) {
    return res.status(400).json({ error: 'Email, name and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({
      email: sanitizeString(email.trim()),
      name: sanitizeString(name.trim()),
      passwordHash,
      organizationId: process.env.DEFAULT_ORGANIZATION_ID ?? '1',
    });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId, postId: user.postId },
      getJwtSecret(),
      { expiresIn: '7d' },
    );
    res.status(201).json({ token, user: userPayload(user) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signup failed';
    return res.status(400).json({ error: msg });
  }
});

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
    { expiresIn: '7d' },
  );

  res.json({
    token,
    user: userPayload(user, adminAssignedAt),
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
      ...userPayload(dbUser),
      adminAssignedAt: adminAssignedAt ?? undefined,
    },
  });
});

export default router;
