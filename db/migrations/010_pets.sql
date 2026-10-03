-- Pets. Guests may bring any number of pets (each up to 20 kg); every pet is
-- charged a flat fee per night (see PET_FEE in backend/src/lib/pricing.js).
-- A booking records how many pets are coming so its total can be explained.
-- Safe to re-run. Not needed for a brand-new database - schema.sql already
-- creates this column.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pets INTEGER NOT NULL DEFAULT 0;
