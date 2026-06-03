/**
 * One-off script: assign Admin role to a user by email.
 * Role comes from post; p1 = "Исполнительный директор" with role Admin.
 *
 * Usage: npx ts-node scripts/assign-admin-by-email.ts <email>
 * Requires DATABASE_URL (PostgreSQL).
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function toPg(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

async function q<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query<T>(toPg(text), params);
  return r.rows as T[];
}

async function qOne<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await q<T>(text, params);
  return rows[0];
}

async function run(text: string, params: unknown[] = []): Promise<void> {
  await pool.query(toPg(text), params);
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  await run(`
    CREATE TABLE IF NOT EXISTS user_posts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, post_id),
      UNIQUE (post_id)
    )
  `);

  const email = process.argv[2]?.trim();
  if (!email) {
    console.error('Usage: npx ts-node scripts/assign-admin-by-email.ts <email>');
    process.exit(1);
  }

  const ADMIN_POST_ID = 'p1';

  const user = await qOne<{ id: string; email: string; name: string; post_id: string | null }>(
    'SELECT id, email, name, post_id FROM users WHERE email = ?',
    [email],
  );

  if (!user) {
    console.error(`User with email "${email}" not found. Create the user in the database (seed or admin), then run this script again.`);
    process.exit(1);
  }

  const post = await qOne<{ id: string; title: string; role: string }>(
    'SELECT id, title, role FROM posts WHERE id = ?',
    [ADMIN_POST_ID],
  );

  if (!post) {
    console.error('Admin post (p1) not found. Has the DB been seeded?');
    process.exit(1);
  }

  if (user.post_id === ADMIN_POST_ID) {
    await run('DELETE FROM user_posts WHERE post_id = ?', [ADMIN_POST_ID]);
    await run(
      `INSERT INTO user_posts (user_id, post_id) VALUES (?, ?)
       ON CONFLICT (post_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [user.id, ADMIN_POST_ID],
    );
    console.log(`${email} already has Admin role (assigned to "${post.title}"). Synced user_posts; log out and log in to see Admin in the UI.`);
    process.exit(0);
  }

  await run('UPDATE users SET post_id = NULL WHERE post_id = ? AND id != ?', [ADMIN_POST_ID, user.id]);
  await run('UPDATE users SET post_id = ? WHERE id = ?', [ADMIN_POST_ID, user.id]);

  await run('DELETE FROM user_posts WHERE post_id = ?', [ADMIN_POST_ID]);
  await run(
    `INSERT INTO user_posts (user_id, post_id) VALUES (?, ?)
     ON CONFLICT (post_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [user.id, ADMIN_POST_ID],
  );

  console.log(`Done. ${email} (${user.name}) is now assigned to "${post.title}" and has Admin role.`);
  console.log('Log in with that email to use Admin permissions.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => pool.end());
