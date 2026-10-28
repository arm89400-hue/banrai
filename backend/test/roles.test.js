import { describe, expect, it } from 'vitest';
import { api, bearer, logTypes, makeAdmin, makeBooking, makeMember, makeUser, pool, useDb } from './helpers.js';

useDb();

const OWNER = 'arm89400@gmail.com';
const setRole = (by, id, admin) => api().patch(`/api/admin/users/${id}/role`).set(bearer(by)).send({ admin });
const canOpenAdmin = async (user) => (await api().get('/api/admin/stats').set(bearer(user))).status === 200;

describe('admin role', () => {
  it('lets an admin make a member an admin, then take it back', async () => {
    const admin = await makeAdmin();
    const member = await makeMember();
    expect(await canOpenAdmin(member)).toBe(false);

    const added = await setRole(admin, member.id, true);
    expect(added.body.user).toMatchObject({ email: 'guest@example.com', is_admin: true });
    expect(await canOpenAdmin(member)).toBe(true);

    expect((await setRole(admin, member.id, false)).body.user.is_admin).toBe(false);
    expect(await canOpenAdmin(member)).toBe(false);
    expect(await logTypes()).toEqual(['role.admin_added', 'role.admin_removed']);
    const { rows } = await pool.query("SELECT actor, details FROM activity_log WHERE type = 'role.admin_added'");
    expect(rows[0]).toMatchObject({ actor: 'admin@baanrai.test', details: { name: 'guest@example.com', member_code: 'M00002' } });
  });

  it('can take the role from an admin set in the server settings', async () => {
    const first = await makeAdmin();
    const second = await makeMember();
    await setRole(first, second.id, true);
    await setRole(second, first.id, false);
    expect(await canOpenAdmin(first)).toBe(false);
  });

  it('never takes the owner out of admin', async () => {
    const admin = await makeAdmin();
    const owner = await makeUser(OWNER);
    expect(await canOpenAdmin(owner)).toBe(true);

    const res = await setRole(admin, owner.id, false);
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('OWNER_FIXED');
    expect((await setRole(owner, owner.id, false)).body.reason).toBe('OWNER_FIXED');

    await pool.query('UPDATE users SET is_admin = false WHERE id = $1', [owner.id]);
    expect(await canOpenAdmin(owner)).toBe(true);
  });

  it('refuses room accounts, unconfirmed emails and unknown accounts', async () => {
    const admin = await makeAdmin();
    const b = await makeBooking();
    const room = await makeUser('BR-ROOM01', { stayBookingId: b.id });
    expect((await setRole(admin, room.id, true)).body.reason).toBe('STAY_ACCOUNT');
    const fresh = await makeUser('new@example.com', { verified: false });
    expect((await setRole(admin, fresh.id, true)).body.reason).toBe('EMAIL_UNVERIFIED');
    expect((await setRole(admin, 999, true)).status).toBe(404);
    expect((await setRole(admin, 'abc', true)).status).toBe(404);
    expect((await setRole(admin, fresh.id, 'yes')).status).toBe(400);
  });

  it('is only for admins', async () => {
    const member = await makeMember();
    const other = await makeMember('other@example.com');
    expect((await setRole(member, other.id, true)).status).toBe(403);
  });

  it('shows the owner and new admins on the People page, and keeps admins out of the chat list', async () => {
    const admin = await makeAdmin();
    await makeUser(OWNER);
    const member = await makeMember();
    await setRole(admin, member.id, true);
    await pool.query('INSERT INTO chat_messages (user_id, from_admin, body) VALUES ($1, false, $2)', [member.id, 'hi']);

    const users = (await api().get('/api/admin/users').set(bearer(admin))).body.users;
    const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
    expect(byEmail[OWNER]).toMatchObject({ is_admin: true, is_owner: true });
    expect(byEmail['guest@example.com']).toMatchObject({ is_admin: true, is_owner: false });

    const chats = (await api().get('/api/admin/chats').set(bearer(admin))).body.chats;
    expect(chats.map((c) => c.email)).not.toContain('guest@example.com');
  });
});
