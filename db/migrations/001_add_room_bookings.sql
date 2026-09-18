-- Brings an existing database (created before room bookings existed) up to
-- date with the current db/schema.sql. Safe to re-run. Not needed for a
-- brand-new database - schema.sql already creates bookings in this shape.
ALTER TABLE bookings ALTER COLUMN activity_id DROP NOT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_exactly_one_target;
ALTER TABLE bookings ADD CONSTRAINT bookings_exactly_one_target CHECK (num_nonnulls(activity_id, room_id) = 1);
CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
