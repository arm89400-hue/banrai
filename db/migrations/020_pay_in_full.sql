ALTER TABLE slip_payments DROP CONSTRAINT IF EXISTS slip_payments_kind_check;
ALTER TABLE slip_payments ADD CONSTRAINT slip_payments_kind_check CHECK (kind IN ('deposit', 'balance', 'full'));
