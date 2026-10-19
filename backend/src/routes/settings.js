import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { logEvent } from '../lib/activityLog.js';

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const MAX_PHONES = 6;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const isUrl = (v) => /^https?:\/\/\S+$/i.test(v);

function readContact(body) {
  const phones = (Array.isArray(body.phones) ? body.phones : [])
    .map((p) => ({ name_th: text(p?.name_th, 40), name_en: text(p?.name_en, 40), number: text(p?.number, 30) }))
    .filter((p) => p.number);
  if (phones.length === 0) return { error: 'Add at least one phone number' };
  if (phones.length > MAX_PHONES) return { error: `At most ${MAX_PHONES} phone numbers` };
  for (const p of phones) {
    const digits = p.number.replace(/\D/g, '');
    if (!/^[\d\s()+-]+$/.test(p.number) || digits.length < 9 || digits.length > 15) {
      return { error: `"${p.number}" doesn't look like a phone number` };
    }
    if (!p.name_th && !p.name_en) return { error: `Add a name for ${p.number}` };
    p.name_th ||= p.name_en;
    p.name_en ||= p.name_th;
  }
  const value = { phones, line: text(body.line, 40), facebook: text(body.facebook, 300), maps: text(body.maps, 300) };
  if (value.facebook && !isUrl(value.facebook)) return { error: 'The Facebook link must start with https://' };
  if (value.maps && !isUrl(value.maps)) return { error: 'The Google Maps link must start with https://' };
  return { value };
}

async function readSetting(key) {
  const { rows } = await pool.query('SELECT value FROM site_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

export const settingsRouter = Router();

settingsRouter.get(
  '/contact',
  wrap(async (_req, res) => {
    res.json({ contact: await readSetting('contact') });
  })
);

export const adminSettingsRouter = Router();
adminSettingsRouter.use(requireAuth, requireAdmin);

adminSettingsRouter.put(
  '/contact',
  wrap(async (req, res) => {
    const { error, value } = readContact(req.body ?? {});
    if (error) return res.status(400).json({ error });
    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at) VALUES ('contact', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(value)]
    );
    await logEvent('settings.contact', { actor: req.user.email, details: { phones: value.phones.length } });
    res.json({ contact: value });
  })
);
