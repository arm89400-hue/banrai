import { Router } from 'express';
import { currentPromotions } from '../lib/promotions.js';

export const promotionRouter = Router();

promotionRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ promotions: await currentPromotions() });
  } catch (err) {
    next(err);
  }
});
