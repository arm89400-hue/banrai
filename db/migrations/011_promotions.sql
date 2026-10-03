-- Promotions: a percentage off the room rate, set up by the admin. A
-- promotion applies to a stay whose check-in date falls within
-- [starts_on, ends_on], for one room or (room_id NULL) every room. If
-- several apply, the biggest discount wins; they never stack. A booking
-- records the discount it was given and the promotion's name, so its total
-- can still be explained after the promotion is edited or deleted.
-- Safe to re-run. Not needed for a brand-new database - schema.sql already
-- creates these.

CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  -- Percent off the room rate (extra-guest and pet fees are not discounted).
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
