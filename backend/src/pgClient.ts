import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

/** Convert SQLite-style `?` placeholders to PostgreSQL `$1`, `$2`, … */
export function toPgText(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url || !url.trim()) {
      throw new Error('DATABASE_URL is required (PostgreSQL connection string)');
    }
    pool = new Pool({
      connectionString: url,
      max: 20,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function execRaw(sql: string): Promise<void> {
  await getPool().query(sql);
}

export async function run(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
  const text = toPgText(sql);
  const res = await getPool().query(text, params);
  return { rowCount: res.rowCount ?? 0 };
}

export async function get<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const text = toPgText(sql);
  const res = await getPool().query<T>(text, params);
  return res.rows[0] as T | undefined;
}

export async function all<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const text = toPgText(sql);
  const res = await getPool().query<T>(text, params);
  return res.rows as T[];
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

function clientToPgText(sql: string): string {
  return toPgText(sql);
}

export async function clientRun(client: PoolClient, sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
  const text = clientToPgText(sql);
  const res = await client.query(text, params);
  return { rowCount: res.rowCount ?? 0 };
}

export async function clientGet<T extends Record<string, unknown> = Record<string, unknown>>(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const text = clientToPgText(sql);
  const res = await client.query<T>(text, params);
  return res.rows[0] as T | undefined;
}

export async function clientAll<T extends Record<string, unknown> = Record<string, unknown>>(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const text = clientToPgText(sql);
  const res = await client.query<T>(text, params);
  return res.rows as T[];
}
