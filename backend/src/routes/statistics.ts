import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { sanitizeString } from '../middleware/sanitize';
import { getStatisticsByPostId, getAllowListForUser, getStatisticsRecords, createStatisticRecord, getStatisticsSeries, getMetricDefinitions, createMetricDefinition, deleteMetricDefinition, getQuotas, setQuota, getConstructorView, getMetricToPostList, setMetricToPost, deleteMetricToPost, getDailyTrackingData, saveDailyEntry, getPlanVsFactLast7Days, getStatisticsGridData, getStatisticsGridDataByPeriod, getSeriesLast30Days, getWeekOverWeekGrowth, canUserEditMetricAssignment, getPostById, appendAuditLog } from '../db';

const router = Router();

// Get organization statistics (агрегация по постам/департаментам)
router.get('/', authenticate, async (req, res) => {
  res.json({
    totalEmployees: 245,
    activeProjects: 35,
    averageCompletionRate: 85,
    departmentStats: [
      { department: 'Engineering', employees: 45, activeProjects: 12, completionRate: 85 },
      { department: 'Marketing', employees: 28, activeProjects: 8, completionRate: 92 },
    ],
  });
});

// List metric definitions (for dropdown). Must be before /post/:postId.
router.get('/metrics', authenticate, async (req, res) => {
  try {
    const list = await getMetricDefinitions();
    res.json(list);
  } catch (e: any) {
    console.error('GET /statistics/metrics', e);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal server error', ...(isDev && { details: (e as any)?.message }) });
  }
});

// Create metric definition (Admin only).
router.post('/metrics', authenticate, requireRole('Admin'), async (req: AuthRequest, res) => {
  const { code, name, unit } = req.body;
  if (!code || !name || !unit || typeof code !== 'string' || typeof name !== 'string' || typeof unit !== 'string') {
    return res.status(400).json({ error: 'code, name, unit (strings) required' });
  }
  try {
    const metric = await createMetricDefinition({ code: sanitizeString(code).trim(), name: sanitizeString(name).trim(), unit: sanitizeString(unit).trim() });
    return res.status(201).json(metric);
  } catch (e: any) {
    if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Metric with this code already exists' });
    }
    console.error('POST /statistics/metrics', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete metric definition (Admin only). Fails if metric is still in use (assignments in matrix).
router.delete('/metrics', authenticate, requireRole('Admin'), async (req: AuthRequest, res) => {
  const code = (req.query.code as string)?.trim();
  if (!code) return res.status(400).json({ error: 'code (query) required' });
  try {
    await deleteMetricDefinition(code);
    await appendAuditLog({ entityType: 'metric', entityId: code, action: 'delete', userId: (req as any).user?.id ?? 'unknown', changes: null });
    return res.status(204).send();
  } catch (e: any) {
    if (e?.code === 'METRIC_IN_USE') {
      return res.status(409).json({ error: e.message });
    }
    console.error('DELETE /statistics/metrics', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Metric-to-post (MetricToRole) assignments. Admin or Department Head.
router.get('/metric-to-post', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  try {
    const postId = (req.query.postId as string) || undefined;
    const metricCode = (req.query.metricCode as string) || undefined;
    const list = await getMetricToPostList({ postId, metricCode });
    res.json(list);
  } catch (e: any) {
    console.error('GET /statistics/metric-to-post', e);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal server error', ...(isDev && { details: (e as any)?.message }) });
  }
});

router.post('/metric-to-post', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  const { postId, metricCode, responsibleUserId, dailyTarget } = req.body;
  if (!postId || !metricCode || typeof postId !== 'string' || typeof metricCode !== 'string') {
    return res.status(400).json({ error: 'postId, metricCode (strings) required' });
  }
  if (req.user?.role === 'Admin') {
    // Admin: skip department checks
  } else {
    const allowed = await getAllowListForUser(req.user);
    if (allowed != null && !allowed.includes(postId)) {
      return res.status(403).json({ error: 'Forbidden: post not in your department' });
    }
  }
  const metrics = await getMetricDefinitions();
  if (!metrics.find(m => m.code === metricCode)) {
    return res.status(404).json({ error: 'Metric not found' });
  }
  const existing = await getMetricToPostList({ postId, metricCode });
  if (existing.length > 0) {
    return res.status(400).json({ error: 'Такой показатель для этой должности уже назначен' });
  }
  const target = dailyTarget !== undefined && dailyTarget !== null && dailyTarget !== '' ? Number(dailyTarget) : null;
  await setMetricToPost(postId, metricCode, responsibleUserId ?? null, target);
  res.status(201).json({ postId, metricCode, responsibleUserId: responsibleUserId ?? null, dailyTarget: target });
});

router.delete('/metric-to-post', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  const postId = req.query.postId as string;
  const metricCode = req.query.metricCode as string;
  if (!postId || !metricCode) return res.status(400).json({ error: 'postId and metricCode required' });
  if (req.user?.role !== 'Admin') {
    const allowed = await getAllowListForUser(req.user);
    if (allowed != null && !allowed.includes(postId)) {
      return res.status(403).json({ error: 'Forbidden: post not in your department' });
    }
  }
  await deleteMetricToPost(postId, metricCode);
  res.status(204).send();
});

// Unified grid: GET /statistics/grid?weekStart=YYYY-MM-DD&periodType=week|month|quarter|year&period=YYYY-MM-DD|YYYY-MM|YYYY-Q1|YYYY&departmentId=&responsibleUserId=&myData=
router.get('/grid', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: 'Not authenticated' });
    const periodType = (req.query.periodType as string) || 'week';
    const period = req.query.period as string;
    const weekStart = getDefaultWeekStart(req.query.weekStart as string);
    const departmentId = (req.query.departmentId as string) || undefined;
    const responsibleUserId = (req.query.responsibleUserId as string) || undefined;
    const myDataParam = req.query.myData as string;
    const myDataOnly = myDataParam === 'true' ? true : myDataParam === 'false' ? false : undefined;
    const isAdmin = req.user.role === 'Admin';

    const validPeriodTypes = ['week', 'month', 'quarter', 'year'];
    const pt = validPeriodTypes.includes(periodType) ? periodType : 'week';

    let periodValue: string;
    if (pt === 'week') {
      periodValue = weekStart;
    } else if (pt === 'month' && period && /^\d{4}-\d{2}$/.test(period)) {
      periodValue = period;
    } else if (pt === 'quarter' && period && /^\d{4}-Q[1-4]$/.test(period)) {
      periodValue = period;
    } else if (pt === 'year' && period && /^\d{4}$/.test(period)) {
      periodValue = period;
    } else {
      const d = new Date();
      if (pt === 'month') periodValue = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      else if (pt === 'quarter') periodValue = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
      else if (pt === 'year') periodValue = String(d.getFullYear());
      else periodValue = weekStart;
    }

    const data = await getStatisticsGridDataByPeriod(req.user.id, pt as 'week' | 'month' | 'quarter' | 'year', periodValue, { departmentId, responsibleUserId, myDataOnly }, isAdmin);
    res.json(data);
  } catch (e: any) {
    console.error('GET /statistics/grid', e);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal server error', ...(isDev && { details: (e as any)?.message }) });
  }
});

// 30-day series + WoW growth for analytics drawer.
router.get('/series-30d', authenticate, async (req: AuthRequest, res) => {
  try {
    const postId = req.query.postId as string;
    const metricCode = req.query.metricCode as string;
    const weekStart = getDefaultWeekStart(req.query.weekStart as string);
    if (!postId || !metricCode) return res.status(400).json({ error: 'postId and metricCode required' });
    if (req.user?.role === 'Admin') {
      // Admin: allow all
    } else {
      const allowed = await getAllowListForUser(req.user);
      const canAccess =
        (allowed != null && allowed.includes(postId)) ||
        (req.user?.id != null && await canUserEditMetricAssignment(req.user.id, postId, metricCode));
      if (!canAccess) {
        return res.status(403).json({ error: 'Forbidden: you can only view metrics for your department or assigned to you' });
      }
    }
    const series = await getSeriesLast30Days(postId, metricCode);
    const wowGrowth = await getWeekOverWeekGrowth(postId, metricCode, weekStart);
    res.json({ postId, metricCode, series, weekOverWeekGrowthPercent: wowGrowth });
  } catch (e: any) {
    console.error('GET /statistics/series-30d', e);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal server error', ...(isDev && { details: (e as any)?.message }) });
  }
});

// Daily tracking: rows = metrics for user's roles, columns = week days + plan + actual.
router.get('/daily-tracking', authenticate, async (req: AuthRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const weekStart = getDefaultWeekStart(req.query.weekStart as string);
    const data = await getDailyTrackingData(req.user.id, weekStart);
    res.json(data);
  } catch (e: any) {
    console.error('GET /statistics/daily-tracking', e);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal server error', ...(isDev && { details: (e as any)?.message }) });
  }
});

/** Monday of current week in local time (no UTC). Prefer weekStart from query/headers to avoid timezone mismatch with frontend. */
function getDefaultWeekStart(weekStartFromQuery?: string): string {
  if (weekStartFromQuery && /^\d{4}-\d{2}-\d{2}$/.test(weekStartFromQuery)) return weekStartFromQuery;
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon (local)
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dayNum = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayNum}`;
}

// Save one daily cell (onBlur). Admin: all; Dept/Section Head: posts in subtree; else: own post or responsible.
router.post('/daily-entry', authenticate, async (req: AuthRequest, res) => {
  const { postId, metricCode, date, value } = req.body;
  if (!postId || !metricCode || !date || typeof value !== 'number') {
    return res.status(400).json({ error: 'postId, metricCode, date (strings), value (number) required' });
  }
  const post = await getPostById(postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const allowed = await getAllowListForUser(req.user);
  const canEdit =
    req.user?.role === 'Admin' ||
    (allowed != null && allowed.includes(postId)) ||
    (req.user?.id != null && await canUserEditMetricAssignment(req.user.id, postId, metricCode));
  if (!canEdit) {
    return res.status(403).json({ error: 'Forbidden: you can only edit entries for your posts or assigned metrics' });
  }
  await saveDailyEntry(postId, metricCode, date, Number(value));
  res.json({ postId, metricCode, date, value: Number(value) });
});

// Plan vs Fact for analytics (e.g. Валовой доход last 7 days).
router.get('/plan-vs-fact', authenticate, async (req: AuthRequest, res) => {
  try {
    const metricCode = (req.query.metricCode as string) || 'revenue';
    const postId = (req.query.postId as string) || undefined;
    const data = await getPlanVsFactLast7Days(metricCode, postId);
    res.json(data);
  } catch (e: any) {
    console.error('GET /statistics/plan-vs-fact', e);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal server error', ...(isDev && { details: (e as any)?.message }) });
  }
});

// Constructor view (Конструктор): grid rows for period with quota, value, needMore.
router.get('/constructor', authenticate, async (req: AuthRequest, res) => {
  const period = (req.query.period as string) || '';
  if (!period) return res.status(400).json({ error: 'period required' });
  const allowed = await getAllowListForUser(req.user);
  const rows = await getConstructorView(period, allowed);
  res.json(rows);
});

// List quotas. Filters: postId, metricCode, period.
router.get('/quotas', authenticate, async (req: AuthRequest, res) => {
  const postId = (req.query.postId as string) || undefined;
  const metricCode = (req.query.metricCode as string) || undefined;
  const period = (req.query.period as string) || undefined;
  const allowed = await getAllowListForUser(req.user);
  const list = await getQuotas({ postId, metricCode, period, allowedPostIds: allowed });
  res.json(list);
});

// Set one quota (upsert). Admin or Department Head; post must be in allowed.
router.put('/quotas', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  const { postId, metricCode, period, targetValue } = req.body;
  if (!postId || !metricCode || !period || typeof targetValue !== 'number') {
    return res.status(400).json({ error: 'postId, metricCode, period, targetValue (number) required' });
  }
  const allowed = await getAllowListForUser(req.user);
  if (allowed != null && !allowed.includes(postId)) {
    return res.status(403).json({ error: 'Forbidden: post not in your department' });
  }
  await setQuota(postId, metricCode, period, Number(targetValue));
  res.json({ postId, metricCode, period, targetValue: Number(targetValue) });
});

// List records (Учет). Must be before /post/:postId. Filters: postId, period, metricCode.
router.get('/records', authenticate, async (req: AuthRequest, res) => {
  const postId = (req.query.postId as string) || undefined;
  const period = (req.query.period as string) || undefined;
  const metricCode = (req.query.metricCode as string) || undefined;
  const allowed = await getAllowListForUser(req.user);
  const list = await getStatisticsRecords({ postId, period, metricCode, allowedPostIds: allowed });
  res.json(list);
});

// Series for charts (Графики, Анализ). postId, metricCode required; from, to optional.
router.get('/series', authenticate, async (req: AuthRequest, res) => {
  const postId = req.query.postId as string;
  const metricCode = req.query.metricCode as string;
  if (!postId || !metricCode) return res.status(400).json({ error: 'postId and metricCode required' });
  const allowed = await getAllowListForUser(req.user);
  if (allowed != null && !allowed.includes(postId)) {
    return res.status(403).json({ error: 'Forbidden: post not in your department' });
  }
  const fromPeriod = (req.query.from as string) || undefined;
  const toPeriod = (req.query.to as string) || undefined;
  const series = await getStatisticsSeries(postId, metricCode, fromPeriod, toPeriod);
  res.json({ postId, metricCode, series });
});

// Get statistics by post (привязка к postId). Department Head / Section Head only for posts in their subtree.
router.get('/post/:postId', authenticate, async (req: AuthRequest, res) => {
  try {
    const postId = typeof req.params.postId === 'string' ? req.params.postId : req.params.postId?.[0];
    if (!postId) return res.status(400).json({ error: 'postId required' });
    const allowed = await getAllowListForUser(req.user);
    if (allowed != null && !allowed.includes(postId)) {
      return res.status(403).json({ error: 'Forbidden: post not in your department' });
    }
    const rows = await getStatisticsByPostId(postId);
    const metrics: Record<string, number> = {};
    rows.forEach(r => { metrics[r.metricCode] = r.value; });
    res.json({ postId, period: rows[0]?.period || '2026-Q1', metrics, raw: rows });
  } catch (e: any) {
    console.error('GET /statistics/post/:postId', e);
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).json({ error: 'Internal server error', ...(isDev && { details: (e as any)?.message }) });
  }
});

// Create one statistics record (Ввод). Admin or Department Head; post must be in allowed.
router.post('/', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  const { postId, period, metricCode, value } = req.body;
  if (!postId || !period || !metricCode || typeof value !== 'number') {
    return res.status(400).json({ error: 'postId, period, metricCode, value (number) required' });
  }
  const allowed = await getAllowListForUser(req.user);
  if (allowed != null && !allowed.includes(postId)) {
    return res.status(403).json({ error: 'Forbidden: post not in your department' });
  }
  const record = await createStatisticRecord({ postId, period, metricCode, value: Number(value) });
  res.status(201).json(record);
});

// Get department statistics
router.get('/department/:id', authenticate, async (req, res) => {
  res.json({
    departmentId: req.params.id,
    employees: 45,
    activeProjects: 12,
    completionRate: 85,
  });
});

export default router;
