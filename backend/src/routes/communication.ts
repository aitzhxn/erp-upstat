import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { sanitizeString } from '../middleware/sanitize';
import { getMailboxMessages, getMailboxMessageById, markMailboxMessageAsRead, getAllowListForUser, createMailboxMessage, getPostById, getAttachmentsByMessageId, createMessageAttachment, getAttachmentById, getMessageRecipientPostId, getUnreadCountForUser, getPostsForUser, archiveMailboxMessagesBulk, deleteMailboxMessages, clearMailboxFolder, appendAuditLog } from '../db';

const router = Router();

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const base = Buffer.from(file.originalname, 'latin1').toString('utf-8').replace(/\s+/g, '_').slice(0, 50);
    cb(null, `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`);
  },
});

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

/** Unread message count (across all user's boxes). */
router.get('/unread-count', authenticate, async (req: AuthRequest, res) => {
  if (!req.user?.id) return res.json({ count: 0 });
  const count = await getUnreadCountForUser(req.user.id);
  res.json({ count });
});

/** Get one message with full body (for view modal). User must have access (recipient or sender post). */
router.get('/messages/:id', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  if (!id) return res.status(400).json({ error: 'Message ID required' });
  const msg = await getMailboxMessageById(id);
  if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const canView = myPostIds.includes(msg.recipientPostId) || (msg.senderPostId != null && myPostIds.includes(msg.senderPostId));
  if (!canView) return res.status(403).json({ error: 'Нет доступа' });
  const attachments = await getAttachmentsByMessageId(msg.id);
  res.json({ ...msg, attachments });
});

/** Mark message as read. User must own the recipient post. */
router.patch('/messages/:id/read', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  if (!id) return res.status(400).json({ error: 'Message ID required' });
  const msg = await getMailboxMessageById(id);
  if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  if (!myPostIds.includes(msg.recipientPostId)) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  await markMailboxMessageAsRead(id);
  res.json({ ok: true });
});

/** Get mailbox messages. ?postId= &folder=inbox|archive|sent. Includes attachments. */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  const postId = (req.query.postId as string) || undefined;
  const folder = ((req.query.folder as string) || 'inbox') as 'inbox' | 'archive' | 'sent';
  const allowed = await getAllowListForUser(req.user);
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const list = await getMailboxMessages({
    postId,
    allowedPostIds: folder === 'sent' ? undefined : allowed,
    folder,
    senderPostIds: folder === 'sent' ? myPostIds : undefined,
  });
  const withAttachments = await Promise.all(
    list.map(async (m) => ({
      ...m,
      attachments: await getAttachmentsByMessageId(m.id),
    })),
  );
  res.json(withAttachments);
});

/** Send message to a position (recipient post). Supports file attachments via multipart/form-data. */
router.post('/send', authenticate, upload.array('files', 10), async (req: AuthRequest, res) => {
  const { recipientPostId, senderPostId, subject, body, parentMessageId } = req.body;
  const files = (req as any).files as Express.Multer.File[] | undefined;
  if (!recipientPostId || typeof recipientPostId !== 'string' || !recipientPostId.trim()) {
    return res.status(400).json({ error: 'recipientPostId required' });
  }
  if (!subject || typeof subject !== 'string' || !subject.trim()) {
    return res.status(400).json({ error: 'subject required' });
  }
  const post = await getPostById(recipientPostId.trim());
  if (!post) return res.status(404).json({ error: 'Должность получателя не найдена' });
  const senderPost = senderPostId ? await getPostById(String(senderPostId).trim()) : null;
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const validSender = !senderPostId || (senderPost && myPostIds.includes(senderPost.id));
  const senderEmail = req.user?.email || 'unknown@local';
  const created = await createMailboxMessage({
    recipientPostId: recipientPostId.trim(),
    senderPostId: validSender && senderPost ? senderPost.id : null,
    senderEmail,
    subject: sanitizeString((subject || '').trim()),
    body: sanitizeString(typeof body === 'string' ? body : ''),
    parentMessageId: parentMessageId ? String(parentMessageId).trim() : null,
  });
  const attachments: Array<{ id: string; filename: string; mimeType: string | null; fileSize: number | null }> = [];
  if (files && files.length > 0) {
    for (const f of files) {
      const storedName = path.basename(f.path);
      const att = await createMessageAttachment({
        messageId: created.id,
        filename: f.originalname,
        mimeType: f.mimetype,
        filePath: storedName,
        fileSize: f.size,
      });
      attachments.push({ id: att.id, filename: att.filename, mimeType: att.mimeType, fileSize: att.fileSize });
    }
  }
  res.status(201).json({ ...created, attachments });
});

/** Download attachment. User must have access to the message (recipient post in allowed list). */
router.get('/attachments/:id', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  if (!id) return res.status(400).json({ error: 'Attachment ID required' });
  const att = await getAttachmentById(id);
  if (!att) return res.status(404).json({ error: 'Вложение не найдено' });
  const recipientPostId = await getMessageRecipientPostId(att.messageId);
  if (!recipientPostId) return res.status(404).json({ error: 'Сообщение не найдено' });
  const allowed = await getAllowListForUser(req.user);
  const hasAccess = allowed === null || allowed.includes(recipientPostId);
  if (!hasAccess) return res.status(403).json({ error: 'Нет доступа' });
  const absPath = path.join(uploadsDir, att.filePath);
  const resolvedUploadsDir = path.resolve(uploadsDir);
  const resolvedAbsPath = path.resolve(absPath);
  if (!resolvedAbsPath.startsWith(resolvedUploadsDir + path.sep)) {
    return res.status(400).json({ error: 'Invalid attachment path' });
  }
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Файл не найден' });
  res.download(absPath, att.filename, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'Ошибка скачивания' });
  });
});

/** Archive selected messages. Only messages the user has access to will be archived. */
router.post('/messages/archive', authenticate, async (req: AuthRequest, res) => {
  const { ids } = req.body;
  const idList = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  if (idList.length === 0) return res.status(400).json({ error: 'ids required' });
  // Filter: only messages where user holds the recipient or sender post
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const ownedIds: string[] = [];
  for (const msgId of idList) {
    const msg = await getMailboxMessageById(msgId);
    if (msg && (myPostIds.includes(msg.recipientPostId) || (msg.senderPostId != null && myPostIds.includes(msg.senderPostId)))) {
      ownedIds.push(msgId);
    }
  }
  if (ownedIds.length === 0) return res.status(403).json({ error: 'Нет доступа к указанным сообщениям' });
  await archiveMailboxMessagesBulk(ownedIds);
  await appendAuditLog({ entityType: 'mailbox_message', entityId: 'bulk', action: 'archive', userId: (req as any).user?.id ?? 'unknown', changes: null });
  res.json({ ok: true });
});

/** Delete selected messages. Only messages the user has access to will be deleted. */
router.post('/messages/delete', authenticate, async (req: AuthRequest, res) => {
  const { ids } = req.body;
  const idList = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  if (idList.length === 0) return res.status(400).json({ error: 'ids required' });
  // Filter: only messages where user holds the recipient or sender post
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  const ownedIds: string[] = [];
  for (const msgId of idList) {
    const msg = await getMailboxMessageById(msgId);
    if (msg && (myPostIds.includes(msg.recipientPostId) || (msg.senderPostId != null && myPostIds.includes(msg.senderPostId)))) {
      ownedIds.push(msgId);
    }
  }
  if (ownedIds.length === 0) return res.status(403).json({ error: 'Нет доступа к указанным сообщениям' });
  await deleteMailboxMessages(ownedIds);
  await appendAuditLog({ entityType: 'mailbox_message', entityId: 'bulk', action: 'delete', userId: (req as any).user?.id ?? 'unknown', changes: null });
  res.json({ ok: true });
});

/** Clear folder for post (delete all messages in folder). */
router.post('/clear', authenticate, async (req: AuthRequest, res) => {
  const { postId, folder } = req.body;
  if (!postId || typeof postId !== 'string') return res.status(400).json({ error: 'postId required' });
  const f = (folder === 'sent' || folder === 'archive') ? folder : 'inbox';
  const myPostIds = req.user?.id ? (await getPostsForUser(req.user.id)).map(p => p.id) : [];
  if (!myPostIds.includes(postId)) return res.status(403).json({ error: 'Нет доступа' });
  const deleted = await clearMailboxFolder(postId, f);
  await appendAuditLog({ entityType: 'mailbox_message', entityId: 'bulk', action: 'delete', userId: (req as any).user?.id ?? 'unknown', changes: null });
  res.json({ deleted });
});

export default router;
