-- Deposit slips checked with SlipOK (see backend/src/lib/slipok.js). Every
-- upload is kept, passed or not, so the owner can see what a guest sent.
-- A bank transaction (trans_ref) can confirm only one booking: the partial
-- unique index stops the same slip from being reused. Re-runnable.

CREATE TABLE IF NOT EXISTS slip_payments (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('verified', 'rejected')),
  reason TEXT,                -- why it was rejected (SLIP_AMOUNT, SLIP_DUPLICATE, ...)
  trans_ref TEXT,             -- the bank's transaction reference
  amount NUMERIC(10, 2),      -- amount on the slip
  expected NUMERIC(10, 2) NOT NULL, -- the deposit it had to match
  sending_bank TEXT,
  sender_name TEXT,
  receiver_name TEXT,
  trans_at TIMESTAMPTZ,       -- when the transfer was made
  slip_file TEXT,             -- the uploaded image, /uploads/...
  raw JSONB,                  -- SlipOK's full answer, for support
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slip_payments_booking ON slip_payments(booking_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_slip_payments_verified_ref
  ON slip_payments(trans_ref) WHERE status = 'verified';
