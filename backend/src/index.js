import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { bookingRouter } from './routes/booking.js';
import { opnRouter } from './routes/opn.js';
import { activityRouter } from './routes/activity.js';
import { roomRouter } from './routes/room.js';
import { adminRouter } from './routes/admin.js';
import { stayRouter } from './routes/stay.js';
import { chatRouter } from './routes/chat.js';
import { promotionRouter } from './routes/promotion.js';
import { UPLOAD_DIR } from './lib/photos.js';
import { pool } from './db/pool.js';
import { adminAnnouncementRouter, announcementRouter } from './routes/announcement.js';
import { adminSettingsRouter, settingsRouter } from './routes/settings.js';

const app = express();
app.disable('x-powered-by');

// The live site calls the API from its own address, so only the local
// dev site needs CORS. CORS_ORIGINS (comma-separated) adds more.
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/uploads', express.static(UPLOAD_DIR, { immutable: true, maxAge: '365d', index: false }));

app.use('/api/auth', authRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/pay', opnRouter);
app.use('/api/activities', activityRouter);
app.use('/api/rooms', roomRouter);
app.use('/api/admin/announcements', adminAnnouncementRouter);
app.use('/api/admin/settings', adminSettingsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/announcements', announcementRouter);
app.use('/api/stay', stayRouter);
app.use('/api/chat', chatRouter);
app.use('/api/promotions', promotionRouter);
app.use('/api/settings', settingsRouter);

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The photo is too large (8 MB at most)', reason: 'TOO_LARGE' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Small additive schema updates that must be in place before the routes run
// (same as db/migrations, safe to repeat).
pool
  .query('ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS image TEXT')
  .catch((err) => console.error('schema update failed:', err.message));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
