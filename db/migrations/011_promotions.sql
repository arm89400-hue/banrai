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

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_name TEXT;
