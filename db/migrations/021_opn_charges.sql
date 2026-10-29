CREATE TABLE IF NOT EXISTS opn_charges (
  id TEXT PRIMARY KEY,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  booking_ids INTEGER[] NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'balance', 'full')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  qr_uri TEXT,
  expires_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opn_charges_booking_ids ON opn_charges USING GIN (booking_ids);
