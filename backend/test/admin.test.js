import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JPEG,
  PNG,
  api,
  bearer,
  bookingRow,
  day,
  failPoolQuery,
  failWhen,
  logTypes,
  makeAdmin,
  makeBooking,
  makeMember,
  makeUser,
  patchClients,
  pool,
  useDb,
} from './helpers.js';

useDb();

let admin;
beforeEach(async () => {
  admin = await makeAdmin();
});

const as = () => bearer(admin);
const slip = async (bookingIds, kind = 'deposit', status = 'review') =>
  (
    await pool.query(
      `INSERT INTO slip_payments (booking_id, booking_ids, kind, status, expected, slip_file)
       VALUES ($1, $2, $3, $4, 1800, '/uploads/s.jpg') RETURNING id`,
      [bookingIds[0], bookingIds, kind, status]
    )
  ).rows[0].id;

describe('overview', () => {
  it('counts what needs doing', async () => {
    const member = await makeMember();
    const b = await makeBooking({ userId: member.id });
    await makeBooking({ roomId: 2, status: 'confirmed', checkIn: day(0), checkOut: day(2) });
    await slip([b.id]);
    await pool.query("INSERT INTO chat_messages (user_id, from_admin, body) VALUES ($1, false, 'Hi')", [member.id]);
    const res = await api().get('/api/admin/stats').set(as());
    expect(res.body.stats).toMatchObject({
      users: 2,
      rooms: 3,
      bookings: 2,
      pending_bookings: 1,
      unread_chats: 1,
      waiting_chats: 1,
      slips_to_review: 1,
    });
    expect(res.body.payment_setup.opn).toBe('test');
  });

  it('lists bookings with their slips and member codes, and the people', async () => {
    const member = await makeMember();
    const b = await makeBooking({ userId: member.id });
    await makeBooking({ roomId: 2 });
    await slip([b.id]);
    await slip([b.id], 'balance');
    const list = (await api().get('/api/admin/bookings').set(as())).body.bookings;
    const mine = list.find((x) => x.id === b.id);
    expect(mine).toMatchObject({ member_code: 'M00002', slip_status: 'review', balance_slip_status: 'review', slip_count: 1 });
    expect(list.find((x) => x.id !== b.id).member_code).toBeNull();
    const users = (await api().get('/api/admin/users').set(as())).body.users;
    expect(users.find((u) => u.email === 'admin@baanrai.test').is_admin).toBe(true);
    expect((await api().get('/api/admin/log').set(as())).body.log).toEqual([]);
  });
});

describe('booking status', () => {
  const setStatus = (id, status) => api().patch(`/api/admin/bookings/${id}`).set(as()).send({ status });

  it('confirms a booking: makes the room login and accepts a waiting slip', async () => {
    const b = await makeBooking({ code: 'BR-ADM001' });
    await slip([b.id], 'full');
    const res = await setStatus(b.id, 'confirmed');
    expect(res.body.booking).toMatchObject({ status: 'confirmed', stay_username: 'BR-ADM001' });
    expect((await bookingRow(b.id)).balance_method).toBe('online');
    expect((await pool.query('SELECT status FROM slip_payments')).rows[0].status).toBe('verified');
    expect(await logTypes()).toEqual(['booking.confirmed']);
  });

  it('cancels and re-opens a booking, removing the room login', async () => {
    const b = await makeBooking({ code: 'BR-ADM002', status: 'confirmed' });
    await setStatus(b.id, 'confirmed');
    await slip([b.id]);
    expect((await setStatus(b.id, 'cancelled')).body.booking.status).toBe('cancelled');
    expect((await pool.query('SELECT count(*)::int AS n FROM users WHERE stay_booking_id = $1', [b.id])).rows[0].n).toBe(0);
    expect((await setStatus(b.id, 'pending')).body.booking.status).toBe('pending');
    expect(await logTypes()).toEqual(['booking.cancelled', 'booking.reopened']);
  });

  it('will not re-open a booking whose dates were taken meanwhile', async () => {
    const b = await makeBooking({ status: 'cancelled' });
    await makeBooking({ status: 'pending' });
    expect((await setStatus(b.id, 'pending')).status).toBe(409);
  });

  it('checks the status and the booking', async () => {
    expect((await setStatus(1, 'done')).status).toBe(400);
    expect((await setStatus(999, 'confirmed')).status).toBe(404);
  });

  it('passes other database errors on', async () => {
    const b = await makeBooking();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    patchClients(failWhen((sql) => sql.startsWith('UPDATE bookings SET status')));
    expect((await setStatus(b.id, 'confirmed')).status).toBe(500);
  });
});

describe('deleting a booking', () => {
  const remove = (id, reason) => api().delete(`/api/admin/bookings/${id}`).set(as()).send({ reason });

  it('deletes it and tells the member why', async () => {
    const member = await makeMember();
    const b = await makeBooking({ userId: member.id, code: 'BR-DEL001' });
    const res = await remove(b.id, 'Flooded road');
    expect(res.body).toEqual({ ok: true, notified: true });
    const notice = (await pool.query('SELECT code, reason FROM booking_notices')).rows[0];
    expect(notice).toEqual({ code: 'BR-DEL001', reason: 'Flooded road' });
    expect((await pool.query('SELECT body FROM chat_messages')).rows[0].body).toContain('Flooded road');
  });

  it('deletes a walk-in booking without telling anyone', async () => {
    const b = await makeBooking();
    expect((await remove(b.id, 'Mistake')).body.notified).toBe(false);
  });

  it('needs a reason and a real booking', async () => {
    expect((await remove(1, 'no')).body.reason).toBe('BAD_REASON');
    expect((await remove('x', 'Because')).status).toBe(404);
    expect((await remove(999, 'Because')).status).toBe(404);
  });

  it('rolls back on a database error', async () => {
    const b = await makeBooking();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    patchClients(failWhen((sql) => sql.startsWith('DELETE FROM bookings')));
    expect((await remove(b.id, 'Because')).status).toBe(500);
    expect(await bookingRow(b.id)).toBeTruthy();
  });
});

describe('rooms and activities', () => {
  it('adds, edits and deletes a room', async () => {
    const made = await api()
      .post('/api/admin/rooms')
      .set(as())
      .send({ name: 'Barn', description: ' Big ', price: '900', capacity: '4', max_extra_guests: '2', image_url: '/x.jpg' });
    expect(made.status).toBe(201);
    expect(made.body.room).toMatchObject({ name: 'Barn', description: 'Big', capacity: 4, photos: [] });
    const id = made.body.room.id;
    const edited = await api().put(`/api/admin/rooms/${id}`).set(as()).send({ name: 'Big barn', price: 950, capacity: '' });
    expect(edited.body.room).toMatchObject({ name: 'Big barn', capacity: null, max_extra_guests: 0 });
    await pool.query("INSERT INTO photos (room_id, file) VALUES ($1, '/uploads/r.jpg')", [id]);
    expect((await api().delete(`/api/admin/rooms/${id}`).set(as())).body).toEqual({ ok: true });
    expect((await api().delete(`/api/admin/rooms/${id}`).set(as())).status).toBe(404);
    expect((await api().delete('/api/admin/rooms/x').set(as())).status).toBe(404);
    expect((await api().put('/api/admin/rooms/999').set(as()).send({ name: 'A', price: 1 })).status).toBe(404);
  });

  it.each([
    [{ price: 1 }, /name/],
    [{ name: 'A', price: -1 }, /price/],
    [{ name: 'A', price: 1, capacity: 0 }, /capacity/],
    [{ name: 'A', price: 1, max_extra_guests: 11 }, /extra guests/],
  ])('refuses a bad room %#', async (body, error) => {
    expect((await api().post('/api/admin/rooms').set(as()).send(body)).body.error).toMatch(error);
    expect((await api().put('/api/admin/rooms/1').set(as()).send(body)).body.error).toMatch(error);
  });

  it('adds activities at the end of the list, edits and deletes them', async () => {
    const made = await api().post('/api/admin/activities').set(as()).send({ name_th: 'ปลูกผัก', tag: 'Farm' });
    expect(made.body.activity).toMatchObject({ name: 'ปลูกผัก', position: 2, price: '0.00' });
    const id = made.body.activity.id;
    const edited = await api().put(`/api/admin/activities/${id}`).set(as()).send({ name: 'Planting', price: 50, position: '0' });
    expect(edited.body.activity).toMatchObject({ name: 'Planting', position: 0 });
    expect((await api().delete(`/api/admin/activities/${id}`).set(as())).body).toEqual({ ok: true });
    expect((await api().delete(`/api/admin/activities/${id}`).set(as())).status).toBe(404);
  });

  it.each([
    [{}, /name/],
    [{ name: 'A', price: 'free' }, /price/],
    [{ name: 'A', position: -1 }, /order/],
  ])('refuses a bad activity %#', async (body, error) => {
    expect((await api().post('/api/admin/activities').set(as()).send(body)).body.error).toMatch(error);
  });

  it('answers 404 for an unknown activity', async () => {
    expect((await api().put('/api/admin/activities/x').set(as()).send({ name: 'A' })).status).toBe(404);
    expect((await api().put('/api/admin/activities/999').set(as()).send({ name: 'A' })).status).toBe(404);
    expect((await api().put('/api/admin/activities/1').set(as())).status).toBe(400);
    expect((await api().post('/api/admin/activities').set(as())).status).toBe(400);
  });
});

describe('photos', () => {
  const upload = (kind, id, body = JPEG) =>
    api().post(`/api/admin/${kind}/${id}/photos`).set(as()).set('Content-Type', 'image/jpeg').send(body);

  it('uploads photos in order, reorders and deletes them', async () => {
    await upload('rooms', 1);
    const second = await upload('rooms', 1, PNG);
    expect(second.status).toBe(201);
    const [a, b] = second.body.photos;
    const reordered = await api().put('/api/admin/rooms/1/photos/order').set(as()).send({ ids: [b.id, a.id] });
    expect(reordered.body.photos.map((p) => p.id)).toEqual([b.id, a.id]);
    const left = await api().delete(`/api/admin/photos/${b.id}`).set(as());
    expect(left.body.photos.map((p) => p.id)).toEqual([a.id]);
    expect((await api().delete(`/api/admin/photos/${b.id}`).set(as())).status).toBe(404);
    expect((await api().delete('/api/admin/photos/x').set(as())).status).toBe(404);
  });

  it('works for activities and announcements too', async () => {
    expect((await upload('activities', 1)).status).toBe(201);
    const { rows } = await pool.query("INSERT INTO announcements (title, audience) VALUES ('A', 'home') RETURNING id");
    expect((await upload('announcements', rows[0].id)).status).toBe(201);
  });

  it('stops at six photos', async () => {
    for (let i = 0; i < 6; i++) await upload('rooms', 2);
    expect((await upload('rooms', 2)).body.reason).toBe('MAX_PHOTOS');
  });

  it('refuses other files, unknown owners and a wrong order list', async () => {
    expect((await upload('rooms', 1, Buffer.from('this is not an image'))).body.reason).toBe('BAD_IMAGE');
    expect((await upload('rooms', 999)).status).toBe(404);
    expect((await upload('rooms', 'x')).status).toBe(404);
    expect((await api().put('/api/admin/rooms/x/photos/order').set(as()).send({ ids: [] })).status).toBe(404);
    await upload('rooms', 1);
    expect((await api().put('/api/admin/rooms/1/photos/order').set(as()).send({ ids: [123] })).status).toBe(400);
    expect((await api().put('/api/admin/rooms/1/photos/order').set(as())).status).toBe(400);
  });

  it('removes the saved file if the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    patchClients(failWhen((sql) => sql.startsWith('INSERT INTO photos')));
    expect((await upload('rooms', 1)).status).toBe(500);
  });
});

describe('payments by hand', () => {
  it('approves a waiting slip for every room booked together', async () => {
    const a = await makeBooking({ code: 'BR-G1', groupCode: 'BR-G1' });
    const b = await makeBooking({ roomId: 2, code: 'BR-G2', groupCode: 'BR-G1' });
    const id = await slip([a.id]);
    const older = await slip([b.id]);
    const res = await api().post(`/api/admin/slips/${id}/approve`).set(as());
    expect(res.body).toEqual({ ok: true, amount: 3600, bookings: [a.id, b.id] });
    expect((await bookingRow(b.id)).status).toBe('confirmed');
    const other = (await pool.query('SELECT status, reason FROM slip_payments WHERE id = $1', [older])).rows[0];
    expect(other).toEqual({ status: 'rejected', reason: 'SUPERSEDED' });
    expect((await api().post(`/api/admin/slips/${id}/approve`).set(as())).status).toBe(409);
  });

  it('will not approve a slip for something already paid, or an unknown slip', async () => {
    const b = await makeBooking({ status: 'confirmed', balancePaidAt: new Date() });
    const id = await slip([b.id]);
    expect((await api().post(`/api/admin/slips/${id}/approve`).set(as())).body.error).toMatch(/Nothing is owed/);
    expect((await api().post('/api/admin/slips/x/approve').set(as())).status).toBe(404);
  });

  it('rolls back a failed approval', async () => {
    const b = await makeBooking();
    const id = await slip([b.id]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    patchClients(failWhen((sql) => sql.includes("SET status = 'verified'")));
    expect((await api().post(`/api/admin/slips/${id}/approve`).set(as())).status).toBe(500);
    expect((await bookingRow(b.id)).status).toBe('pending');
  });

  it('rejects a waiting slip once', async () => {
    const b = await makeBooking();
    const id = await slip([b.id]);
    expect((await api().patch(`/api/admin/slips/${id}/reject`).set(as())).body).toEqual({ ok: true });
    expect((await api().patch(`/api/admin/slips/${id}/reject`).set(as())).status).toBe(409);
    expect((await api().patch('/api/admin/slips/x/reject').set(as())).status).toBe(404);
  });

  it('marks the balance paid at the farm, and can undo it', async () => {
    const b = await makeBooking({ status: 'confirmed' });
    await slip([b.id], 'balance');
    const paid = await api().patch(`/api/admin/bookings/${b.id}/balance`).set(as()).send({ paid: true });
    expect(paid.body).toEqual({ ok: true, amount: 1800 });
    expect((await bookingRow(b.id)).balance_method).toBe('at_farm');
    expect((await api().patch(`/api/admin/bookings/${b.id}/balance`).set(as()).send({ paid: true })).status).toBe(409);
    expect((await api().patch(`/api/admin/bookings/${b.id}/balance`).set(as()).send({ paid: false })).body).toEqual({ ok: true });
    expect((await api().patch(`/api/admin/bookings/${b.id}/balance`).set(as()).send({ paid: false })).status).toBe(409);
    expect(await logTypes()).toEqual(['booking.balance_paid', 'booking.balance_unpaid']);
  });

  it('answers 404 for the balance of an unknown booking', async () => {
    expect((await api().patch('/api/admin/bookings/x/balance').set(as()).send({})).status).toBe(404);
    expect((await api().patch('/api/admin/bookings/999/balance').set(as()).send({})).status).toBe(404);
  });

  it('rolls back a failed balance update', async () => {
    const b = await makeBooking({ status: 'confirmed' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    patchClients(failWhen((sql) => sql.includes('balance_paid_at = now()')));
    expect((await api().patch(`/api/admin/bookings/${b.id}/balance`).set(as()).send({})).status).toBe(500);
  });

  it('changes the amount and tells the member', async () => {
    const member = await makeMember();
    const b = await makeBooking({ userId: member.id, code: 'BR-AMT001' });
    const res = await api().patch(`/api/admin/bookings/${b.id}/amount`).set(as()).send({ total: 4000, deposit: 2000, reason: 'Extra bed' });
    expect(res.body.booking).toMatchObject({ total: '4000.00', deposit: '2000.00' });
    expect((await pool.query('SELECT body FROM chat_messages')).rows[0].body).toContain('฿4,000');
    const walkIn = await makeBooking({ roomId: 2, total: null });
    expect((await api().patch(`/api/admin/bookings/${walkIn.id}/amount`).set(as()).send({ total: 100, deposit: 0 })).status).toBe(200);
  });

  it.each([
    [{ total: '', deposit: 0 }, /Total/],
    [{ total: -1, deposit: 0 }, /Total/],
    [{ total: 100, deposit: 200 }, /Deposit/],
    [{ total: 100, deposit: '' }, /Deposit/],
  ])('refuses a bad amount %#', async (body, error) => {
    expect((await api().patch('/api/admin/bookings/1/amount').set(as()).send(body)).body.error).toMatch(error);
  });

  it('answers 404 for the amount of an unknown booking', async () => {
    expect((await api().patch('/api/admin/bookings/x/amount').set(as()).send({})).status).toBe(404);
    expect((await api().patch('/api/admin/bookings/999/amount').set(as()).send({ total: 1, deposit: 0 })).status).toBe(404);
  });
});

describe('promotions', () => {
  const promo = { name: 'Rainy', percent: 15, starts_on: '2026-07-01', ends_on: '2026-07-31' };

  it('adds, lists, edits and deletes a promotion', async () => {
    const made = await api().post('/api/admin/promotions').set(as()).send({ ...promo, room_id: '1' });
    expect(made.status).toBe(201);
    const id = made.body.promotion.id;
    expect((await api().get('/api/admin/promotions').set(as())).body.promotions[0]).toMatchObject({ room_name: expect.any(String) });
    const edited = await api().put(`/api/admin/promotions/${id}`).set(as()).send({ ...promo, active: false });
    expect(edited.body.promotion).toMatchObject({ id, active: false, room_id: null });
    expect((await api().delete(`/api/admin/promotions/${id}`).set(as())).body).toEqual({ ok: true });
    expect((await api().delete(`/api/admin/promotions/${id}`).set(as())).status).toBe(404);
    expect(await logTypes()).toEqual(['promotion.created', 'promotion.deleted']);
  });

  it.each([
    [{ ...promo, name: '' }, /Name/],
    [{ ...promo, percent: 0 }, /Discount/],
    [{ ...promo, starts_on: '1 July' }, /first and last/],
    [{ ...promo, ends_on: '2026-06-01' }, /not be before/],
    [{ ...promo, room_id: 'abc' }, /Unknown room/],
  ])('refuses a bad promotion %#', async (body, error) => {
    expect((await api().post('/api/admin/promotions').set(as()).send(body)).body.error).toMatch(error);
  });

  it('refuses a room that does not exist, and unknown promotions', async () => {
    expect((await api().post('/api/admin/promotions').set(as()).send({ ...promo, room_id: 99 })).body.error).toBe('Unknown room');
    const made = await api().post('/api/admin/promotions').set(as()).send(promo);
    const id = made.body.promotion.id;
    expect((await api().put(`/api/admin/promotions/${id}`).set(as()).send({ ...promo, room_id: 99 })).body.error).toBe('Unknown room');
    expect((await api().put('/api/admin/promotions/999').set(as()).send(promo)).status).toBe(404);
    expect((await api().put('/api/admin/promotions/x').set(as()).send(promo)).status).toBe(404);
    expect((await api().put(`/api/admin/promotions/${id}`).set(as()).send({})).status).toBe(400);
    expect((await api().delete('/api/admin/promotions/x').set(as())).status).toBe(404);
  });

  it('passes other database errors on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failPoolQuery((sql) => sql.includes('promotions'));
    expect((await api().post('/api/admin/promotions').set(as()).send(promo)).status).toBe(500);
    expect((await api().put('/api/admin/promotions/1').set(as()).send(promo)).status).toBe(500);
  });
});

describe('admin chat', () => {
  it('lists guests (not admins), reads and answers them', async () => {
    const member = await makeMember();
    const b = await makeBooking({ code: 'BR-CHAT01' });
    const room = await makeUser('BR-CHAT01', { stayBookingId: b.id });
    await pool.query("INSERT INTO chat_messages (user_id, from_admin, body) VALUES ($1, false, 'Hi')", [member.id]);
    const chats = (await api().get('/api/admin/chats').set(as())).body.chats;
    expect(chats.map((c) => c.email).sort()).toEqual(['BR-CHAT01', 'guest@example.com']);
    expect(chats.find((c) => c.user_id === room.id).member_code).toBeNull();

    expect((await api().get(`/api/admin/chats/${member.id}`).set(as())).body.messages).toHaveLength(1);
    expect((await api().post(`/api/admin/chats/${member.id}`).set(as()).send({ body: 'Hello' })).status).toBe(201);
    const photo = await api().post(`/api/admin/chats/${member.id}/image`).set(as()).set('Content-Type', 'image/jpeg').send(JPEG);
    expect(photo.body.message).toMatchObject({ from_admin: true, image: expect.any(String) });
  });

  it('checks the account and the message', async () => {
    expect((await api().get('/api/admin/chats/x').set(as())).status).toBe(404);
    expect((await api().post('/api/admin/chats/x').set(as()).send({ body: 'a' })).status).toBe(404);
    expect((await api().post('/api/admin/chats/1').set(as()).send({ body: '' })).status).toBe(400);
    expect((await api().post('/api/admin/chats/999').set(as()).send({ body: 'a' })).status).toBe(404);
    const img = (id) => api().post(`/api/admin/chats/${id}/image`).set(as()).set('Content-Type', 'image/jpeg').send(JPEG);
    expect((await img('x')).status).toBe(404);
    expect((await img(999)).status).toBe(404);
    const gif = await api().post('/api/admin/chats/1/image').set(as()).set('Content-Type', 'image/gif').send(Buffer.from('GIF89a........'));
    expect(gif.body.reason).toBe('BAD_IMAGE');
  });

  it('passes other database errors on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failPoolQuery((sql) => sql.includes('INSERT INTO chat_messages'));
    expect((await api().post('/api/admin/chats/1').set(as()).send({ body: 'a' })).status).toBe(500);
    const img = await api().post('/api/admin/chats/1/image').set(as()).set('Content-Type', 'image/jpeg').send(JPEG);
    expect(img.status).toBe(500);
  });
});
