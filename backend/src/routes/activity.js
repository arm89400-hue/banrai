import { Router } from 'express';
import { pool } from '../db/pool.js';

export const activityRouter = Router();

// Lists every activity, alphabetically. Public - no auth required.
activityRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, description, price FROM activities ORDER BY name'
  );
  res.json({ activities: rows });
});

// Fetches a single activity by id, or 404 if it doesn't exist.
activityRouter.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, description, price FROM activities WHERE id = $1',
    [req.params.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ error: 'Activity not found' });
  }
  res.json({ activity: rows[0] });
});
