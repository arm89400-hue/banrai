import { describe, expect, it, vi } from 'vitest';
import { api, bearer, bookingRow, fakeFetch, logTypes, makeBooking, makeMember, patchClients, pool, useDb } from './helpers.js';

useDb();

const charge = (id, status = 'pending', amount = 180000) => ({
  body: {
    id,
    status,
    amount,
    source: { scannable_code: { image: { download_uri: `http://qr/${id}` } } },
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  },
});

async function member() {
  const m = await makeMember();
  const b = await makeBooking({ userId: m.id, code: 'BR-OPN001' });
  return { m, b };
}

describe('PromptPay QR (Opn)', () => {
  it('makes a QR once and gives the same one back while it is still open', async () => {
    const { m, b } = await member();
    const fetch = fakeFetch(charge('chrg_1'));
    const first = await api().post(`/api/pay/${b.id}/qr`).set(bearer(m));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ charge: 'chrg_1', qr: 'http://qr/chrg_1', amount: 1800 });
    const again = await api().post(`/api/pay/${b.id}/qr`).set(bearer(m));
    expect(again.body.charge).toBe('chrg_1');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('answers 404 or 409 when there is nothing to pay', async () => {
    const { m, b } = await member();
    expect((await api().post('/api/pay/abc/qr').set(bearer(m))).status).toBe(404);
    expect((await api().post('/api/pay/999/qr').set(bearer(m))).status).toBe(404);
    expect((await api().post(`/api/pay/${b.id}/qr?kind=balance`).set(bearer(m))).body.reason).toBe('BALANCE_NOT_DUE');
    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [b.id]);
    expect((await api().post(`/api/pay/${b.id}/qr`).set(bearer(m))).body.reason).toBe('NOT_PENDING');
  });

  it('says so when Opn cannot make the QR', async () => {
    const { m, b } = await member();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fakeFetch({ ok: false, status: 500, body: { object: 'error', message: 'down' } });
    expect((await api().post(`/api/pay/${b.id}/qr`).set(bearer(m))).body.reason).toBe('QR_SERVICE');
  });

  it('confirms the booking once the charge has been paid', async () => {
    const { m, b } = await member();
    fakeFetch(charge('chrg_2'));
    await api().post(`/api/pay/${b.id}/qr`).set(bearer(m));
    fakeFetch(charge('chrg_2', 'successful'));
    const res = await api().get('/api/pay/charges/chrg_2').set(bearer(m));
    expect(res.body).toMatchObject({ status: 'successful', booking: { status: 'confirmed' } });
    const again = await api().get('/api/pay/charges/chrg_2').set(bearer(m));
    expect(again.body.status).toBe('successful');
    expect(await logTypes()).toEqual(['booking.confirmed']);
  });

  it('keeps waiting while the charge is pending, even if Opn cannot be reached', async () => {
    const { m, b } = await member();
    fakeFetch(charge('chrg_3'));
    await api().post(`/api/pay/${b.id}/qr`).set(bearer(m));
    fakeFetch(charge('chrg_3', 'pending'));
    expect((await api().get('/api/pay/charges/chrg_3').set(bearer(m))).body).toEqual({ status: 'pending' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fakeFetch(new Error('offline'));
    expect((await api().get('/api/pay/charges/chrg_3').set(bearer(m))).body).toEqual({ status: 'pending' });
    expect((await api().get('/api/pay/charges/chrg_none').set(bearer(m))).status).toBe(404);
  });

  it('logs a payment that no longer matches what is owed, without confirming', async () => {
    const { m, b } = await member();
    fakeFetch(charge('chrg_4'));
    await api().post(`/api/pay/${b.id}/qr`).set(bearer(m));
    await pool.query('UPDATE bookings SET deposit = 1000 WHERE id = $1', [b.id]);
    fakeFetch(charge('chrg_4', 'successful'));
    await api().get('/api/pay/charges/chrg_4').set(bearer(m));
    expect((await bookingRow(b.id)).status).toBe('pending');
    expect(await logTypes()).toEqual(['payment.unmatched']);
  });

  it('settles through the Opn webhook, and ignores charges it does not know', async () => {
    const { m, b } = await member();
    fakeFetch(charge('chrg_5'));
    await api().post(`/api/pay/${b.id}/qr`).set(bearer(m));
    fakeFetch(charge('chrg_5', 'successful'));
    const res = await api().post('/api/pay/opn-webhook').send({ key: 'charge.complete', data: { id: 'chrg_5' } });
    expect(res.body).toEqual({ ok: true });
    expect((await bookingRow(b.id)).status).toBe('confirmed');
    // A second call for the same charge finds it already settled.
    fakeFetch(charge('chrg_5', 'successful'));
    await api().post('/api/pay/opn-webhook').send({ key: 'charge.complete', data: { id: 'chrg_5' } });
    expect(await logTypes()).toEqual(['booking.confirmed']);
    const fetch = fakeFetch();
    await api().post('/api/pay/opn-webhook').send({ key: 'charge.complete', data: { id: 'chrg_unknown' } });
    await api().post('/api/pay/opn-webhook').send({ key: 'other' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('logs a webhook that fails to refresh', async () => {
    const { m, b } = await member();
    fakeFetch(charge('chrg_6'));
    await api().post(`/api/pay/${b.id}/qr`).set(bearer(m));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fakeFetch(new Error('offline'));
    await api().post('/api/pay/opn-webhook').send({ key: 'charge.complete', data: { id: 'chrg_6' } });
    expect(error).toHaveBeenCalled();
  });

  it('rolls back a settle that fails half way', async () => {
    const { m, b } = await member();
    fakeFetch(charge('chrg_7'));
    await api().post(`/api/pay/${b.id}/qr`).set(bearer(m));
    fakeFetch(charge('chrg_7', 'successful'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    patchClients((sql, params, query) =>
      (sql.startsWith('UPDATE bookings') ? Promise.reject(new Error('boom')) : query(sql, params))
    );
    expect((await api().get('/api/pay/charges/chrg_7').set(bearer(m))).body.status).toBe('pending');
    expect((await bookingRow(b.id)).status).toBe('pending');
  });

  it('says QR payments are not set up without an Opn key', async () => {
    vi.resetModules();
    const key = process.env.OPN_SECRET_KEY;
    delete process.env.OPN_SECRET_KEY;
    try {
      const { app } = await import('../src/app.js');
      const supertest = (await import('supertest')).default;
      const { m, b } = await member();
      expect((await supertest(app).post(`/api/pay/${b.id}/qr`).set(bearer(m))).body.reason).toBe('QR_NOT_CONFIGURED');
    } finally {
      process.env.OPN_SECRET_KEY = key;
    }
  });
});
