import { Router } from 'express';
import { pool } from '../db/pool.js';

export const contactRouter = Router();

// Stores a message from the public Contact page form. No auth required.
contactRouter.post('/', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email and message are required' });
  }

  await pool.query(
    'INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)',
    [name, email, message]
  );
  res.status(201).json({ ok: true });
});
