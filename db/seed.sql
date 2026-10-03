-- Dev-only sample data. Running this more than once will duplicate rows
-- (rooms/activities have no unique constraint on name) - truncate first
-- if you need to re-seed a database that already has these rows.
-- The farmstay's five rooms, named for the family ("English · Thai" - the
-- site shows whichever matches the visitor's language as the title).
-- Prices are Thai Baht per room per night, breakfast included, for
-- `capacity` guests. Father's and Mother's rooms take up to 2 extra guests
-- (charged per person per night - see backend/src/lib/pricing.js).
INSERT INTO rooms (name, price, capacity, max_extra_guests)
VALUES
  ('Father''s Room · ห้องพ่อ', 1800, 2, 2),
  ('Mother''s Room · ห้องแม่', 1800, 2, 2),
  ('Child''s Room · ห้องลูก', 1500, 2, 0),
  ('Grandchild''s Room · ห้องหลาน', 1400, 2, 0),
  ('Great-grandchild''s Room · ห้องเหลน', 1200, 2, 0);

INSERT INTO activities (name, description, price)
VALUES
  ('Guided Nature Walk', 'Morning walk through the surrounding forest trails.', 10),
  ('Bicycle Rental', 'Half-day bicycle rental to explore Pak Chong.', 8);
