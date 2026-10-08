-- Slips can wait for the owner to check them by hand ('review') while no
-- automatic slip checker (SlipOK) is set up. Re-runnable.

ALTER TABLE slip_payments DROP CONSTRAINT IF EXISTS slip_payments_status_check;
ALTER TABLE slip_payments ADD CONSTRAINT slip_payments_status_check
  CHECK (status IN ('verified', 'rejected', 'review'));
ALTER TABLE slip_payments ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
