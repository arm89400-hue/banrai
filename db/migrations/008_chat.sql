-- Chat between the property (the admin dashboard's Chat tab) and a
-- signed-in account. There is one conversation per account, so a message
-- only records whose conversation it belongs to and which side wrote it.
-- Safe to re-run. Not needed for a brand-new database - schema.sql already
-- creates this table.

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  -- The account whose conversation this is (a member or a room account).
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- true: written by the property; false: written by the account.
  from_admin BOOLEAN NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When the other side first saw it; NULL while unread.
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, id);
