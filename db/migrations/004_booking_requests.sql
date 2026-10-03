-- Guest booking requests: guests can book without an account (name +
-- phone), each booking gets a short code for checking its status, and the
-- property moves it through pending -> confirmed / cancelled from the admin
-- dashboard. Safe to re-run. Not needed for a brand-new database -
-- schema.sql already creates bookings in this shape.

ALTER TABLE bookings ALTER COLUMN user_id DROP NOT NULL;

-- Bookings that existed before this migration were instant bookings, so
-- they start out confirmed; new rows default to pending.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE bookings ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS guests INTEGER,
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_phone TEXT,
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS guest_line TEXT,
  ADD COLUMN IF NOT EXISTS requests TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS total NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS deposit NUMERIC(10, 2);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_code ON bookings(code);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_valid;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_valid
  CHECK (status IN ('pending', 'confirmed', 'cancelled'));

-- Every booking belongs to an account or carries the guest's contact details.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_has_owner;
ALTER TABLE bookings ADD CONSTRAINT bookings_has_owner
  CHECK (user_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL));

-- Cancelled bookings no longer hold the room.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_room_no_overlap;
ALTER TABLE bookings ADD CONSTRAINT bookings_room_no_overlap
  EXCLUDE USING gist (room_id WITH =, tstzrange(booked_for, booked_until, '[)') WITH &&)
  WHERE (room_id IS NOT NULL AND status <> 'cancelled');
