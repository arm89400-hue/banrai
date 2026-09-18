import pg from 'pg';

const { Pool } = pg;

// Shared PostgreSQL connection pool used by every route in the app.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
