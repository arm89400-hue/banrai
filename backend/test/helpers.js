import { afterAll, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { pool } from '../src/db/pool.js';
import { app } from '../src/app.js';

export { pool };
export const api = () => request(app);

export const ADMIN_EMAIL = 'admin@baanrai.test';
export const PASSWORD = 'secret123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

// Small valid image headers; the app only looks at the first bytes.
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
export const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);

const TABLES = [
  'activity_log', 'chat_messages', 'booking_notices', 'opn_charges', 'slip_payments', 'photos',
  'promotions', 'announcements', 'site_settings', 'payments', 'users', 'bookings', 'rooms', 'activities',
];

export async function resetDb() {
  await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  await pool.query(
    `INSERT INTO rooms (name, price, capacity, max_extra_guests) VALUES
       ('Father''s Room · ห้องพ่อ', 1800, 2, 2),
       ('Mother''s Room · ห้องแม่', 1800, 2, 2),
       ('Child''s Room · ห้องลูก', 1500, 2, 0)`
  );
  await pool.query(
    `INSERT INTO activities (name, name_th, price, position) VALUES ('Fruit picking', 'เก็บผลไม้', 0, 1)`
  );
}

// Resets the database before each test and closes this file's connections at the end.
export function useDb() {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await resetDb();
  });
  afterAll(() => pool.end());
}

export async function makeUser(email, { expiresAt = null, stayBookingId = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, account_expires_at, stay_booking_id)
     VALUES ($1, $2, $3, $4) RETURNING id, email`,
    [email, PASSWORD_HASH, expiresAt, stayBookingId]
  );
  return { ...rows[0], token: tokenFor(rows[0].id) };
}

export const tokenFor = (id) => jwt.sign({ sub: id }, process.env.JWT_SECRET, { expiresIn: '1h' });
export const bearer = (user) => ({ Authorization: `Bearer ${user.token}` });

export const makeAdmin = () => makeUser(ADMIN_EMAIL);
export const makeMember = (email = 'guest@example.com') => makeUser(email);

export const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// Inserts a room booking straight into the database.
export async function makeBooking({
  userId = null,
  roomId = 1,
  checkIn = day(10),
  checkOut = day(12),
  status = 'pending',
  code = null,
  groupCode = null,
  total = 3600,
  deposit = 1800,
  balancePaidAt = null,
  balanceMethod = null,
  guestName = 'Somchai',
  createdAt = null,
} = {}) {
  const { rows } = await pool.query(
    `INSERT INTO bookings (user_id, room_id, booked_for, booked_until, status, code, group_code, guests,
                           guest_name, guest_phone, total, deposit, balance_paid_at, balance_method, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 2, $8, '0812345678', $9, $10, $11, $12, coalesce($13, now()))
     RETURNING *`,
    [userId, roomId, checkIn, checkOut, status, code, groupCode, guestName, total, deposit, balancePaidAt, balanceMethod, createdAt]
  );
  return rows[0];
}

export async function bookingRow(id) {
  return (await pool.query('SELECT * FROM bookings WHERE id = $1', [id])).rows[0];
}

export async function logTypes() {
  return (await pool.query('SELECT type FROM activity_log ORDER BY id')).rows.map((r) => r.type);
}

// A stand-in for fetch: answers with each given response in turn.
export function fakeFetch(...responses) {
  const fn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce({ ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

// Lets a test make queries on checked-out connections fail (or change them).
// `wrap(sql, params, query)` decides what each query does; `query` runs it for
// real. Connections the pool takes for its own pool.query calls are left alone,
// and every connection gets its normal query back when it is released.
export function patchClients(wrap) {
  const real = pool.connect.bind(pool);
  return vi.spyOn(pool, 'connect').mockImplementation((callback) => {
    if (callback) return real(callback);
    return real().then((client) => {
      const query = client.query.bind(client);
      const release = client.release;
      client.query = (sql, params) => wrap(String(sql), params, query);
      client.release = (err) => {
        delete client.query;
        return release(err);
      };
      return client;
    });
  });
}

export const failWhen = (test) => (sql, params, query) =>
  test(sql) ? Promise.reject(new Error('boom')) : query(sql, params);

// Makes pool.query fail for queries that pass `test`, and run the rest for real.
export function failPoolQuery(test) {
  const real = pool.query.bind(pool);
  return vi.spyOn(pool, 'query').mockImplementation((sql, ...rest) =>
    test(String(sql)) ? Promise.reject(new Error('boom')) : real(sql, ...rest)
  );
}
