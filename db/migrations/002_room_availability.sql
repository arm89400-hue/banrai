-- Brings an existing database (created before room-availability checks
-- existed) up to date with the current db/schema.sql. Safe to re-run. Not
-- needed for a brand-new database - schema.sql already creates bookings in
-- this shape.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booked_until TIMESTAMPTZ;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_room_range_valid;
ALTER TABLE bookings ADD CONSTRAINT bookings_room_range_valid CHECK (
  (room_id IS NULL AND booked_until IS NULL) OR
  (room_id IS NOT NULL AND booked_until IS NOT NULL AND booked_until > booked_for)
);

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_room_no_overlap;
ALTER TABLE bookings ADD CONSTRAINT bookings_room_no_overlap
  EXCLUDE USING gist (room_id WITH =, tstzrange(booked_for, booked_until, '[)') WITH &&)
  WHERE (room_id IS NOT NULL);
