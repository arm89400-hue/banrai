// Which payment boxes to show. Rooms booked together (same group_code) are
// one payment: the server sends the group's sum as deposit_due/balance_due
// on every room, and the box is shown once, on the group's first room.

// The server's payment options -> PaymentPanel props.
export const payOptions = (data) => ({
  qrPay: data?.qr_pay ?? null,
  testPay: Boolean(data?.test_pay),
  slipPay: Boolean(data?.slip_pay),
  slipCheck: data?.slip_check ?? 'manual',
  promptpay: data?.promptpay ?? null,
  promptpayName: data?.promptpay_name ?? null,
});

// The code a guest quotes for a payment: the group's code, else the booking's.
export const payCode = (b) => b.group_code ?? b.code;

// Whether this booking (with its group) still owes the deposit or the balance.
export function owes(b, kind) {
  if (!b.room_id) return false;
  return kind === 'deposit'
    ? b.status === 'pending' && Number(b.deposit_due) > 0
    : b.status === 'confirmed' && Number(b.balance_due) > 0;
}

// The ids of the bookings that show the payment box for `kind`: the first
// owing booking of each group.
export function payLeads(bookings, kind) {
  const seen = new Set();
  const leads = new Set();
  for (const b of [...bookings].sort((x, y) => x.id - y.id)) {
    if (!owes(b, kind) || seen.has(payCode(b))) continue;
    seen.add(payCode(b));
    leads.add(b.id);
  }
  return leads;
}

// How many rooms one payment covers (rooms of the group that owe it).
export const roomsPaying = (bookings, lead, kind) =>
  lead.group_code ? bookings.filter((b) => b.group_code === lead.group_code && owes(b, kind)).length : 1;

// Puts updated bookings (from a payment) into a list.
export const mergeBookings = (list, updated) =>
  list.map((b) => updated.find((u) => u.id === b.id) ?? b);

// A guest's room bookings as stays: rooms booked together (same
// group_code) are one stay. Each stay: { key, bookings, lead, status,
// checkIn, checkOut, guests, total, deposit }. `status` is 'pending' while
// any room still owes the deposit, 'cancelled' if every room is cancelled,
// else 'confirmed'.
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

// Whether a stay still needs something from the guest (deposit or the rest).
export const stayNeedsAction = (stay) =>
  stay.status === 'pending' || stay.bookings.some((b) => owes(b, 'balance'));

// What the sample QR holds: plain text, so a bank app that scans it finds
// nothing to pay.
export const SAMPLE_QR_TEXT = 'Baanrai 344 - SAMPLE QR, NOT FOR PAYMENT / ตัวอย่าง ห้ามโอน';

// Slip errors the server explains with a reason code.
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
