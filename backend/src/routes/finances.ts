import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { sanitizeString } from '../middleware/sanitize';
import { getBudgets, getBudgetById, approveBudget, createBudget, deleteBudget, getDepartments, appendAuditLog } from '../db';

const router = Router();

router.get('/', authenticate, (req: AuthRequest, res) => {
  const responsiblePostId = (req.query.responsiblePostId as string | undefined) || undefined;
  const period = (req.query.period as string | undefined) || undefined;
  const allowed = null; // Admin sees all; role filtering happens via responsiblePostId
  const budgets = getBudgets(responsiblePostId, period, allowed);
  res.json(budgets);
});

router.post('/', authenticate, requireRole('Admin', 'Department Head'), (req: AuthRequest, res) => {
  const { departmentId, responsiblePostId, category, period, planned, limits } = req.body;

  if (!departmentId || !category || !period || planned == null) {
    return res.status(400).json({ error: 'departmentId, category, period, planned — обязательные поля' });
  }

  const plannedNum = Number(planned);
  const limitsNum = Number(limits ?? planned);
  if (Number.isNaN(plannedNum) || plannedNum <= 0) {
    return res.status(400).json({ error: 'Сумма плана должна быть положительным числом' });
  }

  const depts = getDepartments();
  if (!depts.find(d => d.id === departmentId)) {
    return res.status(400).json({ error: 'Отдел не найден' });
  }

  const id = `b${Date.now()}`;
  createBudget({
    id,
    departmentId,
    responsiblePostId: responsiblePostId || null,
    category: sanitizeString(category).trim(),
    period,
    planned: plannedNum,
    limits: limitsNum,
  });

  appendAuditLog({
    entityType: 'budget',
    entityId: id,
    action: 'created',
    userId: req.user!.id,
    changes: JSON.stringify({ departmentId, category, period, planned: plannedNum }),
  });

  const created = getBudgetById(id);
  res.status(201).json(created);
});

router.post('/:id/approve', authenticate, requireRole('Admin', 'Department Head'), (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const existing = getBudgetById(id);
  if (!existing) return res.status(404).json({ error: 'Budget not found' });
  approveBudget(id);
  appendAuditLog({ entityType: 'budget', entityId: id, action: 'approved', userId: req.user!.id, changes: null });
  const updated = getBudgetById(id);
  res.json(updated);
});

router.delete('/:id', authenticate, requireRole('Admin'), (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const existing = getBudgetById(id);
  if (!existing) return res.status(404).json({ error: 'Budget not found' });
  deleteBudget(id);
  appendAuditLog({ entityType: 'budget', entityId: id, action: 'deleted', userId: req.user!.id, changes: null });
  res.json({ success: true });
});

export default router;
