import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/auth';
import { sanitizeString } from '../middleware/sanitize';
import {
  getUserByEmailForLogin,
  createUser,
  getUserById,
  getAdminAssignedAt,
  verifyUserEmail,
  resendUserVerificationCode,
} from '../db';

const router = Router();

function getJwtSecret(): string {
  return process.env.JWT_SECRET!;
}

/** Signup: create user. Does not issue JWT directly. User redirected to verify email. */
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
    res.status(201).json({
      message: 'Verification code sent to email',
      email: user.email,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signup failed';
    return res.status(400).json({ error: msg });
  }
});

/** Login: verify password, check verification, issue JWT. */
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

  if (!user.isVerified) {
    return res.status(403).json({
      error: 'Email not verified',
      isVerified: false,
      email: user.email,
    });
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

/** Verify email endpoint: validates 6-digit OTP code and returns session token. */
router.post('/verify-email', async (req, res) => {
  const { email, code } = req.body;
  if (!email?.trim() || !code?.trim()) {
    return res.status(400).json({ error: 'Email and code are required' });
  }
  try {
    const user = await verifyUserEmail(email.trim(), code.trim());
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verification failed';
    return res.status(400).json({ error: msg });
  }
});

/** Resend verification code endpoint. */
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }
  try {
    await resendUserVerificationCode(email.trim());
    res.json({ message: 'Verification code resent successfully' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to resend verification code';
    return res.status(400).json({ error: msg });
  }
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
