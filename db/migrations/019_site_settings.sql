CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_settings (key, value) VALUES (
  'contact',
  '{
    "phones": [
      {"name_th": "Jit", "name_en": "Jit", "number": "089-202-9053"},
      {"name_th": "แมว", "name_en": "Maew", "number": "081-876-2884"}
    ],
    "line": "",
    "facebook": "https://www.facebook.com/baanraikongpor.pakchong",
    "maps": "https://goo.gl/maps/EzwtcXYgctz2gkAQ6"
  }'
) ON CONFLICT (key) DO NOTHING;
