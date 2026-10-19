INSERT INTO rooms (name, price, capacity, max_extra_guests)
VALUES
  ('Father''s Room · ห้องพ่อ', 1800, 2, 2),
  ('Mother''s Room · ห้องแม่', 1800, 2, 2),
  ('Child''s Room · ห้องลูก', 1500, 2, 0),
  ('Grandchild''s Room · ห้องหลาน', 1400, 2, 0),
  ('Great-grandchild''s Room · ห้องเหลน', 1200, 2, 0);

INSERT INTO activities (name, name_th, description, description_th, tag, tag_th, price, position)
VALUES
  ('Fruit picking', 'เก็บผลไม้', 'Pick ripe fruit straight from the organic orchard', 'เลือกเก็บผลไม้สุกคาต้นจากสวนอินทรีย์', 'In season', 'ตามฤดูกาล', 0, 1),
  ('Cooking class', 'กิจกรรมสอนทำอาหาร', NULL, NULL, 'Great for families', 'เหมาะกับครอบครัว', 0, 2),
  ('Egg collecting', 'เก็บไข่', 'Collect fresh eggs from the coop for breakfast', 'เก็บไข่สด ๆ จากเล้า มาทำอาหารเช้า', 'Every morning', 'ทุกเช้า', 0, 3),
  ('BBQ & moo kata', 'บาร์บีคิว & หมูกระทะ', 'Grilling under the night sky', 'ปิ้งย่างยามราตรี', 'Extra charge', 'มีค่าบริการ', 0, 4),
  ('Planting', 'ปลูกต้นไม้', 'Plant a tree in the orchard to remember your stay', 'ลงมือปลูกต้นไม้ในสวน เป็นที่ระลึกของการมาพัก', 'Great for families', 'เหมาะกับครอบครัว', 0, 5);

INSERT INTO photos (room_id, file, position)
SELECT r.id, '/images/rooms/room-' || r.id || '-' || n || '.jpg', n
FROM rooms r
JOIN (VALUES (1, 3), (2, 3), (3, 2), (4, 4), (5, 3)) AS c(room_id, count) ON c.room_id = r.id
CROSS JOIN LATERAL generate_series(1, c.count) AS n;

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
JOIN activities a ON a.name = v.activity;
