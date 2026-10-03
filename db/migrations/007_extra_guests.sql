-- Extra-guest pricing. A room's price is per room per night (breakfast
-- included) and covers `rooms.capacity` guests. Rooms that allow it can take
-- up to `max_extra_guests` more, each charged a flat fee per night (see
-- EXTRA_GUEST_FEE in backend/src/lib/pricing.js). Bookings record how many
-- of their guests were extra, so the total can be explained later.
-- Safe to re-run. Not needed for a brand-new database - schema.sql already
-- creates these columns.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS max_extra_guests INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS extra_guests INTEGER NOT NULL DEFAULT 0;
