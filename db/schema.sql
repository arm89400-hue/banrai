-- Needed for the GiST exclusion constraint below (gives GiST an equality
-- operator class for plain integer columns like room_id).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  account_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  capacity INTEGER,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference TEXT UNIQUE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

-- A booking is either a room stay or an activity slot, never both -
-- exactly one of activity_id/room_id must be set (see the CHECK below).
-- Room stays are a [booked_for, booked_until) range (check-in/check-out);
-- activities are a single point in time, so booked_until stays NULL.
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  booked_for TIMESTAMPTZ NOT NULL,
  booked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_exactly_one_target CHECK (num_nonnulls(activity_id, room_id) = 1),
  CONSTRAINT bookings_room_range_valid CHECK (
    (room_id IS NULL AND booked_until IS NULL) OR
    (room_id IS NOT NULL AND booked_until IS NOT NULL AND booked_until > booked_for)
  ),
  -- Database-enforced double-booking guard: no two room bookings for the
  -- same room may have overlapping [booked_for, booked_until) ranges. This
  -- holds even under concurrent requests, which an application-level check
  -- (SELECT then INSERT) can't guarantee on its own.
  CONSTRAINT bookings_room_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(booked_for, booked_until, '[)') WITH &&
  ) WHERE (room_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_activity_id ON bookings(activity_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
