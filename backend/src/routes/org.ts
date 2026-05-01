import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { sanitizeString } from '../middleware/sanitize';
import type { PostWithHolder, PostHolder } from '../types';
import {
  getPostsWithHolders,
  getPostById,
  getPostsForUser,
  getAncestorPostIds,
  getDepartments,
  createDepartment as dbCreateDepartment,
  updateDepartment as dbUpdateDepartment,
  deleteDepartment as dbDeleteDepartment,
  createPost as dbCreatePost,
  updatePost as dbUpdatePost,
  deletePosts as dbDeletePosts,
  getUsers,
  getUsersWithRoles,
  assignUserToPost as dbAssignUserToPost,
  vacatePost as dbVacatePost,
  deleteUser as dbDeleteUser,
  postHasChildren,
  appendAuditLog,
  getAllowListForUser,
  getAdminAssignedAt,
  getAdminPostIdForUser,
  getAdminPostIds,
} from '../db';

const router = Router();

function postIdFromParams(params: { id?: string | string[] }): string {
  const id = params.id;
  return typeof id === 'string' ? id : (id?.[0] ?? '');
}

/** Дерево постов: все посты с информацией о занятости. Department Head / Section Head видят только своё поддерево. */
router.get('/posts', authenticate, (req: AuthRequest, res) => {
  const allowed = getAllowListForUser(req.user);
  res.json(getPostsWithHolders(allowed));
});

/** Список всех должностей для выбора получателя сообщения. Любой авторизованный пользователь может писать любому. */
router.get('/posts/for-recipients', authenticate, (req, res) => {
  res.json(getPostsWithHolders(null));
});

/** Посты текущего пользователя («мои коробки» для Communication). */
router.get('/my-posts', authenticate, (req: AuthRequest, res) => {
  if (!req.user?.id) return res.json([]);
  res.json(getPostsForUser(req.user.id));
});

/** Список пользователей (для выбора при назначении на должность). */
router.get('/users', authenticate, (req, res) => {
  res.json(getUsers());
});

/** Список пользователей с ролями (для страницы управления — только Admin). */
router.get('/users/with-roles', authenticate, requireRole('Admin'), (req, res) => {
  res.json(getUsersWithRoles());
});

/** Назначить пользователя администратором (на первый свободный пост с ролью Admin). */
router.post('/users/:id/make-admin', authenticate, requireRole('Admin'), (req: AuthRequest, res) => {
  const targetId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  if (!targetId) return res.status(400).json({ error: 'User ID required' });
  if (targetId === req.user?.id) return res.status(400).json({ error: 'Вы уже администратор' });
  const adminPostIds = getAdminPostIds();
  for (const postId of adminPostIds) {
    const post = getPostById(postId);
    if (post && !post.currentHolder) {
      dbAssignUserToPost(postId, targetId);
      appendAuditLog({ entityType: 'user', entityId: targetId, action: 'make_admin', userId: req.user!.id, changes: null });
      return res.json({ success: true });
    }
  }
  return res.status(400).json({ error: 'Нет свободной должности администратора. Обратитесь к разработчику.' });
});

/** Убрать роль администратора у пользователя. Только админ со старшинством может снять более нового админа. */
router.post('/users/:id/remove-admin', authenticate, requireRole('Admin'), (req: AuthRequest, res) => {
  const targetId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  if (!targetId) return res.status(400).json({ error: 'User ID required' });
  if (targetId === req.user?.id) return res.status(400).json({ error: 'Нельзя снять админа с самого себя' });
  const targetAdminPostId = getAdminPostIdForUser(targetId);
  if (!targetAdminPostId) return res.status(400).json({ error: 'Пользователь не является администратором' });
  const requesterAt = getAdminAssignedAt(req.user!.id);
  const targetAt = getAdminAssignedAt(targetId);
  if (!requesterAt || !targetAt) return res.status(403).json({ error: 'Нет прав для этого действия' });
  if (requesterAt >= targetAt) return res.status(403).json({ error: 'Снять админа может только администратор со старшинством (назначенный раньше)' });
  dbVacatePost(targetAdminPostId);
  appendAuditLog({ entityType: 'user', entityId: targetId, action: 'remove_admin', userId: req.user!.id, changes: null });
  res.json({ success: true });
});

/** Удалить пользователя (только Admin). */
router.delete('/users/:id', authenticate, requireRole('Admin'), (req: AuthRequest, res) => {
  const userId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  if (userId === req.user?.id) {
    return res.status(400).json({ error: 'Нельзя удалить самого себя' });
  }
  
  try {
    dbDeleteUser(userId);
    appendAuditLog({
      entityType: 'user',
      entityId: userId,
      action: 'delete',
      userId: req.user?.id ?? 'unknown',
      changes: null,
    });
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка при удалении пользователя';
    res.status(400).json({ error: message });
  }
});

/** Предки поста (вышестоящие должности) для выбора «кому отправить» план на согласование. */
router.get('/posts/:id/ancestors', authenticate, (req, res) => {
  const postId = postIdFromParams(req.params);
  const ids = getAncestorPostIds(postId);
  const all = getPostsWithHolders(null);
  const ancestors = ids.map((id) => {
    const p = all.find((x) => x.id === id);
    const label = p ? (p.currentHolder ? `${p.title} — ${p.currentHolder.name}` : p.title) : id;
    return { id, title: p?.title ?? id, label };
  });
  res.json(ancestors);
});

/** Один пост по ID (с holder или вакансия). */
router.get('/posts/:id', authenticate, (req, res) => {
  const id = postIdFromParams(req.params);
  const post = getPostById(id);
  if (post) {
    res.json(post);
  } else {
    res.status(404).json({ error: 'Post not found' });
  }
});

/** Создать должность. */
router.post('/posts', authenticate, requireRole('Admin', 'Department Head'), (req: AuthRequest, res) => {
  const body = req.body as Partial<PostWithHolder> & { title: string };
  const { title, parentPostId, departmentId, role, level, orderIndex, code } = body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  const id = `p${Date.now()}`;
  const posts = getPostsWithHolders();
  const parentLevel = parentPostId ? (posts.find(p => p.id === parentPostId)?.level ?? 0) + 1 : 0;
  const newPost = dbCreatePost({
    id,
    title: sanitizeString(title).trim(),
    description: body.description ?? '',
    parentPostId: parentPostId ?? null,
    departmentId: departmentId ?? 'd1',
    role: role ?? 'Employee',
    level: level ?? parentLevel,
    orderIndex: orderIndex ?? 0,
    code: code ?? null,
  });
  appendAuditLog({
    entityType: 'post',
    entityId: id,
    action: 'created',
    userId: req.user!.id,
    changes: JSON.stringify({ title: newPost.title, parentPostId: newPost.parentPostId, departmentId: newPost.departmentId, role: newPost.role }),
  });
  res.status(201).json(newPost);
});

/** Обновить должность (редактирование, перемещение). */
router.put('/posts/:id', authenticate, requireRole('Admin', 'Department Head'), (req: AuthRequest, res) => {
  const id = postIdFromParams(req.params);
  const post = getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const body = req.body as Partial<PostWithHolder>;
  const updates: Record<string, any> = {};
  if (body.title !== undefined) updates.title = sanitizeString(body.title);
  if (body.description !== undefined) updates.description = body.description;
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId;
  if (body.role !== undefined) updates.role = body.role;
  if (body.code !== undefined) updates.code = body.code;
  if (body.orderIndex !== undefined) updates.orderIndex = body.orderIndex;
  if (body.level !== undefined) updates.level = body.level;
  if (body.cardColor !== undefined) updates.cardColor = body.cardColor;
  if (body.cardNotes !== undefined) updates.cardNotes = body.cardNotes;
  if (body.parentPostId !== undefined) {
    updates.parentPostId = body.parentPostId;
    const posts = getPostsWithHolders();
    updates.level = body.parentPostId
      ? (posts.find(p => p.id === body.parentPostId)?.level ?? 0) + 1
      : 0;
  }
  dbUpdatePost(id, updates);
  appendAuditLog({
    entityType: 'post',
    entityId: id,
    action: 'updated',
    userId: req.user!.id,
    changes: Object.keys(updates).length ? JSON.stringify(updates) : null,
  });
  const updated = getPostById(id);
  res.json(updated);
});

/** Удалить должность (?cascade=true — вместе с дочерними). */
router.delete('/posts/:id', authenticate, requireRole('Admin', 'Department Head'), (req: AuthRequest, res) => {
  const id = postIdFromParams(req.params);
  const cascade = (req.query.cascade as string) === 'true';
  if (!cascade && postHasChildren(id)) {
    return res.status(400).json({ error: 'Post has children; use ?cascade=true to delete with children' });
  }
  dbDeletePosts(id, cascade);
  appendAuditLog({
    entityType: 'post',
    entityId: id,
    action: 'deleted',
    userId: req.user!.id,
    changes: JSON.stringify({ cascade }),
  });
  res.status(204).send();
});

/** Устаревшие эндпоинты (employees/departments) — оставлены для совместимости. */
router.get('/employees', authenticate, (req: AuthRequest, res) => {
  const allowed = getAllowListForUser(req.user);
  const posts = getPostsWithHolders(allowed);
  const employees = posts
    .filter(p => p.currentHolder != null)
    .map(p => ({
      id: (p.currentHolder as PostHolder).userId,
      name: (p.currentHolder as PostHolder).name,
      email: (p.currentHolder as PostHolder).email,
      postId: p.id,
      departmentId: p.departmentId,
    }));
  res.json(employees);
});

router.get('/departments', authenticate, (req, res) => {
  res.json(getDepartments());
});

router.get('/hierarchy', authenticate, (req: AuthRequest, res) => {
  const allowed = getAllowListForUser(req.user);
  res.json({ posts: getPostsWithHolders(allowed) });
});

/** Назначить пользователя на пост. Снимает с предыдущей должности. */
router.post('/posts/:id/assign', authenticate, requireRole('Admin', 'Department Head'), (req: AuthRequest, res) => {
  const id = postIdFromParams(req.params);
  const { userId, name, email } = req.body;
  const post = getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (userId) {
    dbAssignUserToPost(id, userId);
    appendAuditLog({
      entityType: 'post',
      entityId: id,
      action: 'assign',
      userId: req.user!.id,
      changes: JSON.stringify({ userId }),
    });
  } else {
    dbVacatePost(id);
    appendAuditLog({
      entityType: 'post',
      entityId: id,
      action: 'vacate',
      userId: req.user!.id,
    });
  }
  const updated = getPostById(id);
  // Role may have changed — instruct the client to re-fetch a fresh token
  res.setHeader('X-Token-Refresh-Required', 'true');
  res.json(updated);
});

/** Назначить сотрудника на должность (то же, что assign). */
router.post('/posts/:id/assign-user', authenticate, requireRole('Admin', 'Department Head'), (req: AuthRequest, res) => {
  const id = postIdFromParams(req.params);
  const { userId, name, email } = req.body;
  const post = getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (userId) {
    dbAssignUserToPost(id, userId);
    appendAuditLog({
      entityType: 'post',
      entityId: id,
      action: 'assign',
      userId: req.user!.id,
      changes: JSON.stringify({ userId }),
    });
  } else {
    dbVacatePost(id);
    appendAuditLog({
      entityType: 'post',
      entityId: id,
      action: 'vacate',
      userId: req.user!.id,
    });
  }
  const updated = getPostById(id);
  // Role may have changed — instruct the client to re-fetch a fresh token
  res.setHeader('X-Token-Refresh-Required', 'true');
  res.json(updated);
});

/** Снять сотрудника с должности (сделать вакансией). */
router.post('/posts/:id/vacate', authenticate, requireRole('Admin', 'Department Head'), (req: AuthRequest, res) => {
  const id = postIdFromParams(req.params);
  const post = getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  dbVacatePost(id);
  appendAuditLog({
    entityType: 'post',
    entityId: id,
    action: 'vacate',
    userId: req.user!.id,
  });
  const updated = getPostById(id);
  res.json(updated);
});

/** Get all departments. */
router.get('/departments', authenticate, (req, res) => {
  res.json(getDepartments());
});

/** Create department (Admin only). */
router.post('/departments', authenticate, requireRole('Admin'), (req: AuthRequest, res) => {
  const { name, parentId, managerPostId } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название отдела обязательно' });
  }
  
  const id = `dept${Date.now()}`;
  
  try {
    dbCreateDepartment({
      id,
      name: sanitizeString(name).trim(),
      parentId: parentId || null,
      managerPostId: managerPostId || null,
      organizationId: process.env.DEFAULT_ORGANIZATION_ID ?? '1',
    });

    appendAuditLog({
      entityType: 'department',
      entityId: id,
      action: 'create',
      userId: req.user!.id,
      changes: JSON.stringify({ name: sanitizeString(name).trim(), parentId, managerPostId }),
    });
    
    const created = getDepartments().find(d => d.id === id);
    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка при создании отдела';
    res.status(400).json({ error: message });
  }
});

/** Update department (Admin only). */
router.put('/departments/:id', authenticate, requireRole('Admin'), (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  
  if (!id) {
    return res.status(400).json({ error: 'Department ID is required' });
  }
  
  const department = getDepartments().find(d => d.id === id);
  if (!department) {
    return res.status(404).json({ error: 'Отдел не найден' });
  }
  
  const { name, parentId, managerPostId } = req.body;
  const updates: any = {};

  if (name !== undefined) updates.name = sanitizeString(name).trim();
  if (parentId !== undefined) updates.parentId = parentId || null;
  if (managerPostId !== undefined) updates.managerPostId = managerPostId || null;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  // Check for circular reference: new parent must not be a descendant of this dept
  if (parentId) {
    const allDepts = getDepartments();
    const deptMap = new Map(allDepts.map(d => [d.id, d]));
    const checkCircular = (checkId: string, targetId: string): boolean => {
      const dept = deptMap.get(checkId);
      if (!dept) return false;
      if (dept.parentId === targetId) return true;
      if (dept.parentId) return checkCircular(dept.parentId, targetId);
      return false;
    };
    if (parentId === id || checkCircular(parentId, id)) {
      return res.status(400).json({ error: 'Circular department reference detected' });
    }
  }

  try {
    dbUpdateDepartment(id, updates);
    
    appendAuditLog({
      entityType: 'department',
      entityId: id,
      action: 'update',
      userId: req.user!.id,
      changes: JSON.stringify(updates),
    });
    
    const updated = getDepartments().find(d => d.id === id);
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка при обновлении отдела';
    res.status(400).json({ error: message });
  }
});

/** Delete department (Admin only). */
router.delete('/departments/:id', authenticate, requireRole('Admin'), (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  
  if (!id) {
    return res.status(400).json({ error: 'Department ID is required' });
  }
  
  const department = getDepartments().find(d => d.id === id);
  if (!department) {
    return res.status(404).json({ error: 'Отдел не найден' });
  }
  
  try {
    dbDeleteDepartment(id);
    
    appendAuditLog({
      entityType: 'department',
      entityId: id,
      action: 'delete',
      userId: req.user!.id,
      changes: null,
    });
    
    res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка при удалении отдела';
    res.status(400).json({ error: message });
  }
});

export default router;
