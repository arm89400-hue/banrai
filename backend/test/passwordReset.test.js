import { describe, expect, it, vi } from 'vitest';
import { PASSWORD, api, bearer, logTypes, makeBooking, makeUser, pool, useDb } from './helpers.js';
import { isEmail, trimTrailingSlashes } from '../src/lib/text.js';
import { resetEmail } from '../src/routes/auth.js';

useDb();

// Without SMTP settings the email is printed instead of sent; read the link from there.
function catchMail() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () => {
    const line = log.mock.calls.map((c) => String(c[0])).find((t) => t.includes('reset-password?token='));
    return line?.match(/token=([\w-]+)/)?.[1];
  };
}

const forgot = (email, lang) => api().post('/api/auth/forgot').send({ email, lang });

describe('text checks', () => {
  it('accepts ordinary emails and refuses broken ones', () => {
    for (const ok of ['a@b.co', 'somchai.k@gmail.com', 'x+tag@mail.example.th']) expect(isEmail(ok)).toBe(true);
    for (const bad of ['', 'a', 'a@b', '@b.co', 'a@.co', 'a@co.', 'a@@b.co', 'a b@c.co', 'a@b@c.co', null, 'x'.repeat(250) + '@b.co']) {
      expect(isEmail(bad)).toBe(false);
    }
  });

  it('stays fast on long crafted input', () => {
    const start = performance.now();
    isEmail('a@' + 'a.'.repeat(50000) + '!');
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('trims only trailing slashes', () => {
    expect(trimTrailingSlashes('https://a.co///')).toBe('https://a.co');
    expect(trimTrailingSlashes('https://a.co/x')).toBe('https://a.co/x');
    expect(trimTrailingSlashes('')).toBe('');
  });
});

describe('forgot password', () => {
  it('refuses something that is not an email', async () => {
    const res = await forgot('BR-ABCDEF');
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe('BAD_EMAIL');
  });

  it('answers the same for unknown emails and sends nothing', async () => {
    const mail = catchMail();
    const res = await forgot('nobody@example.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(mail()).toBeUndefined();
  });

  it('skips room accounts', async () => {
    const booking = await makeBooking();
    await makeUser('room@example.com', { stayBookingId: booking.id });
    const mail = catchMail();
    expect((await forgot('room@example.com')).status).toBe(200);
    expect(mail()).toBeUndefined();
  });

  it('emails a one-time link that sets a new password and ends old logins', async () => {
    const user = await makeUser('guest@example.com');
    const mail = catchMail();
    expect((await forgot('Guest@Example.com', 'en')).status).toBe(200);
    const token = mail();
    expect(token).toMatch(/^[\w-]{40,}$/);

    const check = await api().get('/api/auth/reset').query({ token });
    expect(check.status).toBe(200);
    expect(check.body.email).toBe('gu•••@example.com');

    const weak = await api().post('/api/auth/reset').send({ token, password: 'short' });
    expect(weak.body.reason).toBe('WEAK_PASSWORD');

    // The old login was made before the reset.
    await new Promise((r) => setTimeout(r, 1100));
    const done = await api().post('/api/auth/reset').send({ token, password: 'new-password-1' });
    expect(done.status).toBe(200);
    expect(done.body.user.email).toBe('guest@example.com');
    expect(done.body.token).toBeTruthy();

    expect((await api().get('/api/bookings').set(bearer(user))).status).toBe(401);
    expect((await api().get('/api/bookings').set({ Authorization: `Bearer ${done.body.token}` })).status).toBe(200);

    const oldPw = await api().post('/api/auth/login').send({ email: 'guest@example.com', password: PASSWORD });
    expect(oldPw.status).toBe(401);
    const newPw = await api().post('/api/auth/login').send({ email: 'guest@example.com', password: 'new-password-1' });
    expect(newPw.status).toBe(200);

    const again = await api().post('/api/auth/reset').send({ token, password: 'another-pass-2' });
    expect(again.body.reason).toBe('BAD_TOKEN');
    expect(await logTypes()).toEqual(expect.arrayContaining(['password.reset_requested', 'password.reset']));
  });

  it('refuses unknown and expired links', async () => {
    expect((await api().get('/api/auth/reset').query({ token: 'nope' })).body.reason).toBe('BAD_TOKEN');
    expect((await api().get('/api/auth/reset')).body.reason).toBe('BAD_TOKEN');
    await makeUser('late@example.com');
    const mail = catchMail();
    await forgot('late@example.com');
    const token = mail();
    await pool.query("UPDATE password_resets SET expires_at = now() - interval '1 minute'");
    const res = await api().post('/api/auth/reset').send({ token, password: 'new-password-1' });
    expect(res.body.reason).toBe('BAD_TOKEN');
  });

  it('sends at most three links an hour per account', async () => {
    await makeUser('busy@example.com');
    const mail = catchMail();
    for (let i = 0; i < 5; i++) await forgot('busy@example.com');
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM password_resets');
    expect(rows[0].n).toBe(3);
    expect(mail()).toBeTruthy();
  });

  it('writes the email in Thai or English with the link', () => {
    const th = resetEmail('https://site.test/reset-password?token=abc', 'th');
    const en = resetEmail('https://site.test/reset-password?token=abc', 'en');
    expect(th.subject).toContain('ตั้งรหัสผ่านใหม่');
    expect(en.subject).toContain('Reset your password');
    for (const m of [th, en]) {
      expect(m.text).toContain('https://site.test/reset-password?token=abc');
      expect(m.html).toContain('href="https://site.test/reset-password?token=abc"');
    }
  });
});
