import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DB_DIR = fileURLToPath(new URL('../../db/', import.meta.url));
const testUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/baanrai_test';

// Drops and re-creates the test database, then builds it the same way a new
// server is built: schema.sql, then every migration in order.
export async function setup() {
  const name = new URL(testUrl).pathname.slice(1);
  if (!name.endsWith('_test')) throw new Error(`Refusing to reset "${name}": test database names must end in _test`);

  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect();
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [name]);
  await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const db = new pg.Client({ connectionString: testUrl });
  await db.connect();
  await db.query('SET client_min_messages = warning');
  await db.query(readFileSync(join(DB_DIR, 'schema.sql'), 'utf8'));
  const migrations = join(DB_DIR, 'migrations');
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    await db.query(readFileSync(join(migrations, file), 'utf8'));
  }
  await db.end();
}
