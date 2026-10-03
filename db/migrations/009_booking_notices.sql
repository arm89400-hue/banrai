-- Notices for members whose booking the property deleted. The booking row
-- itself is gone, so the notice keeps what the member needs to recognise it
-- (code, room, dates) together with the reason the admin gave. Shown on the
-- member's "My bookings" page until they dismiss it.
-- Safe to re-run. Not needed for a brand-new database - schema.sql already
-- creates this table.

CREATE TABLE IF NOT EXISTS booking_notices (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT,
  -- The room or activity that was booked.
  booked TEXT,
  check_in DATE,
  check_out DATE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_notices_user ON booking_notices(user_id);
