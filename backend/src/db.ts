import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcryptjs';
import type { PostWithHolder, PostHolder, User } from './types';
import { execRaw, run, get, all, transaction, clientRun, clientGet, clientAll } from './pgClient';
import { sendVerificationEmail } from './services/mailService';

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
    createdBy: row.created_by || undefined,
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
export async function initDb(): Promise<void> {
  // Works from both src/ (ts-node) and dist/ (node): both resolve to backend/src/schema.sql
  const schemaPath = path.join(__dirname, '..', 'src', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  await execRaw(schema);
  try {
    await execRaw('ALTER TABLE posts ADD COLUMN code TEXT');
  } catch {
    // column may already exist
  }
  try {
    await execRaw('ALTER TABLE posts ADD COLUMN card_color TEXT');
  } catch {
    // column may already exist
  }
  try {
    await execRaw('ALTER TABLE posts ADD COLUMN card_notes TEXT');
  } catch {
    // column may already exist
  }
  await migrateStatisticQuotasTable();
  await migratePostStatisticsTable();
  await migrateMetricToPostTable();
  await migrateMetricDefinitionsTable();
  await migrateUserPostsTable();
  await migrateUsersToUserPosts();
  await migrateMailboxAttachmentsTable();
  await migrateMailboxMessagesFolder();
  await migrateMailboxMessagesWorkPlan();
  await migrateWorkPlanNotifications();
  await migrateWorkPlansWorkflow();
  await migrateUsersVerification();
  await execRaw(
    "ALTER TABLE departments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
  );
  await execRaw(
    "ALTER TABLE instructions ADD COLUMN IF NOT EXISTS content TEXT"
  );
  await execRaw(`
    CREATE TABLE IF NOT EXISTS instruction_acknowledgements (
      id              TEXT PRIMARY KEY,
      instruction_id  TEXT NOT NULL REFERENCES instructions(id) ON DELETE CASCADE,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(instruction_id, user_id)
    )
  `);
  await seedMetricDefinitionsIfEmpty();
  await seedIfEmpty();
  await ensureSecondAdminPost();
  if (process.env.NODE_ENV !== 'production') {
    await ensureUserAdiletMail();
  }
}

/** Ensure metric_definitions table exists (for DBs created before schema had it). */
async function migrateMetricDefinitionsTable(): Promise<void> {
  await execRaw(`
    CREATE TABLE IF NOT EXISTS metric_definitions (
      id         TEXT PRIMARY KEY,
      code       TEXT UNIQUE NOT NULL,
      name       TEXT NOT NULL,
      unit       TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try {
    await execRaw('ALTER TABLE metric_definitions ADD COLUMN description TEXT');
  } catch {
    // column may already exist
  }
}

/** Ensure statistic_quotas table exists (for DBs created before schema had it). */
async function migrateStatisticQuotasTable(): Promise<void> {
  await execRaw(`
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
async function migratePostStatisticsTable(): Promise<void> {
  await execRaw(`
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
async function migrateMetricToPostTable(): Promise<void> {
  await execRaw(`
    CREATE TABLE IF NOT EXISTS metric_to_post (
      post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      metric_code  TEXT NOT NULL,
      responsible_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, metric_code)
    )
  `);
  try {
    await execRaw('ALTER TABLE metric_to_post ADD COLUMN daily_target REAL');
  } catch {
    // column already exists
  }
}

/** Ensure user_posts table exists (for DBs created before schema had it). */
async function migrateUserPostsTable(): Promise<void> {
  await execRaw(`
    CREATE TABLE IF NOT EXISTS user_posts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, post_id),
      UNIQUE (post_id)
    )
  `);
  try {
    await execRaw('ALTER TABLE user_posts ADD COLUMN assigned_at TEXT');
    await execRaw(`UPDATE user_posts SET assigned_at = '2000-01-01 00:00:00' WHERE assigned_at IS NULL`);
  } catch {
    // already exists
  }
}

/** Ensure second admin post exists so multiple admins can exist (for seniority / remove-admin). */
async function ensureSecondAdminPost(): Promise<void> {
  const exists = await get('SELECT 1 FROM posts WHERE id = ?', ['p_admin2']);
  if (exists) return;
  await run(`
    INSERT INTO posts (id, title, description, parent_post_id, department_id, role, level, order_index, code)
    VALUES ('p_admin2', 'Администратор', 'Дополнительная роль администратора', 'p1', 'd1', 'Admin', 0, 99, null)
  `, []);
}

/** Ensure mailbox_message_attachments table exists. */
async function migrateMailboxAttachmentsTable(): Promise<void> {
  await execRaw(`
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
    await execRaw('CREATE INDEX IF NOT EXISTS idx_attachments_message ON mailbox_message_attachments(message_id)');
  } catch {
    // ignore
  }
}

/** Add sender_post_id, folder, and body to mailbox_messages. */
async function migrateMailboxMessagesFolder(): Promise<void> {
  try {
    await execRaw('ALTER TABLE mailbox_messages ADD COLUMN sender_post_id TEXT REFERENCES posts(id)');
  } catch {
    // already exists
  }
  try {
    await execRaw("ALTER TABLE mailbox_messages ADD COLUMN folder TEXT DEFAULT 'inbox'");
    await execRaw("UPDATE mailbox_messages SET folder = 'inbox' WHERE folder IS NULL");
  } catch {
    // already exists
  }
  try {
    await execRaw('ALTER TABLE mailbox_messages ADD COLUMN body TEXT');
  } catch {
    // already exists
  }
}

/** Add work_plan_id to mailbox_messages for work plan notifications. */
async function migrateMailboxMessagesWorkPlan(): Promise<void> {
  try {
    await execRaw('ALTER TABLE mailbox_messages ADD COLUMN work_plan_id TEXT REFERENCES work_plans(id)');
  } catch {
    // already exists
  }
  try {
    await execRaw('CREATE INDEX IF NOT EXISTS idx_mailbox_work_plan ON mailbox_messages(work_plan_id)');
  } catch {
    // already exists
  }
}

/** Create work_plan_notifications table for in-app notifications. */
async function migrateWorkPlanNotifications(): Promise<void> {
  await execRaw(`
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
    await execRaw('CREATE INDEX IF NOT EXISTS idx_notifications_user ON work_plan_notifications(recipient_user_id, read)');
  } catch {}
  try {
    await execRaw('CREATE INDEX IF NOT EXISTS idx_notifications_plan ON work_plan_notifications(work_plan_id)');
  } catch {}
}

/** Add workflow fields to work_plans and create work_plan_tasks. */
async function migrateWorkPlansWorkflow(): Promise<void> {
  try {
    await execRaw('ALTER TABLE work_plans ADD COLUMN workflow_status TEXT DEFAULT \'draft\'');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE work_plans ADD COLUMN author_user_id TEXT REFERENCES users(id)');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE work_plans ADD COLUMN approver_post_id TEXT REFERENCES posts(id)');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE work_plans ADD COLUMN submitted_at TEXT');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE work_plans ADD COLUMN approved_at TEXT');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE work_plans ADD COLUMN rejected_at TEXT');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE work_plans ADD COLUMN rejection_comment TEXT');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE work_plans ADD COLUMN period TEXT');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE work_plans ADD COLUMN approval_comment TEXT');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE work_plans ADD COLUMN message_text TEXT');
  } catch { /* already exists */ }
  await execRaw(`
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
    await execRaw('CREATE INDEX IF NOT EXISTS idx_work_plan_tasks_plan ON work_plan_tasks(work_plan_id)');
  } catch { /* ignore */ }
  await execRaw(`UPDATE work_plans SET workflow_status = 'draft' WHERE workflow_status IS NULL`);
}

/** Migrate users to support email verification columns and verify existing users. */
async function migrateUsersVerification(): Promise<void> {
  try {
    // Add is_verified column defaulting to TRUE so existing users are automatically verified
    await execRaw('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT TRUE');
    // Set future defaults to FALSE for new insertions
    await execRaw('ALTER TABLE users ALTER COLUMN is_verified SET DEFAULT FALSE');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMP');
  } catch { /* already exists */ }
  try {
    await execRaw('ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_attempts INTEGER DEFAULT 0');
  } catch { /* already exists */ }
}

/** Migrate users.post_id into user_posts so one user can hold multiple posts. */
async function migrateUsersToUserPosts(): Promise<void> {
  try {
    await execRaw(`
      INSERT INTO user_posts (user_id, post_id)
      SELECT id, post_id FROM users WHERE post_id IS NOT NULL
      ON CONFLICT (user_id, post_id) DO NOTHING
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

async function seedMetricDefinitionsIfEmpty(): Promise<void> {
  const count = await get('SELECT COUNT(*)::int AS c FROM metric_definitions', []) as { c: number };
  if (Number(count?.c ?? 0) > 0) return;
  for (let i = 0; i < DEFAULT_METRICS.length; i++) {
    const [code, name, unit] = DEFAULT_METRICS[i];
    await run(
      `INSERT INTO metric_definitions (id, code, name, unit) VALUES (?, ?, ?, ?)`,
      [`metric${i + 1}`, code, name, unit],
    );
  }
}

async function seedIfEmpty(): Promise<void> {
  const count = await get('SELECT COUNT(*)::int AS c FROM posts', []) as { c: number };
  if (Number(count?.c ?? 0) > 0) return;

  const posts: Array<[string, string, string, string | null, string, string, number, number, string | null]> = [
    ['p1', 'Исполнительный директор', 'Руководитель организации', null, 'd1', 'Admin', 0, 0, null],
    ['p2', 'Заместитель по управлению', '', 'p1', 'd2', 'Department Head', 1, 0, null],
    ['p3', 'Заместитель по производству', '', 'p1', 'd3', 'Department Head', 1, 1, null],
    ['p4', 'Руководитель 1 Отделения', 'Персонал и коммуникации', 'p2', 'd4', 'Section Head', 2, 0, null],
    ['p5', 'Начальник отдела 1', 'Направления и персонала', 'p4', 'd4', 'Employee', 3, 0, null],
  ];
  for (const p of posts) {
    await run(
      `INSERT INTO posts (id, title, description, parent_post_id, department_id, role, level, order_index, code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...p],
    );
  }

  const defaultHash = bcrypt.hashSync('password123', 10);
  await run(
    `INSERT INTO users (id, email, name, organization_id, password_hash, post_id) VALUES (?, ?, ?, ?, ?, ?)`,
    ['u1', 'a@example.com', 'Королева Анастасия', '1', defaultHash, 'p1'],
  );
  await run(
    `INSERT INTO users (id, email, name, organization_id, password_hash, post_id) VALUES (?, ?, ?, ?, ?, ?)`,
    ['u2', 'd@example.com', 'Дана Ишмухаметова', '1', defaultHash, 'p2'],
  );
  await run(
    `INSERT INTO users (id, email, name, organization_id, password_hash, post_id) VALUES (?, ?, ?, ?, ?, ?)`,
    ['u3', 'free@example.com', 'Иван Свободный', '1', defaultHash, null],
  );

  const depts: Array<[string, string, null, string, string]> = [
    ['d1', '—', null, 'p1', '1'],
    ['d2', 'Управление', null, 'p2', '1'],
    ['d3', 'Производство', null, 'p3', '1'],
    ['d4', 'Персонал и коммуникации', null, 'p4', '1'],
  ];
  for (const d of depts) {
    await run(
      `INSERT INTO departments (id, name, parent_id, manager_post_id, organization_id) VALUES (?, ?, ?, ?, ?)`,
      [...d],
    );
  }

  const iso = new Date().toISOString();
  await run(
    `INSERT INTO instructions (id, title, post_id, owner_post_id, status, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['ins1', 'Safety Protocol v2.1', 'p1', 'p1', 'active', 2, iso],
  );
  await run(
    `INSERT INTO instructions (id, title, post_id, owner_post_id, status, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['ins2', 'Data Handling Guidelines', 'p2', 'p2', 'active', 1, iso],
  );

  await run(
    `INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)`,
    ['stat1', 'p1', '2026-Q1', 'completedTasks', 12],
  );
  await run(
    `INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)`,
    ['stat2', 'p1', '2026-Q1', 'overdue', 0],
  );
  await run(
    `INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)`,
    ['stat3', 'p2', '2026-Q1', 'completedTasks', 8],
  );
  await run(
    `INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)`,
    ['stat4', 'p1', '2026-01', 'completedTasks', 4],
  );
  await run(
    `INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)`,
    ['stat5', 'p1', '2026-02', 'completedTasks', 5],
  );
  await run(
    `INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)`,
    ['stat6', 'p1', '2026-03', 'completedTasks', 3],
  );
  await run(
    `INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)`,
    ['stat7', 'p2', '2026-01', 'completedTasks', 3],
  );
  await run(
    `INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)`,
    ['stat8', 'p2', '2026-02', 'completedTasks', 5],
  );
  await run(
    `INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)`,
    ['stat9', 'p1', '2026-Q1', 'revenue', 120000],
  );
  await run(
    `INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)`,
    ['stat10', 'p2', '2026-Q1', 'revenue', 45000],
  );

  await run(
    `INSERT INTO budgets (id, department_id, responsible_post_id, category, period, planned, approved, spent, remaining, limits, approval_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['b1', 'd2', 'p2', 'Salaries', '2026-Q1', 500000, 480000, 120000, 360000, 500000, 'approved'],
  );
  await run(
    `INSERT INTO budgets (id, department_id, responsible_post_id, category, period, planned, approved, spent, remaining, limits, approval_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['b2', 'd3', 'p3', 'Campaigns', '2026-Q1', 200000, 0, 0, 200000, 200000, 'pending'],
  );
  await run(
    `INSERT INTO budgets (id, department_id, responsible_post_id, category, period, planned, approved, spent, remaining, limits, approval_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['b3', 'd4', 'p4', 'Training', '2026-Q1', 50000, 50000, 0, 50000, 50000, 'approved'],
  );

  const now = new Date().toISOString();
  await run(
    `INSERT INTO work_plans (id, title, post_id, department, status, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['wp1', 'Q1 Product Launch', 'p1', 'Product', 'on-track', '2026-03-31', now, now],
  );
  await run(
    `INSERT INTO work_plans (id, title, post_id, department, status, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['wp2', 'Marketing Campaign', 'p2', 'Marketing', 'at-risk', '2026-02-15', now, now],
  );
  await run(
    `INSERT INTO work_plans (id, title, post_id, department, status, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['wp3', 'Infrastructure Upgrade', 'p3', 'IT', 'overdue', '2026-01-20', now, now],
  );

  await run(
    `INSERT INTO metric_to_post (post_id, metric_code, responsible_user_id, daily_target) VALUES (?, ?, ?, ?)`,
    ['p1', 'completedTasks', 'u1', 5],
  );
  await run(
    `INSERT INTO metric_to_post (post_id, metric_code, responsible_user_id, daily_target) VALUES (?, ?, ?, ?)`,
    ['p1', 'revenue', 'u1', 5000],
  );
  await run(
    `INSERT INTO metric_to_post (post_id, metric_code, responsible_user_id, daily_target) VALUES (?, ?, ?, ?)`,
    ['p2', 'completedTasks', 'u2', 3],
  );
  await run(
    `INSERT INTO metric_to_post (post_id, metric_code, responsible_user_id, daily_target) VALUES (?, ?, ?, ?)`,
    ['p2', 'revenue', null, null],
  );
  await run(
    `INSERT INTO metric_to_post (post_id, metric_code, responsible_user_id, daily_target) VALUES (?, ?, ?, ?)`,
    ['p3', 'calls', 'u2', 10],
  );

  await run(
    `INSERT INTO mailbox_messages (id, recipient_post_id, sender_email, subject, body_snippet, message_date, unread) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['msg1', 'p1', 'john@example.com', 'Q1 Budget Review', 'Please review the attached budget.', '2026-01-22', 1],
  );
  await run(
    `INSERT INTO mailbox_messages (id, recipient_post_id, sender_email, subject, body_snippet, message_date, unread) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['msg2', 'p1', 'jane@example.com', 'Team Meeting Reminder', 'Reminder: meeting at 10:00.', '2026-01-21', 0],
  );
  await run(
    `INSERT INTO mailbox_messages (id, recipient_post_id, sender_email, subject, body_snippet, message_date, unread) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['msg3', 'p2', 'hr@example.com', 'Staff Update', 'New hire paperwork.', '2026-01-20', 1],
  );

  const auditNow = new Date().toISOString();
  await run(
    `INSERT INTO audit_log (id, entity_type, entity_id, action, user_id, changes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['al1', 'post', 'p1', 'created', 'u1', null, auditNow],
  );
  await run(
    `INSERT INTO audit_log (id, entity_type, entity_id, action, user_id, changes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['al2', 'post', 'p1', 'assign', 'u1', '{"userId":"u1"}', auditNow],
  );
  await run(
    `INSERT INTO audit_log (id, entity_type, entity_id, action, user_id, changes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['al3', 'post', 'p2', 'updated', 'u1', '{"title":"Заместитель по управлению"}', auditNow],
  );
}

/** Ensure user adilet2005@mail.ru exists (password: adilet2005). Idempotent. */
async function ensureUserAdiletMail(): Promise<void> {
  const email = 'adilet2005@mail.ru';
  const existing = await get('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', [email.toLowerCase()]) as { id: string } | undefined;
  if (existing) return;
  const id = 'u-adilet-mail';
  const passwordHash = bcrypt.hashSync('adilet2005', 10);
  await run(`
    INSERT INTO users (id, email, name, organization_id, password_hash, post_id)
    VALUES (?, ?, ?, ?, ?, NULL)
  `, [id, email, 'Adilet', '1', passwordHash]);
}

/** All posts with currentHolder (from user_posts: one person can hold many posts). Optional allowedPostIds. */
export async function getPostsWithHolders(allowedPostIds?: string[] | null): Promise<PostWithHolder[]> {
  if (allowedPostIds && allowedPostIds.length > 500) {
    throw new Error('Too many IDs requested');
  }
  let sql = `
    SELECT p.id, p.title, p.description, p.parent_post_id, p.department_id, p.role, p.level, p.order_index, p.code,
           p.card_color, p.card_notes,
           (SELECT user_id FROM audit_log WHERE entity_type = 'post' AND entity_id = p.id AND action = 'created' ORDER BY created_at ASC LIMIT 1) AS created_by,
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
  const rows = (params.length ? await all(sql, [...params]) : await all(sql, [])) as any[];
  return rows.map(r => ({ ...rowToPost(r), currentHolder: rowToHolder(r) }));
}

/** Posts the user holds (from user_posts; fallback to users.post_id). "My boxes" for Communication. */
export async function getPostsForUser(userId: string): Promise<PostWithHolder[]> {
  const fromUserPosts = await all('SELECT post_id FROM user_posts WHERE user_id = ?', [userId]) as Array<{ post_id: string }>;
  let postIds = fromUserPosts.map((r) => r.post_id);
  if (postIds.length === 0) {
    const u = await get('SELECT post_id FROM users WHERE id = ?', [userId]) as { post_id: string | null } | undefined;
    if (u?.post_id) postIds = [u.post_id];
  }
  if (postIds.length === 0) return [];
  const placeholders = postIds.map(() => '?').join(',');
  const rows = await all(`
    SELECT p.id, p.title, p.description, p.parent_post_id, p.department_id, p.role, p.level, p.order_index, p.code,
           p.card_color, p.card_notes,
           (SELECT user_id FROM audit_log WHERE entity_type = 'post' AND entity_id = p.id AND action = 'created' ORDER BY created_at ASC LIMIT 1) AS created_by,
           u.id AS user_id, u.name, u.email, u.avatar_url
    FROM posts p
    LEFT JOIN user_posts up ON up.post_id = p.id
    LEFT JOIN users u ON u.id = up.user_id
    WHERE p.id IN (${placeholders})
    ORDER BY p.title
  `, [...postIds]) as any[];
  return rows.map((r) => ({ ...rowToPost(r), currentHolder: rowToHolder(r) }));
}

/** Single post by id with holder. */
export async function getPostById(id: string): Promise<PostWithHolder | null> {
  const row = await get(`
    SELECT p.id, p.title, p.description, p.parent_post_id, p.department_id, p.role, p.level, p.order_index, p.code,
           p.card_color, p.card_notes,
           (SELECT user_id FROM audit_log WHERE entity_type = 'post' AND entity_id = p.id AND action = 'created' ORDER BY created_at ASC LIMIT 1) AS created_by,
           u.id AS user_id, u.name, u.email, u.avatar_url
    FROM posts p
    LEFT JOIN user_posts up ON up.post_id = p.id
    LEFT JOIN users u ON u.id = up.user_id
    WHERE p.id = ?
  `, [id]) as any;
  if (!row) return null;
  return { ...rowToPost(row), currentHolder: rowToHolder(row) };
}

/** Create post; returns new post with currentHolder null. */
export async function createPost(data: {
  id: string;
  title: string;
  description?: string;
  parentPostId: string | null;
  departmentId: string;
  role: string;
  level: number;
  orderIndex: number;
  code?: string | null;
}): Promise<PostWithHolder> {
  await run(`
    INSERT INTO posts (id, title, description, parent_post_id, department_id, role, level, order_index, code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [data.id,
    data.title,
    data.description ?? '',
    data.parentPostId,
    data.departmentId,
    data.role,
    data.level,
    data.orderIndex,
    data.code ?? null]);
  return (await getPostById(data.id))!;
}

/** Update post fields. */
export async function updatePost(id: string, data: Partial<{
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
}>): Promise<void> {
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
  await run(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`, [...values]);
}

/** Delete post(s). If cascade, delete subtree. Cleans FKs: stats, work_plans, mailbox, budgets, departments, instructions. */
export async function deletePosts(id: string, cascade: boolean): Promise<void> {
  await transaction(async (client) => {
    const toRemove: string[] = [id];
    if (cascade) {
      const collect = async (pid: string) => {
        const children = await clientAll<{ id: string }>(
          client,
          'SELECT id FROM posts WHERE parent_post_id = ?',
          [pid],
        );
        for (const c of children) {
          toRemove.push(c.id);
          await collect(c.id);
        }
      };
      await collect(id);
    }
    const ordered = toRemove.slice().reverse();
    for (const pid of ordered) {
      await clientRun(client, 'DELETE FROM post_statistics WHERE post_id = ?', [pid]);
      await clientRun(client, 'DELETE FROM work_plans WHERE post_id = ?', [pid]);
      await clientRun(client, 'DELETE FROM mailbox_messages WHERE recipient_post_id = ?', [pid]);
      await clientRun(client, 'UPDATE budgets SET responsible_post_id = NULL WHERE responsible_post_id = ?', [pid]);
      await clientRun(client, 'UPDATE departments SET manager_post_id = NULL WHERE manager_post_id = ?', [pid]);
      const instrIds = await clientAll<{ id: string }>(
        client,
        'SELECT id FROM instructions WHERE post_id = ? OR owner_post_id = ?',
        [pid, pid],
      );
      for (const inst of instrIds) {
        await clientRun(client, 'DELETE FROM instruction_steps WHERE instruction_id = ?', [inst.id]);
      }
      await clientRun(client, 'DELETE FROM instructions WHERE post_id = ? OR owner_post_id = ?', [pid, pid]);
      await clientRun(client, 'UPDATE users SET post_id = NULL WHERE post_id = ?', [pid]);
      await clientRun(client, 'DELETE FROM posts WHERE id = ?', [pid]);
    }
  });
}

/** All users (id, name, email, avatarUrl, postId). */
export async function getUsers(): Promise<Pick<User, 'id' | 'name' | 'email' | 'avatarUrl' | 'postId'>[]> {
  const rows = await all('SELECT id, name, email, avatar_url, post_id FROM users', []) as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    avatarUrl: r.avatar_url || undefined,
    postId: r.post_id,
  }));
}

/** When the user was assigned to any admin post, or null if not admin. Used for seniority: only older admins can remove newer ones. */
export async function getAdminAssignedAt(userId: string): Promise<string | null> {
  const row = await get(`
    SELECT up.assigned_at FROM user_posts up JOIN posts p ON p.id = up.post_id
    WHERE up.user_id = ? AND p.role = 'Admin' ORDER BY up.assigned_at ASC LIMIT 1
  `, [userId]) as { assigned_at: string | null } | undefined;
  return row?.assigned_at ?? null;
}

/** Post id that has role Admin and is held by this user, or null. */
export async function getAdminPostIdForUser(userId: string): Promise<string | null> {
  const row = await get(`
    SELECT up.post_id FROM user_posts up JOIN posts p ON p.id = up.post_id
    WHERE up.user_id = ? AND p.role = 'Admin' LIMIT 1
  `, [userId]) as { post_id: string } | undefined;
  return row?.post_id ?? null;
}

/** Ids of posts with role Admin (for finding a free slot when making admin). */
export async function getAdminPostIds(): Promise<string[]> {
  const rows = await all('SELECT id FROM posts WHERE role = ?', ['Admin']) as { id: string }[];
  return rows.map(r => r.id);
}

/** All users with effective role (highest among posts) and post title (for Admin user management). Includes adminAssignedAt for seniority. */
export async function getUsersWithRoles(): Promise<Array<{ id: string; name: string; email: string; avatarUrl?: string; postId: string | null; postTitle: string | null; role: string | null; adminAssignedAt: string | null }>> {
  const rows = await all(`
    SELECT u.id, u.name, u.email, u.avatar_url, u.post_id, p.title AS post_title
    FROM users u
    LEFT JOIN posts p ON p.id = u.post_id
    ORDER BY u.name
  `, []) as any[];
  const roleRows = await all(`
    SELECT up.user_id, p.role FROM user_posts up JOIN posts p ON p.id = up.post_id
  `, []) as { user_id: string; role: string }[];
  const adminRows = await all(`
    SELECT up.user_id, MIN(up.assigned_at) AS assigned_at FROM user_posts up JOIN posts p ON p.id = up.post_id WHERE p.role = 'Admin' GROUP BY up.user_id
  `, []) as { user_id: string; assigned_at: string | null }[];
  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, []);
    rolesByUser.get(r.user_id)!.push(r.role);
  }
  const adminByUser = new Map<string, string | null>();
  for (const a of adminRows) adminByUser.set(a.user_id, a.assigned_at);
  const out: Array<{ id: string; name: string; email: string; avatarUrl?: string; postId: string | null; postTitle: string | null; role: string | null; adminAssignedAt: string | null }> = [];
  for (const r of rows) {
    const roles = rolesByUser.get(r.id) ?? [];
    let role: string | null = null;
    if (roles.length) role = highestRole(roles);
    else if (r.post_id) {
      const pr = await get('SELECT role FROM posts WHERE id = ?', [r.post_id]) as { role: string } | undefined;
      role = pr?.role ?? null;
    }
    out.push({
      id: r.id,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatar_url || undefined,
      postId: r.post_id,
      postTitle: r.post_title || null,
      role: role || null,
      adminAssignedAt: role === 'Admin' ? (adminByUser.get(r.id) ?? null) : null,
    });
  }
  return out;
}

/** Set user's post_id (assign or vacate). Clears previous post. */
export async function setUserPostId(userId: string, postId: string | null): Promise<void> {
  await run('UPDATE users SET post_id = ? WHERE id = ?', [postId, userId]);
}

/** Assign user to post. One person can hold many posts: we add (userId, postId) and set primary. Post gets one holder. */
export async function assignUserToPost(postId: string, userId: string): Promise<void> {
  await transaction(async (client) => {
    await clientRun(client, 'DELETE FROM user_posts WHERE post_id = ?', [postId]);
    await clientRun(
      client,
      `INSERT INTO user_posts (user_id, post_id, assigned_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [userId, postId],
    );
    await clientRun(client, 'UPDATE users SET post_id = ? WHERE id = ?', [postId, userId]);
  });
}

/** Clear holder from post. If user has no other posts, clear users.post_id. */
export async function vacatePost(postId: string): Promise<void> {
  const holder = await get('SELECT user_id FROM user_posts WHERE post_id = ?', [postId]) as { user_id: string } | undefined;
  await run('DELETE FROM user_posts WHERE post_id = ?', [postId]);
  if (holder) {
    const rest = await get('SELECT post_id FROM user_posts WHERE user_id = ? LIMIT 1', [holder.user_id]) as { post_id: string } | undefined;
    await run('UPDATE users SET post_id = ? WHERE id = ?', [rest?.post_id ?? null, holder.user_id]);
  }
}

/** Delete user from system. Vacates all posts held by user. */
export async function deleteUser(userId: string): Promise<void> {
  const user = await get('SELECT id FROM users WHERE id = ?', [userId]) as { id: string } | undefined;
  if (!user) {
    throw new Error('Пользователь не найден');
  }
  
  // Get all posts held by this user and vacate them
  const userPosts = await all('SELECT post_id FROM user_posts WHERE user_id = ?', [userId]) as Array<{ post_id: string }>;
  for (const { post_id } of userPosts) {
    await vacatePost(post_id);
  }
  
  // Delete user (CASCADE will handle user_posts, metric_to_post will SET NULL)
  await run('DELETE FROM users WHERE id = ?', [userId]);
}

/** Check if post has children. */
export async function postHasChildren(id: string): Promise<boolean> {
  const row = await get('SELECT 1 FROM posts WHERE parent_post_id = ? LIMIT 1', [id]);
  return !!row;
}

/** All departments. */
export async function getDepartments(): Promise<Array<{ id: string; name: string; parentId: string | null; managerPostId: string | null; organizationId: string }>> {
  const rows = await all(`
    SELECT id, name, parent_id AS parentId, manager_post_id AS managerPostId, organization_id AS organizationId
    FROM departments
    ORDER BY name
  `, []) as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    parentId: r.parentId ?? null,
    managerPostId: r.managerPostId ?? null,
    organizationId: r.organizationId ?? '1',
  }));
}

/** Create department. */
export async function createDepartment(data: { id: string; name: string; parentId?: string | null; managerPostId?: string | null; organizationId?: string }): Promise<void> {
  await run(`
    INSERT INTO departments (id, name, parent_id, manager_post_id, organization_id)
    VALUES (?, ?, ?, ?, ?)
  `, [data.id,
    data.name,
    data.parentId ?? null,
    data.managerPostId ?? null,
    data.organizationId ?? '1']);
}

/** Update department. */
export async function updateDepartment(id: string, data: { name?: string; parentId?: string | null; managerPostId?: string | null }): Promise<void> {
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
  await run(`UPDATE departments SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values]);
}

/** Delete department. */
export async function deleteDepartment(id: string): Promise<void> {
  // Check if department has posts
  const postsCount = await get('SELECT COUNT(*) as count FROM posts WHERE department_id = ?', [id]) as { count: number };
  if (postsCount.count > 0) {
    throw new Error('Нельзя удалить отдел, в котором есть должности');
  }
  
  // Check if department has children
  const childrenCount = await get('SELECT COUNT(*) as count FROM departments WHERE parent_id = ?', [id]) as { count: number };
  if (childrenCount.count > 0) {
    throw new Error('Нельзя удалить отдел, у которого есть подотделы');
  }
  
  await run('DELETE FROM departments WHERE id = ?', [id]);
}

/** Post id and all descendants (subtree). For visibility: Department Head / Section Head see only their subtree. */
export async function getPostSubtreeIds(postId: string): Promise<string[]> {
  const rows = await all(`
    WITH RECURSIVE subtree(id, level) AS (
      SELECT id, 0 FROM posts WHERE id = ?
      UNION ALL
      SELECT p.id, s.level + 1 FROM posts p
      INNER JOIN subtree s ON p.parent_post_id = s.id
      WHERE s.level < 20
    )
    SELECT id FROM subtree
  `, [postId]) as { id: string }[];
  return rows.map(r => r.id);
}

/** Ancestor post IDs from post up to root (parent, grandparent, …). For "who can approve" work plan. */
export async function getAncestorPostIds(postId: string): Promise<string[]> {
  const ids: string[] = [];
  let current: string | null = postId;
  for (let i = 0; i < 20 && current; i++) {
    const row = await get('SELECT parent_post_id FROM posts WHERE id = ?', [current]) as { parent_post_id: string | null } | undefined;
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
export async function getAllowListForUser(user: { id?: string; role: string; postId?: string | null } | undefined): Promise<string[] | null> {
  if (!user?.id) return [];
  
  // Get all posts held by this user from user_posts table
  const userPosts = await all('SELECT post_id AS "postId" FROM user_posts WHERE user_id = ?', [user.id]) as Array<{ postId: string }>;
  const postIds = userPosts.map(up => up.postId);
  
  // Also include primary postId if not already in list
  if (user.postId && !postIds.includes(user.postId)) {
    postIds.push(user.postId);
  }
  
  if (postIds.length === 0) return [];
  
  // Get subtree for each post and combine
  const allowedSet = new Set<string>();
  for (const pid of postIds) {
    const subtree = await getPostSubtreeIds(pid);
    for (const id of subtree) {
      allowedSet.add(id);
    }
  }
  
  return Array.from(allowedSet);
}

/** Instructions list; optional filter by postId; optional allowedPostIds (visibility: only these posts). */
export async function getInstructions(postId?: string, allowedPostIds?: string[] | null): Promise<Array<{ id: string; title: string; postId: string; postTitle?: string; ownerPostId: string; ownerPostTitle?: string; status: string; version: number; content?: string | null; updatedAt: string }>> {
  let sql = `
    SELECT i.id, i.title, i.post_id AS "postId", p.title AS "postTitle",
           i.owner_post_id AS "ownerPostId", op.title AS "ownerPostTitle",
           i.status, i.version, i.content, i.updated_at AS "updatedAt"
    FROM instructions i
    LEFT JOIN posts p ON p.id = i.post_id
    LEFT JOIN posts op ON op.id = i.owner_post_id
  `;
  const params: (string | number)[] = [];
  const conditions: string[] = [];
  if (postId) {
    conditions.push('i.post_id = ?');
    params.push(postId);
  }
  if (allowedPostIds != null) {
    if (allowedPostIds.length > 0) {
      conditions.push(`i.post_id IN (${allowedPostIds.map(() => '?').join(',')})`);
      params.push(...allowedPostIds);
    } else {
      conditions.push('1=0');
    }
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY i.updated_at DESC';
  const rows = (params.length ? await all(sql, [...params]) : await all(sql, [])) as any[];
  return rows.map(r => ({ ...r, updatedAt: r.updatedAt || new Date().toISOString() }));
}

/** Single instruction by id. */
export async function getInstructionById(id: string): Promise<{ id: string; title: string; postId: string; postTitle?: string; ownerPostId: string; ownerPostTitle?: string; status: string; version: number; content?: string | null; updatedAt: string } | null> {
  const row = await get(`
    SELECT i.id, i.title, i.post_id AS "postId", p.title AS "postTitle",
           i.owner_post_id AS "ownerPostId", op.title AS "ownerPostTitle",
           i.status, i.version, i.content, i.updated_at AS "updatedAt"
    FROM instructions i
    LEFT JOIN posts p ON p.id = i.post_id
    LEFT JOIN posts op ON op.id = i.owner_post_id
    WHERE i.id = ?
  `, [id]) as any;
  if (!row) return null;
  return { ...row, updatedAt: row.updatedAt || new Date().toISOString() };
}

/** Create instruction. */
export async function createInstruction(data: { id: string; title: string; postId: string; ownerPostId: string; status: string; version?: number; content?: string }): Promise<void> {
  await run(`
    INSERT INTO instructions (id, title, post_id, owner_post_id, status, version, content, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [data.id, data.title, data.postId, data.ownerPostId, data.status, data.version ?? 1, data.content ?? null, new Date().toISOString()]);
}

/** Update instruction. */
export async function updateInstruction(id: string, data: Partial<{ title: string; status: string; version: number; content: string | null }>): Promise<void> {
  const fields: string[] = ['updated_at = ?'];
  const values: any[] = [new Date().toISOString()];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
  if (data.version !== undefined) { fields.push('version = ?'); values.push(data.version); }
  if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content); }
  values.push(id);
  await run(`UPDATE instructions SET ${fields.join(', ')} WHERE id = ?`, [...values]);
}

/** Delete instruction and its steps. */
export async function deleteInstruction(id: string): Promise<void> {
  await run('DELETE FROM instruction_steps WHERE instruction_id = ?', [id]);
  await run('DELETE FROM instruction_acknowledgements WHERE instruction_id = ?', [id]);
  await run('DELETE FROM instructions WHERE id = ?', [id]);
}

/** Acknowledge an instruction for a user. */
export async function acknowledgeInstruction(instructionId: string, userId: string): Promise<void> {
  const id = `ack${Date.now()}`;
  await run(`
    INSERT INTO instruction_acknowledgements (id, instruction_id, user_id, acknowledged_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (instruction_id, user_id) DO NOTHING
  `, [id, instructionId, userId]);
}

/** Check if user has acknowledged an instruction. */
export async function hasUserAcknowledged(instructionId: string, userId: string): Promise<boolean> {
  const row = await get(`
    SELECT 1 FROM instruction_acknowledgements
    WHERE instruction_id = ? AND user_id = ?
    LIMIT 1
  `, [instructionId, userId]);
  return !!row;
}

/** Get list of user acknowledgements for an instruction. */
export async function getInstructionAcknowledgements(instructionId: string): Promise<Array<{ userId: string; userName: string; userEmail: string; acknowledgedAt: string }>> {
  const rows = await all(`
    SELECT a.user_id AS "userId", u.name AS "userName", u.email AS "userEmail", a.acknowledged_at AS "acknowledgedAt"
    FROM instruction_acknowledgements a
    JOIN users u ON u.id = a.user_id
    WHERE a.instruction_id = ?
    ORDER BY a.acknowledged_at DESC
  `, [instructionId]) as any[];
  return rows.map(r => ({
    userId: r.userId,
    userName: r.userName,
    userEmail: r.userEmail,
    acknowledgedAt: r.acknowledgedAt || '',
  }));
}

/** Instruction steps by instruction_id. */
export async function getInstructionSteps(instructionId: string): Promise<Array<{ id: string; instructionId: string; title: string; text: string | null; link: string | null; deadline: string | null; status: string; orderIndex: number }>> {
  const rows = await all(`
    SELECT id, instruction_id AS instructionId, title, text, link, deadline, status, order_index AS "orderIndex"
    FROM instruction_steps
    WHERE instruction_id = ?
    ORDER BY order_index, id
  `, [instructionId]) as any[];
  return rows.map(r => ({ ...r, text: r.text ?? null, link: r.link ?? null, deadline: r.deadline ?? null }));
}

/** Create instruction step. */
export async function createInstructionStep(instructionId: string, data: { title: string; text?: string | null; link?: string | null; deadline?: string | null; status?: string; orderIndex?: number }): Promise<{ id: string; instructionId: string; title: string; text: string | null; link: string | null; deadline: string | null; status: string; orderIndex: number }> {
  const id = `step${Date.now()}`;
  await run(`
    INSERT INTO instruction_steps (id, instruction_id, title, text, link, deadline, status, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id,
    instructionId,
    data.title,
    data.text ?? null,
    data.link ?? null,
    data.deadline ?? null,
    data.status ?? 'pending',
    data.orderIndex ?? 0]);
  const row = await get('SELECT id, instruction_id AS instructionId, title, text, link, deadline, status, order_index AS "orderIndex" FROM instruction_steps WHERE id = ?', [id]) as any;
  return { ...row, text: row.text ?? null, link: row.link ?? null, deadline: row.deadline ?? null };
}

/** Update instruction step. */
export async function updateInstructionStep(stepId: string, data: Partial<{ title: string; text: string | null; link: string | null; deadline: string | null; status: string; orderIndex: number }>): Promise<void> {
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
  await run(`UPDATE instruction_steps SET ${fields.join(', ')} WHERE id = ?`, [...values]);
}

/** Single instruction step by id. */
export async function getInstructionStepById(stepId: string): Promise<{ id: string; instructionId: string; title: string; text: string | null; link: string | null; deadline: string | null; status: string; orderIndex: number } | null> {
  const row = await get('SELECT id, instruction_id AS instructionId, title, text, link, deadline, status, order_index AS "orderIndex" FROM instruction_steps WHERE id = ?', [stepId]) as any;
  if (!row) return null;
  return { ...row, text: row.text ?? null, link: row.link ?? null, deadline: row.deadline ?? null };
}

/** Delete instruction step. */
export async function deleteInstructionStep(stepId: string): Promise<void> {
  await run('DELETE FROM instruction_steps WHERE id = ?', [stepId]);
}

/** List metric definitions (for dropdowns). */
export async function getMetricDefinitions(): Promise<Array<{ id: string; code: string; name: string; unit: string }>> {
  const rows = await all(`
    SELECT id, code, name, unit FROM metric_definitions ORDER BY name
  `, []) as Array<{ id: string; code: string; name: string; unit: string }>;
  return rows;
}

/** Create metric definition (Admin only). */
export async function createMetricDefinition(data: { code: string; name: string; unit: string }): Promise<{ id: string; code: string; name: string; unit: string }> {
  const id = `metric${Date.now()}`;
  await run(`
    INSERT INTO metric_definitions (id, code, name, unit)
    VALUES (?, ?, ?, ?)
  `, [id, data.code, data.name, data.unit]);
  return { id, code: data.code, name: data.name, unit: data.unit };
}

/** Delete metric definition by code. Fails if metric is still assigned (metric_to_post). */
export async function deleteMetricDefinition(code: string): Promise<void> {
  const inUse = await get('SELECT 1 FROM metric_to_post WHERE metric_code = ? LIMIT 1', [code]);
  if (inUse) {
    const e = new Error('Метрика ещё используется в назначениях. Сначала удалите все назначения в матрице.') as Error & { code?: string };
    e.code = 'METRIC_IN_USE';
    throw e;
  }
  await run('DELETE FROM metric_definitions WHERE code = ?', [code]);
}

/** Statistics by post (post_statistics). */
export async function getStatisticsByPostId(postId: string): Promise<Array<{ id: string; postId: string; period: string; metricCode: string; value: number }>> {
  const rows = await all(`
    SELECT id, post_id AS "postId", period, metric_code AS "metricCode", value
    FROM post_statistics WHERE post_id = ?
  `, [postId]) as any[];
  return rows;
}

/** List statistics records with optional filters; optional allowedPostIds (visibility). Joins post title and holder name. */
export async function getStatisticsRecords(filters: {
  postId?: string;
  period?: string;
  metricCode?: string;
  allowedPostIds?: string[] | null;
}): Promise<Array<{ id: string; postId: string; postTitle: string; holderName: string | null; period: string; metricCode: string; value: number; createdAt: string }>> {
  let sql = `
    SELECT s.id, s.post_id AS "postId", p.title AS postTitle, u.name AS holderName,
           s.period, s.metric_code AS "metricCode", s.value, s.created_at AS "createdAt"
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
  const rows = (params.length ? await all(sql, [...params]) : await all(sql, [])) as any[];
  return rows.map(r => ({ ...r, holderName: r.holderName ?? null, createdAt: r.createdAt || '' }));
}

/** Create one statistics record. */
export async function createStatisticRecord(data: { postId: string; period: string; metricCode: string; value: number }): Promise<{ id: string; postId: string; period: string; metricCode: string; value: number }> {
  const id = `stat${Date.now()}`;
  await run(`
    INSERT INTO post_statistics (id, post_id, period, metric_code, value)
    VALUES (?, ?, ?, ?, ?)
  `, [id, data.postId, data.period, data.metricCode, data.value]);
  return { id, postId: data.postId, period: data.period, metricCode: data.metricCode, value: data.value };
}

/** Series for charts: records for post+metric, optionally filtered by period prefix (e.g. 2026-Q1, 2026-W05). */
export async function getStatisticsSeries(postId: string, metricCode: string, fromPeriod?: string, toPeriod?: string): Promise<Array<{ period: string; value: number }>> {
  let sql = `
    SELECT period, value FROM post_statistics
    WHERE post_id = ? AND metric_code = ?
  `;
  const params: (string | number)[] = [postId, metricCode];
  if (fromPeriod) { sql += ' AND period >= ?'; params.push(fromPeriod); }
  if (toPeriod) { sql += ' AND period <= ?'; params.push(toPeriod); }
  sql += ' ORDER BY period';
  const rows = await all(sql, [...params]) as { period: string; value: number }[];
  return rows;
}

/** List quotas with optional filters; optional allowedPostIds (visibility). */
export async function getQuotas(filters: {
  postId?: string;
  metricCode?: string;
  period?: string;
  allowedPostIds?: string[] | null;
}): Promise<Array<{ id: string; postId: string; metricCode: string; period: string; targetValue: number }>> {
  let sql = 'SELECT id, post_id AS "postId", metric_code AS "metricCode", period, target_value AS targetValue FROM statistic_quotas WHERE 1=1';
  const params: (string | number)[] = [];
  if (filters.postId) { sql += ' AND post_id = ?'; params.push(filters.postId); }
  if (filters.metricCode) { sql += ' AND metric_code = ?'; params.push(filters.metricCode); }
  if (filters.period) { sql += ' AND period = ?'; params.push(filters.period); }
  if (filters.allowedPostIds != null && filters.allowedPostIds.length > 0) {
    sql += ` AND post_id IN (${filters.allowedPostIds.map(() => '?').join(',')})`;
    params.push(...filters.allowedPostIds);
  }
  sql += ' ORDER BY period, post_id, metric_code';
  const rows = (params.length ? await all(sql, [...params]) : await all(sql, [])) as any[];
  return rows;
}

/** Upsert one quota (insert or replace by post_id, metric_code, period). */
export async function setQuota(postId: string, metricCode: string, period: string, targetValue: number): Promise<void> {
  const id = `quota${Date.now()}`;
  await run(`
    INSERT INTO statistic_quotas (id, post_id, metric_code, period, target_value)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (post_id, metric_code, period) DO UPDATE SET target_value = excluded.target_value
  `, [id, postId, metricCode, period, targetValue]);
}

/** Constructor view: rows (post + metric) with quota, value, needMore for the given period. Uses (post, metric) pairs that have at least one record or quota for that period. */
export async function getConstructorView(
  period: string,
  allowedPostIds?: string[] | null
): Promise<Array<{ postId: string; postTitle: string; holderName: string | null; metricCode: string; metricName: string; unit: string; quota: number; value: number; needMore: number }>> {
  const allowedClause =
    allowedPostIds != null && allowedPostIds.length > 0
      ? ` AND post_id IN (${allowedPostIds.map(() => '?').join(',')})`
      : '';
  const allowedParams = allowedPostIds != null && allowedPostIds.length > 0 ? [...allowedPostIds] : [];
  const sql = `
    SELECT
      pairs.post_id AS "postId",
      p.title AS postTitle,
      u.name AS holderName,
      pairs.metric_code AS "metricCode",
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
  const rows = await all(sql, [...params]) as any[];
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
export async function getMetricToPostList(filters: { postId?: string; metricCode?: string } = {}): Promise<Array<{ postId: string; metricCode: string; responsibleUserId: string | null; dailyTarget: number | null }>> {
  let sql = 'SELECT post_id AS "postId", metric_code AS "metricCode", responsible_user_id AS "responsibleUserId", daily_target AS "dailyTarget" FROM metric_to_post WHERE 1=1';
  const params: string[] = [];
  if (filters.postId) { sql += ' AND post_id = ?'; params.push(filters.postId); }
  if (filters.metricCode) { sql += ' AND metric_code = ?'; params.push(filters.metricCode); }
  sql += ' ORDER BY post_id, metric_code';
  const rows = (params.length ? await all(sql, [...params]) : await all(sql, [])) as any[];
  return rows.map((r) => ({ ...r, responsibleUserId: r.responsibleUserId ?? null, dailyTarget: r.dailyTarget ?? null }));
}

/** Assign metric to post; set optional responsible user and daily_target. */
export async function setMetricToPost(postId: string, metricCode: string, responsibleUserId?: string | null, dailyTarget?: number | null): Promise<void> {
  await run(`
    INSERT INTO metric_to_post (post_id, metric_code, responsible_user_id, daily_target)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (post_id, metric_code) DO UPDATE SET responsible_user_id = excluded.responsible_user_id, daily_target = excluded.daily_target
  `, [postId, metricCode, responsibleUserId ?? null, dailyTarget ?? null]);
}

/** Remove metric from post. */
export async function deleteMetricToPost(postId: string, metricCode: string): Promise<void> {
  await run('DELETE FROM metric_to_post WHERE post_id = ? AND metric_code = ?', [postId, metricCode]);
}

/** Check if user can edit daily entries for a metric assignment (holds post or is responsible). */
export async function canUserEditMetricAssignment(userId: string, postId: string, metricCode: string): Promise<boolean> {
  const holder = await get('SELECT user_id FROM user_posts WHERE post_id = ?', [postId]) as { user_id: string } | undefined;
  if (holder?.user_id === userId) return true;
  const assign = await get('SELECT responsible_user_id FROM metric_to_post WHERE post_id = ? AND metric_code = ?', [postId, metricCode]) as { responsible_user_id: string | null } | undefined;
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
export async function getDailyTrackingData(
  userId: string,
  weekStart: string
): Promise<{ weekStart: string; dates: string[]; rows: Array<{ postId: string; postTitle: string; metricCode: string; metricName: string; unit: string; days: Record<string, number>; plan: number; actual: number }> }> {
  const dates: string[] = [];
  const d = new Date(weekStart + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const postIds = (await all('SELECT post_id FROM user_posts WHERE user_id = ?', [userId]) as { post_id: string }[]).map((r) => r.post_id);
  if (postIds.length === 0) {
    return { weekStart, dates, rows: [] };
  }
  const placeholders = postIds.map(() => '?').join(',');
  const assignments = await all(`
    SELECT mtp.post_id AS "postId", mtp.metric_code AS "metricCode", mtp.daily_target AS "dailyTarget", p.title AS postTitle, m.name AS metricName, m.unit
    FROM metric_to_post mtp
    JOIN posts p ON p.id = mtp.post_id
    JOIN metric_definitions m ON m.code = mtp.metric_code
    WHERE mtp.post_id IN (${placeholders})
  `, [...postIds]) as any[];
  const rows: Array<{ postId: string; postTitle: string; metricCode: string; metricName: string; unit: string; dailyTarget: number | null; days: Record<string, number>; plan: number; actual: number }> = [];
  for (const a of assignments) {
    const days: Record<string, number> = {};
    for (const date of dates) {
      const row = await get('SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?', [a.postId, a.metricCode, date]) as { value: number } | undefined;
      days[date] = row?.value ?? 0;
    }
    const planRow = await get('SELECT target_value FROM statistic_quotas WHERE post_id = ? AND metric_code = ? AND period = ?', [a.postId, a.metricCode, weekStart]) as { target_value: number } | undefined;
    const plan = planRow?.target_value ?? 0;
    const actual = Object.values(days).reduce((s, v) => s + v, 0);
    rows.push({ postId: a.postId, postTitle: a.postTitle, metricCode: a.metricCode, metricName: a.metricName, unit: a.unit, dailyTarget: a.dailyTarget ?? null, days, plan, actual });
  }
  return { weekStart, dates, rows };
}

/** Save one daily entry (upsert post_statistics with period = date). */
export async function saveDailyEntry(postId: string, metricCode: string, date: string, value: number): Promise<void> {
  const existing = await get('SELECT id FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?', [postId, metricCode, date]) as { id: string } | undefined;
  if (existing) {
    await run('UPDATE post_statistics SET value = ? WHERE id = ?', [value, existing.id]);
  } else {
    const id = `stat${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await run('INSERT INTO post_statistics (id, post_id, period, metric_code, value) VALUES (?, ?, ?, ?, ?)', [id, postId, date, metricCode, value]);
  }
}

/** Grid data for Statistics page: all active assignments with filters. Used by GET /statistics/grid. */
export async function getStatisticsGridData(
  userId: string,
  weekStart: string,
  filters: { departmentId?: string; responsibleUserId?: string; myDataOnly?: boolean },
  isAdmin: boolean
): Promise<{
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
}> {
  const dates: string[] = [];
  const d = new Date(weekStart + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  let sql = `
    SELECT mtp.post_id AS "postId", mtp.metric_code AS "metricCode", mtp.daily_target AS "dailyTarget", mtp.responsible_user_id AS "responsibleUserId",
           p.title AS postTitle, p.department_id AS "departmentId", d.name AS departmentName,
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
    const userPostIds = (await all('SELECT post_id FROM user_posts WHERE user_id = ?', [userId]) as { post_id: string }[]).map((r) => r.post_id);
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
  const assignments = (params.length ? await all(sql, [...params]) : await all(sql, [])) as any[];

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
      const row = await get('SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?', [a.postId, a.metricCode, date]) as { value: number } | undefined;
      const val = row?.value ?? 0;
      days[date] = val;
      weekTotal += val;
    }
    const planRow = await get('SELECT target_value FROM statistic_quotas WHERE post_id = ? AND metric_code = ? AND period = ?', [a.postId, a.metricCode, weekStart]) as { target_value: number } | undefined;
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
export async function getStatisticsGridDataByPeriod(
  userId: string,
  periodType: 'week' | 'month' | 'quarter' | 'year',
  periodValue: string,
  filters: { departmentId?: string; responsibleUserId?: string; myDataOnly?: boolean },
  isAdmin: boolean
): Promise<{
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
}> {
  if (periodType === 'week') {
    let weekStart = periodValue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodValue)) {
      const d = new Date();
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      weekStart = d.toISOString().slice(0, 10);
    }
    return await getStatisticsGridData(userId, weekStart, filters, isAdmin);
  }

  const { startDate, endDate, dates } = getDateRangeForPeriod(periodType, periodValue);

  let sql = `
    SELECT mtp.post_id AS "postId", mtp.metric_code AS "metricCode", mtp.daily_target AS "dailyTarget", mtp.responsible_user_id AS "responsibleUserId",
           p.title AS postTitle, p.department_id AS "departmentId", d.name AS departmentName,
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
    const userPostIds = (await all('SELECT post_id FROM user_posts WHERE user_id = ?', [userId]) as { post_id: string }[]).map((r) => r.post_id);
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
  const assignments = (params.length ? await all(sql, [...params]) : await all(sql, [])) as any[];

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
    const statRow = await get(
      `SELECT COALESCE(SUM(value), 0)::float AS total FROM post_statistics
       WHERE post_id = ? AND metric_code = ? AND period >= ? AND period <= ?`,
      [a.postId, a.metricCode, startDate, endDate],
    ) as { total: number } | undefined;
    const totalValue = Number(statRow?.total ?? 0);
    const quotaRow = await get(
      `SELECT COALESCE(SUM(target_value), 0)::float AS total FROM statistic_quotas
       WHERE post_id = ? AND metric_code = ? AND period >= ? AND period <= ?`,
      [a.postId, a.metricCode, startDate, endDate],
    ) as { total: number } | undefined;
    const planValue = Number(quotaRow?.total ?? 0);
    const days: Record<string, number> = {};
    for (const date of dates) {
      const r = await get('SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?', [a.postId, a.metricCode, date]) as { value: number } | undefined;
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
export async function getSeriesLast30Days(postId: string, metricCode: string): Promise<Array<{ date: string; value: number }>> {
  const today = new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  const d = new Date(today + 'T12:00:00Z');
  for (let i = 0; i < 30; i++) {
    dates.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }

  const result: Array<{ date: string; value: number }> = [];
  for (const date of dates) {
    const row = await get('SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?', [postId, metricCode, date]) as { value: number } | undefined;
    result.push({ date, value: row?.value ?? 0 });
  }
  return result;
}

/** Week-over-week growth: (thisWeek - lastWeek) / lastWeek * 100. Uses weekStart for "this week". */
export async function getWeekOverWeekGrowth(postId: string, metricCode: string, weekStart: string): Promise<number | null> {
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
    const r = await get('SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?', [postId, metricCode, date]) as { value: number } | undefined;
    thisSum += r?.value ?? 0;
  }
  for (const date of lastWeekDates) {
    const r = await get('SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?', [postId, metricCode, date]) as { value: number } | undefined;
    lastSum += r?.value ?? 0;
  }
  if (lastSum === 0) return thisSum > 0 ? 100 : null;
  return ((thisSum - lastSum) / lastSum) * 100;
}

/** Plan vs Fact for a metric for last 7 days (for analytics chart). postId optional; if not provided uses first post that has the metric. */
export async function getPlanVsFactLast7Days(metricCode: string, postId?: string): Promise<Array<{ date: string; plan: number | null; fact: number }>> {
  const today = new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  const d = new Date(today + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    dates.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  let pid: string | undefined = postId;
  if (!pid) {
    const first = await get('SELECT post_id FROM metric_to_post WHERE metric_code = ? LIMIT 1', [metricCode]) as { post_id: string } | undefined;
    pid = first?.post_id;
  }
  if (!pid) return dates.map((date) => ({ date, plan: null, fact: 0 }));
  const result: Array<{ date: string; plan: number | null; fact: number }> = [];
  for (const date of dates) {
    const factRow = await get('SELECT value FROM post_statistics WHERE post_id = ? AND metric_code = ? AND period = ?', [pid, metricCode, date]) as { value: number } | undefined;
    const fact = factRow?.value ?? 0;
    const weekStartForDay = getWeekStart(date);
    const planRow = await get('SELECT target_value FROM statistic_quotas WHERE post_id = ? AND metric_code = ? AND period = ?', [pid, metricCode, weekStartForDay]) as { target_value: number } | undefined;
    const plan = planRow != null ? planRow.target_value : null;
    result.push({ date, plan, fact });
  }
  return result;
}

/** Budgets list; optional filter by responsiblePostId and/or period; optional allowedPostIds (visibility). */
export async function getBudgets(responsiblePostId?: string, period?: string, allowedPostIds?: string[] | null): Promise<Array<{
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
}>> {
  let sql = `
    SELECT b.id, b.department_id AS "departmentId", b.responsible_post_id AS responsiblePostId,
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
  const rows = (params.length ? await all(sql, [...params]) : await all(sql, [])) as any[];
  return rows.map(r => ({ ...r, department: r.department || r.departmentId }));
}

/** Single budget by id. */
export async function getBudgetById(id: string): Promise<{ id: string; departmentId: string; department?: string; responsiblePostId: string | null; category: string; period: string; planned: number; approved: number; spent: number; remaining: number; limits: number; approvalStatus: string } | null> {
  const row = await get(`
    SELECT b.id, b.department_id AS "departmentId", b.responsible_post_id AS responsiblePostId,
           b.category, b.period, b.planned, b.approved, b.spent, b.remaining, b.limits, b.approval_status AS approvalStatus,
           d.name AS department
    FROM budgets b
    LEFT JOIN departments d ON d.id = b.department_id
    WHERE b.id = ?
  `, [id]) as any;
  if (!row) return null;
  return { ...row, department: row.department || row.departmentId };
}

/** Set budget approval status to approved. */
export async function approveBudget(id: string): Promise<void> {
  await run(`
    UPDATE budgets SET approval_status = 'approved', approved = planned WHERE id = ?
  `, [id]);
}

/** Create a new budget entry. */
export async function createBudget(data: {
  id: string;
  departmentId: string;
  responsiblePostId?: string | null;
  category: string;
  period: string;
  planned: number;
  limits: number;
}): Promise<void> {
  await run(`
    INSERT INTO budgets (id, department_id, responsible_post_id, category, period, planned, approved, spent, remaining, limits, approval_status)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'pending')
  `, [data.id, data.departmentId, data.responsiblePostId ?? null, data.category, data.period, data.planned, data.planned, data.limits]);
}

/** Delete a budget by id. */
export async function deleteBudget(id: string): Promise<void> {
  await run('DELETE FROM budgets WHERE id = ?', [id]);
}

export type WorkPlanWorkflowStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'revision_requested';

/** Create work plan (employee creates for own post). approverPostId can be set at create or at submit. */
export async function createWorkPlan(data: {
  title: string;
  postId: string;
  department?: string | null;
  status?: string;
  dueDate?: string | null;
  authorUserId?: string | null;
  period?: string | null;
  approverPostId?: string | null;
  messageText?: string | null;
}): Promise<{ id: string; title: string; postId: string; department: string | null; status: string; dueDate: string | null; workflowStatus: string; authorUserId: string | null; approverPostId: string | null; submittedAt: string | null; approvedAt: string | null; rejectedAt: string | null; rejectionComment: string | null; approvalComment: string | null; period: string | null; messageText: string | null; createdAt: string; updatedAt: string }> {
  const id = `wp${Date.now()}`;
  const now = new Date().toISOString();
  const post = await getPostById(data.postId);
  const approverPostId = data.approverPostId ?? post?.parentPostId ?? null;
  await run(`
    INSERT INTO work_plans (id, title, post_id, department, status, due_date, workflow_status, author_user_id, approver_post_id, period, message_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id,
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
    now]);
  return (await getWorkPlanById(id))!;
}

/** Get single work plan by id. */
export async function getWorkPlanById(id: string): Promise<{ id: string; title: string; postId: string; postTitle?: string; department: string | null; status: string; dueDate: string | null; workflowStatus: string; authorUserId: string | null; approverPostId: string | null; submittedAt: string | null; approvedAt: string | null; rejectedAt: string | null; rejectionComment: string | null; approvalComment: string | null; period: string | null; messageText: string | null; createdAt: string; updatedAt: string } | null> {
  const row = await get(`
    SELECT wp.id, wp.title, wp.post_id AS "postId", p.title AS "postTitle", wp.department, wp.status, wp.due_date AS "dueDate",
           COALESCE(wp.workflow_status, 'draft') AS "workflowStatus", wp.author_user_id AS "authorUserId",
           wp.approver_post_id AS "approverPostId", wp.submitted_at AS "submittedAt", wp.approved_at AS "approvedAt",
           wp.rejected_at AS "rejectedAt", wp.rejection_comment AS "rejectionComment", wp.approval_comment AS "approvalComment", wp.period, wp.message_text AS "messageText",
           wp.created_at AS "createdAt", wp.updated_at AS "updatedAt"
    FROM work_plans wp
    LEFT JOIN posts p ON p.id = wp.post_id
    WHERE wp.id = ?
  `, [id]) as any;
  if (!row) return null;
  return { ...row, dueDate: row.dueDate ?? null, department: row.department ?? null, authorUserId: row.authorUserId ?? null, approverPostId: row.approverPostId ?? null, submittedAt: row.submittedAt ?? null, approvedAt: row.approvedAt ?? null, rejectedAt: row.rejectedAt ?? null, rejectionComment: row.rejectionComment ?? null, approvalComment: row.approvalComment ?? null, period: row.period ?? null, messageText: row.messageText ?? null };
}

/** Update work plan. */
export async function updateWorkPlan(id: string, data: Partial<{ title: string; postId: string; department: string | null; status: string; dueDate: string | null; period: string | null; approverPostId: string | null; messageText: string | null }>): Promise<void> {
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
  await run(`UPDATE work_plans SET ${fields.join(', ')} WHERE id = ?`, [...values]);
}

/** Submit work plan for approval. Optionally set approver (employee chooses who to send to). */
export async function submitWorkPlan(id: string, approverPostId?: string | null): Promise<void> {
  const now = new Date().toISOString();
  const plan = await getWorkPlanById(id);
  if (approverPostId != null && approverPostId.trim() !== '') {
    await run(`UPDATE work_plans SET approver_post_id = ?, updated_at = ? WHERE id = ? AND (workflow_status = 'draft' OR workflow_status = 'rejected' OR workflow_status = 'revision_requested')`, [approverPostId.trim(), now, id]);
  }
  const result = await run(`
    UPDATE work_plans SET workflow_status = 'submitted', submitted_at = ?, rejected_at = NULL, rejection_comment = NULL, updated_at = ?
    WHERE id = ? AND (workflow_status = 'draft' OR workflow_status = 'rejected' OR workflow_status = 'revision_requested')
  `, [now, now, id]);
  if (result.rowCount === 0) throw new Error('Work plan status has already changed');
  
  // Create notification for approver (На мое согласование)
  const finalApproverPostId = approverPostId != null && approverPostId.trim() !== '' ? approverPostId.trim() : (plan?.approverPostId ?? null);
  if (finalApproverPostId && plan) {
    const approverUser = await getUserByPostId(finalApproverPostId);
    if (approverUser) {
      await createWorkPlanNotification({
        workPlanId: id,
        recipientUserId: approverUser.id,
        actorUserId: plan.authorUserId,
        action: 'submitted',
      });
    }
  }
}

/** Approve work plan (manager). Optional comment. */
export async function approveWorkPlan(id: string, comment?: string | null): Promise<void> {
  const now = new Date().toISOString();
  const plan = await getWorkPlanById(id);
  const result = await run(`
    UPDATE work_plans SET workflow_status = 'approved', approved_at = ?, approval_comment = ?, rejected_at = NULL, rejection_comment = NULL, updated_at = ?
    WHERE id = ? AND workflow_status = 'submitted'
  `, [now, comment ?? null, now, id]);
  if (result.rowCount === 0) throw new Error('Work plan status has already changed');
}

/** Reject work plan (manager). */
export async function rejectWorkPlan(id: string, comment?: string | null): Promise<void> {
  const now = new Date().toISOString();
  const plan = await getWorkPlanById(id);
  const result = await run(`
    UPDATE work_plans SET workflow_status = 'rejected', rejected_at = ?, rejection_comment = ?, updated_at = ?
    WHERE id = ? AND workflow_status = 'submitted'
  `, [now, comment ?? null, now, id]);
  if (result.rowCount === 0) throw new Error('Work plan status has already changed');
}

/** Request revision (manager): plan goes back to author with comment; author can edit and resubmit. */
export async function requestRevisionWorkPlan(id: string, comment?: string | null): Promise<void> {
  const now = new Date().toISOString();
  const plan = await getWorkPlanById(id);
  const result = await run(`
    UPDATE work_plans SET workflow_status = 'revision_requested', rejected_at = ?, rejection_comment = ?, updated_at = ?
    WHERE id = ? AND workflow_status = 'submitted'
  `, [now, comment ?? null, now, id]);
  if (result.rowCount === 0) throw new Error('Work plan status has already changed');
}

/** Work plans list; optional filter by postId, workflowStatus; optional allowedPostIds; optional approverPostIds (for "на моё согласование"). */
export async function getWorkPlans(opts: { postId?: string; allowedPostIds?: string[] | null; workflowStatus?: WorkPlanWorkflowStatus; approverPostIds?: string[] | null }): Promise<Array<{ id: string; title: string; postId: string; postTitle?: string; department: string | null; status: string; dueDate: string | null; workflowStatus: string; authorUserId: string | null; approverPostId: string | null; submittedAt: string | null; approvedAt: string | null; rejectedAt: string | null; rejectionComment: string | null; approvalComment: string | null; period: string | null; messageText: string | null; createdAt: string; updatedAt: string }>> {
  if (opts.allowedPostIds && opts.allowedPostIds.length > 500) {
    throw new Error('Too many IDs requested');
  }
  if (opts.approverPostIds && opts.approverPostIds.length > 500) {
    throw new Error('Too many approver IDs requested');
  }
  let sql = `SELECT wp.id, wp.title, wp.post_id AS "postId", p.title AS "postTitle", wp.department, wp.status, wp.due_date AS "dueDate",
    COALESCE(wp.workflow_status, 'draft') AS "workflowStatus", wp.author_user_id AS "authorUserId", wp.approver_post_id AS "approverPostId",
    wp.submitted_at AS "submittedAt", wp.approved_at AS "approvedAt", wp.rejected_at AS "rejectedAt", wp.rejection_comment AS "rejectionComment", wp.approval_comment AS "approvalComment", wp.period, wp.message_text AS "messageText",
    wp.created_at AS "createdAt", wp.updated_at AS "updatedAt"
    FROM work_plans wp
    LEFT JOIN posts p ON p.id = wp.post_id`;
  const params: (string | number)[] = [];
  const conditions: string[] = [];
  if (opts.postId) { conditions.push('wp.post_id = ?'); params.push(opts.postId); }
  if (opts.allowedPostIds != null && opts.allowedPostIds.length > 0) {
    conditions.push(`wp.post_id IN (${opts.allowedPostIds.map(() => '?').join(',')})`);
    params.push(...opts.allowedPostIds);
  }
  if (opts.approverPostIds != null && opts.approverPostIds.length > 0) {
    conditions.push(`wp.approver_post_id IN (${opts.approverPostIds.map(() => '?').join(',')})`);
    params.push(...opts.approverPostIds);
  }
  if (opts.workflowStatus) { conditions.push('(wp.workflow_status = ? OR (wp.workflow_status IS NULL AND ? = \'draft\'))'); params.push(opts.workflowStatus, opts.workflowStatus); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY wp.updated_at DESC, wp.due_date, wp.title';
  const rows = (params.length ? await all(sql, [...params]) : await all(sql, [])) as any[];
  return rows.map(r => ({ ...r, dueDate: r.dueDate ?? null, department: r.department ?? null, authorUserId: r.authorUserId ?? null, approverPostId: r.approverPostId ?? null, submittedAt: r.submittedAt ?? null, approvedAt: r.approvedAt ?? null, rejectedAt: r.rejectedAt ?? null, rejectionComment: r.rejectionComment ?? null, approvalComment: r.approvalComment ?? null, period: r.period ?? null, messageText: r.messageText ?? null }));
}

/** Work plan tasks. */
export async function getWorkPlanTasks(workPlanId: string): Promise<Array<{ id: string; workPlanId: string; title: string; dueDate: string | null; orderIndex: number }>> {
  const rows = await all(`
    SELECT id, work_plan_id AS "workPlanId", title, due_date AS "dueDate", order_index AS "orderIndex"
    FROM work_plan_tasks WHERE work_plan_id = ? ORDER BY order_index, id
  `, [workPlanId]) as any[];
  return rows.map(r => ({ ...r, dueDate: r.dueDate ?? null }));
}

export async function createWorkPlanTask(data: { workPlanId: string; title: string; dueDate?: string | null; orderIndex?: number }): Promise<{ id: string; workPlanId: string; title: string; dueDate: string | null; orderIndex: number }> {
  const id = `wpt${Date.now()}`;
  const order = data.orderIndex ?? 0;
  await run(`
    INSERT INTO work_plan_tasks (id, work_plan_id, title, due_date, order_index)
    VALUES (?, ?, ?, ?, ?)
  `, [id, data.workPlanId, data.title.trim(), data.dueDate ?? null, order]);
  return { id, workPlanId: data.workPlanId, title: data.title.trim(), dueDate: data.dueDate ?? null, orderIndex: order };
}

export async function updateWorkPlanTask(id: string, data: Partial<{ title: string; dueDate: string | null; orderIndex: number }>): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
  if (data.dueDate !== undefined) { fields.push('due_date = ?'); values.push(data.dueDate); }
  if (data.orderIndex !== undefined) { fields.push('order_index = ?'); values.push(data.orderIndex); }
  if (fields.length === 0) return;
  values.push(id);
  await run(`UPDATE work_plan_tasks SET ${fields.join(', ')} WHERE id = ?`, [...values]);
}

export async function deleteWorkPlanTask(id: string): Promise<void> {
  await run('DELETE FROM work_plan_tasks WHERE id = ?', [id]);
}

export async function deleteWorkPlanTasks(workPlanId: string): Promise<void> {
  await run('DELETE FROM work_plan_tasks WHERE work_plan_id = ?', [workPlanId]);
}

/** Delete work plan by id (author or admin only, draft/rejected/revision_requested status). */
export async function deleteWorkPlan(id: string): Promise<void> {
  // Clean up all FK dependents before deleting the plan itself
  await run('DELETE FROM work_plan_tasks WHERE work_plan_id = ?', [id]);
  await run('DELETE FROM work_plan_notifications WHERE work_plan_id = ?', [id]);
  // Null out mailbox_messages.work_plan_id link (keep the messages, just unlink them)
  await run('UPDATE mailbox_messages SET work_plan_id = NULL WHERE work_plan_id = ?', [id]);
  await run('DELETE FROM work_plans WHERE id = ?', [id]);
}

/** Create work plan notification. */
export async function createWorkPlanNotification(data: {
  workPlanId: string;
  recipientUserId: string;
  actorUserId?: string | null;
  action: 'submitted' | 'approved' | 'rejected' | 'revision_requested';
}): Promise<{ id: string; workPlanId: string; recipientUserId: string; action: string; createdAt: string; read: boolean }> {
  const id = `wpn${Date.now()}`;
  const now = new Date().toISOString();
  await run(`
    INSERT INTO work_plan_notifications (id, work_plan_id, recipient_user_id, actor_user_id, action, created_at, read)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `, [id, data.workPlanId, data.recipientUserId, data.actorUserId ?? null, data.action, now]);
  return { id, workPlanId: data.workPlanId, recipientUserId: data.recipientUserId, action: data.action, createdAt: now, read: false };
}

/** Get unread notification count for user. */
export async function getWorkPlanNotificationCount(userId: string): Promise<number> {
  const row = await get('SELECT COUNT(*) as count FROM work_plan_notifications WHERE recipient_user_id = ? AND read = 0', [userId]) as { count: number };
  return row.count;
}

/** Get notifications for user. */
export async function getWorkPlanNotifications(userId: string, limit?: number): Promise<Array<{
  id: string;
  workPlanId: string;
  workPlanTitle: string;
  action: string;
  createdAt: string;
  read: boolean;
  actorName?: string | null;
}>> {
  const rows = await all(`
    SELECT n.id, n.work_plan_id AS workPlanId, wp.title AS workPlanTitle, n.action, n.created_at AS "createdAt", n.read, u.name AS actorName
    FROM work_plan_notifications n
    LEFT JOIN work_plans wp ON wp.id = n.work_plan_id
    LEFT JOIN users u ON u.id = n.actor_user_id
    WHERE n.recipient_user_id = ?
    ORDER BY n.created_at DESC
    ${limit ? 'LIMIT ?' : ''}
  `, [userId, ...(limit ? [limit] : [])]) as any[];
  return rows.map(r => ({ ...r, read: !!r.read }));
}

/** Mark notification as read. */
export async function markWorkPlanNotificationAsRead(notificationId: string): Promise<void> {
  await run('UPDATE work_plan_notifications SET read = 1 WHERE id = ?', [notificationId]);
}

/** Mark all notifications as read for user. */
export async function markAllWorkPlanNotificationsAsRead(userId: string): Promise<void> {
  await run('UPDATE work_plan_notifications SET read = 1 WHERE recipient_user_id = ?', [userId]);
}

/** Create mailbox message. bodySnippet = first 200 chars of body; body = full text. */
export async function createMailboxMessage(data: {
  recipientPostId: string;
  senderPostId?: string | null;
  senderEmail: string;
  subject: string;
  body: string;
  workPlanId?: string | null;
  parentMessageId?: string | null;
}): Promise<{ id: string; recipientPostId: string; senderPostId: string | null; senderEmail: string; subject: string; bodySnippet: string | null; messageDate: string; unread: number; folder: string; workPlanId: string | null; parentMessageId: string | null }> {
  const id = `msg${Date.now()}`;
  const bodyTrim = data.body.trim();
  const bodySnippet = bodyTrim.slice(0, 200) || null;
  const messageDate = new Date().toISOString().slice(0, 10);
  const body = bodyTrim || null;
  await run(`
    INSERT INTO mailbox_messages (id, recipient_post_id, sender_post_id, sender_email, subject, body_snippet, body, message_date, unread, folder, work_plan_id, parent_message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'inbox', ?, ?)
  `, [id, data.recipientPostId, data.senderPostId ?? null, data.senderEmail, data.subject.trim(), bodySnippet, body, messageDate, data.workPlanId ?? null, data.parentMessageId ?? null]);
  return { id, recipientPostId: data.recipientPostId, senderPostId: data.senderPostId ?? null, senderEmail: data.senderEmail, subject: data.subject.trim(), bodySnippet, messageDate, unread: 1, folder: 'inbox', workPlanId: data.workPlanId ?? null, parentMessageId: data.parentMessageId ?? null };
}

/** Create attachment record for a message. */
export async function createMessageAttachment(data: {
  messageId: string;
  filename: string;
  mimeType?: string | null;
  filePath: string;
  fileSize?: number | null;
}): Promise<{ id: string; messageId: string; filename: string; mimeType: string | null; filePath: string; fileSize: number | null }> {
  const id = `att${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await run(`
    INSERT INTO mailbox_message_attachments (id, message_id, filename, mime_type, file_path, file_size)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, data.messageId, data.filename, data.mimeType ?? null, data.filePath, data.fileSize ?? null]);
  return { id, messageId: data.messageId, filename: data.filename, mimeType: data.mimeType ?? null, filePath: data.filePath, fileSize: data.fileSize ?? null };
}

/** Get attachments for a message. */
export async function getAttachmentsByMessageId(messageId: string): Promise<Array<{ id: string; filename: string; mimeType: string | null; fileSize: number | null }>> {
  const rows = await all(`
    SELECT id, filename, mime_type AS mimeType, file_size AS fileSize
    FROM mailbox_message_attachments WHERE message_id = ?
  `, [messageId]) as any[];
  return rows.map(r => ({ ...r, fileSize: r.fileSize ?? null, mimeType: r.mimeType ?? null }));
}

/** Get attachment by id (for download). Returns full row including file_path. */
export async function getAttachmentById(attachmentId: string): Promise<{ id: string; messageId: string; filename: string; mimeType: string | null; filePath: string; fileSize: number | null } | null> {
  const row = await get(`
    SELECT id, message_id AS messageId, filename, mime_type AS mimeType, file_path AS filePath, file_size AS fileSize
    FROM mailbox_message_attachments WHERE id = ?
  `, [attachmentId]) as any;
  if (!row) return null;
  return { ...row, fileSize: row.fileSize ?? null, mimeType: row.mimeType ?? null };
}

/** Unread message count for user (inbox only, across all their posts/boxes). */
export async function getUnreadCountForUser(userId: string): Promise<number> {
  const posts = await getPostsForUser(userId);
  if (posts.length === 0) return 0;
  const postIds = posts.map((p) => p.id);
  const placeholders = postIds.map(() => '?').join(',');
  const row = await get(`
    SELECT COALESCE(SUM(unread), 0) AS total FROM mailbox_messages
    WHERE recipient_post_id IN (${placeholders}) AND (folder = 'inbox' OR folder IS NULL)
  `, [...postIds]) as { total: number };
  return Number(row?.total ?? 0);
}

/** Get message recipient post ID (for access check). */
export async function getMessageRecipientPostId(messageId: string): Promise<string | null> {
  const row = await get('SELECT recipient_post_id FROM mailbox_messages WHERE id = ?', [messageId]) as { recipient_post_id: string } | undefined;
  return row?.recipient_post_id ?? null;
}

/** Mark mailbox message as read (unread=0). */
export async function markMailboxMessageAsRead(id: string): Promise<void> {
  await run('UPDATE mailbox_messages SET unread = 0 WHERE id = ?', [id]);
}

/** Archive message (folder = 'archive'). */
export async function archiveMailboxMessage(id: string): Promise<void> {
  await run("UPDATE mailbox_messages SET folder = 'archive' WHERE id = ?", [id]);
}

/** Archive multiple messages. */
export async function archiveMailboxMessagesBulk(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await run(`UPDATE mailbox_messages SET folder = 'archive' WHERE id IN (${placeholders})`, [...ids]);
}

/** Delete messages (and attachments via CASCADE if we add it, or delete attachments manually). */
export async function deleteMailboxMessages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await run(`DELETE FROM mailbox_message_attachments WHERE message_id IN (${placeholders})`, [...ids]);
  await run(`DELETE FROM mailbox_messages WHERE id IN (${placeholders})`, [...ids]);
}

/** Clear all messages in folder for postId. folder=sent: by sender_post_id; inbox/archive: by recipient_post_id. */
export async function clearMailboxFolder(postId: string, folder: MailboxFolder): Promise<number> {
  let ids: Array<{ id: string }>;
  if (folder === 'sent') {
    ids = await all('SELECT id FROM mailbox_messages WHERE sender_post_id = ?', [postId]) as Array<{ id: string }>;
  } else {
    ids = await all("SELECT id FROM mailbox_messages WHERE recipient_post_id = ? AND (folder = ? OR (folder IS NULL AND ? = 'inbox'))", [postId, folder, folder]) as Array<{ id: string }>;
  }
  const idList = ids.map(r => r.id);
  if (idList.length > 0) await deleteMailboxMessages(idList);
  return idList.length;
}

export type MailboxFolder = 'inbox' | 'archive' | 'sent';

/** Mailbox messages. mode: inbox/archive = recipient view; sent = sender view. */
export async function getMailboxMessages(opts: {
  postId?: string;
  allowedPostIds?: string[] | null;
  folder?: MailboxFolder;
  senderPostIds?: string[];
}): Promise<Array<{ id: string; recipientPostId: string; senderPostId: string | null; senderEmail: string; subject: string; bodySnippet: string | null; messageDate: string; unread: number; folder: string; parentMessageId: string | null }>> {
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
  const sql = `SELECT id, recipient_post_id AS "recipientPostId", sender_post_id AS "senderPostId", sender_email AS "senderEmail", subject, body_snippet AS "bodySnippet", message_date AS "messageDate", unread, COALESCE(folder, 'inbox') AS folder, parent_message_id AS "parentMessageId" FROM mailbox_messages WHERE ${conditions.join(' AND ')} ORDER BY message_date DESC`;
  const rows = await all(sql, [...params]) as any[];
  return rows.map(r => ({ ...r, unread: Number(r.unread), bodySnippet: r.bodySnippet ?? null, senderPostId: r.senderPostId ?? null, folder: r.folder ?? 'inbox', parentMessageId: r.parentMessageId ?? null }));
}

/** Get one mailbox message by id with full body (for view modal). Returns null if not found. */
export async function getMailboxMessageById(id: string): Promise<{ id: string; recipientPostId: string; senderPostId: string | null; senderEmail: string; subject: string; bodySnippet: string | null; body: string | null; messageDate: string; unread: number; folder: string; parentMessageId: string | null } | null> {
  const row = await get(`
    SELECT id, recipient_post_id AS "recipientPostId", sender_post_id AS "senderPostId", sender_email AS "senderEmail", subject, body_snippet AS "bodySnippet", body, message_date AS "messageDate", unread, COALESCE(folder, 'inbox') AS folder, parent_message_id AS "parentMessageId"
    FROM mailbox_messages WHERE id = ?
  `, [id]) as any;
  if (!row) return null;
  return { ...row, unread: Number(row.unread), bodySnippet: row.bodySnippet ?? null, body: row.body ?? null, senderPostId: row.senderPostId ?? null, folder: row.folder ?? 'inbox', parentMessageId: row.parentMessageId ?? null };
}

/** Recent audit log entries (for Dashboard). Optional allowedPostIds: when set, only include post entities in that list. */
export async function getRecentAuditLog(limit: number, allowedPostIds?: string[] | null): Promise<Array<{ id: string; entityType: string; entityId: string; action: string; userId: string; userName: string | null; changes: string | null; createdAt: string }>> {
  let sql = `
    SELECT al.id, al.entity_type AS "entityType", al.entity_id AS "entityId",
           al.action, al.user_id AS "userId", u.name AS "userName",
           al.changes, al.created_at AS "createdAt"
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
  const rows = await all(sql, [...params]) as any[];
  return rows.map(r => ({ ...r, changes: r.changes ?? null, userName: r.userName ?? null }));
}

/** Audit log by post (entity_type='post', entity_id=postId). */
export async function getAuditLogByPostId(postId: string): Promise<Array<{ id: string; entityType: string; entityId: string; action: string; userId: string; changes: string | null; createdAt: string }>> {
  const rows = await all(`
    SELECT id, entity_type AS entityType, entity_id AS entityId, action, user_id AS "userId", changes, created_at AS "createdAt"
    FROM audit_log
    WHERE entity_type = 'post' AND entity_id = ?
    ORDER BY created_at DESC
  `, [postId]) as any[];
  return rows.map(r => ({ ...r, changes: r.changes ?? null }));
}

/** Append audit log entry (for use from routes). */
export async function appendAuditLog(data: { entityType: string; entityId: string; action: string; userId: string; changes?: string | null }): Promise<void> {
  const id = `al${Date.now()}`;
  await run(`
    INSERT INTO audit_log (id, entity_type, entity_id, action, user_id, changes)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [id, data.entityType, data.entityId, data.action, data.userId, data.changes ?? null]);
}

/** Create user (for signup). Returns user without password. Throws if email exists. Email stored lowercase. */
export async function createUser(data: { email: string; name: string; passwordHash: string; organizationId?: string }): Promise<{ id: string; email: string; name: string; organizationId: string; postId: null; role: string; isVerified: boolean }> {
  const emailNorm = data.email.trim().toLowerCase();
  const existing = await get('SELECT id FROM users WHERE LOWER(TRIM(email)) = ?', [emailNorm]);
  if (existing) {
    throw new Error('Email already registered');
  }
  const id = `u${Date.now()}`;
  const orgId = data.organizationId ?? '1';
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  // Code expires in 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await run(`
    INSERT INTO users (id, email, name, organization_id, password_hash, post_id, is_verified, verification_token, verification_token_expires_at)
    VALUES (?, ?, ?, ?, ?, NULL, FALSE, ?, ?)
  `, [id, emailNorm, data.name.trim(), orgId, data.passwordHash, verificationCode, expiresAt.toISOString()]);

  // Send real email via Brevo (falls back to console.log if BREVO_API_KEY is unset)
  try {
    await sendVerificationEmail(emailNorm, verificationCode);
  } catch (mailError) {
    // Log but don't block signup — user can request resend
    console.error('[createUser] Failed to send verification email:', mailError);
  }

  return {
    id,
    email: emailNorm,
    name: data.name.trim(),
    organizationId: orgId,
    postId: null,
    role: 'Employee',
    isVerified: false,
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
export async function getUserById(userId: string): Promise<{ id: string; email: string; name: string; organizationId: string; postId: string | null; role: string; isVerified: boolean } | null> {
  const row = await get(`
    SELECT u.id, u.email, u.name, u.organization_id, u.post_id, u.is_verified
    FROM users u WHERE u.id = ?
  `, [userId]) as any;
  if (!row) return null;
  const postRoles = await all(`
    SELECT p.role FROM user_posts up JOIN posts p ON p.id = up.post_id WHERE up.user_id = ?
  `, [userId]) as { role: string }[];
  const roles = postRoles.map(r => r.role).filter(Boolean);
  const role = roles.length ? highestRole(roles) : (await get('SELECT role FROM posts WHERE id = ?', [row.post_id]) as { role: string } | undefined)?.role ?? 'Employee';
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    organizationId: row.organization_id,
    postId: row.post_id,
    role,
    isVerified: !!row.is_verified,
  };
}

/** Get user by post ID (finds who holds this post). */
export async function getUserByPostId(postId: string): Promise<{ id: string; email: string; name: string; organizationId: string; postId: string; role: string } | null> {
  const row = await get(`
    SELECT u.id, u.email, u.name, u.organization_id, up.post_id
    FROM users u
    JOIN user_posts up ON up.user_id = u.id
    WHERE up.post_id = ?
    LIMIT 1
  `, [postId]) as any;
  if (!row) return null;
  const postRole = await get('SELECT role FROM posts WHERE id = ?', [postId]) as { role: string } | undefined;
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
export async function getUserByEmailForLogin(email: string): Promise<{ id: string; email: string; name: string; organizationId: string; passwordHash: string; postId: string | null; role: string; isVerified: boolean } | null> {
  const normalized = email.trim().toLowerCase();
  const row = await get(`
    SELECT u.id, u.email, u.name, u.organization_id, u.password_hash, u.post_id, u.is_verified
    FROM users u WHERE LOWER(TRIM(u.email)) = ?
  `, [normalized]) as any;
  if (!row) return null;
  const postRoles = await all(`
    SELECT p.role FROM user_posts up JOIN posts p ON p.id = up.post_id WHERE up.user_id = ?
  `, [row.id]) as { role: string }[];
  const roles = postRoles.map(r => r.role).filter(Boolean);
  const role = roles.length ? highestRole(roles) : (await get('SELECT role FROM posts WHERE id = ?', [row.post_id]) as { role: string } | undefined)?.role ?? 'Employee';
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    organizationId: row.organization_id,
    passwordHash: row.password_hash,
    postId: row.post_id,
    role,
    isVerified: !!row.is_verified,
  };
}

/** Verify user email with a 6-digit verification code. */
export async function verifyUserEmail(email: string, code: string): Promise<{ id: string; email: string; name: string; organizationId: string; postId: string | null; role: string; isVerified: boolean }> {
  const emailNorm = email.trim().toLowerCase();
  const user = await get(`
    SELECT id, is_verified, verification_token, verification_token_expires_at, verification_attempts
    FROM users WHERE LOWER(TRIM(email)) = ?
  `, [emailNorm]) as any;
  if (!user) {
    throw new Error('Пользователь не найден');
  }
  if (user.is_verified) {
    throw new Error('Email уже подтвержден');
  }
  // Check if code has been burned by too many failed attempts
  const attempts = user.verification_attempts ?? 0;
  if (attempts >= 5) {
    // Invalidate the code — user must request a new one
    await run(`UPDATE users SET verification_token = NULL, verification_token_expires_at = NULL, verification_attempts = 0 WHERE id = ?`, [user.id]);
    throw new Error('Код заблокирован после 5 неудачных попыток. Запросите новый код.');
  }
  const expiresAt = user.verification_token_expires_at ? new Date(user.verification_token_expires_at) : null;
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    throw new Error('Срок действия кода подтверждения истек');
  }
  if (!user.verification_token || user.verification_token !== code.trim()) {
    // Increment attempt counter on wrong code
    await run(`UPDATE users SET verification_attempts = COALESCE(verification_attempts, 0) + 1 WHERE id = ?`, [user.id]);
    const remaining = 4 - attempts;
    throw new Error(`Неверный код подтверждения. Осталось попыток: ${remaining > 0 ? remaining : 0}`);
  }
  await run(`
    UPDATE users
    SET is_verified = TRUE, verification_token = NULL, verification_token_expires_at = NULL, verification_attempts = 0
    WHERE id = ?
  `, [user.id]);

  const updated = await getUserById(user.id);
  if (!updated) {
    throw new Error('Ошибка обновления пользователя');
  }
  return updated;
}

/** Resend the 6-digit verification code. */
export async function resendUserVerificationCode(email: string): Promise<void> {
  const emailNorm = email.trim().toLowerCase();
  const user = await get(`
    SELECT id, is_verified FROM users WHERE LOWER(TRIM(email)) = ?
  `, [emailNorm]) as any;
  if (!user) {
    throw new Error('Пользователь не найден');
  }
  if (user.is_verified) {
    throw new Error('Email уже подтвержден');
  }
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  // Code expires in 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await run(`
    UPDATE users
    SET verification_token = ?, verification_token_expires_at = ?
    WHERE id = ?
  `, [verificationCode, expiresAt.toISOString(), user.id]);

  // Send real email via Brevo
  await sendVerificationEmail(emailNorm, verificationCode);
}

/** Get creator user ID of a post from audit log. */
export async function getPostCreator(postId: string): Promise<string | null> {
  const log = await get(`
    SELECT user_id FROM audit_log
    WHERE entity_type = 'post' AND entity_id = ? AND action = 'created'
    ORDER BY created_at ASC
    LIMIT 1
  `, [postId]) as any;
  return log ? log.user_id : null;
}

