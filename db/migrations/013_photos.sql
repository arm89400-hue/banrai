-- Photos for rooms and activities, managed from the admin dashboard
-- (upload, delete, reorder; the first one is the cover). At most 6 per room
-- or activity. Also moves the farm's activities (until now hard-coded on the
-- public Activities page) into the activities table, in Thai and English,
-- and gives every room and activity its current photos as a starting set.
-- Re-runnable: every step checks before it adds.

-- ---- Activities: Thai text, a short tag and a display order ----
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS name_th TEXT,
  ADD COLUMN IF NOT EXISTS description_th TEXT,
  ADD COLUMN IF NOT EXISTS tag TEXT,
  ADD COLUMN IF NOT EXISTS tag_th TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

-- ---- Photos ----
-- `file` is a path: /uploads/... for photos uploaded in admin (served by the
-- API), /images/... for the photos that ship with the site (served by the
-- frontend).
CREATE TABLE IF NOT EXISTS photos (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  file TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT photos_one_owner CHECK ((room_id IS NULL) <> (activity_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_photos_room ON photos(room_id, position);
CREATE INDEX IF NOT EXISTS idx_photos_activity ON photos(activity_id, position);

-- Never more than 6 photos per room or activity, whatever inserts them.
CREATE OR REPLACE FUNCTION photos_max_six() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM photos
      WHERE room_id IS NOT DISTINCT FROM NEW.room_id
        AND activity_id IS NOT DISTINCT FROM NEW.activity_id) >= 6 THEN
    RAISE EXCEPTION 'A room or activity can have at most 6 photos'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'photos_max_six';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS photos_max_six ON photos;
CREATE TRIGGER photos_max_six BEFORE INSERT ON photos
  FOR EACH ROW EXECUTE FUNCTION photos_max_six();

-- ---- The farm's activities (from the public Activities page) ----
-- Older entries keep their place after these five.
UPDATE activities SET position = 100 + id
WHERE position = 0 AND name NOT IN ('Fruit picking', 'Cooking class', 'Egg collecting', 'BBQ & moo kata', 'Planting');

INSERT INTO activities (name, name_th, description, description_th, tag, tag_th, price, position)
SELECT v.name, v.name_th, v.description, v.description_th, v.tag, v.tag_th, 0, v.position
FROM (VALUES
  ('Fruit picking', 'เก็บผลไม้', 'Pick ripe fruit straight from the organic orchard', 'เลือกเก็บผลไม้สุกคาต้นจากสวนอินทรีย์', 'In season', 'ตามฤดูกาล', 1),
  ('Cooking class', 'กิจกรรมสอนทำอาหาร', NULL, NULL, 'Great for families', 'เหมาะกับครอบครัว', 2),
  ('Egg collecting', 'เก็บไข่', 'Collect fresh eggs from the coop for breakfast', 'เก็บไข่สด ๆ จากเล้า มาทำอาหารเช้า', 'Every morning', 'ทุกเช้า', 3),
  ('BBQ & moo kata', 'บาร์บีคิว & หมูกระทะ', 'Grilling under the night sky', 'ปิ้งย่างยามราตรี', 'Extra charge', 'มีค่าบริการ', 4),
  ('Planting', 'ปลูกต้นไม้', 'Plant a tree in the orchard to remember your stay', 'ลงมือปลูกต้นไม้ในสวน เป็นที่ระลึกของการมาพัก', 'Great for families', 'เหมาะกับครอบครัว', 5)
) AS v(name, name_th, description, description_th, tag, tag_th, position)
WHERE NOT EXISTS (SELECT 1 FROM activities a WHERE a.name = v.name);

-- ---- Starting photos: what the site shows today ----
-- Rooms 1-5: public/images/rooms/room-<id>-<n>.jpg (only rooms with no photos yet).
INSERT INTO photos (room_id, file, position)
SELECT r.id, '/images/rooms/room-' || r.id || '-' || n || '.jpg', n
FROM rooms r
JOIN (VALUES (1, 3), (2, 3), (3, 2), (4, 4), (5, 3)) AS c(room_id, count) ON c.room_id = r.id
CROSS JOIN LATERAL generate_series(1, c.count) AS n
WHERE NOT EXISTS (SELECT 1 FROM photos p WHERE p.room_id = r.id);

-- A room's old single image_url (if any) becomes an extra photo.
INSERT INTO photos (room_id, file, position)
SELECT r.id, r.image_url, 0
FROM rooms r
WHERE r.image_url IS NOT NULL AND r.image_url <> ''
  AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.room_id = r.id AND p.file = r.image_url)
  AND (SELECT count(*) FROM photos p WHERE p.room_id = r.id) < 6;

-- The five activities: farm photos (only activities with no photos yet).
INSERT INTO photos (activity_id, file, position)
SELECT a.id, '/images/farm/' || v.file || '.jpg', v.position
FROM (VALUES
  ('Fruit picking', 'harvest', 1), ('Fruit picking', 'booking-fruit1', 2),
  ('Fruit picking', 'booking-avocado4', 3), ('Fruit picking', 'booking-banana1', 4),
  ('Cooking class', 'booking-cook1', 1), ('Cooking class', 'booking-cook4', 2),
  ('Egg collecting', 'around-eggs', 1), ('Egg collecting', 'table-egg-pan', 2),
  ('BBQ & moo kata', 'home-bbq5', 1), ('BBQ & moo kata', 'booking-bbq5', 2),
  ('BBQ & moo kata', 'table-moo-kata', 3), ('BBQ & moo kata', 'table-grill', 4),
  ('Planting', 'around-planting', 1), ('Planting', 'booking-activity1-2', 2),
  ('Planting', 'booking-activity1-3', 3), ('Planting', 'booking-vege6', 4)
) AS v(activity, file, position)
JOIN activities a ON a.name = v.activity
WHERE NOT EXISTS (SELECT 1 FROM photos p WHERE p.activity_id = a.id);
