import { describe, expect, it, vi } from 'vitest';
import {
  JPEG,
  api,
  bearer,
  bookingRow,
  day,
  fakeFetch,
  logTypes,
  makeBooking,
  makeMember,
  pool,
  patchClients,
  useDb,
} from './helpers.js';

useDb();

const request = (over = {}) => ({
  rooms: [1],
  check_in: day(10),
  check_out: day(12),
  name: 'Somchai',
  phone: '081-234-5678',
  guests: 2,
  ...over,
});

const ask = (member, body) => api().post('/api/bookings/request').set(bearer(member)).send(body);

describe('booking request', () => {
  it('books one room with a 50% deposit', async () => {
    const member = await makeMember();
    const res = await ask(member, request({ email: 'g@example.com', line: 'somchai', note: 'Late', requests: ['bbq', 'nope'] }));
    expect(res.status).toBe(201);
    expect(res.body.booking).toMatchObject({ status: 'pending', total: '3600.00', deposit: '1800.00', requests: ['bbq'] });
    expect(res.body.booking.code).toMatch(/^BR-[A-Z2-9]{6}$/);
    expect(res.body).toMatchObject({ qr_pay: 'opn', test_pay: true });
    expect(await logTypes()).toEqual(['booking.requested']);
  });

  it('books several rooms as one group, with pets and a promotion on the first room', async () => {
    const member = await makeMember();
    await pool.query("INSERT INTO promotions (name, percent, starts_on, ends_on) VALUES ('Low season', 10, current_date, current_date + 60)");
    const res = await ask(member, request({ rooms: [1, 2, 1], guests: 5, pets: 1 }));
    expect(res.status).toBe(201);
    const [first, second] = res.body.bookings;
    expect(second.group_code).toBe(first.code);
    expect(first).toMatchObject({ guests: 3, pets: 1, requests: ['pets'], promo_name: 'Low season (-10%)' });
    expect(second).toMatchObject({ guests: 2, pets: 0 });
  });

  it.each([
    [{ rooms: [] }, 'MISSING_FIELDS'],
    [{ rooms: undefined, room_id: 'x' }, 'MISSING_FIELDS'],
    [{ check_in: '2026-13-45' }, 'MISSING_FIELDS'],
    [{ rooms: [1, 2, 3, 4, 5, 6] }, 'TOO_MANY_ROOMS'],
    [{ check_out: day(10) }, 'BAD_DATES'],
    [{ check_out: day(45) }, 'TOO_LONG'],
    [{ check_in: day(-5), check_out: day(-3) }, 'BAD_DATES'],
    [{ name: 'A' }, 'BAD_NAME'],
    [{ phone: '123' }, 'BAD_PHONE'],
    [{ email: 'nope' }, 'BAD_EMAIL'],
    [{ pets: -1 }, 'BAD_PETS'],
    [{ guests: 0 }, 'BAD_GUESTS'],
    [{ guests: 7 }, 'TOO_MANY_GUESTS'],
  ])('refuses a bad request %#', async (over, reason) => {
    const member = await makeMember();
    const res = await ask(member, request(over));
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe(reason);
  });

  it('works without a body or with an empty pets field', async () => {
    const member = await makeMember();
    expect((await api().post('/api/bookings/request').set(bearer(member))).body.reason).toBe('MISSING_FIELDS');
    expect((await ask(member, request({ pets: '' }))).status).toBe(201);
  });

  it('says when a room does not exist or is taken', async () => {
    const member = await makeMember();
    expect((await ask(member, request({ rooms: [99] }))).body.reason).toBe('ROOM_NOT_FOUND');
    await makeBooking({ roomId: 1, checkIn: day(9), checkOut: day(11) });
    expect((await ask(member, request())).body.reason).toBe('ROOM_TAKEN');
  });

  it('tries a new code when one is already used, and gives up after five', async () => {
    const member = await makeMember();
    let clashes = 1;
    patchClients((sql, params, query) =>
      sql.includes('INSERT INTO bookings') && clashes-- > 0
        ? Promise.reject(Object.assign(new Error('dup'), { code: '23505' }))
        : query(sql, params)
    );
    expect((await ask(member, request())).status).toBe(201);
    clashes = 5;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await ask(member, request({ rooms: [2] }))).status).toBe(500);
  });

  it('passes other database errors on', async () => {
    const member = await makeMember();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    patchClients((sql, params, query) =>
      (sql.includes('INSERT') ? Promise.reject(new Error('boom')) : query(sql, params))
    );
    expect((await ask(member, request())).status).toBe(500);
  });
});

describe('my bookings', () => {
  it('lists my bookings and notices, and lets me dismiss a notice', async () => {
    const member = await makeMember();
    await makeBooking({ userId: member.id });
    const { rows } = await pool.query(
      "INSERT INTO booking_notices (user_id, code, booked, check_in, check_out, reason) VALUES ($1, 'BR-1', 'Room', current_date, current_date + 1, 'Closed') RETURNING id",
      [member.id]
    );
    const res = await api().get('/api/bookings').set(bearer(member));
    expect(res.body.bookings).toHaveLength(1);
    expect(res.body.bookings[0]).toMatchObject({ deposit_due: '1800.00', slip_status: null });
    expect(res.body.notices).toHaveLength(1);
    expect((await api().delete(`/api/bookings/notices/${rows[0].id}`).set(bearer(member))).body).toEqual({ ok: true });
    expect((await api().delete(`/api/bookings/notices/${rows[0].id}`).set(bearer(member))).status).toBe(404);
    expect((await api().delete('/api/bookings/notices/abc').set(bearer(member))).status).toBe(404);
  });
});

describe('test payments (PassPay)', () => {
  it('confirms a deposit, then takes the balance', async () => {
    const member = await makeMember();
    const b = await makeBooking({ userId: member.id, code: 'BR-PAY001' });
    const dep = await api().post(`/api/bookings/${b.id}/pass-pay`).set(bearer(member));
    expect(dep.body.booking).toMatchObject({ status: 'confirmed', stay_username: 'BR-PAY001' });
    const bal = await api().post(`/api/bookings/${b.id}/pass-pay?kind=balance`).set(bearer(member));
    expect(bal.body.booking.balance_paid_at).toBeTruthy();
    expect(await logTypes()).toEqual(['booking.confirmed', 'booking.balance_paid']);
    const again = await api().post(`/api/bookings/${b.id}/pass-pay?kind=balance`).set(bearer(member));
    expect(again.body.reason).toBe('BALANCE_NOT_DUE');
  });

  it('pays in full in one go', async () => {
    const member = await makeMember();
    const b = await makeBooking({ userId: member.id });
    const res = await api().post(`/api/bookings/${b.id}/pass-pay?kind=full`).set(bearer(member));
    expect(res.body.booking).toMatchObject({ status: 'confirmed', balance_method: 'online' });
  });

  it("refuses another person's or an unknown booking", async () => {
    const member = await makeMember();
    const other = await makeMember('other@example.com');
    const b = await makeBooking({ userId: other.id });
    expect((await api().post(`/api/bookings/${b.id}/pass-pay`).set(bearer(member))).status).toBe(404);
    expect((await api().post('/api/bookings/abc/pass-pay').set(bearer(member))).status).toBe(404);
    const paid = await makeBooking({ userId: member.id, roomId: 2, status: 'confirmed' });
    expect((await api().post(`/api/bookings/${paid.id}/pass-pay`).set(bearer(member))).body.reason).toBe('NOT_PENDING');
  });

  it('rolls back when the database fails', async () => {
    const member = await makeMember();
    const b = await makeBooking({ userId: member.id });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    patchClients((sql, params, query) =>
      (sql.startsWith('UPDATE bookings') ? Promise.reject(new Error('boom')) : query(sql, params))
    );
    expect((await api().post(`/api/bookings/${b.id}/pass-pay`).set(bearer(member))).status).toBe(500);
    expect((await bookingRow(b.id)).status).toBe('pending');
  });

  it('is turned off when PAYMENT_TEST_MODE is false', async () => {
    vi.resetModules();
    process.env.PAYMENT_TEST_MODE = 'false';
    try {
      const { app } = await import('../src/app.js');
      const supertest = (await import('supertest')).default;
      const member = await makeMember();
      expect((await supertest(app).post('/api/bookings/1/pass-pay').set(bearer(member))).status).toBe(403);
    } finally {
      delete process.env.PAYMENT_TEST_MODE;
    }
  });
});

describe('bank slips', () => {
  const slipok = (data) => ({ body: { success: true, data: { success: true, ...data } } });
  const send = (member, id, kind = 'deposit', body = JPEG) =>
    api().post(`/api/bookings/${id}/slip?kind=${kind}`).set(bearer(member)).set('Content-Type', 'image/jpeg').send(body);

  async function setup() {
    const member = await makeMember();
    const b = await makeBooking({ userId: member.id, createdAt: new Date(Date.now() - 3_600_000) });
    return { member, b };
  }

  it('confirms the booking when SlipOK checks the slip', async () => {
    const { member, b } = await setup();
    fakeFetch(slipok({ amount: 1800, transRef: 'REF1', transTimestamp: new Date().toISOString() }));
    const res = await send(member, b.id);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('confirmed');
    const slip = (await pool.query('SELECT status, trans_ref FROM slip_payments')).rows[0];
    expect(slip).toEqual({ status: 'verified', trans_ref: 'REF1' });
  });

  it('refuses a slip used before', async () => {
    const { member, b } = await setup();
    const other = await makeBooking({ userId: member.id, roomId: 2, status: 'confirmed' });
    await pool.query(
      "INSERT INTO slip_payments (booking_id, booking_ids, kind, status, trans_ref, expected) VALUES ($1, ARRAY[$1::int], 'deposit', 'verified', 'REF1', 1800)",
      [other.id]
    );
    fakeFetch(slipok({ amount: 1800, transRef: 'REF1', transTimestamp: new Date().toISOString() }));
    expect((await send(member, b.id)).body.reason).toBe('SLIP_DUPLICATE');
  });

  it.each([
    [{ amount: 900, transRef: 'R' }, 'SLIP_AMOUNT'],
    [{ amount: 1800, transRef: '' }, 'SLIP_NOT_FOUND'],
    [{ amount: 1800, transRef: 'R', transTimestamp: '2000-01-01T00:00:00Z' }, 'SLIP_OLD'],
  ])('rejects a slip that does not fit %#', async (data, reason) => {
    const { member, b } = await setup();
    fakeFetch(slipok(data));
    const res = await send(member, b.id);
    expect(res.status).toBe(422);
    expect(res.body.reason).toBe(reason);
  });

  it('rejects a slip SlipOK refuses', async () => {
    const { member, b } = await setup();
    fakeFetch({ ok: false, status: 400, body: { code: 1014 } });
    expect((await send(member, b.id)).body.reason).toBe('SLIP_RECEIVER');
  });

  it('sends the slip for a check by hand when SlipOK itself has a problem', async () => {
    const { member, b } = await setup();
    fakeFetch({ ok: false, status: 400, body: { code: 1003 } });
    const res = await send(member, b.id);
    expect(res.status).toBe(202);
    expect(res.body.review).toBe(true);
    expect(await logTypes()).toEqual(['booking.slip_sent']);
  });

  it('refuses unreadable files, unknown bookings and too many tries', async () => {
    const { member, b } = await setup();
    expect((await send(member, b.id, 'deposit', Buffer.from('not an image at all'))).body.reason).toBe('SLIP_UNREADABLE');
    expect((await send(member, 'abc')).status).toBe(404);
    expect((await send(member, 999)).status).toBe(404);
    await pool.query(
      `INSERT INTO slip_payments (booking_id, booking_ids, kind, status, expected)
       SELECT $1, ARRAY[$1::int], 'deposit', 'rejected', 1800 FROM generate_series(1, 8)`,
      [b.id]
    );
    expect((await send(member, b.id)).body.reason).toBe('SLIP_TOO_MANY');
  });

  it('rejects the slip if the amount owed changed while it was being checked', async () => {
    const { member, b } = await setup();
    const fetch = vi.fn(async () => {
      await pool.query('UPDATE bookings SET deposit = 1000 WHERE id = $1', [b.id]);
      return { ok: true, json: async () => slipok({ amount: 1800, transRef: 'R2' }).body };
    });
    vi.stubGlobal('fetch', fetch);
    expect((await send(member, b.id)).body.reason).toBe('SLIP_AMOUNT');
  });

  it('says nothing is owed if the booking was paid meanwhile', async () => {
    const { member, b } = await setup();
    vi.stubGlobal('fetch', async () => {
      await pool.query("UPDATE bookings SET status = 'confirmed' WHERE id = $1", [b.id]);
      return { ok: true, json: async () => slipok({ amount: 1800, transRef: 'R3' }).body };
    });
    expect((await send(member, b.id)).body.reason).toBe('NOT_PENDING');
  });

  it('pays the balance by slip', async () => {
    const member = await makeMember();
    const b = await makeBooking({ userId: member.id, status: 'confirmed' });
    fakeFetch(slipok({ amount: 1800, transRef: 'BAL1' }));
    const res = await send(member, b.id, 'balance');
    expect(res.body.booking.balance_paid_at).toBeTruthy();
    expect((await send(member, b.id, 'balance')).body.reason).toBe('BALANCE_NOT_DUE');
  });

  it('rolls back on a database error while confirming', async () => {
    const { member, b } = await setup();
    fakeFetch(slipok({ amount: 1800, transRef: 'R4' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    patchClients((sql, params, query) =>
      sql.includes('INSERT INTO slip_payments') ? Promise.reject(new Error('boom')) : query(sql, params)
    );
    expect((await send(member, b.id)).status).toBe(500);
  });

  it('sends every slip for a check by hand when SlipOK is not set up', async () => {
    vi.resetModules();
    const key = process.env.SLIPOK_API_KEY;
    delete process.env.SLIPOK_API_KEY;
    try {
      const { app } = await import('../src/app.js');
      const supertest = (await import('supertest')).default;
      const { member, b } = await setup();
      const res = await supertest(app)
        .post(`/api/bookings/${b.id}/slip`)
        .set(bearer(member))
        .set('Content-Type', 'image/jpeg')
        .send(JPEG);
      expect(res.status).toBe(202);
    } finally {
      process.env.SLIPOK_API_KEY = key;
    }
  });
});
