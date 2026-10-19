// Payment test: runs every payment case through the real backend (Docker,
// http://localhost:4001) without real money.
//
//   node backend/tests/payment-flow.mjs        (from the repo root, Docker running)
//
// 1. Manual phase - SlipOK off: slips wait for the owner; admin approves,
//    rejects and marks "paid at farm"; PassPay test button.
// 2. SlipOK phase - the backend is pointed at a pretend SlipOK
//    (tests/slipok-mock.mjs) that answers like the real one: good slip, wrong
//    amount, no QR, slip used twice, SlipOK quota/key problems, bank delay,
//    two rooms paid with one slip, the balance paid online.
// 3. Opn phase - the backend is pointed at a pretend Opn
//    (tests/opn-mock.mjs): QR made for the exact amount, the guest waits,
//    the payment is confirmed when Opn says it is paid (asked by the page,
//    or Opn's webhook) - no slip.
// It makes its own test accounts and bookings (dates in 2029), deletes them
// and their slip images afterwards, and puts the normal backend back.
// Prints PASS/FAIL per check; exits 1 if anything failed.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const API = 'http://localhost:4001';
const MOCK = 'http://localhost:4010';
const OPN = 'http://localhost:4011';
const STAMP = Date.now().toString(36);
const GUEST = `pay-test-${STAMP}@example.test`;
const OTHER = `pay-test-${STAMP}-other@example.test`;
const ADMIN = `pay-test-${STAMP}-admin@example.test`;
const EMAILS = [GUEST, OTHER, ADMIN];
const PASSWORD = 'pay-test-password-1';
// A 1x1 PNG: passes the backend's image check; the pretend SlipOK ignores it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const realAdmins = (readFileSync(join(ROOT, 'backend/.env'), 'utf8').match(/^ADMIN_EMAILS=(.*)$/m)?.[1] ?? '').trim();

// ---------- Docker ----------
const COMPOSE = 'docker compose -f docker-compose.yml -f backend/tests/docker-compose.payment-test.yml';
function sh(cmd, env = {}, input) {
  return execSync(cmd, { cwd: ROOT, env: { ...process.env, ...env }, input, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
}
const sql = (query) => sh('docker compose exec -T db psql -U postgres -d test_y4 -At -v ON_ERROR_STOP=1', {}, query);

async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${url} did not come up`);
}

async function startBackend(slipok, opn = false) {
  sh(`${COMPOSE} up -d slipok-mock opn-mock backend`, {
    TEST_ADMIN_EMAILS: [realAdmins, ADMIN].filter(Boolean).join(','),
    TEST_SLIPOK_KEY: slipok ? 'test-key' : '',
    TEST_SLIPOK_BRANCH: slipok ? 'test-branch' : '',
    TEST_OPN_KEY: opn ? 'skey_test_mock' : '',
  });
  await waitFor(`${API}/health`);
  await waitFor(`${MOCK}/__calls`);
  await waitFor(`${OPN}/__charges`);
}

function restoreBackend() {
  sh(`${COMPOSE} rm -sf slipok-mock opn-mock`, { TEST_ADMIN_EMAILS: realAdmins });
  sh('docker compose up -d backend');
}

// ---------- HTTP ----------
async function call(method, path, { token, body, image } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (image) {
    payload = image;
    headers['Content-Type'] = 'image/png';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(API + path, { method, headers, body: payload });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function account(email) {
  await call('POST', '/api/auth/register', { body: { email, password: PASSWORD } });
  const r = await call('POST', '/api/auth/login', { body: { email, password: PASSWORD } });
  if (!r.data?.token) throw new Error(`login failed for ${email}: ${r.status}`);
  return r.data.token;
}

const mockNext = (answer = {}) => fetch(`${MOCK}/__next`, { method: 'POST', body: JSON.stringify(answer) });
const mockCalls = async () => (await (await fetch(`${MOCK}/__calls`)).json()).calls;

// Each booking gets its own nights in 2029 so test bookings never overlap.
let day = Date.UTC(2029, 1, 1);
function nextDates() {
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const dates = [iso(day), iso(day + 86_400_000)];
  day += 2 * 86_400_000;
  return dates;
}

let rooms;
async function book(token, count) {
  const picked = rooms.slice(0, count);
  const [checkIn, checkOut] = nextDates();
  const r = await call('POST', '/api/bookings/request', {
    token,
    body: {
      rooms: picked.map((x) => x.id),
      check_in: checkIn,
      check_out: checkOut,
      guests: picked.reduce((n, x) => n + x.capacity, 0),
      name: 'Payment Test',
      phone: '0812345678',
    },
  });
  if (r.status !== 201) throw new Error(`booking failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.bookings;
}

async function mine(token, ids) {
  const r = await call('GET', '/api/bookings', { token });
  return ids.map((id) => r.data.bookings.find((b) => b.id === id));
}
const slip = (token, id, kind = 'deposit') => call('POST', `/api/bookings/${id}/slip?kind=${kind}`, { token, image: PNG });
async function adminRow(adminToken, id) {
  const r = await call('GET', '/api/admin/bookings', { token: adminToken });
  return r.data.bookings.find((b) => b.id === id);
}

// ---------- Checks ----------
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  -> ${detail}`}`);
}
const money = (n) => Math.round(Number(n) * 100);
const show = (r) => `${r.status} ${JSON.stringify(r.data?.reason ?? r.data?.error ?? '')}`;

async function manualPhase(g, other, admin) {
  console.log('\n-- Manual check (SlipOK off) --');
  const stats = await call('GET', '/api/admin/stats', { token: admin });
  check('admin sees payment setup: SlipOK off', stats.data?.payment_setup?.slipok === false, JSON.stringify(stats.data?.payment_setup));

  // M1: one room, slip waits, admin approves.
  const [m1] = await book(g, 1);
  check('new booking owes 50% deposit', money(m1.deposit_due) === money(m1.deposit) && money(m1.deposit) * 2 === money(m1.total), `${m1.deposit_due} / ${m1.total}`);
  let r = await slip(g, m1.id);
  check('slip without SlipOK -> waits for owner (202)', r.status === 202 && r.data.review === true, show(r));
  check('booking still pending, slip "review"', r.data.booking?.status === 'pending' && r.data.booking?.slip_status === 'review');
  r = await slip(other, m1.id);
  check("another member can't pay this booking (404)", r.status === 404, show(r));
  let row = await adminRow(admin, m1.id);
  check('admin sees the slip waiting, expected = deposit', row.slip_status === 'review' && money(row.slip_expected) === money(m1.deposit));
  r = await call('POST', `/api/admin/slips/${row.slip_id}/approve`, { token: admin });
  check('admin approves slip', r.status === 200, show(r));
  [m1.after] = await mine(g, [m1.id]);
  check('approved -> confirmed with room login', m1.after.status === 'confirmed' && Boolean(m1.after.stay_username));
  check('balance now due = other half', money(m1.after.balance_due) === money(m1.total) - money(m1.deposit), m1.after.balance_due);

  // M4: balance paid at the farm, undo, mark again.
  r = await call('PATCH', `/api/admin/bookings/${m1.id}/balance`, { token: admin, body: { paid: true } });
  [m1.after] = await mine(g, [m1.id]);
  check('admin "paid at farm" -> balance paid, method at_farm', r.status === 200 && m1.after.balance_method === 'at_farm' && !m1.after.balance_due);
  r = await call('PATCH', `/api/admin/bookings/${m1.id}/balance`, { token: admin, body: { paid: false } });
  [m1.after] = await mine(g, [m1.id]);
  check('admin undo -> balance due again', r.status === 200 && !m1.after.balance_paid_at && Number(m1.after.balance_due) > 0);
  r = await slip(g, m1.id, 'deposit');
  check('deposit slip on a paid booking -> 409 NOT_PENDING', r.status === 409 && r.data.reason === 'NOT_PENDING', show(r));

  // M3: admin rejects, guest sends again.
  const [m3] = await book(g, 1);
  await slip(g, m3.id);
  row = await adminRow(admin, m3.id);
  r = await call('PATCH', `/api/admin/slips/${row.slip_id}/reject`, { token: admin });
  [m3.after] = await mine(g, [m3.id]);
  check('admin rejects -> still pending, guest told (MANUAL_REJECT)', m3.after.status === 'pending' && m3.after.slip_reason === 'MANUAL_REJECT');
  r = await slip(g, m3.id);
  check('guest can send a new slip after a reject', r.status === 202, show(r));

  // M2 + M5: two rooms, one slip for both; then the balance for both.
  const group = await book(g, 2);
  const sum = group.reduce((n, b) => n + money(b.deposit), 0);
  check('2 rooms: each shows the group deposit (one QR)', group.every((b) => money(b.deposit_due) === sum), group.map((b) => b.deposit_due).join(', '));
  r = await slip(g, group[0].id);
  row = await adminRow(admin, group[1].id);
  check('one slip covers both rooms (admin sees it on room 2)', row.slip_status === 'review' && row.slip_rooms === 2 && money(row.slip_expected) === sum);
  await call('POST', `/api/admin/slips/${row.slip_id}/approve`, { token: admin });
  let after = await mine(g, group.map((b) => b.id));
  check('approve -> both rooms confirmed with logins', after.every((b) => b.status === 'confirmed' && b.stay_username));
  r = await slip(g, group[1].id, 'balance');
  check('balance slip for the group (from room 2) waits for owner', r.status === 202, show(r));
  row = await adminRow(admin, group[0].id);
  const balanceSum = group.reduce((n, b) => n + money(b.total) - money(b.deposit), 0);
  check('admin sees balance slip, expected = both rooms', row.balance_slip_status === 'review' && money(row.balance_slip_expected) === balanceSum);
  await call('POST', `/api/admin/slips/${row.balance_slip_id}/approve`, { token: admin });
  after = await mine(g, group.map((b) => b.id));
  check('approve -> both rooms paid in full (online)', after.every((b) => b.balance_method === 'online' && !b.balance_due));

  // M6: PassPay test button, deposit then balance.
  const [m6] = await book(g, 1);
  r = await call('POST', `/api/bookings/${m6.id}/pass-pay?kind=deposit`, { token: g });
  check('PassPay deposit -> confirmed', r.status === 200 && r.data.booking.status === 'confirmed', show(r));
  r = await call('POST', `/api/bookings/${m6.id}/pass-pay?kind=balance`, { token: g });
  check('PassPay balance -> paid in full', r.status === 200 && r.data.booking.balance_method === 'online', show(r));
  r = await call('POST', `/api/bookings/${m6.id}/pass-pay?kind=balance`, { token: g });
  check('pay balance twice -> 409 BALANCE_NOT_DUE', r.status === 409 && r.data.reason === 'BALANCE_NOT_DUE', show(r));

  // M7: the whole price at once instead of the deposit.
  const [m7] = await book(g, 1);
  check('new booking can be paid in full (full_due = total)', money(m7.full_due) === money(m7.total), `${m7.full_due} / ${m7.total}`);
  r = await slip(g, m7.id, 'full');
  check('full-price slip without SlipOK -> waits for owner', r.status === 202 && r.data.booking?.slip_status === 'review', show(r));
  row = await adminRow(admin, m7.id);
  check('admin sees the slip, expected = whole price', row.slip_status === 'review' && money(row.slip_expected) === money(m7.total));
  r = await call('POST', `/api/admin/slips/${row.slip_id}/approve`, { token: admin });
  [m7.after] = await mine(g, [m7.id]);
  check('approve -> confirmed and nothing left to pay', r.status === 200 && m7.after.status === 'confirmed' && m7.after.stay_username && m7.after.balance_method === 'online' && !m7.after.balance_due);

  const [m8] = await book(g, 1);
  await slip(g, m8.id, 'full');
  r = await call('PATCH', `/api/admin/bookings/${m8.id}`, { token: admin, body: { status: 'confirmed' } });
  [m8.after] = await mine(g, [m8.id]);
  check('admin confirms a booking with a full-price slip -> rest paid too', r.status === 200 && m8.after.balance_paid_at && !m8.after.balance_due, show(r));

  const [m9] = await book(g, 1);
  r = await call('POST', `/api/bookings/${m9.id}/pass-pay?kind=full`, { token: g });
  check('PassPay full -> confirmed and paid in full', r.status === 200 && r.data.booking.status === 'confirmed' && r.data.booking.balance_method === 'online', show(r));
  r = await call('POST', `/api/bookings/${m9.id}/pass-pay?kind=full`, { token: g });
  check('pay in full twice -> 409 NOT_PENDING', r.status === 409 && r.data.reason === 'NOT_PENDING', show(r));
}

async function slipokPhase(g, admin) {
  console.log('\n-- SlipOK on (pretend SlipOK) --');
  const stats = await call('GET', '/api/admin/stats', { token: admin });
  check('admin sees payment setup: SlipOK on', stats.data?.payment_setup?.slipok === true, JSON.stringify(stats.data?.payment_setup));

  // A1: good slip -> confirmed at once.
  const calls0 = await mockCalls();
  const [a1] = await book(g, 1);
  await mockNext({ transRef: `REF-${STAMP}-A1` });
  let r = await slip(g, a1.id);
  check('good slip -> confirmed straight away', r.status === 200 && r.data.booking.status === 'confirmed' && r.data.booking.stay_username, show(r));
  check('backend really asked SlipOK', (await mockCalls()) > calls0);

  // A2: wrong amount, from SlipOK (1013) and from our own check.
  const [a2] = await book(g, 1);
  await mockNext({ code: 1013 });
  r = await slip(g, a2.id);
  check('SlipOK says wrong amount -> 422 SLIP_AMOUNT', r.status === 422 && r.data.reason === 'SLIP_AMOUNT', show(r));
  await mockNext({ amount: Number(a2.deposit) - 100 });
  r = await slip(g, a2.id);
  check('slip for less money (SlipOK missed it) -> our check rejects', r.status === 422 && r.data.reason === 'SLIP_AMOUNT', show(r));
  const [a2after] = await mine(g, [a2.id]);
  check('wrong amount never confirms the booking', a2after.status === 'pending');

  // A3: no QR in the picture.
  await mockNext({ code: 1007 });
  r = await slip(g, a2.id);
  check('picture without a slip QR -> 422 SLIP_UNREADABLE', r.status === 422 && r.data.reason === 'SLIP_UNREADABLE', show(r));

  // A4: the same transfer used for a second booking.
  await mockNext({ transRef: `REF-${STAMP}-A1` });
  r = await slip(g, a2.id);
  check('same transfer used twice -> 422 SLIP_DUPLICATE', r.status === 422 && r.data.reason === 'SLIP_DUPLICATE', show(r));
  await mockNext({ code: 1012 });
  r = await slip(g, a2.id);
  check('SlipOK says used before -> 422 SLIP_DUPLICATE', r.status === 422 && r.data.reason === 'SLIP_DUPLICATE', show(r));

  // A5: SlipOK account problems and bank delay -> owner checks by hand.
  // (A new booking: each booking takes at most 8 slips an hour.)
  const [a5] = await book(g, 1);
  for (const [code, reason] of [
    [1004, 'SLIPOK_PACKAGE'],
    [1002, 'SLIPOK_SETUP'],
    [1009, 'SLIP_SERVICE'],
    [1010, 'SLIP_PENDING'],
  ]) {
    await mockNext({ code });
    r = await slip(g, a5.id);
    check(`SlipOK ${code} -> waits for owner (${reason})`, r.status === 202 && r.data.booking.slip_reason === reason, show(r));
  }
  const row = await adminRow(admin, a5.id);
  check('admin sees why SlipOK could not check it', row.slip_status === 'review' && row.slip_reason === 'SLIP_PENDING');
  r = await call('POST', `/api/admin/slips/${row.slip_id}/approve`, { token: admin });
  const [a5after] = await mine(g, [a5.id]);
  check('admin approves it -> confirmed', r.status === 200 && a5after.status === 'confirmed');
  const slipsLeft = await call('GET', '/api/admin/stats', { token: admin });
  check('older slips for the same payment are closed', (await adminRow(admin, a5.id)).slip_status === 'verified' && slipsLeft.status === 200);

  // A7: two rooms, one slip.
  const group = await book(g, 2);
  await mockNext({});
  r = await slip(g, group[0].id);
  const after = await mine(g, group.map((b) => b.id));
  check('2 rooms paid with one slip -> both confirmed', r.status === 200 && after.every((b) => b.status === 'confirmed' && b.stay_username), show(r));

  // A8/A9: the other half online, single room and group.
  await mockNext({});
  r = await slip(g, a1.id, 'balance');
  check('balance slip -> paid in full (online)', r.status === 200 && r.data.booking.balance_method === 'online' && r.data.booking.status === 'confirmed', show(r));
  await mockNext({ amount: 1 });
  r = await slip(g, group[0].id, 'balance');
  check('balance slip for wrong amount -> 422', r.status === 422 && r.data.reason === 'SLIP_AMOUNT', show(r));
  await mockNext({});
  r = await slip(g, group[1].id, 'balance');
  check('group balance slip -> both rooms paid', r.status === 200 && r.data.bookings.every((b) => b.balance_method === 'online'), show(r));

  // A10: the whole price at once, checked by SlipOK.
  const [f1] = await book(g, 1);
  await mockNext({ amount: Number(f1.deposit) });
  r = await slip(g, f1.id, 'full');
  check('full-price slip for only the deposit -> 422 SLIP_AMOUNT', r.status === 422 && r.data.reason === 'SLIP_AMOUNT', show(r));
  await mockNext({});
  r = await slip(g, f1.id, 'full');
  check(
    'full-price slip -> confirmed and paid in full at once',
    r.status === 200 && r.data.booking.status === 'confirmed' && r.data.booking.stay_username && r.data.booking.balance_method === 'online' && !r.data.booking.balance_due,
    show(r)
  );
  const fullCall = (await (await fetch(`${MOCK}/__calls`)).json()).last;
  check('SlipOK was asked for the whole price', money(fullCall.amount) === money(f1.total), JSON.stringify(fullCall));
  const fullGroup = await book(g, 2);
  await mockNext({});
  r = await slip(g, fullGroup[0].id, 'full');
  check('2 rooms paid in full with one slip -> both done', r.status === 200 && r.data.bookings.every((b) => b.status === 'confirmed' && b.balance_method === 'online'), show(r));
}

async function opnPhase(g, other, admin) {
  console.log('\n-- Opn QR, no slip (pretend Opn) --');
  const opnPost = (path) => fetch(OPN + path, { method: 'POST' });
  const stats = await call('GET', '/api/admin/stats', { token: admin });
  check('admin sees payment setup: Opn test', stats.data?.payment_setup?.opn === 'test', JSON.stringify(stats.data?.payment_setup));

  // O1: deposit QR, guest waits, paid -> confirmed.
  const [o1] = await book(g, 1);
  let r = await call('POST', `/api/pay/${o1.id}/qr?kind=deposit`, { token: g });
  check('QR made for the deposit', r.status === 201 && r.data.charge?.startsWith('chrg_') && r.data.qr && money(r.data.amount) === money(o1.deposit), show(r));
  const c1 = r.data.charge;
  const made = (await (await fetch(`${OPN}/__charges`)).json()).charges.find((c) => c.id === c1);
  check('Opn was asked for exactly the deposit', made && made.amount === money(o1.deposit), JSON.stringify(made?.amount));
  r = await call('POST', `/api/pay/${o1.id}/qr?kind=deposit`, { token: g });
  check('asking again shows the same QR (no second charge)', r.status === 200 && r.data.charge === c1, show(r));
  r = await call('GET', `/api/pay/charges/${c1}`, { token: g });
  check('not paid yet -> pending, booking still pending', r.status === 200 && r.data.status === 'pending' && (await mine(g, [o1.id]))[0].status === 'pending', show(r));
  r = await call('GET', `/api/pay/charges/${c1}`, { token: other });
  check("another member can't see this payment (404)", r.status === 404, show(r));
  await opnPost(`/__pay/${c1}`);
  r = await call('GET', `/api/pay/charges/${c1}`, { token: g });
  check('paid -> successful, booking confirmed with room login', r.status === 200 && r.data.status === 'successful' && r.data.booking?.status === 'confirmed' && r.data.booking?.stay_username, show(r));
  r = await call('GET', `/api/pay/charges/${c1}`, { token: g });
  const [o1after] = await mine(g, [o1.id]);
  check('asking again does not pay twice; the rest still due', r.data.status === 'successful' && Number(o1after.balance_due) > 0 && !o1after.balance_paid_at);
  r = await call('POST', `/api/pay/${o1.id}/qr?kind=deposit`, { token: g });
  check('no deposit QR once paid -> 409 NOT_PENDING', r.status === 409 && r.data.reason === 'NOT_PENDING', show(r));

  // O2: pay in full through the webhook (the page never asks).
  const [o2] = await book(g, 1);
  r = await call('POST', `/api/pay/${o2.id}/qr?kind=full`, { token: g });
  check('QR made for the whole price', r.status === 201 && money(r.data.amount) === money(o2.total), show(r));
  const c2 = r.data.charge;
  r = await call('POST', '/api/pay/opn-webhook', { body: { key: 'charge.complete', data: { id: c2 } } });
  let [o2after] = await mine(g, [o2.id]);
  check('webhook before paying changes nothing', r.status === 200 && o2after.status === 'pending');
  await opnPost(`/__pay/${c2}`);
  r = await call('POST', '/api/pay/opn-webhook', { body: { key: 'charge.complete', data: { id: c2 } } });
  [o2after] = await mine(g, [o2.id]);
  check('webhook after paying -> confirmed and paid in full', r.status === 200 && o2after.status === 'confirmed' && o2after.balance_method === 'online' && !o2after.balance_due);
  r = await call('POST', '/api/pay/opn-webhook', { body: { key: 'charge.complete', data: { id: 'chrg_made_up' } } });
  check('webhook for an unknown charge is ignored', r.status === 200);

  // O3: balance QR; expired QR; two rooms.
  r = await call('POST', `/api/pay/${o1.id}/qr?kind=balance`, { token: g });
  const c3 = r.data.charge;
  check('QR for the rest = other half', r.status === 201 && money(r.data.amount) === money(o1.total) - money(o1.deposit), show(r));
  await opnPost(`/__expire/${c3}`);
  r = await call('GET', `/api/pay/charges/${c3}`, { token: g });
  check('expired QR -> expired, nothing paid', r.data.status === 'expired' && !(await mine(g, [o1.id]))[0].balance_paid_at, show(r));
  r = await call('POST', `/api/pay/${o1.id}/qr?kind=balance`, { token: g });
  check('after it expires a new QR is made', r.status === 201 && r.data.charge !== c3, show(r));
  await opnPost(`/__pay/${r.data.charge}`);
  r = await call('GET', `/api/pay/charges/${r.data.charge}`, { token: g });
  check('rest paid -> paid in full', r.data.status === 'successful' && r.data.booking?.balance_method === 'online', show(r));

  const group = await book(g, 2);
  r = await call('POST', `/api/pay/${group[1].id}/qr?kind=deposit`, { token: g });
  check('2 rooms: one QR for both deposits', r.status === 201 && money(r.data.amount) === group.reduce((n, b) => n + money(b.deposit), 0), show(r));
  await opnPost(`/__pay/${r.data.charge}`);
  r = await call('GET', `/api/pay/charges/${r.data.charge}`, { token: g });
  check('paid -> both rooms confirmed', r.data.status === 'successful' && r.data.bookings.every((b) => b.status === 'confirmed'), show(r));
}

function cleanup() {
  const list = EMAILS.map((e) => `'${e}'`).join(',');
  const files = sql(
    `SELECT DISTINCT slip_file FROM slip_payments WHERE slip_file IS NOT NULL
       AND booking_id IN (SELECT b.id FROM bookings b JOIN users u ON u.id = b.user_id WHERE u.email IN (${list}));`
  )
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => /^\/uploads\/[\w.-]+$/.test(f));
  if (files.length) sh(`docker compose exec -T backend rm -f ${files.map((f) => `/app${f}`).join(' ')}`);
  sql(`BEGIN;
    DELETE FROM activity_log WHERE actor IN (${list})
      OR booking_id IN (SELECT b.id FROM bookings b JOIN users u ON u.id = b.user_id WHERE u.email IN (${list}));
    DELETE FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email IN (${list}));
    DELETE FROM users WHERE email IN (${list});
    COMMIT;`);
  return files.length;
}

let failed = false;
try {
  console.log('Starting the backend with SlipOK off...');
  await startBackend(false);
  rooms = (await call('GET', '/api/rooms')).data.rooms.filter((x) => x.capacity > 0).sort((a, b) => a.id - b.id);
  const [g, other, admin] = [await account(GUEST), await account(OTHER), await account(ADMIN)];
  await manualPhase(g, other, admin);

  console.log('\nRestarting the backend with the pretend SlipOK...');
  await startBackend(true);
  await slipokPhase(g, admin);

  console.log('\nRestarting the backend with the pretend Opn...');
  await startBackend(false, true);
  await opnPhase(g, other, admin);
} catch (err) {
  failed = true;
  console.error('\nTest stopped:', err.message);
} finally {
  try {
    console.log(`\nCleaned up test accounts, bookings and ${cleanup()} slip images.`);
  } catch (err) {
    failed = true;
    console.error('Cleanup failed:', err.message);
  }
  restoreBackend();
  console.log('Normal backend restored.');
}

const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} passed, ${bad} failed${failed ? ' (test stopped early)' : ''}.`);
process.exit(bad || failed ? 1 : 0);
