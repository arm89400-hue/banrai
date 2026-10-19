CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT,
  title_th TEXT,
  body TEXT,
  body_th TEXT,
  image TEXT,
  audience TEXT NOT NULL DEFAULT 'home',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT announcements_audience CHECK (audience IN ('home', 'booked', 'both')),
  CONSTRAINT announcements_has_title CHECK (coalesce(title, title_th) IS NOT NULL),
  CONSTRAINT announcements_dates CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_announcements_window ON announcements(starts_at, ends_at);
