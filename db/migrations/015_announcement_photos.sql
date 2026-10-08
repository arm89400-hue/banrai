-- Announcements get up to 6 photos, like rooms and activities, in the shared
-- photos table (the first is the cover). Moves each announcement's old single
-- `image` into it. Re-runnable.

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS announcement_id INTEGER REFERENCES announcements(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_photos_announcement ON photos(announcement_id, position);

-- Exactly one owner: a room, an activity or an announcement.
ALTER TABLE photos DROP CONSTRAINT IF EXISTS photos_one_owner;
ALTER TABLE photos ADD CONSTRAINT photos_one_owner
  CHECK (num_nonnulls(room_id, activity_id, announcement_id) = 1);

-- Never more than 6 photos per owner, whatever inserts them.
CREATE OR REPLACE FUNCTION photos_max_six() RETURNS trigger AS $$
BEGIN
  IF (SELECT count(*) FROM photos
      WHERE room_id IS NOT DISTINCT FROM NEW.room_id
        AND activity_id IS NOT DISTINCT FROM NEW.activity_id
        AND announcement_id IS NOT DISTINCT FROM NEW.announcement_id) >= 6 THEN
    RAISE EXCEPTION 'A room, activity or announcement can have at most 6 photos'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'photos_max_six';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The old single picture becomes the first photo.
INSERT INTO photos (announcement_id, file, position)
SELECT a.id, a.image, 1
FROM announcements a
WHERE a.image IS NOT NULL AND a.image <> ''
  AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.announcement_id = a.id AND p.file = a.image);
UPDATE announcements SET image = NULL WHERE image IS NOT NULL;
