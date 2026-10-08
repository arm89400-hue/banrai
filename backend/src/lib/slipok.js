// Checks a bank transfer slip with SlipOK (https://slipok.com/api-documentation/).
//
// SlipOK reads the slip's QR code and asks the bank whether the transfer is
// real. With `amount` it also rejects a slip for a different amount (1013),
// and with `log: true` it rejects a slip paid to someone other than the
// account registered on the branch (1014) or one it has seen before (1012).
// The caller still checks the amount and the transfer reference itself, so
// a wrong answer from the service can't confirm a booking on its own.
//
// Needs SLIPOK_API_KEY and SLIPOK_BRANCH_ID (backend/.env).

const API_KEY = process.env.SLIPOK_API_KEY ?? '';
const BRANCH_ID = process.env.SLIPOK_BRANCH_ID ?? '';

export const slipokConfigured = () => Boolean(API_KEY && BRANCH_ID);

// SlipOK error codes -> our reason codes (the frontend translates these).
const REASONS = {
  1005: 'SLIP_UNREADABLE', // not an image file
  1006: 'SLIP_UNREADABLE', // broken image
  1007: 'SLIP_UNREADABLE', // no QR code in the image
  1008: 'SLIP_UNREADABLE', // QR is not a payment slip
  1009: 'SLIP_SERVICE', // bank system temporarily unavailable
  1010: 'SLIP_PENDING', // the bank hasn't published this transfer yet - try again soon
  1011: 'SLIP_NOT_FOUND', // QR expired / transfer not found
  1012: 'SLIP_DUPLICATE', // slip already used
  1013: 'SLIP_AMOUNT', // amount doesn't match
  1014: 'SLIP_RECEIVER', // paid to a different account
};

// Sends the image to SlipOK. Resolves to
//   { ok: true, slip }            - SlipOK accepted it; `slip` is its data
//   { ok: false, reason, raw }    - rejected, or the service failed
// `amount` is the deposit the slip must match.
export async function checkSlip({ image, contentType, amount }) {
  if (!slipokConfigured()) return { ok: false, reason: 'SLIP_NOT_CONFIGURED', raw: null };

  const form = new FormData();
  form.append('files', new Blob([image], { type: contentType }), 'slip');
  form.append('amount', String(amount));
  form.append('log', 'true');

  let res;
  let body;
  try {
    res = await fetch(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(BRANCH_ID)}`, {
      method: 'POST',
      headers: { 'x-authorization': API_KEY },
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    body = await res.json().catch(() => null);
  } catch {
    return { ok: false, reason: 'SLIP_SERVICE', raw: null };
  }

  if (res.ok && body?.success && body.data?.success) return { ok: true, slip: body.data, raw: body };

  const code = Number(body?.code ?? body?.data?.code);
  return { ok: false, reason: REASONS[code] ?? 'SLIP_SERVICE', code: code || null, raw: body };
}

// Baht -> satang, so 1800 and "1800.00" compare equal without float trouble.
export const satang = (value) => Math.round(Number(value) * 100);
