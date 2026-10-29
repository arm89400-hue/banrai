import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fail fast when the database is unreachable instead of waiting forever.
  connectionTimeoutMillis: 5000,
});

// A dropped database connection must not crash the app: log it, and the next
// query opens a new connection once the database is back.
pool.on('error', (err) => console.error('database connection lost:', err.message));
