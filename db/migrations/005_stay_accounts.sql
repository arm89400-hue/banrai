-- Stay accounts: when the property confirms a room booking (deposit
-- received), the system creates a temporary login for that room's guest
-- dashboard. It is a row in `users` linked to the booking through
-- stay_booking_id, and its account_expires_at is the booking's check-out
-- time, after which it can no longer sign in. The generated username and
-- password are kept on the booking so the guest (in "My bookings") and the
-- property (in the admin dashboard) can read them.
-- Safe to re-run. Not needed for a brand-new database - schema.sql already
-- creates these columns.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stay_booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE;

-- At most one stay account per booking.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stay_booking
  ON users(stay_booking_id) WHERE stay_booking_id IS NOT NULL;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS stay_username TEXT,
  ADD COLUMN IF NOT EXISTS stay_password TEXT;
