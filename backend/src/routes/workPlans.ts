import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  getWorkPlans,
  getWorkPlanById,
  createWorkPlan,
  updateWorkPlan,
  submitWorkPlan,
  approveWorkPlan,
  rejectWorkPlan,
  requestRevisionWorkPlan,
  getAllowListForUser,
  getPostsForUser,
  getPostById,
  getAncestorPostIds,
  getWorkPlanTasks,
  createWorkPlanTask,
  updateWorkPlanTask,
  deleteWorkPlanTask,
  deleteWorkPlanTasks,
  deleteWorkPlan,
  getWorkPlanNotificationCount,
  getWorkPlanNotifications,
  markWorkPlanNotificationAsRead,
  markAllWorkPlanNotificationsAsRead,
} from '../db';

const router = Router();

/** Parse messageText and sync tasks. Lines like "1. Task title" or "- Task title" or "* Task title". */
async function syncTasksFromMessageText(workPlanId: string, messageText: string | null): Promise<void> {
  await deleteWorkPlanTasks(workPlanId);
  if (!messageText?.trim()) return;
  const lines = messageText.split(/\r?\n/);
  let orderIndex = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const numberMatch = trimmed.match(/^\d+[\.\)]\s*(.*)$/);
    const bulletMatch = trimmed.match(/^[\-\*]\s*(.*)$/);
    let taskTitle = '';
    if (numberMatch) {
      taskTitle = numberMatch[1].trim();
    } else if (bulletMatch) {
      taskTitle = bulletMatch[1].trim();
    }
    if (taskTitle) {
      await createWorkPlanTask({
        workPlanId,
        title: taskTitle,
        dueDate: null,
        orderIndex: orderIndex++,
      });
    }
  }
}

/** Get work plans; optional ?postId= & ?workflowStatus= & ?forMyApproval=1 (plans waiting for my approval). */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  const postId = (req.query.postId as string) || undefined;
  const workflowStatus = (req.query.workflowStatus as string) || undefined;
  const forMyApproval = req.query.forMyApproval === '1' || req.query.forMyApproval === 'true';
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  let list;
  if (forMyApproval && myPostIds.length > 0) {
    list = await getWorkPlans({ workflowStatus: 'submitted', approverPostIds: myPostIds });
  } else {
    const allowed = await getAllowListForUser(req.user);
    list = await getWorkPlans({ postId, allowedPostIds: allowed, workflowStatus: workflowStatus as any || undefined });
  }
  res.json(list);
});

/** Get one work plan by id. */
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const plan = await getWorkPlanById(id);
  if (!plan) return res.status(404).json({ error: 'Work plan not found' });
  const allowed = await getAllowListForUser(req.user);
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const canSee = allowed === null || allowed.includes(plan.postId) || (plan.approverPostId != null && myPostIds.includes(plan.approverPostId));
  if (!canSee) return res.status(403).json({ error: 'No access' });
  const tasks = await getWorkPlanTasks(id);
  res.json({ ...plan, tasks });
});

/** Create work plan. Employee: for own post (postId in my posts). Admin/Department Head: any. */
router.post('/', authenticate, async (req: AuthRequest, res) => {
  const { title, postId, department, status, dueDate, period, messageText } = req.body;
  if (!title?.trim() || !postId) {
    return res.status(400).json({ error: 'title and postId required' });
  }
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const isAdminOrHead = req.user?.role === 'Admin' || req.user?.role === 'Department Head' || req.user?.role === 'Section Head';
  const canCreateForPost = isAdminOrHead || myPostIds.includes(postId);
  if (!canCreateForPost) {
    return res.status(403).json({ error: 'You can only create work plans for your own position(s)' });
  }
  const created = await createWorkPlan({
    title: title.trim(),
    postId,
    department: department ?? null,
    status: status ?? 'on-track',
    dueDate: dueDate ?? null,
    authorUserId: req.user?.id ?? null,
    period: period ?? null,
    messageText: typeof messageText === 'string' ? messageText.trim() || null : null,
  });
  if (created.messageText) {
    await syncTasksFromMessageText(created.id, created.messageText);
  }
  const updated = await getWorkPlanById(created.id);
  res.status(201).json(updated!);
});

/** Update work plan. Author (draft/rejected/revision_requested) or Admin/Department Head. */
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const existing = await getWorkPlanById(id);
  if (!existing) return res.status(404).json({ error: 'Work plan not found' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const isAuthor = existing.authorUserId === req.user?.id;
  const isAdminOrHead = req.user?.role === 'Admin' || req.user?.role === 'Department Head' || req.user?.role === 'Section Head';
  const editableStatus = existing.workflowStatus === 'draft' || existing.workflowStatus === 'rejected' || existing.workflowStatus === 'revision_requested';
  const canEdit = editableStatus && (isAuthor || isAdminOrHead || myPostIds.includes(existing.postId));
  if (!canEdit) return res.status(403).json({ error: 'Cannot edit this plan' });
  const { title, postId, department, status, dueDate, period, messageText } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title.trim();
  if (postId !== undefined) updates.postId = postId;
  if (department !== undefined) updates.department = department;
  if (status !== undefined) updates.status = status;
  if (dueDate !== undefined) updates.dueDate = dueDate;
  if (period !== undefined) updates.period = period;
  if (messageText !== undefined) updates.messageText = typeof messageText === 'string' ? messageText.trim() || null : null;
  if (Object.keys(updates).length > 0) await updateWorkPlan(id, updates as any);
  if (messageText !== undefined) {
    await syncTasksFromMessageText(id, typeof messageText === 'string' ? messageText.trim() || null : null);
  }
  const updated = await getWorkPlanById(id);
  res.json(updated!);
});

/** Submit work plan for approval. Author only. Body: { approverPostId? } — employee chooses who to send to. */
router.post('/:id/submit', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const { approverPostId } = req.body || {};
  const plan = await getWorkPlanById(id);
  if (!plan) return res.status(404).json({ error: 'Work plan not found' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const isAuthor = plan.authorUserId === req.user?.id || myPostIds.includes(plan.postId);
  if (!isAuthor) return res.status(403).json({ error: 'Only the author can submit' });
  if (plan.workflowStatus !== 'draft' && plan.workflowStatus !== 'rejected' && plan.workflowStatus !== 'revision_requested') {
    return res.status(400).json({ error: 'Plan already submitted or approved' });
  }
  const approver = typeof approverPostId === 'string' && approverPostId.trim() ? approverPostId.trim() : undefined;
  if (approver) {
    const allowed = await getAncestorPostIds(plan.postId);
    if (!allowed.includes(approver)) {
      return res.status(400).json({ error: 'Выберите руководителя из списка (вышестоящая должность) для согласования' });
    }
  }
  await submitWorkPlan(id, approver);
  const updated = await getWorkPlanById(id);
  res.json(updated!);
});

/** Approve work plan. Approver (manager) only. Body: { comment? } — optional comment. */
router.post('/:id/approve', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const { comment } = req.body || {};
  const plan = await getWorkPlanById(id);
  if (!plan) return res.status(404).json({ error: 'Work plan not found' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const isApprover = plan.approverPostId != null && myPostIds.includes(plan.approverPostId);
  const isAdmin = req.user?.role === 'Admin';
  if (!isApprover && !isAdmin) return res.status(403).json({ error: 'Only the manager can approve' });
  if (plan.workflowStatus !== 'submitted') return res.status(400).json({ error: 'Plan is not submitted' });
  const ancestors = await getAncestorPostIds(plan.postId);
  if (plan.approverPostId == null || !ancestors.includes(plan.approverPostId)) {
    return res.status(403).json({ error: 'Approver is no longer valid for this work plan' });
  }
  await approveWorkPlan(id, typeof comment === 'string' ? comment : undefined);
  const updated = await getWorkPlanById(id);
  res.json(updated!);
});

/** Reject work plan. Approver only. Comment required. */
router.post('/:id/reject', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const { comment } = req.body || {};
  const plan = await getWorkPlanById(id);
  if (!plan) return res.status(404).json({ error: 'Work plan not found' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const isApprover = plan.approverPostId != null && myPostIds.includes(plan.approverPostId);
  const isAdmin = req.user?.role === 'Admin';
  if (!isApprover && !isAdmin) return res.status(403).json({ error: 'Only the manager can reject' });
  if (plan.workflowStatus !== 'submitted') return res.status(400).json({ error: 'Plan is not submitted' });
  const commentStr = typeof comment === 'string' ? comment.trim() : '';
  if (!commentStr) return res.status(400).json({ error: 'Укажите причину отклонения (комментарий обязателен)' });
  const ancestors = await getAncestorPostIds(plan.postId);
  if (plan.approverPostId == null || !ancestors.includes(plan.approverPostId)) {
    return res.status(403).json({ error: 'Approver is no longer valid for this work plan' });
  }
  await rejectWorkPlan(id, commentStr);
  const updated = await getWorkPlanById(id);
  res.json(updated!);
});

/** Request revision (manager): plan goes back to author with comment. Body: { comment? }. */
router.post('/:id/request-revision', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const { comment } = req.body || {};
  const plan = await getWorkPlanById(id);
  if (!plan) return res.status(404).json({ error: 'Work plan not found' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const isApprover = plan.approverPostId != null && myPostIds.includes(plan.approverPostId);
  const isAdmin = req.user?.role === 'Admin';
  if (!isApprover && !isAdmin) return res.status(403).json({ error: 'Only the manager can request revision' });
  if (plan.workflowStatus !== 'submitted') return res.status(400).json({ error: 'Plan is not submitted' });
  const commentStr = typeof comment === 'string' ? comment.trim() : '';
  if (!commentStr) return res.status(400).json({ error: 'Укажите, что доработать (комментарий обязателен)' });
  const ancestors = await getAncestorPostIds(plan.postId);
  if (plan.approverPostId == null || !ancestors.includes(plan.approverPostId)) {
    return res.status(403).json({ error: 'Approver is no longer valid for this work plan' });
  }
  await requestRevisionWorkPlan(id, commentStr);
  const updated = await getWorkPlanById(id);
  res.json(updated!);
});

/** Get tasks of a work plan. */
router.get('/:id/tasks', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const plan = await getWorkPlanById(id);
  if (!plan) return res.status(404).json({ error: 'Work plan not found' });
  const allowed = await getAllowListForUser(req.user);
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const canSee = allowed === null || allowed.includes(plan.postId) || (plan.approverPostId != null && myPostIds.includes(plan.approverPostId));
  if (!canSee) return res.status(403).json({ error: 'No access' });
  const tasks = await getWorkPlanTasks(id);
  res.json(tasks);
});

/** Add task to work plan. */
router.post('/:id/tasks', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const { title, dueDate, orderIndex } = req.body;
  const plan = await getWorkPlanById(id);
  if (!plan) return res.status(404).json({ error: 'Work plan not found' });
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const isAuthor = plan.authorUserId === req.user?.id || myPostIds.includes(plan.postId);
  const canEdit = (plan.workflowStatus === 'draft' || plan.workflowStatus === 'rejected' || plan.workflowStatus === 'revision_requested') && (isAuthor || req.user?.role === 'Admin');
  if (!canEdit) return res.status(403).json({ error: 'Cannot add tasks' });
  const created = await createWorkPlanTask({ workPlanId: id, title: title.trim(), dueDate: dueDate ?? null, orderIndex: orderIndex ?? 0 });
  res.status(201).json(created);
});

/** Update task. */
router.put('/:id/tasks/:taskId', authenticate, async (req: AuthRequest, res) => {
  const planId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const taskId = typeof req.params.taskId === 'string' ? req.params.taskId : req.params.taskId?.[0] ?? '';
  const { title, dueDate, orderIndex } = req.body;
  const plan = await getWorkPlanById(planId);
  if (!plan) return res.status(404).json({ error: 'Work plan not found' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const isAuthor = plan.authorUserId === req.user?.id || myPostIds.includes(plan.postId);
  const canEdit = (plan.workflowStatus === 'draft' || plan.workflowStatus === 'rejected' || plan.workflowStatus === 'revision_requested') && (isAuthor || req.user?.role === 'Admin');
  if (!canEdit) return res.status(403).json({ error: 'Cannot edit tasks' });
  await updateWorkPlanTask(taskId, { title, dueDate, orderIndex });
  res.json({ ok: true });
});

/** Delete task. */
router.delete('/:id/tasks/:taskId', authenticate, async (req: AuthRequest, res) => {
  const planId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const taskId = typeof req.params.taskId === 'string' ? req.params.taskId : req.params.taskId?.[0] ?? '';
  const plan = await getWorkPlanById(planId);
  if (!plan) return res.status(404).json({ error: 'Work plan not found' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const isAuthor = plan.authorUserId === req.user?.id || myPostIds.includes(plan.postId);
  const canEdit = (plan.workflowStatus === 'draft' || plan.workflowStatus === 'rejected' || plan.workflowStatus === 'revision_requested') && (isAuthor || req.user?.role === 'Admin');
  if (!canEdit) return res.status(403).json({ error: 'Cannot delete tasks' });
  await deleteWorkPlanTask(taskId);
  res.status(204).send();
});

/** Delete work plan. Author or Admin/Department Head. */
router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const plan = await getWorkPlanById(id);
  if (!plan) return res.status(404).json({ error: 'Work plan not found' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const isAuthor = plan.authorUserId === req.user?.id;
  const isAdminOrHead = req.user?.role === 'Admin' || req.user?.role === 'Department Head' || req.user?.role === 'Section Head';
  const canDelete = isAuthor || isAdminOrHead || myPostIds.includes(plan.postId);
  if (!canDelete) return res.status(403).json({ error: 'Cannot delete this plan' });
  await deleteWorkPlan(id);
  res.status(204).send();
});

/** Get notification count for current user. */
router.get('/notifications/count', authenticate, async (req: AuthRequest, res) => {
  if (!req.user?.id) return res.json({ count: 0 });
  const count = await getWorkPlanNotificationCount(req.user.id);
  res.json({ count });
});

/** Get notifications for current user. */
router.get('/notifications', authenticate, async (req: AuthRequest, res) => {
  if (!req.user?.id) return res.json([]);
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const notifications = await getWorkPlanNotifications(req.user.id, limit);
  res.json(notifications);
});

/** Mark notification as read. */
router.patch('/notifications/:id/read', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  await markWorkPlanNotificationAsRead(id);
  res.json({ ok: true });
});

/** Mark all notifications as read. */
router.post('/notifications/read-all', authenticate, async (req: AuthRequest, res) => {
  if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
  await markAllWorkPlanNotificationsAsRead(req.user.id);
  res.json({ ok: true });
});

export default router;
