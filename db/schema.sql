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
  -- Guests the price covers, and how many more may be added for a fee.
  capacity INTEGER,
  max_extra_guests INTEGER NOT NULL DEFAULT 0,
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
-- Guests can book without an account: then user_id is NULL and the
-- guest_* contact fields are required. `code` is the short reference the
-- guest uses to check their booking; `status` is managed by the property.
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  booked_for TIMESTAMPTZ NOT NULL,
  booked_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  code TEXT,
  guests INTEGER,
  -- How many of `guests` were beyond the room's included count (charged extra).
  extra_guests INTEGER NOT NULL DEFAULT 0,
  -- How many pets are coming (each charged a flat fee per night).
  pets INTEGER NOT NULL DEFAULT 0,
  guest_name TEXT,
  guest_phone TEXT,
  guest_email TEXT,
  guest_line TEXT,
  requests TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  total NUMERIC(10, 2),
  deposit NUMERIC(10, 2),
  -- Promotion discount already taken off `total`, and which promotion gave it.
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  promo_name TEXT,
  -- Login for the room's guest dashboard, generated when the booking is
  -- confirmed (see users.stay_booking_id below).
  stay_username TEXT,
  stay_password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_exactly_one_target CHECK (num_nonnulls(activity_id, room_id) = 1),
  CONSTRAINT bookings_room_range_valid CHECK (
    (room_id IS NULL AND booked_until IS NULL) OR
    (room_id IS NOT NULL AND booked_until IS NOT NULL AND booked_until > booked_for)
  ),
  CONSTRAINT bookings_status_valid CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  CONSTRAINT bookings_has_owner CHECK (
    user_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL)
  ),
  -- Database-enforced double-booking guard: no two active room bookings
  -- for the same room may have overlapping [booked_for, booked_until)
  -- ranges. This holds even under concurrent requests, which an
  -- application-level check (SELECT then INSERT) can't guarantee on its
  -- own. Cancelled bookings don't hold the room.
  CONSTRAINT bookings_room_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(booked_for, booked_until, '[)') WITH &&
  ) WHERE (room_id IS NOT NULL AND status <> 'cancelled')
);

-- Stay accounts: a temporary login created when a room booking is
-- confirmed, for that room's guest dashboard. It expires at check-out
-- (users.account_expires_at). Added here, after bookings exists, because
-- users and bookings reference each other.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stay_booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stay_booking
  ON users(stay_booking_id) WHERE stay_booking_id IS NOT NULL;

-- Activity log for the admin dashboard's Log tab: who did what and when -
-- booking requests, confirmations (with the room login that was created),
-- cancellations, sign-ups and logins. Append-only.
CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  actor TEXT,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

-- Chat between the property (admin dashboard) and a signed-in account: one
-- conversation per account. from_admin says which side wrote the message;
-- read_at is set when the other side first sees it.
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_admin BOOLEAN NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, id);

-- Notices for members whose booking the property deleted: what was booked
-- and the reason the admin gave. Shown on "My bookings" until dismissed.
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

-- Promotions: a percentage off the room rate for stays that check in within
-- [starts_on, ends_on], for one room or (room_id NULL) every room. The
-- biggest applicable discount wins; promotions never stack.
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  percent NUMERIC(5, 2) NOT NULL CHECK (percent > 0 AND percent <= 100),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promotions_dates_valid CHECK (ends_on >= starts_on)
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_code ON bookings(code);
