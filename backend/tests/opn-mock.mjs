// A pretend Opn (Omise) for the payment test (tests/payment-flow.mjs) and
// for trying the QR pop-up without an Opn account. It answers the two calls
// the site makes, the way https://docs.omise.co/promptpay shows:
//   POST /charges          (source[type]=promptpay) -> a pending charge with a QR picture
//   GET  /charges/:id      -> the charge, with its current status
// The test (or a person) "pays" a charge with:
//   POST /__pay/:id        -> status 'successful'
//   POST /__expire/:id     -> status 'expired'
//   GET  /__charges        -> every charge made so far
// QR pictures are served at /qr/:id.svg on MOCK_PUBLIC_URL (what the
// browser can reach).
//
// Run: node opn-mock.mjs   (listens on MOCK_PORT, default 4011)

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const PORT = Number(process.env.MOCK_PORT ?? 4011);
const PUBLIC_URL = (process.env.MOCK_PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, '');
const SECRET_KEY = process.env.MOCK_SECRET_KEY ?? 'skey_test_mock';

const charges = new Map();

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const error = (res, status, code, message) => send(res, status, { object: 'error', code, message });

// A picture that looks like a QR (a pattern from the charge id), with the
// amount under it - enough to see it on screen; it is not scannable.
function qrSvg(charge) {
  const bits = Buffer.from(charge.id).toString('hex');
  let cells = '';
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      const finder = (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
      const on = finder ? x % 6 === 0 || y % 6 === 0 || (x % 6 > 1 && x % 6 < 5 && y % 6 > 1 && y % 6 < 5) : parseInt(bits[(x * 7 + y * 3) % bits.length], 16) % 2;
      if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 29 32"><rect x="-2" y="-2" width="29" height="32" fill="#fff"/><g fill="#0b3d2c">${cells}</g><text x="12.5" y="28.6" font-size="2.4" text-anchor="middle" font-family="sans-serif">PromptPay ฿${(charge.amount / 100).toLocaleString('en')} (TEST)</text></svg>`;
}

function chargeView(c) {
  if (c.status === 'pending' && Date.parse(c.expires_at) < Date.now()) c.status = 'expired';
  return {
    object: 'charge',
    id: c.id,
    amount: c.amount,
    currency: 'THB',
    status: c.status,
    paid: c.status === 'successful',
    expires_at: c.expires_at,
    metadata: c.metadata,
    source: {
      object: 'source',
      type: 'promptpay',
      scannable_code: { type: 'qr', image: { download_uri: `${PUBLIC_URL}/qr/${c.id}.svg` } },
    },
  };
}

createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://mock');
    const path = url.pathname;

    // Test controls and QR pictures (no key needed).
    let m;
    if (req.method === 'GET' && path === '/__charges') return send(res, 200, { charges: [...charges.values()].map(chargeView) });
    if (req.method === 'POST' && (m = /^\/__(pay|expire)\/([\w]+)$/.exec(path))) {
      const c = charges.get(m[2]);
      if (!c) return error(res, 404, 'not_found', 'charge was not found');
      c.status = m[1] === 'pay' ? 'successful' : 'expired';
      return send(res, 200, chargeView(c));
    }
    if (req.method === 'GET' && (m = /^\/qr\/([\w]+)\.svg$/.exec(path))) {
      const c = charges.get(m[1]);
      return c ? send(res, 200, qrSvg(c), 'image/svg+xml') : send(res, 404, 'not found', 'text/plain');
    }

    // The Opn API: secret key as the Basic auth user name.
    const auth = Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString();
    if (auth !== `${SECRET_KEY}:`) return error(res, 401, 'authentication_failure', 'authentication failed');

    if (req.method === 'POST' && path === '/charges') {
      const form = new URLSearchParams(Buffer.concat(chunks).toString());
      const amount = Number(form.get('amount'));
      if (form.get('source[type]') !== 'promptpay' || form.get('currency') !== 'THB') {
        return error(res, 400, 'invalid_charge', 'source type or currency not supported');
      }
      if (!Number.isInteger(amount) || amount < 2000 || amount > 15000000) {
        return error(res, 400, 'invalid_charge', 'amount must be between 20 and 150,000 THB');
      }
      const metadata = {};
      for (const [key, value] of form) {
        const k = /^metadata\[(.+)\]$/.exec(key);
        if (k) metadata[k[1]] = value;
      }
      const c = {
        id: `chrg_test_${randomBytes(8).toString('hex')}`,
        amount,
        status: 'pending',
        expires_at: form.get('expires_at') || new Date(Date.now() + 86_400_000).toISOString(),
        metadata,
      };
      charges.set(c.id, c);
      return send(res, 200, chargeView(c));
    }
    if (req.method === 'GET' && (m = /^\/charges\/([\w]+)$/.exec(path))) {
      const c = charges.get(m[1]);
      return c ? send(res, 200, chargeView(c)) : error(res, 404, 'not_found', 'charge was not found');
    }
    return error(res, 404, 'not_found', 'not found');
  });
}).listen(PORT, () => console.log(`pretend Opn on :${PORT}`));
