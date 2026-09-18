import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { paymentRouter } from './routes/payment.js';
import { bookingRouter } from './routes/booking.js';
import { activityRouter } from './routes/activity.js';
import { roomRouter } from './routes/room.js';
import { contactRouter } from './routes/contact.js';

const app = express();

app.use(cors());
app.use(express.json());

// Simple liveness check used by the boot/deploy scripts to confirm the
// server is up and accepting requests.
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/activities', activityRouter);
app.use('/api/rooms', roomRouter);
app.use('/api/contact', contactRouter);

// Catch-all error handler: logs any error thrown/rejected by a route
// handler and responds with a generic 500 instead of leaking a stack trace.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
