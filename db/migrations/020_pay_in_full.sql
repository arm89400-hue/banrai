-- Paying the whole price at once.
--
-- * slip_payments.kind 'full': one transfer for the whole price (deposit and
--   the rest together), chosen by the guest instead of the 50% deposit. It
--   confirms the booking and marks the rest paid in one go.
-- Re-runnable.

ALTER TABLE slip_payments DROP CONSTRAINT IF EXISTS slip_payments_kind_check;
ALTER TABLE slip_payments ADD CONSTRAINT slip_payments_kind_check CHECK (kind IN ('deposit', 'balance', 'full'));
