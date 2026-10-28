import 'dotenv/config';
import { app } from './app.js';
import { pool } from './db/pool.js';

// Small additive schema updates that must be in place before the routes run
// (same as db/migrations, safe to repeat).
pool
  .query(
    `ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image TEXT;
     ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
     CREATE TABLE IF NOT EXISTS password_resets (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       token_hash TEXT NOT NULL UNIQUE,
       expires_at TIMESTAMPTZ NOT NULL,
       used_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
     ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
     CREATE TABLE IF NOT EXISTS email_codes (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       code_hash TEXT NOT NULL,
       expires_at TIMESTAMPTZ NOT NULL,
       attempts INTEGER NOT NULL DEFAULT 0,
       used_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );
     CREATE INDEX IF NOT EXISTS idx_email_codes_user ON email_codes(user_id);`
  )
  .catch((err) => console.error('schema update failed:', err.message));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
