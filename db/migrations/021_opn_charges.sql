-- PromptPay QR payments through Opn Payments (Omise): the guest scans a QR
-- made for the exact amount and just waits; the payment is confirmed when
-- Opn reports the charge as paid - no slip needed.
--
-- One row per QR made (charge). `booking_ids` are every booking it pays for
-- (rooms booked together pay with one QR); `kind` is the payment it is
-- ('deposit', 'full' or 'balance', as in slip_payments). `settled_at` is set
-- once the payment has been recorded on the bookings, so a charge is never
-- recorded twice. Re-runnable.

CREATE TABLE IF NOT EXISTS opn_charges (
  id TEXT PRIMARY KEY,               -- Opn charge id (chrg_...)
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, -- the booking paid from
  booking_ids INTEGER[] NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('deposit', 'balance', 'full')),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | successful | failed | expired (Opn's)
  qr_uri TEXT,                       -- the QR picture Opn made
  expires_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,            -- when the payment was recorded on the bookings
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opn_charges_booking_ids ON opn_charges USING GIN (booking_ids);
