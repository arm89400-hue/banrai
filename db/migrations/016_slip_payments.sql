CREATE TABLE IF NOT EXISTS slip_payments (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('verified', 'rejected')),
  reason TEXT,
  trans_ref TEXT,
  amount NUMERIC(10, 2),
  expected NUMERIC(10, 2) NOT NULL,
  sending_bank TEXT,
  sender_name TEXT,
  receiver_name TEXT,
  trans_at TIMESTAMPTZ,
  slip_file TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slip_payments_booking ON slip_payments(booking_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_slip_payments_verified_ref
  ON slip_payments(trans_ref) WHERE status = 'verified';
