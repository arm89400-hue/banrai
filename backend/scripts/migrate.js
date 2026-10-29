// Brings the database up to date, then exits. Run before the app starts:
//   npm run migrate            (on your computer, reads backend/.env)
//   the "migrator" container   (in Docker, see docker-compose.yml)
//
// - New, empty database: runs db/schema.sql
//   (plus db/seed.sql sample data when MIGRATE_SEED=true, dev only), then every
//   file in db/migrations in order.
// - Database that already has tables but no record of migrations (the live
//   site before this script existed): records every current migration as
//   already applied, without running them again.
// - After that: runs only migrations not yet recorded in schema_migrations.
// Safe to run any number of times. Each file runs in its own transaction.
import 'dotenv/config';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const DB_DIR =
  process.env.DB_DIR ?? [join(here, '../db'), join(here, '../../db')].find((d) => existsSync(join(d, 'schema.sql')));
if (!DB_DIR) throw new Error('db folder (schema.sql, migrations/) not found; set DB_DIR');
const MIGRATIONS = join(DB_DIR, 'migrations');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });

async function inTransaction(fn) {
  await client.query('BEGIN');
  try {
    await fn();
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  await client.connect();
  await client.query('SET client_min_messages = warning');

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const { rows: tracking } = await client.query("SELECT to_regclass('public.schema_migrations') AS t");
  const { rows: users } = await client.query("SELECT to_regclass('public.users') AS t");
  const hasTracking = Boolean(tracking[0].t);
  const hasTables = Boolean(users[0].t);

  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  if (!hasTracking && hasTables) {
    await client.query(
      'INSERT INTO schema_migrations (filename) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING',
      [files]
    );
    console.log(`existing database: recorded ${files.length} migrations as already applied`);
    return;
  }

  const fresh = !hasTables;
  if (fresh) {
    await inTransaction(() => client.query(readFileSync(join(DB_DIR, 'schema.sql'), 'utf8')));
    console.log('new database: schema.sql applied');
    // Sample data goes in before the migrations, the same order the database
    // was first built in (later migrations add photos to the sample rooms).
    if (process.env.MIGRATE_SEED === 'true') {
      await inTransaction(() => client.query(readFileSync(join(DB_DIR, 'seed.sql'), 'utf8')));
      console.log('seed.sql applied');
    }
  }

  const { rows } = await client.query('SELECT filename FROM schema_migrations');
  const done = new Set(rows.map((r) => r.filename));
  let ran = 0;
  for (const file of files.filter((f) => !done.has(f))) {
    await inTransaction(async () => {
      await client.query(readFileSync(join(MIGRATIONS, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    });
    console.log(`applied ${file}`);
    ran += 1;
  }

  console.log(ran ? `done: ${ran} migration(s) applied` : 'done: database already up to date');
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error('migration failed:', err.message);
    await client.end().catch(() => {});
    process.exit(1);
  });
