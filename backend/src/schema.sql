-- Post-centric schema (reference for migration)
-- Key entity: Post. User occupies Post via user.post_id.

-- Posts (должности), hierarchy via parent_post_id
CREATE TABLE IF NOT EXISTS posts (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  parent_post_id TEXT REFERENCES posts(id),
  department_id  TEXT NOT NULL,
  role          TEXT NOT NULL,  -- Admin, Inspector, Department Head, Section Head, Employee
  level         INTEGER NOT NULL DEFAULT 0,
  order_index   INTEGER NOT NULL DEFAULT 0,
  card_color    TEXT,            -- optional card color key: default, blue, green, amber, violet
  card_notes    TEXT,            -- optional text shown on org chart card
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users: id, name, email, avatar_url; optional post_id (primary position for role/JWT)
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  avatar_url      TEXT,
  password_hash   TEXT,
  post_id         TEXT REFERENCES posts(id),  -- primary position (for role/JWT)
  is_verified     BOOLEAN DEFAULT FALSE,
  verification_token TEXT,
  verification_token_expires_at TIMESTAMP,
  verification_attempts INTEGER DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User can hold multiple posts (one person = head of many departments). Each post has at most one holder.
CREATE TABLE IF NOT EXISTS user_posts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id),
  UNIQUE (post_id)
);

-- Instructions: bound to post
CREATE TABLE IF NOT EXISTS instructions (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  post_id        TEXT NOT NULL REFERENCES posts(id),
  owner_post_id  TEXT NOT NULL REFERENCES posts(id),
  status         TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  content        TEXT,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Instruction steps (per instruction)
CREATE TABLE IF NOT EXISTS instruction_steps (
  id              TEXT PRIMARY KEY,
  instruction_id  TEXT NOT NULL REFERENCES instructions(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  text            TEXT,
  link            TEXT,
  deadline        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  order_index     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_instruction_steps_instruction ON instruction_steps(instruction_id);

-- Statistics: bound to post
CREATE TABLE IF NOT EXISTS post_statistics (
  id          TEXT PRIMARY KEY,
  post_id     TEXT NOT NULL REFERENCES posts(id),
  period      TEXT NOT NULL,
  metric_code TEXT NOT NULL,
  value       REAL NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Metric definitions (name, unit). Admin can add new metrics.
CREATE TABLE IF NOT EXISTS metric_definitions (
  id         TEXT PRIMARY KEY,
  code       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  unit       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quotas (targets) per post, metric, period. Уже есть = value from post_statistics; Надо ещё = max(0, target - value).
CREATE TABLE IF NOT EXISTS statistic_quotas (
  id           TEXT PRIMARY KEY,
  post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  metric_code  TEXT NOT NULL,
  period       TEXT NOT NULL,
  target_value REAL NOT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (post_id, metric_code, period)
);
CREATE INDEX IF NOT EXISTS idx_statistic_quotas_lookup ON statistic_quotas(post_id, metric_code, period);

-- MetricToRole: which metrics are assigned to which post (role). daily_target = per-day target for cell coloring.
CREATE TABLE IF NOT EXISTS metric_to_post (
  post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  metric_code  TEXT NOT NULL,
  responsible_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  daily_target REAL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, metric_code)
);
CREATE INDEX IF NOT EXISTS idx_metric_to_post_post ON metric_to_post(post_id);
CREATE INDEX IF NOT EXISTS idx_metric_to_post_metric ON metric_to_post(metric_code);

-- Budgets: optional responsible post
CREATE TABLE IF NOT EXISTS budgets (
  id                 TEXT PRIMARY KEY,
  department_id      TEXT NOT NULL,
  responsible_post_id TEXT REFERENCES posts(id),
  category           TEXT NOT NULL,
  period             TEXT NOT NULL,
  planned            REAL NOT NULL,
  approved           REAL NOT NULL DEFAULT 0,
  spent              REAL NOT NULL DEFAULT 0,
  remaining          REAL NOT NULL,
  limits             REAL NOT NULL,
  approval_status    TEXT NOT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  parent_id        TEXT REFERENCES departments(id),
  manager_post_id  TEXT REFERENCES posts(id),
  organization_id  TEXT NOT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Work plans: bound to post (owner/responsible)
CREATE TABLE IF NOT EXISTS work_plans (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  post_id     TEXT NOT NULL REFERENCES posts(id),
  department  TEXT,
  status      TEXT NOT NULL,
  due_date    TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mailbox messages: inbound per post (recipient_post_id = должность)
CREATE TABLE IF NOT EXISTS mailbox_messages (
  id                TEXT PRIMARY KEY,
  recipient_post_id TEXT NOT NULL REFERENCES posts(id),
  sender_post_id    TEXT REFERENCES posts(id),
  sender_email      TEXT NOT NULL,
  subject           TEXT NOT NULL,
  body_snippet      TEXT,
  body              TEXT,
  message_date      TEXT NOT NULL,
  unread            INTEGER NOT NULL DEFAULT 1,
  folder            TEXT DEFAULT 'inbox',
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  work_plan_id      TEXT REFERENCES work_plans(id),
  parent_message_id TEXT REFERENCES mailbox_messages(id)
);

-- Work plan notifications: for approvers and employees
CREATE TABLE IF NOT EXISTS work_plan_notifications (
  id                 TEXT PRIMARY KEY,
  work_plan_id       TEXT NOT NULL REFERENCES work_plans(id),
  recipient_user_id  TEXT NOT NULL REFERENCES users(id),
  actor_user_id      TEXT REFERENCES users(id),
  action             TEXT NOT NULL, -- submitted, approved, rejected, revision_requested
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read               INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON work_plan_notifications(recipient_user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_plan ON work_plan_notifications(work_plan_id);

-- Indexes for tree and lookups
CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parent_post_id);
CREATE INDEX IF NOT EXISTS idx_users_post ON users(post_id);
CREATE INDEX IF NOT EXISTS idx_instructions_post ON instructions(post_id);
CREATE INDEX IF NOT EXISTS idx_statistics_post ON post_statistics(post_id);
CREATE INDEX IF NOT EXISTS idx_work_plans_post ON work_plans(post_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_recipient ON mailbox_messages(recipient_post_id);

-- Audit log: entity_type (e.g. 'post'), entity_id (e.g. post id), action, user_id, timestamp
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  changes     TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

-- Instruction acknowledgements (ознакомление)
CREATE TABLE IF NOT EXISTS instruction_acknowledgements (
  id              TEXT PRIMARY KEY,
  instruction_id  TEXT NOT NULL REFERENCES instructions(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(instruction_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_acknowledgements_instruction ON instruction_acknowledgements(instruction_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);