import { Router } from 'express';
import { currentPromotions } from '../lib/promotions.js';

export const promotionRouter = Router();

// The promotions guests can use right now or later - public, so the room
// pages and the booking flow can show the discounted price before the
// guest logs in. The admin manages them under /api/admin/promotions.
promotionRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ promotions: await currentPromotions() });
  } catch (err) {
    next(err);
  }
});
