/**
 * One-off script: assign Admin role to a user by email.
 * Role comes from post; p1 = "Исполнительный директор" with role Admin.
 *
 * Usage: npx ts-node scripts/assign-admin-by-email.ts <email>
 * Example: npx ts-node scripts/assign-admin-by-email.ts adilet@gmail.com
 */
import Database from 'better-sqlite3';
import * as path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data.db');
const database = new Database(dbPath);

// Ensure user_posts exists (role at login is read from here)
database.exec(`
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

const user = database.prepare('SELECT id, email, name, post_id FROM users WHERE email = ?').get(email) as
  | { id: string; email: string; name: string; post_id: string | null }
  | undefined;

if (!user) {
  console.error(`User with email "${email}" not found. Sign up first at /signup, then run this script again.`);
  process.exit(1);
}

const post = database.prepare('SELECT id, title, role FROM posts WHERE id = ?').get(ADMIN_POST_ID) as
  | { id: string; title: string; role: string }
  | undefined;

if (!post) {
  console.error('Admin post (p1) not found. Has the DB been seeded?');
  process.exit(1);
}

if (user.post_id === ADMIN_POST_ID) {
  // Role at login comes from user_posts — ensure it's in sync so UI shows Admin
  database.prepare('DELETE FROM user_posts WHERE post_id = ?').run(ADMIN_POST_ID);
  database.prepare('INSERT OR REPLACE INTO user_posts (user_id, post_id) VALUES (?, ?)').run(user.id, ADMIN_POST_ID);
  console.log(`${email} already has Admin role (assigned to "${post.title}"). Synced user_posts; log out and log in to see Admin in the UI.`);
  process.exit(0);
}

// Free the admin post if someone else holds it (optional: leave them vacated)
database.prepare('UPDATE users SET post_id = NULL WHERE post_id = ? AND id != ?').run(ADMIN_POST_ID, user.id);
database.prepare('UPDATE users SET post_id = ? WHERE id = ?').run(ADMIN_POST_ID, user.id);

// Role at login comes from user_posts, not just users.post_id — ensure admin post is in user_posts
database.prepare('DELETE FROM user_posts WHERE post_id = ?').run(ADMIN_POST_ID);
database.prepare('INSERT OR REPLACE INTO user_posts (user_id, post_id) VALUES (?, ?)').run(user.id, ADMIN_POST_ID);

console.log(`Done. ${email} (${user.name}) is now assigned to "${post.title}" and has Admin role.`);
console.log('Log in with that email to use Admin permissions.');
