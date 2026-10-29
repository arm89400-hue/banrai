ALTER TABLE slip_payments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'deposit';
ALTER TABLE slip_payments DROP CONSTRAINT IF EXISTS slip_payments_kind_check;
ALTER TABLE slip_payments ADD CONSTRAINT slip_payments_kind_check CHECK (kind IN ('deposit', 'balance'));

ALTER TABLE slip_payments ADD COLUMN IF NOT EXISTS booking_ids INTEGER[];
UPDATE slip_payments SET booking_ids = ARRAY[booking_id] WHERE booking_ids IS NULL;
ALTER TABLE slip_payments ALTER COLUMN booking_ids SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slip_payments_booking_ids ON slip_payments USING GIN (booking_ids);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_paid_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS balance_method TEXT;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_balance_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_balance_method_check
  CHECK (balance_method IS NULL OR balance_method IN ('online', 'at_farm'));
