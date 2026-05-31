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
  getAdminPostIdForUser,
  getAdminPostIds,
  getPostCreator,
} from '../db';

const router = Router();

function postIdFromParams(params: { id?: string | string[] }): string {
  const id = params.id;
  return typeof id === 'string' ? id : (id?.[0] ?? '');
}

async function isUserSuperAdmin(user: any): Promise<boolean> {
  if (!user?.id) return false;
  const myPosts = await getPostsForUser(user.id);
  return myPosts.some((p) => p.id === 'p1');
}


/** Дерево постов: все посты с информацией о занятости. Любой авторизованный пользователь видит полную оргструктуру. */
router.get('/posts', authenticate, async (req: AuthRequest, res) => {
  res.json(await getPostsWithHolders(null));
});

/** Список всех должностей для выбора получателя сообщения. Любой авторизованный пользователь может писать любому. */
router.get('/posts/for-recipients', authenticate, async (req, res) => {
  res.json(await getPostsWithHolders(null));
});

/** Посты текущего пользователя («мои коробки» для Communication). */
router.get('/my-posts', authenticate, async (req: AuthRequest, res) => {
  if (!req.user?.id) return res.json([]);
  res.json(await getPostsForUser(req.user.id));
});

/** Список пользователей (для выбора при назначении на должность). */
router.get('/users', authenticate, async (req, res) => {
  res.json(await getUsers());
});

/** Список пользователей с ролями (для страницы управления — только Admin). */
router.get('/users/with-roles', authenticate, requireRole('Admin'), async (req, res) => {
  res.json(await getUsersWithRoles());
});

/** Назначить пользователя администратором (на первый свободный пост с ролью Admin). */
router.post('/users/:id/make-admin', authenticate, requireRole('Admin'), async (req: AuthRequest, res) => {
  const targetId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  if (!targetId) return res.status(400).json({ error: 'User ID required' });
  if (targetId === req.user?.id) return res.status(400).json({ error: 'Вы уже администратор' });
  const adminPostIds = await getAdminPostIds();
  for (const postId of adminPostIds) {
    const post = await getPostById(postId);
    if (post && !post.currentHolder) {
      await dbAssignUserToPost(postId, targetId);
      await appendAuditLog({ entityType: 'user', entityId: targetId, action: 'make_admin', userId: req.user!.id, changes: null });
      return res.json({ success: true });
    }
  }
  return res.status(400).json({ error: 'Нет свободной должности администратора. Обратитесь к разработчику.' });
});

/** Убрать роль администратора у пользователя. Любой админ может снять другого админа (не себя). */
router.post('/users/:id/remove-admin', authenticate, requireRole('Admin'), async (req: AuthRequest, res) => {
  const targetId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  if (!targetId) return res.status(400).json({ error: 'User ID required' });
  if (targetId === req.user?.id) return res.status(400).json({ error: 'Нельзя снять админа с самого себя' });
  if (!await getAdminPostIdForUser(targetId)) {
    return res.status(400).json({ error: 'Пользователь не является администратором' });
  }
  while (true) {
    const adminPostId = await getAdminPostIdForUser(targetId);
    if (!adminPostId) break;
    await dbVacatePost(adminPostId);
  }
  await appendAuditLog({ entityType: 'user', entityId: targetId, action: 'remove_admin', userId: req.user!.id, changes: null });
  res.json({ success: true });
});

/** Удалить пользователя (только Admin). */
router.delete('/users/:id', authenticate, requireRole('Admin'), async (req: AuthRequest, res) => {
  const userId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  if (userId === req.user?.id) {
    return res.status(400).json({ error: 'Нельзя удалить самого себя' });
  }
  
  try {
    await dbDeleteUser(userId);
    await appendAuditLog({
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
router.get('/posts/:id/ancestors', authenticate, async (req, res) => {
  const postId = postIdFromParams(req.params);
  const ids = await getAncestorPostIds(postId);
  const all = await getPostsWithHolders(null);
  const ancestors = ids.map((id) => {
    const p = all.find((x) => x.id === id);
    const label = p ? (p.currentHolder ? `${p.title} — ${p.currentHolder.name}` : p.title) : id;
    return { id, title: p?.title ?? id, label };
  });
  res.json(ancestors);
});

/** Один пост по ID (с holder или вакансия). */
router.get('/posts/:id', authenticate, async (req, res) => {
  const id = postIdFromParams(req.params);
  const post = await getPostById(id);
  if (post) {
    res.json(post);
  } else {
    res.status(404).json({ error: 'Post not found' });
  }
});

/** Создать должность. */
router.post('/posts', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  const body = req.body as Partial<PostWithHolder> & { title: string };
  const { title, parentPostId, departmentId, role, level, orderIndex, code } = body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  
  const isSuper = await isUserSuperAdmin(req.user);
  if (!isSuper) {
    const allowed = await getAllowListForUser(req.user);
    if (parentPostId == null && req.user?.role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied: only users at the very top can create a root post' });
    }
    if (allowed != null && parentPostId != null && !allowed.includes(parentPostId)) {
      return res.status(403).json({ error: 'Access denied: parent post is not in your hierarchy' });
    }
  }

  const id = `p${Date.now()}`;
  const posts = await getPostsWithHolders();
  const parentLevel = parentPostId ? (posts.find(p => p.id === parentPostId)?.level ?? 0) + 1 : 0;
  const newPost = await dbCreatePost({
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
  await appendAuditLog({
    entityType: 'post',
    entityId: id,
    action: 'created',
    userId: req.user!.id,
    changes: JSON.stringify({ title: newPost.title, parentPostId: newPost.parentPostId, departmentId: newPost.departmentId, role: newPost.role }),
  });
  res.status(201).json(newPost);
});

/** Обновить должность (редактирование, перемещение). */
router.put('/posts/:id', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  const id = postIdFromParams(req.params);
  const post = await getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const body = req.body as Partial<PostWithHolder>;
  
  const isSuper = await isUserSuperAdmin(req.user);
  if (!isSuper) {
    if (post.parentPostId === null) {
      const creatorId = await getPostCreator(id);
      if (creatorId && creatorId !== req.user?.id) {
        return res.status(403).json({ error: 'Доступ запрещен: корневую должность может менять только тот, кто её создавал!' });
      }
    }

    const allowed = await getAllowListForUser(req.user);
    if (allowed != null && !allowed.includes(id)) {
      return res.status(403).json({ error: 'Access denied: this post is not in your hierarchy' });
    }
    if (allowed != null && body.parentPostId === null) {
      return res.status(403).json({ error: 'Access denied: only users at the very top can make a post a root post' });
    }
    if (allowed != null && body.parentPostId !== undefined && body.parentPostId !== null && !allowed.includes(body.parentPostId)) {
      return res.status(403).json({ error: 'Access denied: target parent post is not in your hierarchy' });
    }
  }
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
    const posts = await getPostsWithHolders();
    updates.level = body.parentPostId
      ? (posts.find(p => p.id === body.parentPostId)?.level ?? 0) + 1
      : 0;
  }
  await dbUpdatePost(id, updates);
  await appendAuditLog({
    entityType: 'post',
    entityId: id,
    action: 'updated',
    userId: req.user!.id,
    changes: Object.keys(updates).length ? JSON.stringify(updates) : null,
  });
  const updated = await getPostById(id);
  res.json(updated);
});

/** Удалить должность (?cascade=true — вместе с дочерними). */
router.delete('/posts/:id', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  const id = postIdFromParams(req.params);
  const post = await getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const isSuper = await isUserSuperAdmin(req.user);
  if (!isSuper) {
    if (post.parentPostId === null) {
      const creatorId = await getPostCreator(id);
      if (creatorId && creatorId !== req.user?.id) {
        return res.status(403).json({ error: 'Доступ запрещен: корневую должность может менять только тот, кто её создавал!' });
      }
    }
    const allowed = await getAllowListForUser(req.user);
    if (allowed != null && !allowed.includes(id)) {
      return res.status(403).json({ error: 'Access denied: this post is not in your hierarchy' });
    }
  }
  const cascade = (req.query.cascade as string) === 'true';
  if (!cascade && await postHasChildren(id)) {
    return res.status(400).json({ error: 'Post has children; use ?cascade=true to delete with children' });
  }
  await dbDeletePosts(id, cascade);
  await appendAuditLog({
    entityType: 'post',
    entityId: id,
    action: 'deleted',
    userId: req.user!.id,
    changes: JSON.stringify({ cascade }),
  });
  res.status(204).send();
});

/** Устаревшие эндпоинты (employees/departments) — оставлены для совместимости. */
router.get('/employees', authenticate, async (req: AuthRequest, res) => {
  const posts = await getPostsWithHolders(null);
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

router.get('/departments', authenticate, async (req, res) => {
  res.json(await getDepartments());
});

router.get('/hierarchy', authenticate, async (req: AuthRequest, res) => {
  res.json({ posts: await getPostsWithHolders(null) });
});

/** Назначить пользователя на пост. Снимает с предыдущей должности. */
router.post('/posts/:id/assign', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  const id = postIdFromParams(req.params);
  const isSuper = await isUserSuperAdmin(req.user);
  if (!isSuper) {
    const allowed = await getAllowListForUser(req.user);
    if (allowed != null && !allowed.includes(id)) {
      return res.status(403).json({ error: 'Access denied: this post is not in your hierarchy' });
    }
  }
  const { userId, name, email } = req.body;
  const post = await getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isSuper && post.parentPostId === null) {
    const creatorId = await getPostCreator(id);
    if (creatorId && creatorId !== req.user?.id) {
      return res.status(403).json({ error: 'Доступ запрещен: корневую должность может менять только тот, кто её создавал!' });
    }
  }
  if (userId) {
    await dbAssignUserToPost(id, userId);
    await appendAuditLog({
      entityType: 'post',
      entityId: id,
      action: 'assign',
      userId: req.user!.id,
      changes: JSON.stringify({ userId }),
    });
  } else {
    await dbVacatePost(id);
    await appendAuditLog({
      entityType: 'post',
      entityId: id,
      action: 'vacate',
      userId: req.user!.id,
    });
  }
  const updated = await getPostById(id);
  // Role may have changed — instruct the client to re-fetch a fresh token only if the current user was affected
  if (userId === req.user?.id) {
    res.setHeader('X-Token-Refresh-Required', 'true');
  }
  res.json(updated);
});

/** Назначить сотрудника на должность (то же, что assign). */
router.post('/posts/:id/assign-user', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  const id = postIdFromParams(req.params);
  const isSuper = await isUserSuperAdmin(req.user);
  if (!isSuper) {
    const allowed = await getAllowListForUser(req.user);
    if (allowed != null && !allowed.includes(id)) {
      return res.status(403).json({ error: 'Access denied: this post is not in your hierarchy' });
    }
  }
  const { userId, name, email } = req.body;
  const post = await getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isSuper && post.parentPostId === null) {
    const creatorId = await getPostCreator(id);
    if (creatorId && creatorId !== req.user?.id) {
      return res.status(403).json({ error: 'Доступ запрещен: корневую должность может менять только тот, кто её создавал!' });
    }
  }
  if (userId) {
    await dbAssignUserToPost(id, userId);
    await appendAuditLog({
      entityType: 'post',
      entityId: id,
      action: 'assign',
      userId: req.user!.id,
      changes: JSON.stringify({ userId }),
    });
  } else {
    await dbVacatePost(id);
    await appendAuditLog({
      entityType: 'post',
      entityId: id,
      action: 'vacate',
      userId: req.user!.id,
    });
  }
  const updated = await getPostById(id);
  // Role may have changed — instruct the client to re-fetch a fresh token only if the current user was affected
  if (userId === req.user?.id) {
    res.setHeader('X-Token-Refresh-Required', 'true');
  }
  res.json(updated);
});

/** Снять сотрудника с должности (сделать вакансией). */
router.post('/posts/:id/vacate', authenticate, requireRole('Admin', 'Department Head'), async (req: AuthRequest, res) => {
  const id = postIdFromParams(req.params);
  const isSuper = await isUserSuperAdmin(req.user);
  if (!isSuper) {
    const allowed = await getAllowListForUser(req.user);
    if (allowed != null && !allowed.includes(id)) {
      return res.status(403).json({ error: 'Access denied: this post is not in your hierarchy' });
    }
  }
  const post = await getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (!isSuper && post.parentPostId === null) {
    const creatorId = await getPostCreator(id);
    if (creatorId && creatorId !== req.user?.id) {
      return res.status(403).json({ error: 'Доступ запрещен: корневую должность может менять только тот, кто её создавал!' });
    }
  }
  await dbVacatePost(id);
  await appendAuditLog({
    entityType: 'post',
    entityId: id,
    action: 'vacate',
    userId: req.user!.id,
  });
  const updated = await getPostById(id);
  res.json(updated);
});

/** Get all departments. */
router.get('/departments', authenticate, async (req, res) => {
  res.json(await getDepartments());
});

/** Create department (Admin only). */
router.post('/departments', authenticate, requireRole('Admin'), async (req: AuthRequest, res) => {
  const { name, parentId, managerPostId } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Название отдела обязательно' });
  }
  
  const id = `dept${Date.now()}`;
  
  try {
    await dbCreateDepartment({
      id,
      name: sanitizeString(name).trim(),
      parentId: parentId || null,
      managerPostId: managerPostId || null,
      organizationId: process.env.DEFAULT_ORGANIZATION_ID ?? '1',
    });

    await appendAuditLog({
      entityType: 'department',
      entityId: id,
      action: 'create',
      userId: req.user!.id,
      changes: JSON.stringify({ name: sanitizeString(name).trim(), parentId, managerPostId }),
    });
    
    const created = (await getDepartments()).find(d => d.id === id);
    res.status(201).json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка при создании отдела';
    res.status(400).json({ error: message });
  }
});

/** Update department (Admin only). */
router.put('/departments/:id', authenticate, requireRole('Admin'), async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  
  if (!id) {
    return res.status(400).json({ error: 'Department ID is required' });
  }
  
  const department = (await getDepartments()).find(d => d.id === id);
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
    const allDepts = await getDepartments();
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
    await dbUpdateDepartment(id, updates);
    
    await appendAuditLog({
      entityType: 'department',
      entityId: id,
      action: 'update',
      userId: req.user!.id,
      changes: JSON.stringify(updates),
    });
    
    const updated = (await getDepartments()).find(d => d.id === id);
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка при обновлении отдела';
    res.status(400).json({ error: message });
  }
});

/** Delete department (Admin only). */
router.delete('/departments/:id', authenticate, requireRole('Admin'), async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0];
  
  if (!id) {
    return res.status(400).json({ error: 'Department ID is required' });
  }
  
  const department = (await getDepartments()).find(d => d.id === id);
  if (!department) {
    return res.status(404).json({ error: 'Отдел не найден' });
  }
  
  try {
    await dbDeleteDepartment(id);
    
    await appendAuditLog({
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
