-- Dev-only sample data. Running this more than once will duplicate rows
-- (rooms/activities have no unique constraint on name) - truncate first
-- if you need to re-seed a database that already has these rows.
INSERT INTO rooms (name, description, price, capacity)
VALUES
  ('Garden View Room', 'Cozy room overlooking the garden, with a private balcony.', 45, 2),
  ('Forest Cabin', 'Detached wooden cabin surrounded by trees, quiet and private.', 65, 3),
  ('Family Suite', 'Two-bedroom suite with a shared living area, great for families.', 95, 4),
  ('Twin Room', 'Comfortable room with two single beds, great for friends traveling together.', 40, 2),
  ('Pool View Room', 'Ground floor room with direct views of the pool and garden.', 55, 2);

INSERT INTO activities (name, description, price)
VALUES
  ('Guided Nature Walk', 'Morning walk through the surrounding forest trails.', 10),
  ('Bicycle Rental', 'Half-day bicycle rental to explore Pak Chong.', 8);
