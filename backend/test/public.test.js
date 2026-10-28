import { describe, expect, it, vi } from 'vitest';
import { JPEG, api, bearer, day, makeAdmin, makeBooking, makeMember, makeUser, pool, useDb } from './helpers.js';

useDb();

describe('the app', () => {
  it('answers a health check and hides the Express header', async () => {
    const res = await api().get('/health');
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows the local site by CORS and no other site', async () => {
    const local = await api().get('/health').set('Origin', 'http://localhost:5173');
    expect(local.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const other = await api().get('/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('turns unexpected errors into a plain 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('db down'));
    const res = await api().get('/api/activities');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  it('refuses photos over 8 MB', async () => {
    const member = await makeMember();
    const big = Buffer.concat([JPEG, Buffer.alloc(8 * 1024 * 1024)]);
    const res = await api().post('/api/chat/image').set(bearer(member)).set('Content-Type', 'image/jpeg').send(big);
    expect(res.status).toBe(413);
    expect(res.body.reason).toBe('TOO_LARGE');
  });

  it('reads extra CORS sites from CORS_ORIGINS', async () => {
    vi.resetModules();
    process.env.CORS_ORIGINS = 'https://a.example, ,https://b.example';
    try {
      const { app } = await import('../src/app.js');
      const request = (await import('supertest')).default;
      const res = await request(app).get('/health').set('Origin', 'https://b.example');
      expect(res.headers['access-control-allow-origin']).toBe('https://b.example');
    } finally {
      delete process.env.CORS_ORIGINS;
    }
  });
});

describe('rooms', () => {
  it('lists every room with the prices for extras', async () => {
    const res = await api().get('/api/rooms');
    expect(res.body.rooms).toHaveLength(3);
    expect(res.body).toMatchObject({ extra_guest_fee: 500, pet_fee: 100, pet_max_kg: 20 });
  });

  it('lists only rooms free for the dates', async () => {
    await makeBooking({ roomId: 1, checkIn: day(10), checkOut: day(12) });
    await makeBooking({ roomId: 2, checkIn: day(10), checkOut: day(12), status: 'cancelled' });
    const res = await api().get('/api/rooms').query({ checkIn: day(11), checkOut: day(13) });
    expect(res.body.rooms.map((r) => r.id).sort()).toEqual([2, 3]);
  });

  it('checks the dates', async () => {
    expect((await api().get('/api/rooms').query({ checkIn: 'x', checkOut: day(2) })).status).toBe(400);
    const back = await api().get('/api/rooms').query({ checkIn: day(3), checkOut: day(3) });
    expect(back.body.error).toMatch(/after/);
  });

  it('shows one room, or 404', async () => {
    expect((await api().get('/api/rooms/1')).body.room.id).toBe(1);
    expect((await api().get('/api/rooms/99')).status).toBe(404);
    expect((await api().get('/api/rooms/abc')).status).toBe(404);
  });

  it('lists the booked dates of a room', async () => {
    await makeBooking({ roomId: 1, checkIn: '2099-01-10', checkOut: '2099-01-12' });
    const res = await api().get('/api/rooms/1/booked');
    expect(res.body.booked).toEqual([{ check_in: '2099-01-10', check_out: '2099-01-12' }]);
    expect((await api().get('/api/rooms/x/booked')).status).toBe(404);
  });

  it('passes database errors on for booked dates', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('db down'));
    expect((await api().get('/api/rooms/1/booked')).status).toBe(500);
  });
});

describe('activities and promotions', () => {
  it('lists activities with their photos', async () => {
    const res = await api().get('/api/activities');
    expect(res.body.activities[0]).toMatchObject({ name: 'Fruit picking', photos: [] });
  });

  it('lists current promotions', async () => {
    await pool.query("INSERT INTO promotions (name, percent, starts_on, ends_on) VALUES ('Rainy', 15, current_date, current_date + 3)");
    const res = await api().get('/api/promotions');
    expect(res.body.promotions).toEqual([expect.objectContaining({ name: 'Rainy', percent: 15 })]);
  });

  it('passes database errors on for promotions', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('db down'));
    expect((await api().get('/api/promotions')).status).toBe(500);
  });
});

describe('contact settings', () => {
  const good = {
    phones: [{ name_th: 'จิต', number: '089-202-9053' }, { name_en: 'Maew', number: '+66 81 876 2884' }, { number: '' }],
    line: '@baanrai',
    facebook: 'https://facebook.com/baanrai',
    maps: 'https://maps.example/x',
  };

  it('has no contact until the admin saves one', async () => {
    expect((await api().get('/api/settings/contact')).body).toEqual({ contact: null });
  });

  it('saves the contact, filling a missing name from the other language', async () => {
    const admin = await makeAdmin();
    const res = await api().put('/api/admin/settings/contact').set(bearer(admin)).send(good);
    expect(res.status).toBe(200);
    expect(res.body.contact.phones).toEqual([
      { name_th: 'จิต', name_en: 'จิต', number: '089-202-9053' },
      { name_th: 'Maew', name_en: 'Maew', number: '+66 81 876 2884' },
    ]);
    expect((await api().get('/api/settings/contact')).body.contact.line).toBe('@baanrai');
  });

  it.each([
    [{ phones: [] }, /at least one/],
    [{ phones: Array.from({ length: 7 }, () => ({ name_en: 'A', number: '0812345678' })) }, /At most 6/],
    [{ phones: [{ name_en: 'A', number: '12' }] }, /doesn't look like/],
    [{ phones: [{ name_en: 'A', number: '08x2345678' }] }, /doesn't look like/],
    [{ phones: [{ number: '0812345678' }] }, /Add a name/],
    [{ ...good, facebook: 'facebook.com/x' }, /Facebook/],
    [{ ...good, maps: 'maps' }, /Google Maps/],
  ])('refuses a bad contact %#', async (body, error) => {
    const admin = await makeAdmin();
    const res = await api().put('/api/admin/settings/contact').set(bearer(admin)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(error);
  });

  it('copes with no body at all', async () => {
    const admin = await makeAdmin();
    expect((await api().put('/api/admin/settings/contact').set(bearer(admin))).status).toBe(400);
  });
});

describe('announcements', () => {
  async function announce(audience, extra = '') {
    await pool.query(
      `INSERT INTO announcements (title, audience, starts_at, ends_at, active) VALUES ($1, $2, now() - interval '1 hour', NULL, true)${extra}`,
      [`For ${audience}`, audience]
    );
  }

  it('shows home and both on the home page', async () => {
    await announce('home');
    await announce('booked');
    await announce('both');
    const res = await api().get('/api/announcements/home');
    expect(res.body.announcements.map((a) => a.title).sort()).toEqual(['For both', 'For home']);
  });

  it('shows booked notices only to guests with a booking', async () => {
    await announce('booked');
    const member = await makeMember();
    expect((await api().get('/api/announcements/mine').set(bearer(member))).body.announcements).toEqual([]);
    await makeBooking({ userId: member.id });
    expect((await api().get('/api/announcements/mine').set(bearer(member))).body.announcements).toHaveLength(1);
    const b = await makeBooking({ roomId: 2 });
    const room = await makeUser('BR-ROOM', { stayBookingId: b.id });
    expect((await api().get('/api/announcements/mine').set(bearer(room))).body.announcements).toHaveLength(1);
  });
});

describe('admin announcements', () => {
  const base = { title: 'Pool closed', audience: 'both', body: 'Cleaning' };

  it('creates, lists, edits and deletes announcements', async () => {
    const admin = await makeAdmin();
    const made = await api().post('/api/admin/announcements').set(bearer(admin)).send(base);
    expect(made.status).toBe(201);
    const id = made.body.announcement.id;
    expect((await api().get('/api/admin/announcements').set(bearer(admin))).body.announcements).toHaveLength(1);
    const edited = await api()
      .put(`/api/admin/announcements/${id}`)
      .set(bearer(admin))
      .send({ ...base, title_th: 'สระปิด', active: false, starts_at: '2026-01-01T00:00:00Z', ends_at: '2026-01-02T00:00:00Z' });
    expect(edited.body.announcement).toMatchObject({ title_th: 'สระปิด', active: false });
    await pool.query("INSERT INTO photos (announcement_id, file) VALUES ($1, '/uploads/a.jpg')", [id]);
    expect((await api().delete(`/api/admin/announcements/${id}`).set(bearer(admin))).body).toEqual({ ok: true });
    expect((await api().delete(`/api/admin/announcements/${id}`).set(bearer(admin))).status).toBe(404);
  });

  it.each([
    [{ audience: 'both' }, /title/],
    [{ title: 'x', audience: 'nobody' }, /who sees/],
    [{ title: 'x', audience: 'home', starts_at: 'soon' }, /start time/],
    [{ title: 'x', audience: 'home', ends_at: 'later' }, /end time/],
    [{ title: 'x', audience: 'home', starts_at: '2026-01-02', ends_at: '2026-01-01' }, /after the start/],
  ])('refuses a bad announcement %#', async (body, error) => {
    const admin = await makeAdmin();
    const res = await api().post('/api/admin/announcements').set(bearer(admin)).send(body);
    expect(res.body.error).toMatch(error);
  });

  it('answers 404 for unknown or bad ids, and 400 for a bad edit', async () => {
    const admin = await makeAdmin();
    expect((await api().put('/api/admin/announcements/x').set(bearer(admin)).send(base)).status).toBe(404);
    expect((await api().put('/api/admin/announcements/5').set(bearer(admin)).send(base)).status).toBe(404);
    expect((await api().put('/api/admin/announcements/5').set(bearer(admin)).send({})).status).toBe(400);
    expect((await api().delete('/api/admin/announcements/x').set(bearer(admin))).status).toBe(404);
    expect((await api().post('/api/admin/announcements').set(bearer(admin))).status).toBe(400);
  });
});

describe('guest chat', () => {
  it('keeps admins out', async () => {
    const admin = await makeAdmin();
    expect((await api().get('/api/chat').set(bearer(admin))).body.reason).toBe('ADMIN_ACCOUNT');
  });

  it('sends messages and photos, and marks replies read', async () => {
    const member = await makeMember();
    expect((await api().post('/api/chat').set(bearer(member)).send({ body: '  ' })).status).toBe(400);
    expect((await api().post('/api/chat').set(bearer(member)).send({ body: 'x'.repeat(2001) })).status).toBe(400);
    expect((await api().post('/api/chat').set(bearer(member)).send({ body: 'Hello' })).status).toBe(201);

    const photo = await api().post('/api/chat/image?text=%20Look%20').set(bearer(member)).set('Content-Type', 'image/jpeg').send(JPEG);
    expect(photo.status).toBe(201);
    expect(photo.body.message).toMatchObject({ body: 'Look', image: expect.stringMatching(/^\/uploads\/chat-/) });
    const bad = await api().post('/api/chat/image').set(bearer(member)).set('Content-Type', 'image/gif').send(Buffer.from('GIF89a........'));
    expect(bad.body.reason).toBe('BAD_IMAGE');

    await pool.query("INSERT INTO chat_messages (user_id, from_admin, body) VALUES ($1, true, 'Hi')", [member.id]);
    expect((await api().get('/api/chat/unread').set(bearer(member))).body).toEqual({ unread: 1 });
    expect((await api().get('/api/chat').set(bearer(member))).body.messages).toHaveLength(3);
    expect((await api().get('/api/chat/unread').set(bearer(member))).body).toEqual({ unread: 0 });
  });
});

describe('stay page', () => {
  it('is for guests, not admins', async () => {
    const admin = await makeAdmin();
    expect((await api().get('/api/stay').set(bearer(admin))).body.reason).toBe('ADMIN_ACCOUNT');
  });

  it('shows nothing without a confirmed stay', async () => {
    const member = await makeMember();
    await makeBooking({ userId: member.id });
    expect((await api().get('/api/stay').set(bearer(member))).body).toEqual({ stay: null, rooms: [] });
  });

  it('shows a member every room of the group and what is left to pay', async () => {
    const member = await makeMember();
    await makeBooking({ userId: member.id, status: 'confirmed', code: 'BR-S1', groupCode: 'BR-S1' });
    await makeBooking({ userId: member.id, roomId: 2, status: 'confirmed', code: 'BR-S2', groupCode: 'BR-S1', balancePaidAt: new Date() });
    const res = await api().get('/api/stay').set(bearer(member));
    expect(res.body.rooms).toHaveLength(2);
    expect(res.body.stay).toMatchObject({ code: 'BR-S1', balance_due: 1800 });
  });

  it('shows a room account its own booking', async () => {
    const b = await makeBooking({ status: 'confirmed', code: 'BR-R1' });
    const room = await makeUser('BR-R1', { stayBookingId: b.id, expiresAt: day(30) });
    const res = await api().get('/api/stay').set(bearer(room));
    expect(res.body.stay).toMatchObject({ code: 'BR-R1', expires_at: expect.any(String) });
  });

  it('passes database errors on', async () => {
    const member = await makeMember();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const real = pool.query.bind(pool);
    vi.spyOn(pool, 'query').mockImplementation((sql, ...rest) =>
      String(sql).includes('WITH lead') ? Promise.reject(new Error('db down')) : real(sql, ...rest)
    );
    expect((await api().get('/api/stay').set(bearer(member))).status).toBe(500);
  });
});
