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
import { adminAnnouncementRouter, announcementRouter } from './routes/announcement.js';
import { adminSettingsRouter, settingsRouter } from './routes/settings.js';

const app = express();

app.use(cors());
app.use(express.json());

// Simple liveness check used by the boot/deploy scripts to confirm the
// server is up and accepting requests.
app.get('/health', (_req, res) => res.json({ ok: true }));

// Room and activity photos uploaded in admin. Every upload gets a new random
// name, so browsers may cache them for good.
app.use('/uploads', express.static(UPLOAD_DIR, { immutable: true, maxAge: '365d', index: false }));

app.use('/api/auth', authRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/pay', opnRouter);
app.use('/api/activities', activityRouter);
app.use('/api/rooms', roomRouter);
// Before /api/admin, whose catch-all routes would otherwise see these first.
app.use('/api/admin/announcements', adminAnnouncementRouter);
app.use('/api/admin/settings', adminSettingsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/announcements', announcementRouter);
app.use('/api/stay', stayRouter);
app.use('/api/chat', chatRouter);
app.use('/api/promotions', promotionRouter);
app.use('/api/settings', settingsRouter);

// Catch-all error handler: logs any error thrown/rejected by a route
// handler and responds with a generic 500 instead of leaking a stack trace.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
