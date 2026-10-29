ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stay_booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stay_booking
  ON users(stay_booking_id) WHERE stay_booking_id IS NOT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS stay_username TEXT,
  ADD COLUMN IF NOT EXISTS stay_password TEXT;
