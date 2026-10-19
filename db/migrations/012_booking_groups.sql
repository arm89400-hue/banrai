ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_code TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_group_code ON bookings(group_code) WHERE group_code IS NOT NULL;
