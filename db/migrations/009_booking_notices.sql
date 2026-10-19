CREATE TABLE IF NOT EXISTS booking_notices (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT,
  booked TEXT,
  check_in DATE,
  check_out DATE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_notices_user ON booking_notices(user_id);
