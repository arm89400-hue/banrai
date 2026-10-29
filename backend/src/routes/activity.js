import { Router } from 'express';
import { pool } from '../db/pool.js';
import { photosJson } from '../lib/photos.js';

export const activityRouter = Router();

const ACTIVITY_COLUMNS = `id, name, name_th, description, description_th, tag, tag_th, price, position,
  ${photosJson('activity_id', 'activities.id')} AS photos`;

activityRouter.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${ACTIVITY_COLUMNS} FROM activities ORDER BY position, id`);
    res.json({ activities: rows });
  } catch (err) {
    next(err);
  }
});
