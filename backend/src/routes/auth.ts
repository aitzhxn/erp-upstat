import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/auth';
import { sanitizeString } from '../middleware/sanitize';
import { getUserByEmailForLogin, createUser, getUserById, getAdminAssignedAt } from '../db';

const router = Router();

function getJwtSecret(): string {
  return process.env.JWT_SECRET!;
}

/** Signup: create user, issue JWT. New users have postId=null, role=Employee. */
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
    const user = createUser({ email: sanitizeString(email.trim()), name: sanitizeString(name.trim()), passwordHash, organizationId: process.env.DEFAULT_ORGANIZATION_ID ?? '1' });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, organizationId: user.organizationId, postId: user.postId },
      getJwtSecret(),
      { expiresIn: '7d' }
    );
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: 'Main Organization',
        postId: user.postId,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signup failed';
    return res.status(400).json({ error: msg });
  }
});

/** Login: verify password, issue JWT. User role from Post.role (postId). */
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = getUserByEmailForLogin(email.trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

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
    },
  });
});

router.get('/me', authenticate, (req: any, res) => {
  const dbUser = getUserById(req.user.id);
  if (!dbUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  const adminAssignedAt = dbUser.role === 'Admin' ? getAdminAssignedAt(dbUser.id) : null;
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
