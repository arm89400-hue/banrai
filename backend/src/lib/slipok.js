import { trimTrailingSlashes } from './text.js';
const API_KEY = process.env.SLIPOK_API_KEY ?? '';
const BRANCH_ID = process.env.SLIPOK_BRANCH_ID ?? '';
const API_URL = trimTrailingSlashes(process.env.SLIPOK_API_URL || 'https://api.slipok.com/api/line/apikey');

export const slipokConfigured = () => Boolean(API_KEY && BRANCH_ID);

const REASONS = {
  1001: 'SLIPOK_SETUP',
  1002: 'SLIPOK_SETUP',
  1003: 'SLIPOK_PACKAGE',
  1004: 'SLIPOK_PACKAGE',
  1005: 'SLIP_UNREADABLE',
  1006: 'SLIP_UNREADABLE',
  1007: 'SLIP_UNREADABLE',
  1008: 'SLIP_UNREADABLE',
  1009: 'SLIP_SERVICE',
  1010: 'SLIP_PENDING',
  1011: 'SLIP_NOT_FOUND',
  1012: 'SLIP_DUPLICATE',
  1013: 'SLIP_AMOUNT',
  1014: 'SLIP_RECEIVER',
};

export const CHECKER_PROBLEMS = new Set(['SLIPOK_SETUP', 'SLIPOK_PACKAGE', 'SLIP_SERVICE', 'SLIP_PENDING']);

export async function checkSlip({ image, contentType, amount }) {
  if (!slipokConfigured()) return { ok: false, reason: 'SLIP_NOT_CONFIGURED', raw: null };

  const form = new FormData();
  form.append('files', new Blob([image], { type: contentType }), 'slip');
  form.append('amount', String(amount));
  form.append('log', 'true');

  let res;
  let body;
  try {
    res = await fetch(`${API_URL}/${encodeURIComponent(BRANCH_ID)}`, {
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

export const satang = (value) => Math.round(Number(value) * 100);
