ALTER TABLE slip_payments DROP CONSTRAINT IF EXISTS slip_payments_status_check;
ALTER TABLE slip_payments ADD CONSTRAINT slip_payments_status_check
  CHECK (status IN ('verified', 'rejected', 'review'));
ALTER TABLE slip_payments ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
