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
  name_th TEXT,
  description_th TEXT,
  tag TEXT,
  tag_th TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
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
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

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
  extra_guests INTEGER NOT NULL DEFAULT 0,
  pets INTEGER NOT NULL DEFAULT 0,
  guest_name TEXT,
  guest_phone TEXT,
  guest_email TEXT,
  guest_line TEXT,
  requests TEXT[] NOT NULL DEFAULT '{}',
  note TEXT,
  total NUMERIC(10, 2),
  deposit NUMERIC(10, 2),
  discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  promo_name TEXT,
  group_code TEXT,
  stay_username TEXT,
  stay_password TEXT,
  balance_paid_at TIMESTAMPTZ,
  balance_method TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_balance_method_check CHECK (balance_method IS NULL OR balance_method IN ('online', 'at_farm')),
  CONSTRAINT bookings_exactly_one_target CHECK (num_nonnulls(activity_id, room_id) = 1),
  CONSTRAINT bookings_room_range_valid CHECK (
    (room_id IS NULL AND booked_until IS NULL) OR
    (room_id IS NOT NULL AND booked_until IS NOT NULL AND booked_until > booked_for)
  ),
  CONSTRAINT bookings_status_valid CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  CONSTRAINT bookings_has_owner CHECK (
    user_id IS NOT NULL OR (guest_name IS NOT NULL AND guest_phone IS NOT NULL)
  ),
  CONSTRAINT bookings_room_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(booked_for, booked_until, '[)') WITH &&
  ) WHERE (room_id IS NOT NULL AND status <> 'cancelled')
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stay_booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stay_booking
  ON users(stay_booking_id) WHERE stay_booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  actor TEXT,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_admin BOOLEAN NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id, id);
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image TEXT;

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

CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT photos_one_owner CHECK ((room_id IS NULL) <> (activity_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_photos_room ON photos(room_id, position);
CREATE INDEX IF NOT EXISTS idx_photos_activity ON photos(activity_id, position);

CREATE OR REPLACE FUNCTION photos_max_six() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM photos
      WHERE room_id IS NOT DISTINCT FROM NEW.room_id
        AND activity_id IS NOT DISTINCT FROM NEW.activity_id
        AND announcement_id IS NOT DISTINCT FROM NEW.announcement_id) >= 6 THEN
    RAISE EXCEPTION 'A room, activity or announcement can have at most 6 photos'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'photos_max_six';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photos_max_six ON photos;
CREATE TRIGGER photos_max_six BEFORE INSERT ON photos
  FOR EACH ROW EXECUTE FUNCTION photos_max_six();

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT,
  title_th TEXT,
  body TEXT,
  body_th TEXT,
  image TEXT,
  audience TEXT NOT NULL DEFAULT 'home',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT announcements_audience CHECK (audience IN ('home', 'booked', 'both')),
  CONSTRAINT announcements_has_title CHECK (coalesce(title, title_th) IS NOT NULL),
  CONSTRAINT announcements_dates CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_announcements_window ON announcements(starts_at, ends_at);

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_photos_announcement ON photos(announcement_id, position);
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_one_owner;
ALTER TABLE photos ADD CONSTRAINT photos_one_owner
  CHECK (num_nonnulls(room_id, activity_id, announcement_id) = 1);

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

CREATE TABLE IF NOT EXISTS slip_payments (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  booking_ids INTEGER[] NOT NULL,
  kind TEXT NOT NULL DEFAULT 'deposit' CHECK (kind IN ('deposit', 'balance', 'full')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('verified', 'rejected', 'review')),
  reason TEXT,
  trans_ref TEXT,
  amount NUMERIC(10, 2),
  expected NUMERIC(10, 2) NOT NULL,
  sending_bank TEXT,
  sender_name TEXT,
  receiver_name TEXT,
  trans_at TIMESTAMPTZ,
  slip_file TEXT,
  raw JSONB,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slip_payments_booking ON slip_payments(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_slip_payments_booking_ids ON slip_payments USING GIN (booking_ids);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_slip_payments_verified_ref
  ON slip_payments(trans_ref) WHERE status = 'verified';

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_settings (key, value) VALUES (
  'contact',
  '{
    "phones": [
      {"name_th": "Jit", "name_en": "Jit", "number": "089-202-9053"},
      {"name_th": "แมว", "name_en": "Maew", "number": "081-876-2884"}
    ],
    "line": "",
    "facebook": "https://www.facebook.com/baanraikongpor.pakchong",
    "maps": "https://goo.gl/maps/EzwtcXYgctz2gkAQ6"
  }'
) ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS opn_charges (
  id TEXT PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  booking_ids INTEGER[] NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'balance', 'full')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  qr_uri TEXT,
  expires_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opn_charges_booking_ids ON opn_charges USING GIN (booking_ids);
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
