export const payOptions = (data) => ({
  qrPay: data?.qr_pay ?? null,
  testPay: Boolean(data?.test_pay),
  slipPay: Boolean(data?.slip_pay),
  slipCheck: data?.slip_check ?? 'manual',
  promptpay: data?.promptpay ?? null,
  promptpayName: data?.promptpay_name ?? null,
});

export const payCode = (b) => b.group_code ?? b.code;

export function owes(b, kind) {
  if (!b.room_id) return false;
  return kind === 'deposit'
    ? b.status === 'pending' && Number(b.deposit_due) > 0
    : b.status === 'confirmed' && Number(b.balance_due) > 0;
}

export const roomsPaying = (bookings, lead, kind) =>
  lead.group_code ? bookings.filter((b) => b.group_code === lead.group_code && owes(b, kind)).length : 1;

export const mergeBookings = (list, updated) =>
  list.map((b) => updated.find((u) => u.id === b.id) ?? b);

export function groupStays(bookings) {
  const byKey = new Map();
  for (const b of bookings) {
    if (!b.room_id) continue;
    const key = payCode(b) ?? `#${b.id}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(b);
  }
  return [...byKey.entries()].map(([key, list]) => {
    const rooms = [...list].sort((a, b) => a.id - b.id);
    const live = rooms.filter((b) => b.status !== 'cancelled');
    const status = live.length === 0 ? 'cancelled' : live.some((b) => b.status === 'pending') ? 'pending' : 'confirmed';
    const sum = (field) => live.reduce((n, b) => n + Number(b[field] ?? 0), 0);
    return {
      key,
      bookings: rooms,
      lead: live[0] ?? rooms[0],
      status,
      checkIn: String(rooms[0].booked_for).slice(0, 10),
      checkOut: String(rooms[0].booked_until).slice(0, 10),
      guests: sum('guests'),
      total: sum('total'),
      deposit: sum('deposit'),
    };
  });
}

export const stayNeedsAction = (stay) =>
  stay.status === 'pending' || stay.bookings.some((b) => owes(b, 'balance'));

export const SAMPLE_QR_TEXT = 'Baanrai 344 - SAMPLE QR, NOT FOR PAYMENT / ตัวอย่าง ห้ามโอน';

const SLIP_ERRORS = new Set([
  'SLIP_UNREADABLE',
  'SLIP_NOT_FOUND',
  'SLIP_PENDING',
  'SLIP_DUPLICATE',
  'SLIP_AMOUNT',
  'SLIP_RECEIVER',
  'SLIP_OLD',
  'SLIP_SERVICE',
  'SLIP_NOT_CONFIGURED',
  'SLIP_TOO_MANY',
  'QR_SERVICE',
  'QR_NOT_CONFIGURED',
]);
export const errorKey = (reason) =>
  reason === 'NOT_PENDING' || reason === 'BALANCE_NOT_DUE'
    ? 'pay.errNotPending'
    : SLIP_ERRORS.has(reason)
      ? `pay.err.${reason}`
      : 'pay.errGeneric';
