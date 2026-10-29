import { describe, expect, it, vi } from 'vitest';
import { ADMIN_EMAIL, PASSWORD, api, logTypes, makeBooking, makeUser, pool, useDb } from './helpers.js';
import { codeEmail } from '../src/routes/auth.js';
import * as mailer from '../src/lib/mailer.js';

useDb();

// Without SMTP settings the email is printed instead of sent; read the codes from there.
function catchCodes() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () =>
    log.mock.calls
      .map((c) => String(c[0]))
      .filter((t) => t.includes('[mail not configured]'))
      .map((t) => t.match(/\b(\d{6})\b/)?.[1]);
}

const register = (email, lang) => api().post('/api/auth/register').send({ email, password: PASSWORD, lang });
const login = (email) => api().post('/api/auth/login').send({ email, password: PASSWORD });
const verify = (email, code) => api().post('/api/auth/verify').send({ email, code });
const resend = (email, lang) => api().post('/api/auth/verify/resend').send({ email, lang });
// Moves every code back in time, as if the guest waited.
const age = (sql) => pool.query(`UPDATE email_codes SET created_at = created_at - interval '${sql}'`);

describe('email check', () => {
  it('opens a new account only with the emailed code', async () => {
    const codes = catchCodes();
    await register('new@example.com');
    const [code] = codes();
    expect(code).toMatch(/^\d{6}$/);

    expect((await login('new@example.com')).body.reason).toBe('EMAIL_UNVERIFIED');
    const wrong = await verify('new@example.com', code === '000000' ? '111111' : '000000');
    expect(wrong.body.reason).toBe('BAD_CODE');

    const ok = await verify('NEW@example.com', ` ${code.slice(0, 3)} ${code.slice(3)} `);
    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeTruthy();
    expect(ok.body.user.email).toBe('new@example.com');
    expect((await login('new@example.com')).status).toBe(200);
    expect((await verify('new@example.com', code)).body.reason).toBe('BAD_CODE');
    expect(await logTypes()).toEqual(['member.registered', 'member.email_verified', 'login.member', 'login.member']);
  });

  it('asks old unconfirmed accounts for a code at their next login', async () => {
    const codes = catchCodes();
    await makeUser('old@example.com', { verified: false });
    const res = await login('old@example.com');
    expect(res.status).toBe(403);
    expect(res.body.token).toBeUndefined();
    expect((await verify('old@example.com', codes()[0])).status).toBe(200);
  });

  it('lets admins and room accounts in without a code', async () => {
    catchCodes();
    await makeUser(ADMIN_EMAIL, { verified: false });
    const b = await makeBooking();
    await makeUser('BR-ROOM01', { stayBookingId: b.id, verified: false });
    expect((await login(ADMIN_EMAIL)).status).toBe(200);
    expect((await login('BR-ROOM01')).status).toBe(200);
  });

  it('waits a minute between codes and sends at most five an hour', async () => {
    const codes = catchCodes();
    await register('slow@example.com', 'en');
    await resend('slow@example.com', 'en');
    expect(codes()).toHaveLength(1);

    for (let i = 0; i < 4; i++) {
      await age('2 minutes');
      await resend('slow@example.com');
    }
    expect(codes()).toHaveLength(5);
    await age('2 minutes');
    await resend('slow@example.com');
    expect(codes()).toHaveLength(5);

    await age('1 hour');
    await resend('slow@example.com');
    expect(codes()).toHaveLength(6);
  });

  it('only the newest code counts, for 15 minutes and five tries', async () => {
    const codes = catchCodes();
    await register('try@example.com');
    await age('2 minutes');
    await resend('try@example.com');
    const [first, second] = codes();
    if (first !== second) expect((await verify('try@example.com', first)).body.reason).toBe('BAD_CODE');

    const wrong = second === '999999' ? '888888' : '999999';
    for (let i = 0; i < 5; i++) await verify('try@example.com', wrong);
    expect((await verify('try@example.com', second)).body.reason).toBe('CODE_EXPIRED');

    await age('2 minutes');
    await resend('try@example.com');
    await pool.query("UPDATE email_codes SET expires_at = now() - interval '1 second'");
    expect((await verify('try@example.com', codes()[2])).body.reason).toBe('CODE_EXPIRED');
  });

  it('gives nothing away about unknown or finished accounts', async () => {
    const codes = catchCodes();
    expect((await verify('who@example.com', '123456')).body.reason).toBe('BAD_CODE');
    expect((await verify('who@example.com')).body.reason).toBe('BAD_CODE');
    expect((await resend('who@example.com')).body).toEqual({ ok: true });
    await makeUser('done@example.com');
    expect((await resend('done@example.com')).body).toEqual({ ok: true });
    expect(codes()).toHaveLength(0);
  });

  it('confirms the email when a reset link is used', async () => {
    catchCodes();
    const user = await makeUser('reset@example.com', { verified: false });
    await pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, encode(sha256('t0k3n'), 'hex'), now() + interval '5 minutes')`,
      [user.id]
    );
    expect((await api().post('/api/auth/reset').send({ token: 't0k3n', password: 'new-password-1' })).status).toBe(200);
    const res = await api().post('/api/auth/login').send({ email: 'reset@example.com', password: 'new-password-1' });
    expect(res.status).toBe(200);
  });

  it('still answers when the email cannot be sent', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(mailer, 'sendMail').mockRejectedValueOnce(new Error('smtp down'));
    expect((await register('down@example.com')).status).toBe(201);
    expect(error.mock.calls.flat().join(' ')).toMatch(/code email failed/);
  });
});

describe('code email', () => {
  it('shows the code in Thai or English', () => {
    const th = codeEmail('012345', 'th');
    expect(th.subject).toContain('012345');
    expect(th.html).toContain('ยืนยันอีเมลของคุณ');
    expect(th.text).toContain('012345');
    const en = codeEmail('012345', 'en');
    expect(en.subject).toMatch(/^Your code 012345/);
    expect(en.html).toContain('>012345<');
  });
});
