import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcryptjs';
import type { PostWithHolder, PostHolder, User } from './types';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data.db');
const database = new Database(dbPath);
database.pragma('foreign_keys = ON');

function rowToPost(row: any): Omit<PostWithHolder, 'currentHolder'> {
  return {
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    parentPostId: row.parent_post_id,
    departmentId: row.department_id,
    role: row.role,
    level: row.level,
    orderIndex: row.order_index,
    code: row.code || undefined,
    cardColor: row.card_color || undefined,
    cardNotes: row.card_notes || undefined,
  };
}

function rowToHolder(row: any): PostHolder | null {
  if (!row?.user_id) return null;
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email || undefined,
    avatarUrl: row.avatar_url || undefined,
  };
}

/** Run schema and optional code column; seed if empty. */
export function initDb(): void {
  // Works from both src/ (ts-node) and dist/ (node): both resolve to backend/src/schema.sql
  const schemaPath = path.join(__dirname, '..', 'src', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
  try {
    database.exec('ALTER TABLE posts ADD COLUMN code TEXT');
  } catch {
    // column may already exist
  }
  try {
    database.exec('ALTER TABLE posts ADD COLUMN card_color TEXT');
  } catch {
    // column may already exist
  }
  try {
    database.exec('ALTER TABLE posts ADD COLUMN card_notes TEXT');
  } catch {
    // column may already exist
  }
  migrateStatisticQuotasTable();
  migratePostStatisticsTable();
  migrateMetricToPostTable();
  migrateMetricDefinitionsTable();
  migrateUserPostsTable();
  migrateUsersToUserPosts();
  migrateMailboxAttachmentsTable();
  migrateMailboxMessagesFolder();
  migrateMailboxMessagesWorkPlan();
  migrateWorkPlanNotifications();
  migrateWorkPlansWorkflow();
  seedMetricDefinitionsIfEmpty();
  seedIfEmpty();
  ensureSecondAdminPost();
  if (process.env.NODE_ENV !== 'production') {
    ensureUserAdiletMail();
  }
}

/** Ensure metric_definitions table exists (for DBs created before schema had it). */
function migrateMetricDefinitionsTable(): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS metric_definitions (
      id         TEXT PRIMARY KEY,
      code       TEXT UNIQUE NOT NULL,
      name       TEXT NOT NULL,
      unit       TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    database.exec('ALTER TABLE metric_definitions ADD COLUMN description TEXT');
  } catch {
    // column may already exist
  }
}

/** Ensure statistic_quotas table exists (for DBs created before schema had it). */
function migrateStatisticQuotasTable(): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS statistic_quotas (
      id           TEXT PRIMARY KEY,
      post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      metric_code  TEXT NOT NULL,
      period       TEXT NOT NULL,
      target_value REAL NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (post_id, metric_code, period)
    )
  `);
}

/** Ensure post_statistics table exists (for DBs created before schema had it). */
function migratePostStatisticsTable(): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS post_statistics (
      id          TEXT PRIMARY KEY,
      post_id     TEXT NOT NULL REFERENCES posts(id),
      period      TEXT NOT NULL,
      metric_code TEXT NOT NULL,
      value       REAL NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/** Ensure metric_to_post table exists and has daily_target. */
function migrateMetricToPostTable(): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS metric_to_post (
      post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      metric_code  TEXT NOT NULL,
      responsible_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, metric_code)
    )
  `);
  try {
    database.exec('ALTER TABLE metric_to_post ADD COLUMN daily_target REAL');
  } catch {
    // column already exists
  }
}

/** Ensure user_posts table exists (for DBs created before schema had it). */
function migrateUserPostsTable(): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_posts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, post_id),
      UNIQUE (post_id)
    )
  `);
  try {
    database.exec('ALTER TABLE user_posts ADD COLUMN assigned_at TEXT');
    database.exec(`UPDATE user_posts SET assigned_at = '2000-01-01 00:00:00' WHERE assigned_at IS NULL`);
  } catch {
    // already exists
  }
}

/** Ensure second admin post exists so multiple admins can exist (for seniority / remove-admin). */
function ensureSecondAdminPost(): void {
  const exists = database.prepare('SELECT 1 FROM posts WHERE id = ?').get('p_admin2');
  if (exists) return;
  database.prepare(`
    INSERT INTO posts (id, title, description, parent_post_id, department_id, role, level, order_index, code)
    VALUES ('p_admin2', 'Администратор', 'Дополнительная роль администратора', 'p1', 'd1', 'Admin', 0, 99, null)
  `).run();
}

/** Ensure mailbox_message_attachments table exists. */
function migrateMailboxAttachmentsTable(): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS mailbox_message_attachments (
      id          TEXT PRIMARY KEY,
      message_id  TEXT NOT NULL REFERENCES mailbox_messages(id) ON DELETE CASCADE,
      filename    TEXT NOT NULL,
      mime_type   TEXT,
      file_path   TEXT NOT NULL,
      file_size   INTEGER,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    database.exec('CREATE INDEX IF NOT EXISTS idx_attachments_message ON mailbox_message_attachments(message_id)');
  } catch {
    // ignore
  }
}

/** Add sender_post_id, folder, and body to mailbox_messages. */
function migrateMailboxMessagesFolder(): void {
  try {
    database.exec('ALTER TABLE mailbox_messages ADD COLUMN sender_post_id TEXT REFERENCES posts(id)');
  } catch {
    // already exists
  }
  try {
    database.exec("ALTER TABLE mailbox_messages ADD COLUMN folder TEXT DEFAULT 'inbox'");
    database.exec("UPDATE mailbox_messages SET folder = 'inbox' WHERE folder IS NULL");
  } catch {
    // already exists
  }
  try {
    database.exec('ALTER TABLE mailbox_messages ADD COLUMN body TEXT');
  } catch {
    // already exists
  }
}

/** Add work_plan_id to mailbox_messages for work plan notifications. */
function migrateMailboxMessagesWorkPlan(): void {
  try {
    database.exec('ALTER TABLE mailbox_messages ADD COLUMN work_plan_id TEXT REFERENCES work_plans(id)');
  } catch {
    // already exists
  }
  try {
    database.exec('CREATE INDEX IF NOT EXISTS idx_mailbox_work_plan ON mailbox_messages(work_plan_id)');
  } catch {
    // already exists
  }
}

/** Create work_plan_notifications table for in-app notifications. */
function migrateWorkPlanNotifications(): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS work_plan_notifications (
      id                 TEXT PRIMARY KEY,
      work_plan_id       TEXT NOT NULL REFERENCES work_plans(id),
      recipient_user_id  TEXT NOT NULL REFERENCES users(id),
      actor_user_id      TEXT REFERENCES users(id),
      action             TEXT NOT NULL,
      created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      read               INTEGER NOT NULL DEFAULT 0
    )
  `);
  try {
    database.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user ON work_plan_notifications(recipient_user_id, read)');
  } catch {}
  try {
    database.exec('CREATE INDEX IF NOT EXISTS idx_notifications_plan ON work_plan_notifications(work_plan_id)');
  } catch {}
}

/** Add workflow fields to work_plans and create work_plan_tasks. */
function migrateWorkPlansWorkflow(): void {
  try {
    database.exec('ALTER TABLE work_plans ADD COLUMN workflow_status TEXT DEFAULT \'draft\'');
  } catch { /* already exists */ }
  try {
    database.exec('ALTER TABLE work_plans ADD COLUMN author_user_id TEXT REFERENCES users(id)');
  } catch { /* already exists */ }
  try {
    database.exec('ALTER TABLE work_plans ADD COLUMN approver_post_id TEXT REFERENCES posts(id)');
  } catch { /* already exists */ }
  try {
    database.exec('ALTER TABLE work_plans ADD COLUMN submitted_at TEXT');
  } catch { /* already exists */ }
  try {
    database.exec('ALTER TABLE work_plans ADD COLUMN approved_at TEXT');
  } catch { /* already exists */ }
  try {
    database.exec('ALTER TABLE work_plans ADD COLUMN rejected_at TEXT');
  } catch { /* already exists */ }
  try {
    database.exec('ALTER TABLE work_plans ADD COLUMN rejection_comment TEXT');
  } catch { /* already exists */ }
  try {
    database.exec('ALTER TABLE work_plans ADD COLUMN period TEXT');
  } catch { /* already exists */ }
  try {
    database.exec('ALTER TABLE work_plans ADD COLUMN approval_comment TEXT');
  } catch { /* already exists */ }
  try {
    database.exec('ALTER TABLE work_plans ADD COLUMN message_text TEXT');
  } catch { /* already exists */ }
  database.exec(`
    CREATE TABLE IF NOT EXISTS work_plan_tasks (
      id TEXT PRIMARY KEY,
      work_plan_id TEXT NOT NULL REFERENCES work_plans(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      due_date TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    database.exec('CREATE INDEX IF NOT EXISTS idx_work_plan_tasks_plan ON work_plan_tasks(work_plan_id)');
  } catch { /* ignore */ }
  database.exec(`UPDATE work_plans SET workflow_status = 'draft' WHERE workflow_status IS NULL`);
}

/** Migrate users.post_id into user_posts so one user can hold multiple posts. */
function migrateUsersToUserPosts(): void {
  try {
    database.exec(`
      INSERT OR IGNORE INTO user_posts (user_id, post_id)
      SELECT id, post_id FROM users WHERE post_id IS NOT NULL
    `);
  } catch {
    // ignore if no post_id column or other issue
  }
}

const DEFAULT_METRICS: Array<[string, string, string]> = [
  ['completedTasks', 'Выполненные задачи', 'шт'],
  ['overdue', 'Просрочено', 'шт'],
  ['revenue', 'Валовой доход', 'руб'],
  ['calls', 'Исходящие звонки', 'шт'],
  ['presentations', 'Отправленные презентации', 'шт'],
  ['proposals', 'Отправленные КП', 'шт'],
  ['contracts', 'Заключённые договоры', 'шт'],
];

function seedMetricDefinitionsIfEmpty(): void {
  const count = database.prepare('SELECT COUNT(*) as c FROM metric_definitions').get() as { c: number };
  if (count.c > 0) return;
  const insert = database.prepare(`
    INSERT INTO metric_definitions (id, code, name, unit)
    VALUES (?, ?, ?, ?)
  `);
  DEFAULT_METRICS.forEach(([code, name, unit], i) => {
    insert.run(`metric${i + 1}`, code, name, unit);
  });
}

function seedIfEmpty(): void {
  const count = database.prepare('SELECT COUNT(*) as c FROM posts').get() as { c: number };
  if (count.c > 0) return;

  const insertPost = database.prepare(`
    INSERT INTO posts (id, title, description, parent_post_id, department_id, role, level, order_index, code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertUser = database.prepare(`
    INSERT INTO users (id, email, name, organization_id, password_hash, post_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertDept = database.prepare(`
    INSERT INTO departments (id, name, parent_id, manager_post_id, organization_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  const posts: Array<[string, string, string, string | null, string, string, number, number, string | null]> = [
    ['p1', 'Исполнительный директор', 'Руководитель организации', null, 'd1', 'Admin', 0, 0, null],
    ['p2', 'Заместитель по управлению', '', 'p1', 'd2', 'Department Head', 1, 0, null],
    ['p3', 'Заместитель по производству', '', 'p1', 'd3', 'Department Head', 1, 1, null],
    ['p4', 'Руководитель 1 Отделения', 'Персонал и коммуникации', 'p2', 'd4', 'Section Head', 2, 0, null],
    ['p5', 'Начальник отдела 1', 'Направления и персонала', 'p4', 'd4', 'Employee', 3, 0, null],
  ];
  for (const p of posts) insertPost.run(...p);

  const defaultHash = bcrypt.hashSync('password123', 10);
  insertUser.run('u1', 'a@example.com', 'Королева Анастасия', '1', defaultHash, 'p1');
  insertUser.run('u2', 'd@example.com', 'Дана Ишмухаметова', '1', defaultHash, 'p2');
  insertUser.run('u3', 'free@example.com', 'Иван Свободный', '1', defaultHash, null);

  const depts: Array<[string, string, null, string, string]> = [
    ['d1', '—', null, 'p1', '1'],
    ['d2', 'Управление', null, 'p2', '1'],
    ['d3', 'Производство', null, 'p3', '1'],
    ['d4', 'Персонал и коммуникации', null, 'p4', '1'],
  ];
  for (const d of depts) insertDept.run(...d);

  const insertInstruction = database.prepare(`
    INSERT INTO instructions (id, title, post_id, owner_post_id, status, version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertInstruction.run('ins1', 'Safety Protocol v2.1', 'p1', 'p1', 'active', 2, new Date().toISOString());
  insertInstruction.run('ins2', 'Data Handling Guidelines', 'p2', 'p2', 'active', 1, new Date().toISOString());

  const insertStat = database.prepare(`
    INSERT INTO post_statistics (id, post_id, period, metric_code, value)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertStat.run('stat1', 'p1', '2026-Q1', 'completedTasks', 12);
  insertStat.run('stat2', 'p1', '2026-Q1', 'overdue', 0);
  insertStat.run('stat3', 'p2', '2026-Q1', 'completedTasks', 8);
  insertStat.run('stat4', 'p1', '2026-01', 'completedTasks', 4);
  insertStat.run('stat5', 'p1', '2026-02', 'completedTasks', 5);
  insertStat.run('stat6', 'p1', '2026-03', 'completedTasks', 3);
  insertStat.run('stat7', 'p2', '2026-01', 'completedTasks', 3);
  insertStat.run('stat8', 'p2', '2026-02', 'completedTasks', 5);
  insertStat.run('stat9', 'p1', '2026-Q1', 'revenue', 120000);
  insertStat.run('stat10', 'p2', '2026-Q1', 'revenue', 45000);

  const insertBudget = database.prepare(`
    INSERT INTO budgets (id, department_id, responsible_post_id, category, period, planned, approved, spent, remaining, limits, approval_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertBudget.run('b1', 'd2', 'p2', 'Salaries', '2026-Q1', 500000, 480000, 120000, 360000, 500000, 'approved');
  insertBudget.run('b2', 'd3', 'p3', 'Campaigns', '2026-Q1', 200000, 0, 0, 200000, 200000, 'pending');
  insertBudget.run('b3', 'd4', 'p4', 'Training', '2026-Q1', 50000, 50000, 0, 50000, 50000, 'approved');

  const insertWorkPlan = database.prepare(`
    INSERT INTO work_plans (id, title, post_id, department, status, due_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  insertWorkPlan.run('wp1', 'Q1 Product Launch', 'p1', 'Product', 'on-track', '2026-03-31', now, now);
  insertWorkPlan.run('wp2', 'Marketing Campaign', 'p2', 'Marketing', 'at-risk', '2026-02-15', now, now);
  insertWorkPlan.run('wp3', 'Infrastructure Upgrade', 'p3', 'IT', 'overdue', '2026-01-20', now, now);

  const insertMetricToPost = database.prepare(`
    INSERT INTO metric_to_post (post_id, metric_code, responsible_user_id, daily_target)
    VALUES (?, ?, ?, ?)
  `);
  insertMetricToPost.run('p1', 'completedTasks', 'u1', 5);
  insertMetricToPost.run('p1', 'revenue', 'u1', 5000);
  insertMetricToPost.run('p2', 'completedTasks', 'u2', 3);
  insertMetricToPost.run('p2', 'revenue', null, null);
  insertMetricToPost.run('p3', 'calls', 'u2', 10);

  const insertMail = database.prepare(`
    INSERT INTO mailbox_messages (id, recipient_post_id, sender_email, subject, body_snippet, message_date, unread)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertMail.run('msg1', 'p1', 'john@example.com', 'Q1 Budget Review', 'Please review the attached budget.', '2026-01-22', 1);
  insertMail.run('msg2', 'p1', 'jane@example.com', 'Team Meeting Reminder', 'Reminder: meeting at 10:00.', '2026-01-21', 0);
  insertMail.run('msg3', 'p2', 'hr@example.com', 'Staff Update', 'New hire paperwork.', '2026-01-20', 1);

  const insertAudit = database.prepare(`
    INSERT INTO audit_log (id, entity_type, entity_id, action, user_id, changes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const auditNow = new Date().toISOString();
  insertAudit.run('al1', 'post', 'p1', 'created', 'u1', null, auditNow);
  insertAudit.run('al2', 'post', 'p1', 'assign', 'u1', '{"userId":"u1"}', auditNow);
  insertAudit.run('al3', 'post', 'p2', 'updated', 'u1', '{"title":"Заместитель по управлению"}', auditNow);
}

/** Ensure user adilet2005@mail.ru exists (password: adilet2005). Idempotent. */
function ensureUserAdiletMail(): void {
  const email = 'adilet2005@mail.ru';
  const existing = database.prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?').get(email.toLowerCase()) as { id: string } | undefined;
  if (existing) return;
  const id = 'u-adilet-mail';
  const passwordHash = bcrypt.hashSync('adilet2005', 10);
  database.prepare(`
    INSERT INTO users (id, email, name, organization_id, password_hash, post_id)
    VALUES (?, ?, ?, ?, ?, NULL)
  `).run(id, email, 'Adilet', '1', passwordHash);
}

/** All posts with currentHolder (from user_posts: one person can hold many posts). Optional allowedPostIds. */
export function getPostsWithHolders(allowedPostIds?: string[] | null): PostWithHolder[] {
  if (allowedPostIds && allowedPostIds.length > 500) {
    throw new Error('Too many IDs requested');
  }
  let sql = `
    SELECT p.id, p.title, p.description, p.parent_post_id, p.department_id, p.role, p.level, p.order_index, p.code,
           p.card_color, p.card_notes,
           u.id AS user_id, u.name, u.email, u.avatar_url
    FROM posts p
    LEFT JOIN user_posts up ON up.post_id = p.id
    LEFT JOIN users u ON u.id = up.user_id
  `;
  const params: string[] = [];
  if (allowedPostIds != null && allowedPostIds.length > 0) {
    sql += ` WHERE p.id IN (${allowedPostIds.map(() => '?').join(',')})`;
    params.push(...allowedPostIds);
  }
  sql += ' ORDER BY p.level, p.order_index';
  const rows = (params.length ? database.prepare(sql).all(...params) : database.prepare(sql).all()) as any[];
  return rows.map(r => ({ ...rowToPost(r), currentHolder: rowToHolder(r) }));
}

/** Posts the user holds (from user_posts; fallback to users.post_id). "My boxes" for Communication. */
export function getPostsForUser(userId: string): PostWithHolder[] {
  const fromUserPosts = database.prepare('SELECT post_id FROM user_posts WHERE user_id = ?').all(userId) as Array<{ post_id: string }>;
  let postIds = fromUserPosts.map((r) => r.post_id);
  if (postIds.length === 0) {
    const u = database.prepare('SELECT post_id FROM users WHERE id = ?').get(userId) as { post_id: string | null } | undefined;
    if (u?.post_id) postIds = [u.post_id];
  }
  if (postIds.length === 0) return [];
  const placeholders = postIds.map(() => '?').join(',');
  const rows = database.prepare(`
    SELECT p.id, p.title, p.description, p.parent_post_id, p.department_id, p.role, p.level, p.order_index, p.code,
           p.card_color, p.card_notes,
           u.id AS user_id, u.name, u.email, u.avatar_url
    FROM posts p
    LEFT JOIN user_posts up ON up.post_id = p.id
    LEFT JOIN users u ON u.id = up.user_id
    WHERE p.id IN (${placeholders})
    ORDER BY p.title
  `).all(...postIds) as any[];
  return rows.map((r) => ({ ...rowToPost(r), currentHolder: rowToHolder(r) }));
}

/** Single post by id with holder. */
export function getPostById(id: string): PostWithHolder | null {
  const row = database.prepare(`
    SELECT p.id, p.title, p.description, p.parent_post_id, p.department_id, p.role, p.level, p.order_index, p.code,
           p.card_color, p.card_notes,
           u.id AS user_id, u.name, u.email, u.avatar_url
    FROM posts p
    LEFT JOIN user_posts up ON up.post_id = p.id
    LEFT JOIN users u ON u.id = up.user_id
    WHERE p.id = ?
  `).get(id) as any;
  if (!row) return null;
  return { ...rowToPost(row), currentHolder: rowToHolder(row) };
}

/** Create post; returns new post with currentHolder null. */
export function createPost(data: {
  id: string;
  title: string;
  description?: string;
  parentPostId: string | null;
  departmentId: string;
  role: string;
  level: number;
  orderIndex: number;
  code?: string | null;
}): PostWithHolder {
  database.prepare(`
    INSERT INTO posts (id, title, description, parent_post_id, department_id, role, level, order_index, code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.title,
    data.description ?? '',
    data.parentPostId,
    data.departmentId,
    data.role,
    data.level,
    data.orderIndex,
    data.code ?? null
  );
  return getPostById(data.id)!;
}

/** Update post fields. */
export function updatePost(id: string, data: Partial<{
  title: string;
  description: string;
  departmentId: string;
  role: string;
  level: number;
  orderIndex: number;
  code: string | null;
  parentPostId: string | null;
  cardColor: string | null;
  cardNotes: string | null;
}>): void {
  const fields: string[] = [];
  const values: any[] = [];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
  if (data.departmentId !== undefined) { fields.push('department_id = ?'); values.push(data.departmentId); }
  if (data.role !== undefined) { fields.push('role = ?'); values.push(data.role); }
  if (data.level !== undefined) { fields.push('level = ?'); values.push(data.level); }
  if (data.orderIndex !== undefined) { fields.push('order_index = ?'); values.push(data.orderIndex); }
  if (data.code !== undefined) { fields.push('code = ?'); values.push(data.code); }
  if (data.parentPostId !== undefined) { fields.push('parent_post_id = ?'); values.push(data.parentPostId); }
  if (data.cardColor !== undefined) { fields.push('card_color = ?'); values.push(data.cardColor); }
  if (data.cardNotes !== undefined) { fields.push('card_notes = ?'); values.push(data.cardNotes); }
  if (fields.length === 0) return;
  values.push(id);
  database.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/** Delete post(s). If cascade, delete subtree. Cleans FKs: stats, work_plans, mailbox, budgets, departments, instructions. */
export function deletePosts(id: string, cascade: boolean): void {
  const tx = database.transaction(() => {
    const toRemove: string[] = [id];
    if (cascade) {
      const collect = (pid: string) => {
        const children = database.prepare('SELECT id FROM posts WHERE parent_post_id = ?').all(pid) as { id: string }[];
        children.forEach(c => { toRemove.push(c.id); collect(c.id); });
      };
      collect(id);
    }
    // Delete children before parents (satisfy parent_post_id FK)
    const ordered = toRemove.slice().reverse();
    for (const pid of ordered) {
      database.prepare('DELETE FROM post_statistics WHERE post_id = ?').run(pid);
      database.prepare('DELETE FROM work_plans WHERE post_id = ?').run(pid);
      database.prepare('DELETE FROM mailbox_messages WHERE recipient_post_id = ?').run(pid);
      database.prepare('UPDATE budgets SET responsible_post_id = NULL WHERE responsible_post_id = ?').run(pid);
      database.prepare('UPDATE departments SET manager_post_id = NULL WHERE manager_post_id = ?').run(pid);
      const instrIds = database.prepare('SELECT id FROM instructions WHERE post_id = ? OR owner_post_id = ?').all(pid, pid) as { id: string }[];
      for (const i of instrIds) {
        database.prepare('DELETE FROM instruction_steps WHERE instruction_id = ?').run(i.id);
      }
      database.prepare('DELETE FROM instructions WHERE post_id = ? OR owner_post_id = ?').run(pid, pid);
      database.prepare('UPDATE users SET post_id = NULL WHERE post_id = ?').run(pid);
      database.prepare('DELETE FROM posts WHERE id = ?').run(pid);
    }
  });
  tx();
}

/** All users (id, name, email, avatarUrl, postId). */
export function getUsers(): Pick<User, 'id' | 'name' | 'email' | 'avatarUrl' | 'postId'>[] {
  const rows = database.prepare('SELECT id, name, email, avatar_url, post_id FROM users').all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    avatarUrl: r.avatar_url || undefined,
    postId: r.post_id,
  }));
}

/** When the user was assigned to any admin post, or null if not admin. Used for seniority: only older admins can remove newer ones. */
export function getAdminAssignedAt(userId: string): string | null {
  const row = database.prepare(`
    SELECT up.assigned_at FROM user_posts up JOIN posts p ON p.id = up.post_id
    WHERE up.user_id = ? AND p.role = 'Admin' ORDER BY up.assigned_at ASC LIMIT 1
  `).get(userId) as { assigned_at: string | null } | undefined;
  return row?.assigned_at ?? null;
}

/** Post id that has role Admin and is held by this user, or null. */
export function getAdminPostIdForUser(userId: string): string | null {
  const row = database.prepare(`
    SELECT up.post_id FROM user_posts up JOIN posts p ON p.id = up.post_id
    WHERE up.user_id = ? AND p.role = 'Admin' LIMIT 1
  `).get(userId) as { post_id: string } | undefined;
  return row?.post_id ?? null;
}

/** Ids of posts with role Admin (for finding a free slot when making admin). */
export function getAdminPostIds(): string[] {
  const rows = database.prepare('SELECT id FROM posts WHERE role = ?').all('Admin') as { id: string }[];
  return rows.map(r => r.id);
}

/** All users with effective role (highest among posts) and post title (for Admin user management). Includes adminAssignedAt for seniority. */
export function getUsersWithRoles(): Array<{ id: string; name: string; email: string; avatarUrl?: string; postId: string | null; postTitle: string | null; role: string | null; adminAssignedAt: string | null }> {
  const rows = database.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_url, u.post_id, p.title AS post_title
    FROM users u
    LEFT JOIN posts p ON p.id = u.post_id
    ORDER BY u.name
  `).all() as any[];
  const roleRows = database.prepare(`
    SELECT up.user_id, p.role FROM user_posts up JOIN posts p ON p.id = up.post_id
  `).all() as { user_id: string; role: string }[];
  const adminRows = database.prepare(`
    SELECT up.user_id, MIN(up.assigned_at) AS assigned_at FROM user_posts up JOIN posts p ON p.id = up.post_id WHERE p.role = 'Admin' GROUP BY up.user_id
  `).all() as { user_id: string; assigned_at: string | null }[];
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, []);
    rolesByUser.get(r.user_id)!.push(r.role);
  }
  const adminByUser = new Map<string, string | null>();
  for (const a of adminRows) adminByUser.set(a.user_id, a.assigned_at);
  return rows.map(r => {
    const roles = rolesByUser.get(r.id) ?? [];
    const role = roles.length ? highestRole(roles) : (r.post_id ? (database.prepare('SELECT role FROM posts WHERE id = ?').get(r.post_id) as { role: string })?.role ?? null : null);
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatar_url || undefined,
      postId: r.post_id,
      postTitle: r.post_title || null,
      role: role || null,
      adminAssignedAt: role === 'Admin' ? (adminByUser.get(r.id) ?? null) : null,
    };
  });
}

/** Set user's post_id (assign or vacate). Clears previous post. */
export function setUserPostId(userId: string, postId: string | null): void {
  database.prepare('UPDATE users SET post_id = ? WHERE id = ?').run(postId, userId);
}

/** Assign user to post. One person can hold many posts: we add (userId, postId) and set primary. Post gets one holder. */
export function assignUserToPost(postId: string, userId: string): void {
  const tx = database.transaction(() => {
    database.prepare('DELETE FROM user_posts WHERE post_id = ?').run(postId);
    database.prepare(`INSERT INTO user_posts (user_id, post_id, assigned_at) VALUES (?, ?, datetime('now'))`).run(userId, postId);
    database.prepare('UPDATE users SET post_id = ? WHERE id = ?').run(postId, userId);
  });
  tx();
}

/** Clear holder from post. If user has no other posts, clear users.post_id. */
export function vacatePost(postId: string): void {
  const holder = database.prepare('SELECT user_id FROM user_posts WHERE post_id = ?').get(postId) as { user_id: string } | undefined;
  database.prepare('DELETE FROM user_posts WHERE post_id = ?').run(postId);
  if (holder) {
    const rest = database.prepare('SELECT post_id FROM user_posts WHERE user_id = ? LIMIT 1').get(holder.user_id) as { post_id: string } | undefined;
    database.prepare('UPDATE users SET post_id = ? WHERE id = ?').run(rest?.post_id ?? null, holder.user_id);
  }
}

/** Delete user from system. Vacates all posts held by user. */
export function deleteUser(userId: string): void {
  const user = database.prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id: string } | undefined;
  if (!user) {
    throw new Error('Пользователь не найден');
  }
  
  // Get all posts held by this user and vacate them
  const userPosts = database.prepare('SELECT post_id FROM user_posts WHERE user_id = ?').all(userId) as Array<{ post_id: string }>;
  userPosts.forEach(({ post_id }) => {
    vacatePost(post_id);
  });
  
  // Delete user (CASCADE will handle user_posts, metric_to_post will SET NULL)
  database.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

/** Check if post has children. */
export function postHasChildren(id: string): boolean {
  const row = database.prepare('SELECT 1 FROM posts WHERE parent_post_id = ? LIMIT 1').get(id);
  return !!row;
}

/** All departments. */
export function getDepartments(): Array<{ id: string; name: string; parentId: string | null; managerPostId: string | null; organizationId: string }> {
  const rows = database.prepare(`
    SELECT id, name, parent_id AS parentId, manager_post_id AS managerPostId, organization_id AS organizationId
    FROM departments
    ORDER BY name
  `).all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    parentId: r.parentId ?? null,
    managerPostId: r.managerPostId ?? null,
    organizationId: r.organizationId ?? '1',
  }));
}

/** Create department. */
export function createDepartment(data: { id: string; name: string; parentId?: string | null; managerPostId?: string | null; organizationId?: string }): void {
  database.prepare(`
    INSERT INTO departments (id, name, parent_id, manager_post_id, organization_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.name,
    data.parentId ?? null,
    data.managerPostId ?? null,
    data.organizationId ?? '1'
  );
}

/** Update department. */
export function updateDepartment(id: string, data: { name?: string; parentId?: string | null; managerPostId?: string | null }): void {
  const updates: string[] = [];
  const values: any[] = [];
  
  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.parentId !== undefined) {
    updates.push('parent_id = ?');
    values.push(data.parentId);
  }
  if (data.managerPostId !== undefined) {
    updates.push('manager_post_id = ?');
    values.push(data.managerPostId);
  }
  
  if (updates.length === 0) return;
  
  values.push(id);
  database.prepare(`UPDATE departments SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
}

/** Delete department. */
export function deleteDepartment(id: string): void {
  // Check if department has posts
  const postsCount = database.prepare('SELECT COUNT(*) as count FROM posts WHERE department_id = ?').get(id) as { count: number };
  if (postsCount.count > 0) {
    throw new Error('Нельзя удалить отдел, в котором есть должности');
  }
  
  // Check if department has children
  const childrenCount = database.prepare('SELECT COUNT(*) as count FROM departments WHERE parent_id = ?').get(id) as { count: number };
  if (childrenCount.count > 0) {
    throw new Error('Нельзя удалить отдел, у которого есть подотделы');
  }
  
  database.prepare('DELETE FROM departments WHERE id = ?').run(id);
}

/** Post id and all descendants (subtree). For visibility: Department Head / Section Head see only their subtree. */
export function getPostSubtreeIds(postId: string): string[] {
  const rows = database.prepare(`
    WITH RECURSIVE subtree(id, level) AS (
      SELECT id, 0 FROM posts WHERE id = ?
      UNION ALL
      SELECT p.id, s.level + 1 FROM posts p
      INNER JOIN subtree s ON p.parent_post_id = s.id
      WHERE s.level < 20
    )
    SELECT id FROM subtree
  `).all(postId) as { id: string }[];
  return rows.map(r => r.id);
}

/** Ancestor post IDs from post up to root (parent, grandparent, …). For "who can approve" work plan. */
export function getAncestorPostIds(postId: string): string[] {
  const ids: string[] = [];
  let current: string | null = postId;
  for (let i = 0; i < 20 && current; i++) {
    const row = database.prepare('SELECT parent_post_id FROM posts WHERE id = ?').get(current) as { parent_post_id: string | null } | undefined;
    const parentId = row?.parent_post_id ?? null;
    if (!parentId) break;
    ids.push(parentId);
    current = parentId;
  }
  return ids;
}

/** Allowed post IDs for visibility:
 *  - Admin                        → null (unrestricted)
 *  - Department Head / Section Head → union of subtrees of all their posts
 *  - Employee / Inspector / other  → only their own assigned post IDs ([] if none)
 */
export function getAllowListForUser(user: { id?: string; role: string; postId?: string | null } | undefined): string[] | null {
  if (!user?.role) return null;
  if (user.role === 'Admin') return null;
  if (user.role === 'Inspector') return null;
  if (user.role === 'Department Head' || user.role === 'Section Head') {
    const postIds = user.id
      ? (database.prepare('SELECT post_id FROM user_posts WHERE user_id = ?').all(user.id) as { post_id: string }[]).map(r => r.post_id)
      : user.postId ? [user.postId] : [];
    if (postIds.length === 0) return null;
    const set = new Set<string>();
    for (const pid of postIds) {
      for (const id of getPostSubtreeIds(pid)) set.add(id);
    }
    return Array.from(set);
  }
  // Employee, Inspector, or any other role: restrict to only their own assigned posts
  if (!user.id) return [];
  const ownPostIds = (database.prepare('SELECT post_id FROM user_posts WHERE user_id = ?').all(user.id) as { post_id: string }[]).map(r => r.post_id);
  return ownPostIds.length > 0 ? ownPostIds : [];
}

/** Instructions list; optional filter by postId; optional allowedPostIds (visibility: only these posts). */
export function getInstructions(postId?: string, allowedPostIds?: string[] | null): Array<{ id: string; title: string; postId: string; ownerPostId: string; status: string; version: number; updatedAt: string }> {
  let sql = 'SELECT id, title, post_id AS postId, owner_post_id AS ownerPostId, status, version, updated_at AS updatedAt FROM instructions';
  const params: (string | number)[] = [];
  const conditions: string[] = [];
  if (postId) {
    conditions.push('post_id = ?');
    params.push(postId);
  }
  if (allowedPostIds != null && allowedPostIds.length > 0) {
    conditions.push(`post_id IN (${allowedPostIds.map(() => '?').join(',')})`);
    params.push(...allowedPostIds);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY updated_at DESC';
  const rows = (params.length ? database.prepare(sql).all(...params) : database.prepare(sql).all()) as any[];
  return rows.map(r => ({ ...r, updatedAt: r.updatedAt || new Date().toISOString() }));
}

/** Single instruction by id. */
export function getInstructionById(id: string): { id: string; title: string; postId: string; ownerPostId: string; status: string; version: number; updatedAt: string } | null {
  const row = database.prepare('SELECT id, title, post_id AS postId, owner_post_id AS ownerPostId, status, version, updated_at AS updatedAt FROM instructions WHERE id = ?').get(id) as any;
  if (!row) return null;
  return { ...row, updatedAt: row.updatedAt || new Date().toISOString() };
}

/** Create instruction. */
export function createInstruction(data: { id: string; title: string; postId: string; ownerPostId: string; status: string; version?: number }): void {
  database.prepare(`
    INSERT INTO instructions (id, title, post_id, owner_post_id, status, version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(data.id, data.title, data.postId, data.ownerPostId, data.status, data.version ?? 1, new Date().toISOString());
}

/** Update instruction. */
export function updateInstruction(id: string, data: Partial<{ title: string; status: string; version: number }>): void {
  const fields: string[] = ['updated_at = ?'];
  const values: any[] = [new Date().toISOString()];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.version !== undefined) { fields.push('version = ?'); values.push(data.version); }
  values.push(id);
  database.prepare(`UPDATE instructions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/** Delete instruction and its steps. */
export function deleteInstruction(id: string): void {
  database.prepare('DELETE FROM instruction_steps WHERE instruction_id = ?').run(id);
  database.prepare('DELETE FROM instructions WHERE id = ?').run(id);
}

/** Instruction steps by instruction_id. */
export function getInstructionSteps(instructionId: string): Array<{ id: string; instructionId: string; title: string; text: string | null; link: string | null; deadline: string | null; status: string; orderIndex: number }> {
  const rows = database.prepare(`
    SELECT id, instruction_id AS instructionId, title, text, link, deadline, status, order_index AS orderIndex
    FROM instruction_steps
    WHERE instruction_id = ?
    ORDER BY order_index, id
  `).all(instructionId) as any[];
  return rows.map(r => ({ ...r, text: r.text ?? null, link: r.link ?? null, deadline: r.deadline ?? null }));
}

/** Create instruction step. */
export function createInstructionStep(instructionId: string, data: { title: string; text?: string | null; link?: string | null; deadline?: string | null; status?: string; orderIndex?: number }): { id: string; instructionId: string; title: string; text: string | null; link: string | null; deadline: string | null; status: string; orderIndex: number } {
  const id = `step${Date.now()}`;
  database.prepare(`
    INSERT INTO instruction_steps (id, instruction_id, title, text, link, deadline, status, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    instructionId,
    data.title,
    data.text ?? null,
    data.link ?? null,
    data.deadline ?? null,
    data.status ?? 'pending',
    data.orderIndex ?? 0
  );
  const row = database.prepare('SELECT id, instruction_id AS instructionId, title, text, link, deadline, status, order_index AS orderIndex FROM instruction_steps WHERE id = ?').get(id) as any;
  return { ...row, text: row.text ?? null, link: row.link ?? null, deadline: row.deadline ?? null };
}

/** Update instruction step. */
export function updateInstructionStep(stepId: string, data: Partial<{ title: string; text: string | null; link: string | null; deadline: string | null; status: string; orderIndex: number }>): void {
  const fields: string[] = [];
  const values: any[] = [];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.text !== undefined) { fields.push('text = ?'); values.push(data.text); }
  if (data.link !== undefined) { fields.push('link = ?'); values.push(data.link); }
  if (data.deadline !== undefined) { fields.push('deadline = ?'); values.push(data.deadline); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.orderIndex !== undefined) { fields.push('order_index = ?'); values.push(data.orderIndex); }
  if (fields.length === 0) return;
  values.push(stepId);
  database.prepare(`UPDATE instruction_steps SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/** Single instruction step by id. */
export function getInstructionStepById(stepId: string): { id: string; instructionId: string; title: string; text: string | null; link: string | null; deadline: string | null; status: string; orderIndex: number } | null {
  const row = database.prepare('SELECT id, instruction_id AS instructionId, title, text, link, deadline, status, order_index AS orderIndex FROM instruction_steps WHERE id = ?').get(stepId) as any;
  if (!row) return null;
  return { ...row, text: row.text ?? null, link: row.link ?? null, deadline: row.deadline ?? null };
}

/** Delete instruction step. */
export function deleteInstructionStep(stepId: string): void {
  database.prepare('DELETE FROM instruction_steps WHERE id = ?').run(stepId);
}

/** List metric definitions (for dropdowns). */
export function getMetricDefinitions(): Array<{ id: string; code: string; name: string; unit: string }> {
  const rows = database.prepare(`
    SELECT id, code, name, unit FROM metric_definitions ORDER BY name
  `).all() as Array<{ id: string; code: string; name: string; unit: string }>;
  return rows;
}

/** Create metric definition (Admin only). */
export function createMetricDefinition(data: { code: string; name: string; unit: string }): { id: string; code: string; name: string; unit: string } {
  const id = `metric${Date.now()}`;
  database.prepare(`
    INSERT INTO metric_definitions (id, code, name, unit)
    VALUES (?, ?, ?, ?)
  `).run(id, data.code, data.name, data.unit);
  return { id, code: data.code, name: data.name, unit: data.unit };
}

/** Delete metric definition by code. Fails if metric is still assigned (metric_to_post). */
export function deleteMetricDefinition(code: string): void {
  const inUse = database.prepare('SELECT 1 FROM metric_to_post WHERE metric_code = ? LIMIT 1').get(code);
  if (inUse) {
    const e = new Error('Метрика ещё используется в назначениях. Сначала удалите все назначения в матрице.') as Error & { code?: string };
    e.code = 'METRIC_IN_USE';
    throw e;
  }
  database.prepare('DELETE FROM metric_definitions WHERE code = ?').run(code);
}

/** Statistics by post (post_statistics). */
export function getStatisticsByPostId(postId: string): Array<{ id: string; postId: string; period: string; metricCode: string; value: number }> {
  const rows = database.prepare(`
    SELECT id, post_id AS postId, period, metric_code AS metricCode, value
    FROM post_statistics WHERE post_id = ?
  `).all(postId) as any[];
  return rows;
}

/** List statistics records with optional filters; optional allowedPostIds (visibility). Joins post title and holder name. */
export function getStatisticsRecords(filters: {
  postId?: string;
  period?: string;
  metricCode?: string;
  allowedPostIds?: string[] | null;
}): Array<{ id: string; postId: string; postTitle: string; holderName: string | null; period: string; metricCode: string; value: number; createdAt: string }> {
  let sql = `
    SELECT s.id, s.post_id AS postId, p.title AS postTitle, u.name AS holderName,
           s.period, s.metric_code AS metricCode, s.value, s.created_at AS createdAt
    FROM post_statistics s
    JOIN posts p ON p.id = s.post_id
    LEFT JOIN users u ON u.post_id = p.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (filters.postId) { sql += ' AND s.post_id = ?'; params.push(filters.postId); }
  if (filters.period) { sql += ' AND s.period = ?'; params.push(filters.period); }
  if (filters.metricCode) { sql += ' AND s.metric_code = ?'; params.push(filters.metricCode); }
  if (filters.allowedPostIds != null && filters.allowedPostIds.length > 0) {
    sql += ` AND s.post_id IN (${filters.allowedPostIds.map(() => '?').join(',')})`;
    params.push(...filters.allowedPostIds);
  }
  sql += ' ORDER BY s.period DESC, p.title, s.metric_code';
  const rows = (params.length ? database.prepare(sql).all(...params) : database.prepare(sql).all()) as any[];
  return rows.map(r => ({ ...r, holderName: r.holderName ?? null, createdAt: r.createdAt || '' }));
}

/** Create one statistics record. */
export function createStatisticRecord(data: { postId: string; period: string; metricCode: string; value: number }): { id: string; postId: string; period: string; metricCode: string; value: number } {
  const id = `stat${Date.now()}`;
  database.prepare(`
    INSERT INTO post_statistics (id, post_id, period, metric_code, value)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.postId, data.period, data.metricCode, data.value);
  return { id, postId: data.postId, period: data.period, metricCode: data.metricCode, value: data.value };
}

/** Series for charts: records for post+metric, optionally filtered by period prefix (e.g. 2026-Q1, 2026-W05). */
export function getStatisticsSeries(postId: string, metricCode: string, fromPeriod?: string, toPeriod?: string): Array<{ period: string; value: number }> {
  let sql = `
    SELECT period, value FROM post_statistics
    WHERE post_id = ? AND metric_code = ?
  `;
  const params: (string | number)[] = [postId, metricCode];
  if (fromPeriod) { sql += ' AND period >= ?'; params.push(fromPeriod); }
  if (toPeriod) { sql += ' AND period <= ?'; params.push(toPeriod); }
  sql += ' ORDER BY period';
  const rows = database.prepare(sql).all(...params) as { period: string; value: number }[];
  return rows;
}

/** List quotas with optional filters; optional allowedPostIds (visibility). */
export function getQuotas(filters: {
  postId?: string;
  metricCode?: string;
  period?: string;
  allowedPostIds?: string[] | null;
}): Array<{ id: string; postId: string; metricCode: string; period: string; targetValue: number }> {
  let sql = 'SELECT id, post_id AS postId, metric_code AS metricCode, period, target_value AS targetValue FROM statistic_quotas WHERE 1=1';
  const params: (string | number)[] = [];
  if (filters.postId) { sql += ' AND post_id = ?'; params.push(filters.postId); }
  if (filters.metricCode) { sql += ' AND metric_code = ?'; params.push(filters.metricCode); }
  if (filters.period) { sql += ' AND period = ?'; params.push(filters.period); }
  if (filters.allowedPostIds != null && filters.allowedPostIds.length > 0) {
    sql += ` AND post_id IN (${filters.allowedPostIds.map(() => '?').join(',')})`;
    params.push(...filters.allowedPostIds);
  }
  sql += ' ORDER BY period, post_id, metric_code';
  const rows = (params.length ? database.prepare(sql).all(...params) : database.prepare(sql).all()) as any[];
  return rows;
}

/** Upsert one quota (insert or replace by post_id, metric_code, period). */
export function setQuota(postId: string, metricCode: string, period: string, targetValue: number): void {
  const id = `quota${Date.now()}`;
  database.prepare(`
    INSERT INTO statistic_quotas (id, post_id, metric_code, period, target_value)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (post_id, metric_code, period) DO UPDATE SET target_value = excluded.target_value
  `).run(id, postId, metricCode, period, targetValue);
}

/** Constructor view: rows (post + metric) with quota, value, needMore for the given period. Uses (post, metric) pairs that have at least one record or quota for that period. */
export function getConstructorView(
  period: string,
  allowedPostIds?: string[] | null
): Array<{ postId: string; postTitle: string; holderName: string | null; metricCode: string; metricName: string; unit: string; quota: number; value: number; needMore: number }> {
  const allowedClause =
    allowedPostIds != null && allowedPostIds.length > 0
      ? ` AND post_id IN (${allowedPostIds.map(() => '?').join(',')})`
      : '';
  const allowedParams = allowedPostIds != null && allowedPostIds.length > 0 ? [...allowedPostIds] : [];
  const sql = `
    SELECT
      pairs.post_id AS postId,
      p.title AS postTitle,
      u.name AS holderName,
      pairs.metric_code AS metricCode,
      m.name AS metricName,
      m.unit,
      COALESCE((SELECT target_value FROM statistic_quotas WHERE post_id = pairs.post_id AND metric_code = pairs.metric_code AND period = ? LIMIT 1), 0) AS quota,
      COALESCE((SELECT value FROM post_statistics WHERE post_id = pairs.post_id AND metric_code = pairs.metric_code AND period = ? LIMIT 1), 0) AS value
    FROM (
      SELECT post_id, metric_code FROM post_statistics WHERE period = ? ${allowedClause}
      UNION
      SELECT post_id, metric_code FROM statistic_quotas WHERE period = ? ${allowedClause}
    ) AS pairs
    JOIN posts p ON p.id = pairs.post_id
    LEFT JOIN user_posts up ON up.post_id = pairs.post_id
    LEFT JOIN users u ON u.id = up.user_id
    JOIN metric_definitions m ON m.code = pairs.metric_code
    ORDER BY p.title, m.name
  `;
  const params = [period, period, period, period, ...allowedParams, ...allowedParams];
  const rows = database.prepare(sql).all(...params) as any[];
  return rows.map((r) => ({
    postId: r.postId,
    postTitle: r.postTitle,
    holderName: r.holderName ?? null,
    metricCode: r.metricCode,
    metricName: r.metricName,
    unit: r.unit,
    quota: r.quota,
    value: r.value,
    needMore: Math.max(0, r.quota - r.value),
  }));
}

/** List metric_to_post assignments; optional filters. */
export function getMetricToPostList(filters: { postId?: string; metricCode?: string } = {}): Array<{ postId: string; metricCode: string; responsibleUserId: string | null; dailyTarget: number | null }> {
  let sql = 'SELECT post_id AS postId, metric_code AS metricCode, responsible_user_id AS responsibleUserId, daily_target AS dailyTarget FROM metric_to_post WHERE 1=1';
  const params: string[] = [];
  if (filters.postId) { sql += ' AND post_id = ?'; params.push(filters.postId); }
  if (filters.metricCode) { sql += ' AND metric_code = ?'; params.push(filters.metricCode); }
  sql += ' ORDER BY post_id, metric_code';
  const rows = (params.length ? database.prepare(sql).all(...params) : database.prepare(sql).all()) as any[];
  return rows.map((r) => ({ ...r, responsibleUserId: r.responsibleUserId ?? null, dailyTarget: r.dailyTarget ?? null }));
}

/** Assign metric to post; set optional responsible user and daily_target. */
export function setMetricToPost(postId: string, metricCode: string, responsibleUserId?: string | null, dailyTarget?: number | null): void {
  database.prepare(`
    INSERT INTO metric_to_post (post_id, metric_code, responsible_user_id, daily_target)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (post_id, metric_code) DO UPDATE SET responsible_user_id = excluded.responsible_user_id, daily_target = excluded.daily_target
  `).run(postId, metricCode, responsibleUserId ?? null, dailyTarget ?? null);
}

/** Remove metric from post. */
export function deleteMetricToPost(postId: string, metricCode: string): void {
  database.prepare('DELETE FROM metric_to_post WHERE post_id = ? AND metric_code = ?').run(postId, metricCode);
}

/** Check if user can edit daily entries for a metric assignment (holds post or is responsible). */
export function canUserEditMetricAssignment(userId: string, postId: string, metricCode: string): boolean {
  const holder = database.prepare('SELECT user_id FROM user_posts WHERE post_id = ?').get(postId) as { user_id: string } | undefined;
  if (holder?.user_id === userId) return true;
  const assign = database.prepare('SELECT responsible_user_id FROM metric_to_post WHERE post_id = ? AND metric_code = ?')
    .get(postId, metricCode) as { responsible_user_id: string | null } | undefined;
  return assign?.responsible_user_id === userId;
}

/** Get Monday of the week for a given date (YYYY-MM-DD). */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Daily tracking: rows = metrics assigned to user's posts, columns = 7 days (Mon-Sun) + plan + actual. period for quota = weekStart (Monday date). */
export function getDailyTrackingData(
  userId: string,
  weekStart: string
): { weekStart: string; dates: string[]; rows: Array<{ postId: string; postTitle: string; metricCode: string; metricName: string; unit: string; days: Record<string, number>; plan: number; actual: number }> } {
  const dates: string[] = [];
  const d = new Date(weekStart + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const postIds = (database.prepare('SELECT post_id FROM user_posts WHERE user_id = ?').all(userId) as { post_id: string }[]).map((r) => r.post_id);
  if (postIds.length === 0) {
    return { weekStart, dates, rows: [] };
  }
  const placeholders = postIds.map(() => '?').join(',');
  const assignments = database.prepare(`
    SELECT mtp.post_id AS postId, mtp.metric_code AS metricCode, mtp.daily_target AS dailyTarget, p.title AS postTitle, m.name AS metricName, m.unit
    FROM metric_to_post mtp
    JOIN posts p ON p.id = mtp.post_id
    JOIN metric_definitions m ON m.code = mtp.metric_code
    WHERE mtp.post_id IN (${placeholders})
  `).all(...postIds) as any[];
  const rows: Array<{ postId: string; postTitle: string; metricCode: string; metricName: string; unit: string; dailyTarget: number | null; days: Record<string, number>; plan: number; actual: number }> = [];
  for (const a of assignments) {
    const days: Record<string, number> = {};
    for (const date of dates) {
      const row = database.prepare(
        'SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?'
      ).get(a.postId, a.metricCode, date) as { value: number } | undefined;
      days[date] = row?.value ?? 0;
    }
    const planRow = database.prepare(
      'SELECT target_value FROM statistic_quotas WHERE post_id = ? AND metric_code = ? AND period = ?'
    ).get(a.postId, a.metricCode, weekStart) as { target_value: number } | undefined;
    const plan = planRow?.target_value ?? 0;
    const actual = Object.values(days).reduce((s, v) => s + v, 0);
    rows.push({ postId: a.postId, postTitle: a.postTitle, metricCode: a.metricCode, metricName: a.metricName, unit: a.unit, dailyTarget: a.dailyTarget ?? null, days, plan, actual });
  }
  return { weekStart, dates, rows };
}

/** Save one daily entry (upsert post_statistics with period = date). */
export function saveDailyEntry(postId: string, metricCode: string, date: string, value: number): void {
  const existing = database.prepare(
    'SELECT id FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?'
  ).get(postId, metricCode, date) as { id: string } | undefined;
  if (existing) {
    database.prepare('UPDATE post_statistics SET value = ? WHERE id = ?').run(value, existing.id);
  } else {
    const id = `stat${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    database.prepare(
      'INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)'
    ).run(id, postId, date, metricCode, value);
  }
}

/** Grid data for Statistics page: all active assignments with filters. Used by GET /statistics/grid. */
export function getStatisticsGridData(
  userId: string,
  weekStart: string,
  filters: { departmentId?: string; responsibleUserId?: string; myDataOnly?: boolean },
  isAdmin: boolean
): {
  weekStart: string;
  dates: string[];
  rows: Array<{
    postId: string;
    postTitle: string;
    metricCode: string;
    metricName: string;
    unit: string;
    dailyTarget: number | null;
    responsibleUserId: string | null;
    responsibleUserName: string | null;
    responsibleUserAvatar: string | null;
    departmentId: string;
    departmentName: string;
    days: Record<string, number>;
    weekTotal: number;
    plan: number;
  }>;
} {
  const dates: string[] = [];
  const d = new Date(weekStart + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  let sql = `
    SELECT mtp.post_id AS postId, mtp.metric_code AS metricCode, mtp.daily_target AS dailyTarget, mtp.responsible_user_id AS responsibleUserId,
           p.title AS postTitle, p.department_id AS departmentId, d.name AS departmentName,
           m.name AS metricName, m.unit,
           u.name AS responsibleUserName, u.avatar_url AS responsibleUserAvatar
    FROM metric_to_post mtp
    JOIN posts p ON p.id = mtp.post_id
    JOIN departments d ON d.id = p.department_id
    JOIN metric_definitions m ON m.code = mtp.metric_code
    LEFT JOIN users u ON u.id = mtp.responsible_user_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (filters.departmentId) {
    sql += ' AND p.department_id = ?';
    params.push(filters.departmentId);
  }
  if (filters.responsibleUserId) {
    sql += ' AND mtp.responsible_user_id = ?';
    params.push(filters.responsibleUserId);
  }

  const myDataOnly = filters.myDataOnly ?? !isAdmin;
  if (myDataOnly) {
    const userPostIds = (database.prepare('SELECT post_id FROM user_posts WHERE user_id = ?').all(userId) as { post_id: string }[]).map((r) => r.post_id);
    if (userPostIds.length === 0) {
      sql += ' AND (mtp.responsible_user_id = ? OR 1=0)';
      params.push(userId);
    } else {
      const placeholders = userPostIds.map(() => '?').join(',');
      sql += ` AND (mtp.responsible_user_id = ? OR mtp.post_id IN (${placeholders}))`;
      params.push(userId, ...userPostIds);
    }
  }

  sql += ' ORDER BY d.name, p.title, m.name';
  const assignments = (params.length ? database.prepare(sql).all(...params) : database.prepare(sql).all()) as any[];

  const rows: Array<{
    postId: string;
    postTitle: string;
    metricCode: string;
    metricName: string;
    unit: string;
    dailyTarget: number | null;
    responsibleUserId: string | null;
    responsibleUserName: string | null;
    responsibleUserAvatar: string | null;
    departmentId: string;
    departmentName: string;
    days: Record<string, number>;
    weekTotal: number;
    plan: number;
  }> = [];

  for (const a of assignments) {
    const days: Record<string, number> = {};
    let weekTotal = 0;
    for (const date of dates) {
      const row = database.prepare(
        'SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?'
      ).get(a.postId, a.metricCode, date) as { value: number } | undefined;
      const val = row?.value ?? 0;
      days[date] = val;
      weekTotal += val;
    }
    const planRow = database.prepare(
      'SELECT target_value FROM statistic_quotas WHERE post_id = ? AND metric_code = ? AND period = ?'
    ).get(a.postId, a.metricCode, weekStart) as { target_value: number } | undefined;
    const plan = planRow?.target_value ?? 0;
    rows.push({
      postId: a.postId,
      postTitle: a.postTitle,
      metricCode: a.metricCode,
      metricName: a.metricName,
      unit: a.unit,
      dailyTarget: a.dailyTarget ?? null,
      responsibleUserId: a.responsibleUserId ?? null,
      responsibleUserName: a.responsibleUserName ?? null,
      responsibleUserAvatar: a.responsibleUserAvatar ?? null,
      departmentId: a.departmentId,
      departmentName: a.departmentName ?? a.departmentId,
      days,
      weekTotal,
      plan,
    });
  }

  return { weekStart, dates, rows };
}

/** Get date range for period. Returns { startDate, endDate, dates[] }. */
function getDateRangeForPeriod(periodType: string, period: string): { startDate: string; endDate: string; dates: string[] } {
  const toDate = (s: string) => new Date(s + 'T12:00:00Z');
  const toStr = (d: Date) => d.toISOString().slice(0, 10);
  const dates: string[] = [];
  let startDate: string;
  let endDate: string;

  if (periodType === 'month' && /^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    startDate = toStr(start);
    endDate = toStr(end);
  } else if (periodType === 'quarter' && /^\d{4}-Q[1-4]$/.test(period)) {
    const [y, q] = [parseInt(period.slice(0, 4), 10), parseInt(period.slice(6), 10)];
    const start = new Date(y, (q - 1) * 3, 1);
    const end = new Date(y, q * 3, 0);
    startDate = toStr(start);
    endDate = toStr(end);
  } else if (periodType === 'year' && /^\d{4}$/.test(period)) {
    const y = parseInt(period, 10);
    startDate = `${y}-01-01`;
    endDate = `${y}-12-31`;
  } else {
    const d = new Date();
    startDate = toStr(d);
    endDate = toStr(d);
  }

  const d = toDate(startDate);
  const end = toDate(endDate);
  while (d <= end) {
    dates.push(toStr(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return { startDate, endDate, dates };
}

/** Grid data for period (week/month/quarter/year). For week uses getStatisticsGridData. For others aggregates post_statistics. */
export function getStatisticsGridDataByPeriod(
  userId: string,
  periodType: 'week' | 'month' | 'quarter' | 'year',
  periodValue: string,
  filters: { departmentId?: string; responsibleUserId?: string; myDataOnly?: boolean },
  isAdmin: boolean
): {
  weekStart: string;
  dates: string[];
  rows: Array<{
    postId: string;
    postTitle: string;
    metricCode: string;
    metricName: string;
    unit: string;
    dailyTarget: number | null;
    responsibleUserId: string | null;
    responsibleUserName: string | null;
    responsibleUserAvatar: string | null;
    departmentId: string;
    departmentName: string;
    days: Record<string, number>;
    weekTotal: number;
    plan: number;
  }>;
} {
  if (periodType === 'week') {
    let weekStart = periodValue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodValue)) {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      weekStart = d.toISOString().slice(0, 10);
    }
    return getStatisticsGridData(userId, weekStart, filters, isAdmin);
  }

  const { startDate, endDate, dates } = getDateRangeForPeriod(periodType, periodValue);

  let sql = `
    SELECT mtp.post_id AS postId, mtp.metric_code AS metricCode, mtp.daily_target AS dailyTarget, mtp.responsible_user_id AS responsibleUserId,
           p.title AS postTitle, p.department_id AS departmentId, d.name AS departmentName,
           m.name AS metricName, m.unit,
           u.name AS responsibleUserName, u.avatar_url AS responsibleUserAvatar
    FROM metric_to_post mtp
    JOIN posts p ON p.id = mtp.post_id
    JOIN departments d ON d.id = p.department_id
    JOIN metric_definitions m ON m.code = mtp.metric_code
    LEFT JOIN users u ON u.id = mtp.responsible_user_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (filters.departmentId) { sql += ' AND p.department_id = ?'; params.push(filters.departmentId); }
  if (filters.responsibleUserId) { sql += ' AND mtp.responsible_user_id = ?'; params.push(filters.responsibleUserId); }
  const myDataOnly = filters.myDataOnly ?? !isAdmin;
  if (myDataOnly) {
    const userPostIds = (database.prepare('SELECT post_id FROM user_posts WHERE user_id = ?').all(userId) as { post_id: string }[]).map((r) => r.post_id);
    if (userPostIds.length === 0) {
      sql += ' AND (mtp.responsible_user_id = ? OR 1=0)';
      params.push(userId);
    } else {
      const placeholders = userPostIds.map(() => '?').join(',');
      sql += ` AND (mtp.responsible_user_id = ? OR mtp.post_id IN (${placeholders}))`;
      params.push(userId, ...userPostIds);
    }
  }
  sql += ' ORDER BY d.name, p.title, m.name';
  const assignments = (params.length ? database.prepare(sql).all(...params) : database.prepare(sql).all()) as any[];

  const rows: Array<{
    postId: string;
    postTitle: string;
    metricCode: string;
    metricName: string;
    unit: string;
    dailyTarget: number | null;
    responsibleUserId: string | null;
    responsibleUserName: string | null;
    responsibleUserAvatar: string | null;
    departmentId: string;
    departmentName: string;
    days: Record<string, number>;
    weekTotal: number;
    plan: number;
  }> = [];

  const sumStats = database.prepare(`
    SELECT COALESCE(SUM(value), 0) AS total FROM post_statistics
    WHERE post_id = ? AND metric_code = ? AND period >= ? AND period <= ?
  `);
  const sumQuotas = database.prepare(`
    SELECT COALESCE(SUM(target_value), 0) AS total FROM statistic_quotas
    WHERE post_id = ? AND metric_code = ? AND period >= ? AND period <= ?
  `);

  for (const a of assignments) {
    const statRow = sumStats.get(a.postId, a.metricCode, startDate, endDate) as { total: number };
    const totalValue = statRow?.total ?? 0;
    const quotaRow = sumQuotas.get(a.postId, a.metricCode, startDate, endDate) as { total: number };
    const planValue = quotaRow?.total ?? 0;
    const days: Record<string, number> = {};
    for (const date of dates) {
      const r = database.prepare('SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?')
        .get(a.postId, a.metricCode, date) as { value: number } | undefined;
      days[date] = r?.value ?? 0;
    }
    rows.push({
      postId: a.postId,
      postTitle: a.postTitle,
      metricCode: a.metricCode,
      metricName: a.metricName,
      unit: a.unit,
      dailyTarget: a.dailyTarget ?? null,
      responsibleUserId: a.responsibleUserId ?? null,
      responsibleUserName: a.responsibleUserName ?? null,
      responsibleUserAvatar: a.responsibleUserAvatar ?? null,
      departmentId: a.departmentId,
      departmentName: a.departmentName ?? a.departmentId,
      days,
      weekTotal: totalValue,
      plan: planValue,
    });
  }

  return { weekStart: startDate, dates, rows };
}

/** Last 30 days of daily values for a metric (post+metric). For analytics drawer. */
export function getSeriesLast30Days(postId: string, metricCode: string): Array<{ date: string; value: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  const d = new Date(today + 'T12:00:00Z');
  for (let i = 0; i < 30; i++) {
    dates.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }

  const result: Array<{ date: string; value: number }> = [];
  for (const date of dates) {
    const row = database.prepare(
      'SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?'
    ).get(postId, metricCode, date) as { value: number } | undefined;
    result.push({ date, value: row?.value ?? 0 });
  }
  return result;
}

/** Week-over-week growth: (thisWeek - lastWeek) / lastWeek * 100. Uses weekStart for "this week". */
export function getWeekOverWeekGrowth(postId: string, metricCode: string, weekStart: string): number | null {
  const thisWeekDates: string[] = [];
  let d1 = new Date(weekStart + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    thisWeekDates.push(d1.toISOString().slice(0, 10));
    d1.setUTCDate(d1.getUTCDate() + 1);
  }
  const d2 = new Date(weekStart + 'T12:00:00Z');
  d2.setUTCDate(d2.getUTCDate() - 7);
  const lastWeekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    lastWeekDates.push(d2.toISOString().slice(0, 10));
    d2.setUTCDate(d2.getUTCDate() + 1);
  }

  let thisSum = 0;
  let lastSum = 0;
  for (const date of thisWeekDates) {
    const r = database.prepare('SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?').get(postId, metricCode, date) as { value: number } | undefined;
    thisSum += r?.value ?? 0;
  }
  for (const date of lastWeekDates) {
    const r = database.prepare('SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?').get(postId, metricCode, date) as { value: number } | undefined;
    lastSum += r?.value ?? 0;
  }
  if (lastSum === 0) return thisSum > 0 ? 100 : null;
  return ((thisSum - lastSum) / lastSum) * 100;
}

/** Plan vs Fact for a metric for last 7 days (for analytics chart). postId optional; if not provided uses first post that has the metric. */
export function getPlanVsFactLast7Days(metricCode: string, postId?: string): Array<{ date: string; plan: number | null; fact: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  const d = new Date(today + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    dates.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  let pid: string | undefined = postId;
  if (!pid) {
    const first = database.prepare(
      'SELECT post_id FROM metric_to_post WHERE metric_code = ? LIMIT 1'
    ).get(metricCode) as { post_id: string } | undefined;
    pid = first?.post_id;
  }
  if (!pid) return dates.map((date) => ({ date, plan: null, fact: 0 }));
  const result: Array<{ date: string; plan: number | null; fact: number }> = [];
  for (const date of dates) {
    const factRow = database.prepare(
      'SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?'
    ).get(pid, metricCode, date) as { value: number } | undefined;
    const fact = factRow?.value ?? 0;
    const weekStartForDay = getWeekStart(date);
    const planRow = database.prepare(
      'SELECT target_value FROM statistic_quotas WHERE post_id = ? AND metric_code = ? AND period = ?'
    ).get(pid, metricCode, weekStartForDay) as { target_value: number } | undefined;
    const plan = planRow != null ? planRow.target_value : null;
    result.push({ date, plan, fact });
  }
  return result;
}

/** Budgets list; optional filter by responsiblePostId and/or period; optional allowedPostIds (visibility). */
export function getBudgets(responsiblePostId?: string, period?: string, allowedPostIds?: string[] | null): Array<{
  id: string;
  departmentId: string;
  department?: string;
  responsiblePostId: string | null;
  category: string;
  period: string;
  planned: number;
  approved: number;
  spent: number;
  remaining: number;
  limits: number;
  approvalStatus: string;
}> {
  let sql = `
    SELECT b.id, b.department_id AS departmentId, b.responsible_post_id AS responsiblePostId,
           b.category, b.period, b.planned, b.approved, b.spent, b.remaining, b.limits, b.approval_status AS approvalStatus,
           d.name AS department
    FROM budgets b
    LEFT JOIN departments d ON d.id = b.department_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (responsiblePostId) { sql += ' AND b.responsible_post_id = ?'; params.push(responsiblePostId); }
  if (period) { sql += ' AND b.period = ?'; params.push(period); }
  if (allowedPostIds != null && allowedPostIds.length > 0) {
    sql += ` AND b.responsible_post_id IN (${allowedPostIds.map(() => '?').join(',')})`;
    params.push(...allowedPostIds);
  }
  sql += ' ORDER BY b.period, b.category';
  const rows = (params.length ? database.prepare(sql).all(...params) : database.prepare(sql).all()) as any[];
  return rows.map(r => ({ ...r, department: r.department || r.departmentId }));
}

/** Single budget by id. */
export function getBudgetById(id: string): { id: string; departmentId: string; department?: string; responsiblePostId: string | null; category: string; period: string; planned: number; approved: number; spent: number; remaining: number; limits: number; approvalStatus: string } | null {
  const row = database.prepare(`
    SELECT b.id, b.department_id AS departmentId, b.responsible_post_id AS responsiblePostId,
           b.category, b.period, b.planned, b.approved, b.spent, b.remaining, b.limits, b.approval_status AS approvalStatus,
           d.name AS department
    FROM budgets b
    LEFT JOIN departments d ON d.id = b.department_id
    WHERE b.id = ?
  `).get(id) as any;
  if (!row) return null;
  return { ...row, department: row.department || row.departmentId };
}

/** Set budget approval status to approved. */
export function approveBudget(id: string): void {
  database.prepare(`
    UPDATE budgets SET approval_status = 'approved', approved = planned WHERE id = ?
  `).run(id);
}

/** Create a new budget entry. */
export function createBudget(data: {
  id: string;
  departmentId: string;
  responsiblePostId?: string | null;
  category: string;
  period: string;
  planned: number;
  limits: number;
}): void {
  database.prepare(`
    INSERT INTO budgets (id, department_id, responsible_post_id, category, period, planned, approved, spent, remaining, limits, approval_status)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'pending')
  `).run(data.id, data.departmentId, data.responsiblePostId ?? null, data.category, data.period, data.planned, data.planned, data.limits);
}

/** Delete a budget by id. */
export function deleteBudget(id: string): void {
  database.prepare('DELETE FROM budgets WHERE id = ?').run(id);
}

export type WorkPlanWorkflowStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'revision_requested';

/** Create work plan (employee creates for own post). approverPostId can be set at create or at submit. */
export function createWorkPlan(data: {
  title: string;
  postId: string;
  department?: string | null;
  status?: string;
  dueDate?: string | null;
  authorUserId?: string | null;
  period?: string | null;
  approverPostId?: string | null;
  messageText?: string | null;
}): { id: string; title: string; postId: string; department: string | null; status: string; dueDate: string | null; workflowStatus: string; authorUserId: string | null; approverPostId: string | null; submittedAt: string | null; approvedAt: string | null; rejectedAt: string | null; rejectionComment: string | null; approvalComment: string | null; period: string | null; messageText: string | null; createdAt: string; updatedAt: string } {
  const id = `wp${Date.now()}`;
  const now = new Date().toISOString();
  const post = getPostById(data.postId);
  const approverPostId = data.approverPostId ?? post?.parentPostId ?? null;
  database.prepare(`
    INSERT INTO work_plans (id, title, post_id, department, status, due_date, workflow_status, author_user_id, approver_post_id, period, message_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.title,
    data.postId,
    data.department ?? null,
    data.status ?? 'on-track',
    data.dueDate ?? null,
    'draft',
    data.authorUserId ?? null,
    approverPostId,
    data.period ?? null,
    data.messageText ?? null,
    now,
    now
  );
  return getWorkPlanById(id)!;
}

/** Get single work plan by id. */
export function getWorkPlanById(id: string): { id: string; title: string; postId: string; department: string | null; status: string; dueDate: string | null; workflowStatus: string; authorUserId: string | null; approverPostId: string | null; submittedAt: string | null; approvedAt: string | null; rejectedAt: string | null; rejectionComment: string | null; approvalComment: string | null; period: string | null; messageText: string | null; createdAt: string; updatedAt: string } | null {
  const row = database.prepare(`
    SELECT id, title, post_id AS postId, department, status, due_date AS dueDate,
           COALESCE(workflow_status, 'draft') AS workflowStatus, author_user_id AS authorUserId,
           approver_post_id AS approverPostId, submitted_at AS submittedAt, approved_at AS approvedAt,
           rejected_at AS rejectedAt, rejection_comment AS rejectionComment, approval_comment AS approvalComment, period, message_text AS messageText,
           created_at AS createdAt, updated_at AS updatedAt
    FROM work_plans WHERE id = ?
  `).get(id) as any;
  if (!row) return null;
  return { ...row, dueDate: row.dueDate ?? null, department: row.department ?? null, authorUserId: row.authorUserId ?? null, approverPostId: row.approverPostId ?? null, submittedAt: row.submittedAt ?? null, approvedAt: row.approvedAt ?? null, rejectedAt: row.rejectedAt ?? null, rejectionComment: row.rejectionComment ?? null, approvalComment: row.approvalComment ?? null, period: row.period ?? null, messageText: row.messageText ?? null };
}

/** Update work plan. */
export function updateWorkPlan(id: string, data: Partial<{ title: string; postId: string; department: string | null; status: string; dueDate: string | null; period: string | null; approverPostId: string | null; messageText: string | null }>): void {
  const fields: string[] = ['updated_at = ?'];
  const values: any[] = [new Date().toISOString()];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.postId !== undefined) { fields.push('post_id = ?'); values.push(data.postId); }
  if (data.department !== undefined) { fields.push('department = ?'); values.push(data.department); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.dueDate !== undefined) { fields.push('due_date = ?'); values.push(data.dueDate); }
  if (data.period !== undefined) { fields.push('period = ?'); values.push(data.period); }
  if (data.approverPostId !== undefined) { fields.push('approver_post_id = ?'); values.push(data.approverPostId); }
  if (data.messageText !== undefined) { fields.push('message_text = ?'); values.push(data.messageText); }
  if (fields.length <= 1) return;
  values.push(id);
  database.prepare(`UPDATE work_plans SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

/** Submit work plan for approval. Optionally set approver (employee chooses who to send to). */
export function submitWorkPlan(id: string, approverPostId?: string | null): void {
  const now = new Date().toISOString();
  const plan = getWorkPlanById(id);
  if (approverPostId != null && approverPostId.trim() !== '') {
    database.prepare(`UPDATE work_plans SET approver_post_id = ?, updated_at = ? WHERE id = ? AND (workflow_status = 'draft' OR workflow_status = 'rejected' OR workflow_status = 'revision_requested')`).run(approverPostId.trim(), now, id);
  }
  const result = database.prepare(`
    UPDATE work_plans SET workflow_status = 'submitted', submitted_at = ?, rejected_at = NULL, rejection_comment = NULL, updated_at = ?
    WHERE id = ? AND (workflow_status = 'draft' OR workflow_status = 'rejected' OR workflow_status = 'revision_requested')
  `).run(now, now, id);
  if (result.changes === 0) throw new Error('Work plan status has already changed');
  
  // Create notification for approver (На мое согласование)
  const finalApproverPostId = approverPostId != null && approverPostId.trim() !== '' ? approverPostId.trim() : (plan?.approverPostId ?? null);
  if (finalApproverPostId && plan) {
    const approverUser = getUserByPostId(finalApproverPostId);
    if (approverUser) {
      createWorkPlanNotification({
        workPlanId: id,
        recipientUserId: approverUser.id,
        actorUserId: plan.authorUserId,
        action: 'submitted',
      });
    }
  }
}

/** Approve work plan (manager). Optional comment. */
export function approveWorkPlan(id: string, comment?: string | null): void {
  const now = new Date().toISOString();
  const plan = getWorkPlanById(id);
  const result = database.prepare(`
    UPDATE work_plans SET workflow_status = 'approved', approved_at = ?, approval_comment = ?, rejected_at = NULL, rejection_comment = NULL, updated_at = ?
    WHERE id = ? AND workflow_status = 'submitted'
  `).run(now, comment ?? null, now, id);
  if (result.changes === 0) throw new Error('Work plan status has already changed');
}

/** Reject work plan (manager). */
export function rejectWorkPlan(id: string, comment?: string | null): void {
  const now = new Date().toISOString();
  const plan = getWorkPlanById(id);
  const result = database.prepare(`
    UPDATE work_plans SET workflow_status = 'rejected', rejected_at = ?, rejection_comment = ?, updated_at = ?
    WHERE id = ? AND workflow_status = 'submitted'
  `).run(now, comment ?? null, now, id);
  if (result.changes === 0) throw new Error('Work plan status has already changed');
}

/** Request revision (manager): plan goes back to author with comment; author can edit and resubmit. */
export function requestRevisionWorkPlan(id: string, comment?: string | null): void {
  const now = new Date().toISOString();
  const plan = getWorkPlanById(id);
  const result = database.prepare(`
    UPDATE work_plans SET workflow_status = 'revision_requested', rejected_at = ?, rejection_comment = ?, updated_at = ?
    WHERE id = ? AND workflow_status = 'submitted'
  `).run(now, comment ?? null, now, id);
  if (result.changes === 0) throw new Error('Work plan status has already changed');
}

/** Work plans list; optional filter by postId, workflowStatus; optional allowedPostIds; optional approverPostIds (for "на моё согласование"). */
export function getWorkPlans(opts: { postId?: string; allowedPostIds?: string[] | null; workflowStatus?: WorkPlanWorkflowStatus; approverPostIds?: string[] | null }): Array<{ id: string; title: string; postId: string; department: string | null; status: string; dueDate: string | null; workflowStatus: string; authorUserId: string | null; approverPostId: string | null; submittedAt: string | null; approvedAt: string | null; rejectedAt: string | null; rejectionComment: string | null; approvalComment: string | null; period: string | null; messageText: string | null; createdAt: string; updatedAt: string }> {
  if (opts.allowedPostIds && opts.allowedPostIds.length > 500) {
    throw new Error('Too many IDs requested');
  }
  if (opts.approverPostIds && opts.approverPostIds.length > 500) {
    throw new Error('Too many approver IDs requested');
  }
  let sql = `SELECT id, title, post_id AS postId, department, status, due_date AS dueDate,
    COALESCE(workflow_status, 'draft') AS workflowStatus, author_user_id AS authorUserId, approver_post_id AS approverPostId,
    submitted_at AS submittedAt, approved_at AS approvedAt, rejected_at AS rejectedAt, rejection_comment AS rejectionComment, approval_comment AS approvalComment, period, message_text AS messageText,
    created_at AS createdAt, updated_at AS updatedAt FROM work_plans`;
  const params: (string | number)[] = [];
  const conditions: string[] = [];
  if (opts.postId) { conditions.push('post_id = ?'); params.push(opts.postId); }
  if (opts.allowedPostIds != null && opts.allowedPostIds.length > 0) {
    conditions.push(`post_id IN (${opts.allowedPostIds.map(() => '?').join(',')})`);
    params.push(...opts.allowedPostIds);
  }
  if (opts.approverPostIds != null && opts.approverPostIds.length > 0) {
    conditions.push(`approver_post_id IN (${opts.approverPostIds.map(() => '?').join(',')})`);
    params.push(...opts.approverPostIds);
  }
  if (opts.workflowStatus) { conditions.push('(workflow_status = ? OR (workflow_status IS NULL AND ? = \'draft\'))'); params.push(opts.workflowStatus, opts.workflowStatus); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY updated_at DESC, due_date, title';
  const rows = (params.length ? database.prepare(sql).all(...params) : database.prepare(sql).all()) as any[];
  return rows.map(r => ({ ...r, dueDate: r.dueDate ?? null, department: r.department ?? null, authorUserId: r.authorUserId ?? null, approverPostId: r.approverPostId ?? null, submittedAt: r.submittedAt ?? null, approvedAt: r.approvedAt ?? null, rejectedAt: r.rejectedAt ?? null, rejectionComment: r.rejectionComment ?? null, approvalComment: r.approvalComment ?? null, period: r.period ?? null, messageText: r.messageText ?? null }));
}

/** Work plan tasks. */
export function getWorkPlanTasks(workPlanId: string): Array<{ id: string; workPlanId: string; title: string; dueDate: string | null; orderIndex: number }> {
  const rows = database.prepare(`
    SELECT id, work_plan_id AS workPlanId, title, due_date AS dueDate, order_index AS orderIndex
    FROM work_plan_tasks WHERE work_plan_id = ? ORDER BY order_index, id
  `).all(workPlanId) as any[];
  return rows.map(r => ({ ...r, dueDate: r.dueDate ?? null }));
}

export function createWorkPlanTask(data: { workPlanId: string; title: string; dueDate?: string | null; orderIndex?: number }): { id: string; workPlanId: string; title: string; dueDate: string | null; orderIndex: number } {
  const id = `wpt${Date.now()}`;
  const order = data.orderIndex ?? 0;
  database.prepare(`
    INSERT INTO work_plan_tasks (id, work_plan_id, title, due_date, order_index)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.workPlanId, data.title.trim(), data.dueDate ?? null, order);
  return { id, workPlanId: data.workPlanId, title: data.title.trim(), dueDate: data.dueDate ?? null, orderIndex: order };
}

export function updateWorkPlanTask(id: string, data: Partial<{ title: string; dueDate: string | null; orderIndex: number }>): void {
  const fields: string[] = [];
  const values: any[] = [];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.dueDate !== undefined) { fields.push('due_date = ?'); values.push(data.dueDate); }
  if (data.orderIndex !== undefined) { fields.push('order_index = ?'); values.push(data.orderIndex); }
  if (fields.length === 0) return;
  values.push(id);
  database.prepare(`UPDATE work_plan_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteWorkPlanTask(id: string): void {
  database.prepare('DELETE FROM work_plan_tasks WHERE id = ?').run(id);
}

/** Delete work plan by id (author or admin only, draft/rejected/revision_requested status). */
export function deleteWorkPlan(id: string): void {
  // Clean up all FK dependents before deleting the plan itself
  database.prepare('DELETE FROM work_plan_tasks WHERE work_plan_id = ?').run(id);
  database.prepare('DELETE FROM work_plan_notifications WHERE work_plan_id = ?').run(id);
  // Null out mailbox_messages.work_plan_id link (keep the messages, just unlink them)
  database.prepare('UPDATE mailbox_messages SET work_plan_id = NULL WHERE work_plan_id = ?').run(id);
  database.prepare('DELETE FROM work_plans WHERE id = ?').run(id);
}

/** Create work plan notification. */
export function createWorkPlanNotification(data: {
  workPlanId: string;
  recipientUserId: string;
  actorUserId?: string | null;
  action: 'submitted' | 'approved' | 'rejected' | 'revision_requested';
}): { id: string; workPlanId: string; recipientUserId: string; action: string; createdAt: string; read: boolean } {
  const id = `wpn${Date.now()}`;
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO work_plan_notifications (id, work_plan_id, recipient_user_id, actor_user_id, action, created_at, read)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(id, data.workPlanId, data.recipientUserId, data.actorUserId ?? null, data.action, now);
  return { id, workPlanId: data.workPlanId, recipientUserId: data.recipientUserId, action: data.action, createdAt: now, read: false };
}

/** Get unread notification count for user. */
export function getWorkPlanNotificationCount(userId: string): number {
  const row = database.prepare('SELECT COUNT(*) as count FROM work_plan_notifications WHERE recipient_user_id = ? AND read = 0').get(userId) as { count: number };
  return row.count;
}

/** Get notifications for user. */
export function getWorkPlanNotifications(userId: string, limit?: number): Array<{
  id: string;
  workPlanId: string;
  workPlanTitle: string;
  action: string;
  createdAt: string;
  read: boolean;
  actorName?: string | null;
}> {
  const rows = database.prepare(`
    SELECT n.id, n.work_plan_id AS workPlanId, wp.title AS workPlanTitle, n.action, n.created_at AS createdAt, n.read, u.name AS actorName
    FROM work_plan_notifications n
    LEFT JOIN work_plans wp ON wp.id = n.work_plan_id
    LEFT JOIN users u ON u.id = n.actor_user_id
    WHERE n.recipient_user_id = ?
    ORDER BY n.created_at DESC
    ${limit ? 'LIMIT ?' : ''}
  `).all(userId, ...(limit ? [limit] : [])) as any[];
  return rows.map(r => ({ ...r, read: !!r.read }));
}

/** Mark notification as read. */
export function markWorkPlanNotificationAsRead(notificationId: string): void {
  database.prepare('UPDATE work_plan_notifications SET read = 1 WHERE id = ?').run(notificationId);
}

/** Mark all notifications as read for user. */
export function markAllWorkPlanNotificationsAsRead(userId: string): void {
  database.prepare('UPDATE work_plan_notifications SET read = 1 WHERE recipient_user_id = ?').run(userId);
}

/** Create mailbox message. bodySnippet = first 200 chars of body; body = full text. */
export function createMailboxMessage(data: {
  recipientPostId: string;
  senderPostId?: string | null;
  senderEmail: string;
  subject: string;
  body: string;
  workPlanId?: string | null;
}): { id: string; recipientPostId: string; senderPostId: string | null; senderEmail: string; subject: string; bodySnippet: string | null; messageDate: string; unread: number; folder: string; workPlanId: string | null } {
  const id = `msg${Date.now()}`;
  const bodyTrim = data.body.trim();
  const bodySnippet = bodyTrim.slice(0, 200) || null;
  const messageDate = new Date().toISOString().slice(0, 10);
  const body = bodyTrim || null;
  database.prepare(`
    INSERT INTO mailbox_messages (id, recipient_post_id, sender_post_id, sender_email, subject, body_snippet, body, message_date, unread, folder, work_plan_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'inbox', ?)
  `).run(id, data.recipientPostId, data.senderPostId ?? null, data.senderEmail, data.subject.trim(), bodySnippet, body, messageDate, data.workPlanId ?? null);
  return { id, recipientPostId: data.recipientPostId, senderPostId: data.senderPostId ?? null, senderEmail: data.senderEmail, subject: data.subject.trim(), bodySnippet, messageDate, unread: 1, folder: 'inbox', workPlanId: data.workPlanId ?? null };
}

/** Create attachment record for a message. */
export function createMessageAttachment(data: {
  messageId: string;
  filename: string;
  mimeType?: string | null;
  filePath: string;
  fileSize?: number | null;
}): { id: string; messageId: string; filename: string; mimeType: string | null; filePath: string; fileSize: number | null } {
  const id = `att${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  database.prepare(`
    INSERT INTO mailbox_message_attachments (id, message_id, filename, mime_type, file_path, file_size)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.messageId, data.filename, data.mimeType ?? null, data.filePath, data.fileSize ?? null);
  return { id, messageId: data.messageId, filename: data.filename, mimeType: data.mimeType ?? null, filePath: data.filePath, fileSize: data.fileSize ?? null };
}

/** Get attachments for a message. */
export function getAttachmentsByMessageId(messageId: string): Array<{ id: string; filename: string; mimeType: string | null; fileSize: number | null }> {
  const rows = database.prepare(`
    SELECT id, filename, mime_type AS mimeType, file_size AS fileSize
    FROM mailbox_message_attachments WHERE message_id = ?
  `).all(messageId) as any[];
  return rows.map(r => ({ ...r, fileSize: r.fileSize ?? null, mimeType: r.mimeType ?? null }));
}

/** Get attachment by id (for download). Returns full row including file_path. */
export function getAttachmentById(attachmentId: string): { id: string; messageId: string; filename: string; mimeType: string | null; filePath: string; fileSize: number | null } | null {
  const row = database.prepare(`
    SELECT id, message_id AS messageId, filename, mime_type AS mimeType, file_path AS filePath, file_size AS fileSize
    FROM mailbox_message_attachments WHERE id = ?
  `).get(attachmentId) as any;
  if (!row) return null;
  return { ...row, fileSize: row.fileSize ?? null, mimeType: row.mimeType ?? null };
}

/** Unread message count for user (inbox only, across all their posts/boxes). */
export function getUnreadCountForUser(userId: string): number {
  const posts = getPostsForUser(userId);
  if (posts.length === 0) return 0;
  const postIds = posts.map((p) => p.id);
  const placeholders = postIds.map(() => '?').join(',');
  const row = database.prepare(`
    SELECT COALESCE(SUM(unread), 0) AS total FROM mailbox_messages
    WHERE recipient_post_id IN (${placeholders}) AND (folder = 'inbox' OR folder IS NULL)
  `).get(...postIds) as { total: number };
  return Number(row?.total ?? 0);
}

/** Get message recipient post ID (for access check). */
export function getMessageRecipientPostId(messageId: string): string | null {
  const row = database.prepare('SELECT recipient_post_id FROM mailbox_messages WHERE id = ?').get(messageId) as { recipient_post_id: string } | undefined;
  return row?.recipient_post_id ?? null;
}

/** Mark mailbox message as read (unread=0). */
export function markMailboxMessageAsRead(id: string): void {
  database.prepare('UPDATE mailbox_messages SET unread = 0 WHERE id = ?').run(id);
}

/** Archive message (folder = 'archive'). */
export function archiveMailboxMessage(id: string): void {
  database.prepare("UPDATE mailbox_messages SET folder = 'archive' WHERE id = ?").run(id);
}

/** Archive multiple messages. */
export function archiveMailboxMessagesBulk(ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  database.prepare(`UPDATE mailbox_messages SET folder = 'archive' WHERE id IN (${placeholders})`).run(...ids);
}

/** Delete messages (and attachments via CASCADE if we add it, or delete attachments manually). */
export function deleteMailboxMessages(ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  database.prepare(`DELETE FROM mailbox_message_attachments WHERE message_id IN (${placeholders})`).run(...ids);
  database.prepare(`DELETE FROM mailbox_messages WHERE id IN (${placeholders})`).run(...ids);
}

/** Clear all messages in folder for postId. folder=sent: by sender_post_id; inbox/archive: by recipient_post_id. */
export function clearMailboxFolder(postId: string, folder: MailboxFolder): number {
  let ids: Array<{ id: string }>;
  if (folder === 'sent') {
    ids = database.prepare('SELECT id FROM mailbox_messages WHERE sender_post_id = ?').all(postId) as Array<{ id: string }>;
  } else {
    ids = database.prepare(
      "SELECT id FROM mailbox_messages WHERE recipient_post_id = ? AND (folder = ? OR (folder IS NULL AND ? = 'inbox'))"
    ).all(postId, folder, folder) as Array<{ id: string }>;
  }
  const idList = ids.map(r => r.id);
  if (idList.length > 0) deleteMailboxMessages(idList);
  return idList.length;
}

export type MailboxFolder = 'inbox' | 'archive' | 'sent';

/** Mailbox messages. mode: inbox/archive = recipient view; sent = sender view. */
export function getMailboxMessages(opts: {
  postId?: string;
  allowedPostIds?: string[] | null;
  folder?: MailboxFolder;
  senderPostIds?: string[];
}): Array<{ id: string; recipientPostId: string; senderPostId: string | null; senderEmail: string; subject: string; bodySnippet: string | null; messageDate: string; unread: number; folder: string }> {
  const { postId, allowedPostIds, folder = 'inbox', senderPostIds } = opts;
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (folder === 'sent') {
    if (!senderPostIds || senderPostIds.length === 0) return [];
    if (postId && senderPostIds.includes(postId)) {
      conditions.push('sender_post_id = ?');
      params.push(postId);
    } else {
      conditions.push(`sender_post_id IN (${senderPostIds.map(() => '?').join(',')})`);
      params.push(...senderPostIds);
    }
  } else {
    if (postId) { conditions.push('recipient_post_id = ?'); params.push(postId); }
    if (allowedPostIds != null && allowedPostIds.length > 0) {
      conditions.push(`recipient_post_id IN (${allowedPostIds.map(() => '?').join(',')})`);
      params.push(...allowedPostIds);
    }
    conditions.push("(folder = ? OR (folder IS NULL AND ? = 'inbox'))");
    params.push(folder, folder);
  }
  const sql = `SELECT id, recipient_post_id AS recipientPostId, sender_post_id AS senderPostId, sender_email AS senderEmail, subject, body_snippet AS bodySnippet, message_date AS messageDate, unread, COALESCE(folder, 'inbox') AS folder FROM mailbox_messages WHERE ${conditions.join(' AND ')} ORDER BY message_date DESC`;
  const rows = database.prepare(sql).all(...params) as any[];
  return rows.map(r => ({ ...r, unread: Number(r.unread), bodySnippet: r.bodySnippet ?? null, senderPostId: r.senderPostId ?? null, folder: r.folder ?? 'inbox' }));
}

/** Get one mailbox message by id with full body (for view modal). Returns null if not found. */
export function getMailboxMessageById(id: string): { id: string; recipientPostId: string; senderPostId: string | null; senderEmail: string; subject: string; bodySnippet: string | null; body: string | null; messageDate: string; unread: number; folder: string } | null {
  const row = database.prepare(`
    SELECT id, recipient_post_id AS recipientPostId, sender_post_id AS senderPostId, sender_email AS senderEmail, subject, body_snippet AS bodySnippet, body, message_date AS messageDate, unread, COALESCE(folder, 'inbox') AS folder
    FROM mailbox_messages WHERE id = ?
  `).get(id) as any;
  if (!row) return null;
  return { ...row, unread: Number(row.unread), bodySnippet: row.bodySnippet ?? null, body: row.body ?? null, senderPostId: row.senderPostId ?? null, folder: row.folder ?? 'inbox' };
}

/** Recent audit log entries (for Dashboard). Optional allowedPostIds: when set, only include post entities in that list. */
export function getRecentAuditLog(limit: number, allowedPostIds?: string[] | null): Array<{ id: string; entityType: string; entityId: string; action: string; userId: string; userName: string | null; changes: string | null; createdAt: string }> {
  let sql = `
    SELECT al.id, al.entity_type AS entityType, al.entity_id AS entityId,
           al.action, al.user_id AS userId, u.name AS userName,
           al.changes, al.created_at AS createdAt
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
  `;
  const params: (string | number)[] = [];
  if (allowedPostIds != null && allowedPostIds.length > 0) {
    sql += ` WHERE (al.entity_type != 'post' OR al.entity_id IN (${allowedPostIds.map(() => '?').join(',')}))`;
    params.push(...allowedPostIds);
  }
  sql += ' ORDER BY al.created_at DESC LIMIT ?';
  params.push(limit);
  const rows = database.prepare(sql).all(...params) as any[];
  return rows.map(r => ({ ...r, changes: r.changes ?? null, userName: r.userName ?? null }));
}

/** Audit log by post (entity_type='post', entity_id=postId). */
export function getAuditLogByPostId(postId: string): Array<{ id: string; entityType: string; entityId: string; action: string; userId: string; changes: string | null; createdAt: string }> {
  const rows = database.prepare(`
    SELECT id, entity_type AS entityType, entity_id AS entityId, action, user_id AS userId, changes, created_at AS createdAt
    FROM audit_log
    WHERE entity_type = 'post' AND entity_id = ?
    ORDER BY created_at DESC
  `).all(postId) as any[];
  return rows.map(r => ({ ...r, changes: r.changes ?? null }));
}

/** Append audit log entry (for use from routes). */
export function appendAuditLog(data: { entityType: string; entityId: string; action: string; userId: string; changes?: string | null }): void {
  const id = `al${Date.now()}`;
  database.prepare(`
    INSERT INTO audit_log (id, entity_type, entity_id, action, user_id, changes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.entityType, data.entityId, data.action, data.userId, data.changes ?? null);
}

/** Create user (for signup). Returns user without password. Throws if email exists. Email stored lowercase. */
export function createUser(data: { email: string; name: string; passwordHash: string; organizationId?: string }): { id: string; email: string; name: string; organizationId: string; postId: null; role: string } {
  const emailNorm = data.email.trim().toLowerCase();
  const existing = database.prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?').get(emailNorm);
  if (existing) {
    throw new Error('Email already registered');
  }
  const id = `u${Date.now()}`;
  const orgId = data.organizationId ?? '1';
  database.prepare(`
    INSERT INTO users (id, email, name, organization_id, password_hash, post_id)
    VALUES (?, ?, ?, ?, ?, NULL)
  `).run(id, emailNorm, data.name.trim(), orgId, data.passwordHash);
  return {
    id,
    email: emailNorm,
    name: data.name.trim(),
    organizationId: orgId,
    postId: null,
    role: 'Employee',
  };
}

/** Highest role from a list (Admin > Inspector > Department Head > Section Head > Employee). Used when user holds multiple posts. */
const ROLE_ORDER = ['Employee', 'Section Head', 'Department Head', 'Inspector', 'Admin'] as const;
function highestRole(roles: (string | null)[]): string {
  for (let i = ROLE_ORDER.length - 1; i >= 0; i--) {
    if (roles.includes(ROLE_ORDER[i])) return ROLE_ORDER[i];
  }
  return 'Employee';
}

/** User by id for /me. Role = highest among all posts the user holds (user_posts), so Admin stays Admin when assigned to other departments. */
export function getUserById(userId: string): { id: string; email: string; name: string; organizationId: string; postId: string | null; role: string } | null {
  const row = database.prepare(`
    SELECT u.id, u.email, u.name, u.organization_id, u.post_id
    FROM users u WHERE u.id = ?
  `).get(userId) as any;
  if (!row) return null;
  const postRoles = database.prepare(`
    SELECT p.role FROM user_posts up JOIN posts p ON p.id = up.post_id WHERE up.user_id = ?
  `).all(userId) as { role: string }[];
  const roles = postRoles.map(r => r.role).filter(Boolean);
  const role = roles.length ? highestRole(roles) : (database.prepare('SELECT role FROM posts WHERE id = ?').get(row.post_id) as { role: string } | undefined)?.role ?? 'Employee';
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    organizationId: row.organization_id,
    postId: row.post_id,
    role,
  };
}

/** Get user by post ID (finds who holds this post). */
export function getUserByPostId(postId: string): { id: string; email: string; name: string; organizationId: string; postId: string; role: string } | null {
  const row = database.prepare(`
    SELECT u.id, u.email, u.name, u.organization_id, up.post_id
    FROM users u
    JOIN user_posts up ON up.user_id = u.id
    WHERE up.post_id = ?
    LIMIT 1
  `).get(postId) as any;
  if (!row) return null;
  const postRole = database.prepare('SELECT role FROM posts WHERE id = ?').get(postId) as { role: string } | undefined;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    organizationId: row.organization_id,
    postId: row.post_id,
    role: postRole?.role ?? 'Employee',
  };
}

/** User by email for login (case-insensitive). Role = highest among all posts the user holds (user_posts). */
export function getUserByEmailForLogin(email: string): { id: string; email: string; name: string; organizationId: string; passwordHash: string; postId: string | null; role: string } | null {
  const normalized = email.trim().toLowerCase();
  const row = database.prepare(`
    SELECT u.id, u.email, u.name, u.organization_id, u.password_hash, u.post_id
    FROM users u WHERE LOWER(TRIM(u.email)) = ?
  `).get(normalized) as any;
  if (!row) return null;
  const postRoles = database.prepare(`
    SELECT p.role FROM user_posts up JOIN posts p ON p.id = up.post_id WHERE up.user_id = ?
  `).all(row.id) as { role: string }[];
  const roles = postRoles.map(r => r.role).filter(Boolean);
  const role = roles.length ? highestRole(roles) : (database.prepare('SELECT role FROM posts WHERE id = ?').get(row.post_id) as { role: string } | undefined)?.role ?? 'Employee';
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    organizationId: row.organization_id,
    passwordHash: row.password_hash,
    postId: row.post_id,
    role,
  };
}
