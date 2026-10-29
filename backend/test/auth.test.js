import { describe, expect, it, vi } from 'vitest';
import { ADMIN_EMAIL, PASSWORD, api, bearer, logTypes, makeBooking, makeMember, makeUser, pool, tokenFor, useDb } from './helpers.js';

const google = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    verifyIdToken = google.verifyIdToken;
  },
}));

useDb();

const googleSays = (payload) => google.verifyIdToken.mockResolvedValueOnce({ getPayload: () => payload });

describe('register', () => {
  it('needs an email and password', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'a@b.co' });
    expect(res.status).toBe(400);
  });

  it('rejects an email that does not look like one', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'nope', password: 'x' });
    expect(res.body.reason).toBe('BAD_EMAIL');
  });

  it('creates a member and refuses the same email twice', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const first = await api().post('/api/auth/register').send({ email: 'new@example.com', password: 'pw' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ verify: true, user: { email: 'new@example.com', member_code: 'M00001', is_admin: false } });
    expect(first.body.token).toBeUndefined();
    const again = await api().post('/api/auth/register').send({ email: 'new@example.com', password: 'pw' });
    expect(again.status).toBe(409);
    expect(await logTypes()).toEqual(['member.registered']);
  });

  it('passes database errors on', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('db down'));
    const res = await api().post('/api/auth/register').send({ email: 'x@example.com', password: 'pw' });
    expect(res.status).toBe(500);
  });
});

describe('login', () => {
  it('needs an email and password', async () => {
    expect((await api().post('/api/auth/login').send({})).status).toBe(400);
  });

  it('refuses a wrong password or unknown email', async () => {
    await makeMember();
    const wrong = await api().post('/api/auth/login').send({ email: 'guest@example.com', password: 'bad' });
    expect(wrong.body.reason).toBe('BAD_CREDENTIALS');
    const unknown = await api().post('/api/auth/login').send({ email: 'who@example.com', password: PASSWORD });
    expect(unknown.status).toBe(401);
  });

  it('logs in members, admins and room accounts, ignoring email case', async () => {
    await makeMember();
    await makeUser(ADMIN_EMAIL);
    const b = await makeBooking();
    await makeUser('BR-ROOM01', { stayBookingId: b.id });

    const member = await api().post('/api/auth/login').send({ email: 'GUEST@example.com', password: PASSWORD });
    expect(member.status).toBe(200);
    expect(member.body.token).toBeTruthy();
    const admin = await api().post('/api/auth/login').send({ email: ADMIN_EMAIL, password: PASSWORD });
    expect(admin.body.user.is_admin).toBe(true);
    const room = await api().post('/api/auth/login').send({ email: 'BR-ROOM01', password: PASSWORD });
    expect(room.body.user.is_stay).toBe(true);
    expect(await logTypes()).toEqual(['login.member', 'login.admin', 'login.room']);
  });

  it('refuses an expired room account', async () => {
    await makeUser('old@example.com', { expiresAt: '2000-01-01' });
    const res = await api().post('/api/auth/login').send({ email: 'old@example.com', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(await logTypes()).toEqual(['login.expired']);
  });
});

describe('Google sign-in', () => {
  it('needs a credential', async () => {
    expect((await api().post('/api/auth/google').send({})).status).toBe(400);
  });

  it('refuses a credential Google does not accept or an unverified email', async () => {
    google.verifyIdToken.mockRejectedValueOnce(new Error('bad'));
    expect((await api().post('/api/auth/google').send({ credential: 'x' })).status).toBe(401);
    googleSays({ email: 'a@example.com', email_verified: false });
    const res = await api().post('/api/auth/google').send({ credential: 'x' });
    expect(res.body.error).toMatch(/not verified/);
  });

  it('signs up a new member, then logs the same person in', async () => {
    googleSays({ email: 'g@example.com', email_verified: true });
    const first = await api().post('/api/auth/google').send({ credential: 'x' });
    expect(first.status).toBe(200);
    googleSays({ email: 'G@example.com', email_verified: true });
    const second = await api().post('/api/auth/google').send({ credential: 'x' });
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(await logTypes()).toEqual(['member.registered', 'login.member', 'login.member']);
  });

  it('confirms the email of an earlier email sign-up', async () => {
    await makeUser('mine@example.com', { verified: false });
    googleSays({ email: 'mine@example.com', email_verified: true });
    expect((await api().post('/api/auth/google').send({ credential: 'x' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: 'mine@example.com', password: PASSWORD })).status).toBe(200);
  });

  it('refuses an expired account', async () => {
    await makeUser('late@example.com', { expiresAt: '2000-01-01' });
    googleSays({ email: 'late@example.com', email_verified: true });
    expect((await api().post('/api/auth/google').send({ credential: 'x' })).status).toBe(403);
  });

  it('says so when Google sign-in is not set up', async () => {
    vi.resetModules();
    const id = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      const { app } = await import('../src/app.js');
      const request = (await import('supertest')).default;
      expect((await request(app).post('/api/auth/google').send({ credential: 'x' })).status).toBe(503);
    } finally {
      process.env.GOOGLE_CLIENT_ID = id;
    }
  });
});

describe('signed-in pages', () => {
  it('needs a valid token for a user that still exists', async () => {
    expect((await api().get('/api/chat')).status).toBe(401);
    const bad = await api().get('/api/chat').set({ Authorization: 'Bearer nonsense' });
    expect(bad.body.reason).toBe('SESSION_ENDED');
    const gone = await api().get('/api/chat').set({ Authorization: `Bearer ${tokenFor(999)}` });
    expect(gone.body.reason).toBe('SESSION_ENDED');
  });

  it('shuts out expired accounts', async () => {
    const old = await makeUser('old@example.com', { expiresAt: '2000-01-01' });
    expect((await api().get('/api/chat').set(bearer(old))).body.reason).toBe('ACCOUNT_EXPIRED');
  });

  it('keeps members out of the admin pages and room accounts out of member pages', async () => {
    const member = await makeMember();
    expect((await api().get('/api/admin/stats').set(bearer(member))).status).toBe(403);
    const b = await makeBooking();
    const room = await makeUser('BR-ROOM02', { stayBookingId: b.id });
    expect((await api().get('/api/bookings').set(bearer(room))).body.reason).toBe('STAY_ACCOUNT');
  });
});
