import 'dotenv/config';
import { app } from './app.js';
import { pool } from './db/pool.js';

// Small additive schema updates that must be in place before the routes run
// (same as db/migrations, safe to repeat).
pool
  .query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image TEXT')
  .catch((err) => console.error('schema update failed:', err.message));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
