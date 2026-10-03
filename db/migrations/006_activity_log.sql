-- Activity log for the admin dashboard's Log tab: who did what and when -
-- booking requests, confirmations (with the room login that was created),
-- cancellations, sign-ups and logins. Append-only; rows are never updated.
-- Safe to re-run. Not needed for a brand-new database - schema.sql already
-- creates this table.

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- e.g. 'booking.requested', 'booking.confirmed', 'login.room'
  type TEXT NOT NULL,
  -- Who did it: an account's email / room username, or NULL for the system.
  actor TEXT,
  -- The booking it is about, if any. Kept readable after the booking is
  -- deleted because the booking code is also copied into `details`.
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
