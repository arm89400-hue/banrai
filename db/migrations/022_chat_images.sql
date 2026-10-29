-- Photos in chat: a message can carry one image (body may then be empty).
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image TEXT;
