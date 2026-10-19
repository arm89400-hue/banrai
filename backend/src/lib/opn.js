// PromptPay QR payments through Opn Payments (Omise), https://docs.omise.co/promptpay
//
// The site asks Opn for a charge with a PromptPay QR for the exact amount;
// the guest scans it and waits. Opn reports the charge 'successful' once
// the money is in - the site checks that (polling while the guest waits, and
// the charge.complete webhook) and then records the payment. No slip.
//
// Needs OPN_SECRET_KEY (backend/.env): skey_test_... while testing (mark a
// charge paid in the Opn dashboard: the charge -> Actions -> Successful),
// skey_... when live. OPN_API_URL is only changed by the payment test, to
// point at a pretend Opn.

const SECRET_KEY = process.env.OPN_SECRET_KEY ?? '';
const API_URL = (process.env.OPN_API_URL || 'https://api.omise.co').replace(/\/+$/, '');
const API_VERSION = '2019-05-29';

export const opnConfigured = () => Boolean(SECRET_KEY);
export const opnTestMode = () => SECRET_KEY.startsWith('skey_test_');

// How long a QR can be paid (Opn allows up to 24 hours).
const QR_MINUTES = 30;

async function call(method, path, form) {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${SECRET_KEY}:`).toString('base64')}`,
      'Omise-Version': API_VERSION,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.object === 'error') {
    const err = new Error(`Opn ${method} ${path}: ${body?.message ?? res.status}`);
    err.opn = body;
    throw err;
  }
  return body;
}

// The parts of a charge the site uses.
const view = (c) => ({
  id: c.id,
  status: c.status, // pending | successful | failed | expired
  amount: c.amount / 100,
  qr: c.source?.scannable_code?.image?.download_uri ?? null,
  expiresAt: c.expires_at ?? null,
  metadata: c.metadata ?? {},
});

// A new PromptPay charge for `amount` baht. `metadata` is stored with the
// charge in Opn (booking code, kind) so the dashboard shows what it was for.
export async function createPromptPay(amount, metadata) {
  const expires = new Date(Date.now() + QR_MINUTES * 60_000).toISOString();
  const form = {
    amount: String(Math.round(Number(amount) * 100)),
    currency: 'THB',
    'source[type]': 'promptpay',
    expires_at: expires,
  };
  for (const [key, value] of Object.entries(metadata)) form[`metadata[${key}]`] = String(value);
  return view(await call('POST', '/charges', form));
}

// The charge as Opn has it now.
export async function getCharge(id) {
  return view(await call('GET', `/charges/${encodeURIComponent(id)}`));
}
