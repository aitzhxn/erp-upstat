import './preload-env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { initDb } from './db';
import authRoutes from './routes/auth';
import orgRoutes from './routes/org';
import instructionsRoutes from './routes/instructions';
import statisticsRoutes from './routes/statistics';
import financesRoutes from './routes/finances';
import workPlansRoutes from './routes/workPlans';
import communicationRoutes from './routes/communication';
import auditRoutes from './routes/audit';
import { globalErrorHandler } from './middleware/errorHandler';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be set to a string of at least 32 characters');
  process.exit(1);
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(helmet());

// Note: JWT stored in localStorage (not cookies) - CSRF risk is minimal. Origin validation handled by CORS.
// CORS: читаем список origins из CORS_ORIGINS (через запятую) или используем дефолты для dev
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX ?? '1000', 10), // Increased default for hot-reloads/polling
  standardHeaders: true,
  legacyHeaders: false,
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/org', orgRoutes);
app.use('/api/instructions', instructionsRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/finances', financesRoutes);
app.use('/api/work-plans', workPlansRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/audit', auditRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(globalErrorHandler);

async function start(): Promise<void> {
  try {
    await initDb();
  } catch (e) {
    console.error('FATAL: database init failed', e);
    process.exit(1);
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

void start();
