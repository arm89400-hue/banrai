-- Several rooms booked together. A guest may book more than one room in one
-- request (when one room can't sleep the whole party); each room is still
-- its own booking row (own code, status, payment and room login), and
-- group_code - the first room's booking code - ties them together.
-- NULL for a single-room booking.
-- Safe to re-run. Not needed for a brand-new database - schema.sql already
-- creates this column.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_code TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_group_code ON bookings(group_code) WHERE group_code IS NOT NULL;
