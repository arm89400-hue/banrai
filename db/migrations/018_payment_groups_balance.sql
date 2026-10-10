-- One payment per booking group, and the second half of the price.
--
-- * slip_payments.kind: 'deposit' (the 50% paid to confirm) or 'balance'
--   (the other half, paid online before arriving).
-- * slip_payments.booking_ids: every booking one slip pays for. Rooms booked
--   together (same group_code) are paid with one transfer; booking_id stays
--   the booking the guest paid from.
-- * bookings.balance_paid_at / balance_method: when and how the other half
--   was paid - 'online' (a checked slip) or 'at_farm' (marked in admin).
-- Re-runnable.

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
