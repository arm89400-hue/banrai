import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fakeFetch, makeBooking, pool, useDb } from './helpers.js';
import { maxGuests, priceStay, splitGuests } from '../src/lib/pricing.js';
import { bestPromotion, currentPromotions } from '../src/lib/promotions.js';
import { UPLOAD_DIR, imageExtension, photosJson, removeUploads, saveUpload } from '../src/lib/photos.js';
import { checkSlip, satang, slipokConfigured } from '../src/lib/slipok.js';
import { createPromptPay, getCharge, opnConfigured, opnTestMode } from '../src/lib/opn.js';
import { ensureStayAccount, randomCode, removeStayAccount } from '../src/lib/stayAccount.js';
import { logEvent } from '../src/lib/activityLog.js';
import { paymentOptions, paymentScope, paymentSetup, recordSlip } from '../src/lib/payments.js';
import { isAdminEmail, isExpired, memberCode, publicUser } from '../src/middleware/auth.js';
import { JPEG, PNG, WEBP } from './helpers.js';

useDb();

describe('pricing', () => {
  const room = { price: 1800, capacity: 2, max_extra_guests: 2 };

  it('prices a stay with extra guests, pets and a promotion', () => {
    expect(priceStay(room, 2, 3, 1, { percent: 10 })).toEqual({
      base: 3600,
      extraGuests: 1,
      extraTotal: 1000,
      petTotal: 200,
      discount: 360,
      total: 4440,
      deposit: 2220,
    });
  });

  it('charges no extra guests for a room without a set capacity', () => {
    expect(priceStay({ price: 500 }, 1, 6).extraGuests).toBe(0);
  });

  it('splits guests across rooms, base beds first', () => {
    const rooms = [room, { capacity: 2, max_extra_guests: 0 }];
    expect(splitGuests(rooms, 5)).toEqual([3, 2]);
    expect(splitGuests(rooms, 7)).toBeNull();
    expect(splitGuests(rooms, 1)).toBeNull();
    expect(splitGuests([], 2)).toBeNull();
    expect(splitGuests([{ capacity: null }], 14)).toEqual([14]);
  });

  it('knows the most guests a room can sleep', () => {
    expect(maxGuests(room)).toBe(4);
    expect(maxGuests({ capacity: 3 })).toBe(3);
    expect(maxGuests({})).toBeNull();
  });
});

describe('promotions', () => {
  const promos = [
    { id: 1, room_id: null, percent: 10, starts_on: '2026-01-01', ends_on: '2026-12-31' },
    { id: 2, room_id: 2, percent: 30, starts_on: '2026-06-01', ends_on: '2026-06-30' },
    { id: 3, room_id: 1, percent: 20, starts_on: '2026-06-01', ends_on: '2026-06-30' },
  ];

  it('picks the biggest discount that fits the room and date', () => {
    expect(bestPromotion(promos, 1, '2026-06-10').id).toBe(3);
    expect(bestPromotion(promos, 1, '2026-07-10').id).toBe(1);
    expect(bestPromotion(promos, 3, '2027-01-01')).toBeNull();
  });

  it('lists active promotions that have not ended', async () => {
    await pool.query(
      `INSERT INTO promotions (name, percent, starts_on, ends_on, active) VALUES
         ('Now', 10, current_date, current_date + 5, true),
         ('Off', 10, current_date, current_date + 5, false),
         ('Old', 10, current_date - 30, current_date - 20, true)`
    );
    expect((await currentPromotions()).map((p) => p.name)).toEqual(['Now']);
  });
});

describe('photos', () => {
  it('recognises JPEG, PNG and WebP only', () => {
    expect(imageExtension(JPEG)).toBe('jpg');
    expect(imageExtension(PNG)).toBe('png');
    expect(imageExtension(WEBP)).toBe('webp');
    expect(imageExtension(Buffer.from('GIF89a-not-allowed'))).toBeNull();
    expect(imageExtension(Buffer.alloc(4))).toBeNull();
    expect(imageExtension('not a buffer')).toBeNull();
  });

  it('saves an upload and removes only files in the upload folder', async () => {
    const file = await saveUpload(JPEG, 'jpg', 'test');
    expect(file).toMatch(/^\/uploads\/test-.+\.jpg$/);
    const onDisk = join(UPLOAD_DIR, file.replace('/uploads/', ''));
    expect(readFileSync(onDisk)).toEqual(JPEG);
    await removeUploads([file, '/images/keep.jpg', null, '/uploads/missing.jpg']);
    expect(existsSync(onDisk)).toBe(false);
  });

  it('builds the photo list SQL for an owner', () => {
    expect(photosJson('room_id', 'r.id')).toContain('p.room_id = r.id');
  });
});

describe('SlipOK', () => {
  it('is set up from the environment', () => {
    expect(slipokConfigured()).toBe(true);
    expect(satang('12.345')).toBe(1235);
  });

  it('accepts a slip the bank confirms', async () => {
    const fetch = fakeFetch({ body: { success: true, data: { success: true, transRef: 'T1', amount: 100 } } });
    const result = await checkSlip({ image: JPEG, contentType: 'image/jpeg', amount: 100 });
    expect(result).toMatchObject({ ok: true, slip: { transRef: 'T1' } });
    expect(fetch.mock.calls[0][0]).toBe('http://slipok.test/branch-1');
  });

  it('turns SlipOK error codes into reasons', async () => {
    fakeFetch({ ok: false, status: 400, body: { code: 1012 } });
    expect(await checkSlip({ image: JPEG, contentType: 'image/jpeg', amount: 1 })).toMatchObject({
      ok: false,
      reason: 'SLIP_DUPLICATE',
      code: 1012,
    });
    fakeFetch({ ok: false, status: 500, body: null });
    expect((await checkSlip({ image: JPEG, contentType: 'image/jpeg', amount: 1 })).reason).toBe('SLIP_SERVICE');
  });

  it('reports the service as down when the request fails', async () => {
    fakeFetch(new Error('offline'));
    expect(await checkSlip({ image: JPEG, contentType: 'image/jpeg', amount: 1 })).toEqual({
      ok: false,
      reason: 'SLIP_SERVICE',
      raw: null,
    });
  });

  it('says it is not set up without keys', async () => {
    vi.resetModules();
    const key = process.env.SLIPOK_API_KEY;
    delete process.env.SLIPOK_API_KEY;
    try {
      const fresh = await import('../src/lib/slipok.js');
      expect(fresh.slipokConfigured()).toBe(false);
      expect((await fresh.checkSlip({ image: JPEG, amount: 1 })).reason).toBe('SLIP_NOT_CONFIGURED');
    } finally {
      process.env.SLIPOK_API_KEY = key;
    }
  });
});

describe('Opn', () => {
  it('is in test mode with a test key', () => {
    expect(opnConfigured()).toBe(true);
    expect(opnTestMode()).toBe(true);
  });

  it('creates a PromptPay charge', async () => {
    const fetch = fakeFetch({
      body: {
        id: 'chrg_1',
        status: 'pending',
        amount: 180000,
        source: { scannable_code: { image: { download_uri: 'http://qr' } } },
        expires_at: '2026-01-01T00:00:00Z',
      },
    });
    const charge = await createPromptPay(1800, { booking: 'BR-1' });
    expect(charge).toEqual({
      id: 'chrg_1',
      status: 'pending',
      amount: 1800,
      qr: 'http://qr',
      expiresAt: '2026-01-01T00:00:00Z',
      metadata: {},
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://opn.test/charges');
    expect(init.body).toContain('amount=180000');
    expect(init.body).toContain('metadata%5Bbooking%5D=BR-1');
  });

  it('reads a charge and reports Opn errors', async () => {
    fakeFetch({ body: { id: 'chrg_2', status: 'successful', amount: 100, metadata: { a: 1 } } });
    expect(await getCharge('chrg_2')).toMatchObject({ status: 'successful', qr: null, expiresAt: null, metadata: { a: 1 } });
    fakeFetch({ ok: false, status: 404, body: { object: 'error', message: 'not found' } });
    await expect(getCharge('chrg_x')).rejects.toThrow('not found');
    fakeFetch({ ok: false, status: 500, body: undefined });
    await expect(getCharge('chrg_y')).rejects.toThrow('500');
  });
});

describe('room accounts', () => {
  it('makes random codes from the safe alphabet', () => {
    expect(randomCode(12)).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
  });

  it('creates one room login per booking and removes it again', async () => {
    const b = await makeBooking({ code: 'BR-AAAAAA' });
    const first = await ensureStayAccount(pool, b.id);
    expect(first.stay_username).toBe('BR-AAAAAA');
    expect(await ensureStayAccount(pool, b.id)).toEqual(first);
    await removeStayAccount(pool, b.id);
    expect((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(0);
  });

  it('makes up a code when the booking has none, and skips missing bookings', async () => {
    const b = await makeBooking();
    expect((await ensureStayAccount(pool, b.id)).stay_username).toMatch(/^BR-/);
    expect(await ensureStayAccount(pool, 999)).toBeNull();
  });
});

describe('activity log', () => {
  it('never lets a logging failure break the request', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('db down'));
    await logEvent('test.event');
    expect(error).toHaveBeenCalledWith('activity log failed:', 'test.event', 'db down');
  });
});

describe('payments', () => {
  it('describes the payment options from the environment', () => {
    expect(paymentOptions()).toEqual({
      qr_pay: 'opn',
      test_pay: true,
      slip_pay: true,
      slip_check: 'auto',
      promptpay: '0812345678',
      promptpay_name: 'Baanrai 344',
    });
    expect(paymentSetup()).toEqual({ promptpay: true, promptpay_name: 'Baanrai 344', slipok: true, opn: 'test', test_pay: true });
  });

  it('shows a live Opn key and no PromptPay when they are set that way', async () => {
    vi.resetModules();
    const saved = { ...process.env };
    Object.assign(process.env, { OPN_SECRET_KEY: 'skey_live_1', PROMPTPAY_ID: '123', PROMPTPAY_NAME: '' });
    try {
      const fresh = await import('../src/lib/payments.js');
      expect(fresh.paymentSetup()).toMatchObject({ opn: 'live', promptpay: false, promptpay_name: null });
      expect(fresh.paymentOptions()).toMatchObject({ promptpay: null, promptpay_name: null });
      process.env.OPN_SECRET_KEY = '';
      vi.resetModules();
      expect((await import('../src/lib/payments.js')).paymentSetup().opn).toBeNull();
    } finally {
      Object.assign(process.env, saved);
    }
  });

  it('works out what is owed for rooms booked together', async () => {
    const a = await makeBooking({ code: 'BR-G1', groupCode: 'BR-G1', total: 3000, deposit: 1500 });
    await makeBooking({ roomId: 2, code: 'BR-G2', groupCode: 'BR-G1', total: 2000, deposit: 1000 });
    const scope = await paymentScope(pool, a.id, { kind: 'deposit' });
    expect(scope).toMatchObject({ amount: 2500, code: 'BR-G1' });
    expect(scope.due).toHaveLength(2);
    expect((await paymentScope(pool, a.id, { kind: 'full' })).amount).toBe(5000);
    expect((await paymentScope(pool, a.id, { kind: 'balance' })).error).toBe('NOT_DUE');
    expect((await paymentScope(pool, 999, { kind: 'deposit' })).error).toBe('NOT_FOUND');
  });

  it('records a slip, keeping only valid slip times', async () => {
    const b = await makeBooking();
    const scope = await paymentScope(pool, b.id, { kind: 'deposit' });
    const id = await recordSlip(pool, {
      scope,
      kind: 'deposit',
      userId: null,
      status: 'review',
      slip: { transTimestamp: 'not a date', sender: { name: 'A' }, receiver: { displayName: 'B' } },
      slipFile: '/uploads/x.jpg',
      raw: { ok: 1 },
    });
    const row = (await pool.query('SELECT * FROM slip_payments WHERE id = $1', [id])).rows[0];
    expect(row).toMatchObject({ trans_at: null, sender_name: 'A', receiver_name: 'B', expected: '1800.00' });
  });
});

describe('auth helpers', () => {
  it('formats member codes and spots admins and expired accounts', () => {
    expect(memberCode(7)).toBe('M00007');
    expect(isAdminEmail('ADMIN@baanrai.test')).toBe(true);
    expect(isExpired({ account_expires_at: '2000-01-01' })).toBe(true);
    expect(isExpired({ account_expires_at: null })).toBe(false);
  });

  it('never treats a room account as an admin', () => {
    expect(publicUser({ id: 1, email: 'admin@baanrai.test', stay_booking_id: 5 })).toMatchObject({
      is_stay: true,
      is_admin: false,
    });
    expect(publicUser({ id: 1, email: 'admin@baanrai.test' })).toMatchObject({ is_stay: false, is_admin: true, stay_booking_id: null });
  });
});
