import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatBaht } from '../src/lib/money';
import { FRUIT_SEASONS, fruitImage, fruitPhoto, fruitsIn, inRange } from '../src/lib/seasons';
import { promptPayPayload } from '../src/lib/promptpay';
import {
  errorKey,
  groupStays,
  mergeBookings,
  owes,
  payCode,
  payOptions,
  roomsPaying,
  stayNeedsAction,
} from '../src/lib/payments';
import { dayOf, groupRows, needsYou, roomTitle } from '../src/lib/adminBookings';
import { ADMIN_PAGES, OLD_SECTIONS, adminPath, pageFromParams } from '../src/lib/adminSections';
import { formatThaiPhone, lineUrl, telOf } from '../src/lib/contact';
import {
  FARM_PHOTOS,
  LOGIN_SLIDES,
  heroSlidesNow,
  listingPhotos,
  partOfDay,
  roomCover,
  roomPhotos,
} from '../src/lib/photos';
import { cachedRoom, cachedRooms, rememberRooms } from '../src/lib/roomCache';
import { addToCalendar } from '../src/lib/calendar';
import { CHECK_IN_TIME, PHONES } from '../src/lib/site';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('money', () => {
  it('shows baht with satang only when needed', () => {
    expect(formatBaht(1800)).toBe('฿1,800');
    expect(formatBaht('1234.5')).toBe('฿1,234.50');
    expect(formatBaht(null)).toBe('฿0');
  });
});

describe('fruit seasons', () => {
  it('handles seasons that run over the new year', () => {
    expect(inRange({ from: 12, to: 3 }, 1)).toBe(true);
    expect(inRange({ from: 12, to: 3 }, 6)).toBe(false);
    expect(inRange({ from: 3, to: 5 }, 4)).toBe(true);
    expect(fruitsIn(1).map((f) => f.id)).toEqual(['rose-apple']);
    expect(fruitsIn(11).map((f) => f.id)).toEqual(['passionfruit']);
    expect(FRUIT_SEASONS.length).toBeGreaterThan(10);
    expect(fruitImage('mango')).toBe('/images/fruit-cut/mango.webp');
    expect(fruitPhoto('mango')).toBe('/images/farm/fruit-mango.jpg');
  });
});

describe('PromptPay QR text', () => {
  it('builds the EMV text with the amount and a checksum', () => {
    const text = promptPayPayload('081-234-5678', 1800);
    expect(text).toMatch(/^000201010212/);
    expect(text).toContain('01130066812345678');
    expect(text).toContain('54071800.00');
    expect(text).toMatch(/6304[0-9A-F]{4}$/);
  });

  it('accepts citizen and e-wallet ids and refuses others', () => {
    expect(promptPayPayload('1234567890123', 1)).toContain('02131234567890123');
    expect(promptPayPayload('123456789012345', 1)).toContain('0315123456789012345');
    expect(() => promptPayPayload('123', 1)).toThrow(/PromptPay ID/);
  });

  it('changes the checksum when the amount changes', () => {
    expect(promptPayPayload('0812345678', 1).slice(-4)).not.toBe(promptPayPayload('0812345678', 2).slice(-4));
  });
});

describe('guest payments', () => {
  const room = (over) => ({ id: 1, room_id: 1, status: 'pending', deposit_due: 900, balance_due: 0, ...over });

  it('reads the payment options', () => {
    expect(payOptions({ qr_pay: 'opn', test_pay: 1, slip_pay: true, slip_check: 'auto', promptpay: '1', promptpay_name: 'A' })).toEqual({
      qrPay: 'opn',
      testPay: true,
      slipPay: true,
      slipCheck: 'auto',
      promptpay: '1',
      promptpayName: 'A',
    });
    expect(payOptions(null)).toMatchObject({ qrPay: null, testPay: false, slipCheck: 'manual' });
  });

  it('knows what a booking still owes', () => {
    expect(owes(room(), 'deposit')).toBe(true);
    expect(owes(room({ room_id: null }), 'deposit')).toBe(false);
    expect(owes(room({ status: 'confirmed', balance_due: 900 }), 'balance')).toBe(true);
    expect(owes(room({ status: 'confirmed' }), 'balance')).toBe(false);
  });

  it('counts the rooms paid together and merges updates', () => {
    const list = [room({ id: 1, group_code: 'G' }), room({ id: 2, group_code: 'G' }), room({ id: 3, group_code: 'H' })];
    expect(roomsPaying(list, list[0], 'deposit')).toBe(2);
    expect(roomsPaying(list, room({ group_code: null }), 'deposit')).toBe(1);
    expect(mergeBookings(list, [{ id: 2, status: 'confirmed' }])[1]).toEqual({ id: 2, status: 'confirmed' });
    expect(payCode({ code: 'BR-1', group_code: null })).toBe('BR-1');
  });

  it('groups bookings into stays', () => {
    const stays = groupStays([
      { id: 2, room_id: 2, code: 'B', group_code: 'A', status: 'pending', booked_for: '2026-03-01T00:00Z', booked_until: '2026-03-03T00:00Z', guests: 2, total: 100, deposit: 50 },
      { id: 1, room_id: 1, code: 'A', group_code: 'A', status: 'confirmed', booked_for: '2026-03-01T00:00Z', booked_until: '2026-03-03T00:00Z', guests: 3, total: 200, deposit: 100 },
      { id: 3, room_id: 1, code: 'C', status: 'cancelled', booked_for: '2026-04-01', booked_until: '2026-04-02' },
      { id: 4, room_id: null, code: 'ACT' },
      { id: 5, room_id: 3, code: 'D', status: 'confirmed', booked_for: '2026-05-01', booked_until: '2026-05-02', balance_due: 500 },
    ]);
    expect(stays.map((s) => [s.key, s.status])).toEqual([['A', 'pending'], ['C', 'cancelled'], ['D', 'confirmed']]);
    expect(stays[0]).toMatchObject({ checkIn: '2026-03-01', checkOut: '2026-03-03', guests: 5, total: 300, deposit: 150 });
    expect(stays[0].lead.id).toBe(1);
    expect(stayNeedsAction(stays[0])).toBe(true);
    expect(stayNeedsAction(stays[1])).toBe(false);
    expect(stayNeedsAction(stays[2])).toBe(true);
    expect(groupStays([{ id: 9, room_id: 1, code: null, status: 'pending', booked_for: 'x', booked_until: 'y' }])[0].key).toBe('#9');
  });

  it('maps server reasons to messages', () => {
    expect(errorKey('NOT_PENDING')).toBe('pay.errNotPending');
    expect(errorKey('BALANCE_NOT_DUE')).toBe('pay.errNotPending');
    expect(errorKey('SLIP_AMOUNT')).toBe('pay.err.SLIP_AMOUNT');
    expect(errorKey('WHAT')).toBe('pay.errGeneric');
  });
});

describe('admin bookings', () => {
  const b = (over) => ({
    id: 1,
    room_id: 1,
    code: 'BR-1',
    status: 'pending',
    booked_for: '2026-03-10T00:00:00Z',
    booked_until: '2026-03-12T00:00:00Z',
    room_name: "Father's Room · ห้องพ่อ",
    guests: 2,
    total: 3600,
    deposit: 1800,
    ...over,
  });

  it('groups rooms booked together and sums them', () => {
    const groups = groupRows([
      b({ id: 2, code: 'BR-2', group_code: 'BR-1', room_name: "Mother's Room · ห้องแม่" }),
      b({ id: 1, group_code: 'BR-1', slip_status: 'review' }),
      b({ id: 3, code: null, status: 'cancelled' }),
      { id: 4, room_id: null, activity_id: 1, code: 'ACT', status: 'confirmed', booked_for: '2026-03-01T00:00:00Z', activity_name: 'Fruit picking' },
    ]);
    expect(groups.map((g) => g.key)).toEqual(['BR-1', '#3', 'activity-4']);
    expect(groups[0]).toMatchObject({ status: 'pending', guests: 4, total: 7200, rooms: 'ห้องพ่อ + ห้องแม่', depositReview: true });
    expect(groups[1]).toMatchObject({ status: 'cancelled', rooms: 'ห้องพ่อ' });
    expect(groups[2]).toMatchObject({ isRoom: false, code: 'ACT', checkOut: '2026-03-01', rooms: 'Fruit picking' });
    expect(groupRows([{ ...groups[2].lead, code: null }], 'en')[0].code).toBe('#4');
  });

  it('works out the balance still owed', () => {
    const [g] = groupRows([
      b({ status: 'confirmed', balance_slip_status: 'review' }),
      b({ id: 2, code: 'BR-2', group_code: 'BR-1', status: 'confirmed', balance_paid_at: 'x', balance_method: 'at_farm' }),
    ]);
    expect(g).toMatchObject({ restDue: 1800, paidAtFarm: true, balanceReview: true });
  });

  it('says which bookings need the owner today', () => {
    const [pending] = groupRows([b()]);
    expect(needsYou(pending, '2026-03-01')).toBe(true);
    const [arriving] = groupRows([b({ status: 'confirmed', booked_for: '2026-03-02T00:00:00Z' })]);
    expect(needsYou(arriving, '2026-03-01')).toBe(true);
    const [later] = groupRows([b({ status: 'confirmed' })]);
    expect(needsYou(later, '2026-03-01')).toBe(false);
    expect(needsYou(later, '2026-04-01')).toBe(false);
    expect(needsYou({ isRoom: false }, '2026-03-01')).toBe(false);
    expect(dayOf(null)).toBe('');
    expect(roomTitle("Father's Room · ห้องพ่อ", 'en')).toBe("Father's Room");
  });
});

describe('admin menu', () => {
  it('turns URLs into pages', () => {
    expect(pageFromParams()).toBe('overview');
    expect(pageFromParams('site')).toBe('rooms');
    expect(pageFromParams('site', 'contact')).toBe('contact');
    expect(pageFromParams('site', 'nope')).toBeNull();
    expect(pageFromParams('bookings')).toBe('bookings');
    expect(pageFromParams('rooms')).toBeNull();
    expect(pageFromParams('bookings', 'x')).toBeNull();
    expect(pageFromParams('nope')).toBeNull();
  });

  it('turns pages into URLs', () => {
    expect(adminPath('log')).toBe('/admin/people/log');
    expect(adminPath('nope')).toBe('/admin');
    expect(ADMIN_PAGES.every((p) => adminPath(p.id) === p.path)).toBe(true);
    expect(Object.values(OLD_SECTIONS).every((id) => ADMIN_PAGES.some((p) => p.id === id))).toBe(true);
  });
});

describe('contact', () => {
  it('formats Thai phone numbers as they are typed', () => {
    expect(formatThaiPhone('0892029053')).toBe('089-202-9053');
    expect(formatThaiPhone('+66 89 202 9053')).toBe('089-202-9053');
    expect(formatThaiPhone('021234567')).toBe('02-123-4567');
    expect(formatThaiPhone('044123456')).toBe('044-123-456');
    expect(formatThaiPhone('089')).toBe('089');
    expect(formatThaiPhone(null)).toBe('');
  });

  it('makes tel: and LINE links', () => {
    expect(telOf('089-202-9053')).toBe('+66892029053');
    expect(telOf('+1 555 0100')).toBe('+15550100');
    expect(lineUrl('@baanrai')).toBe('https://line.me/R/ti/p/%40baanrai');
    expect(lineUrl('jit')).toBe('https://line.me/R/ti/p/~jit');
    expect(PHONES[0].tel).toMatch(/^\+66/);
    expect(CHECK_IN_TIME).toBe('14:00');
  });
});

describe('photos', () => {
  it('opens the home photos on the time of day at the farm', () => {
    expect(partOfDay(new Date('2026-03-01T00:00:00Z'))).toBe('morning');
    expect(partOfDay(new Date('2026-03-01T06:00:00Z'))).toBe('day');
    expect(partOfDay(new Date('2026-03-01T13:00:00Z'))).toBe('evening');
    const slides = heroSlidesNow(new Date('2026-03-01T13:00:00Z'));
    expect(slides[0]).toBe('/images/farm/home-bbq5.jpg');
    expect(new Set(slides).size).toBe(slides.length);
    expect(heroSlidesNow().length).toBeGreaterThan(0);
    expect(LOGIN_SLIDES.length).toBe(6);
    expect(FARM_PHOTOS.main).toContain('entrance');
  });

  it('uses uploaded photos, or the built-in ones', () => {
    const uploaded = { id: 1, photos: [{ id: 7, file: '/uploads/a.jpg' }] };
    expect(roomPhotos(uploaded)).toEqual([{ id: 'photo-7', src: 'http://localhost:4000/uploads/a.jpg' }]);
    expect(roomPhotos({ id: 3 }).map((p) => p.src)).toEqual(['/images/rooms/room-3-1.jpg', '/images/rooms/room-3-2.jpg']);
    expect(roomPhotos({ id: 9, image_url: '/custom.jpg' })).toEqual([{ id: 'room-9-custom', src: '/custom.jpg' }]);
    expect(roomCover({ id: 9 })).toBe('/images/rooms/room-9.jpg');
    expect(roomCover({ id: 3 })).toBe('/images/rooms/room-3-1.jpg');
    expect(listingPhotos(null)).toEqual([]);
  });
});

describe('room cache', () => {
  it('remembers the last room list', () => {
    expect(cachedRoom(1)).toBeNull();
    expect(rememberRooms(null)).toBeNull();
    const data = { rooms: [{ id: 1, name: 'A' }], pet_fee: 100 };
    expect(rememberRooms(data)).toBe(data);
    expect(cachedRooms()).toBe(data);
    expect(cachedRoom('1')).toEqual({ rooms: data.rooms, pet_fee: 100, room: data.rooms[0] });
    expect(cachedRoom(2)).toBeNull();
  });
});

describe('add to calendar', () => {
  it('downloads an .ics file from check-in to check-out in Bangkok time', async () => {
    let blob;
    URL.createObjectURL = vi.fn((b) => {
      blob = b;
      return 'blob:ics';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.useFakeTimers();
    addToCalendar({
      code: 'BR-1',
      checkIn: '2026-03-04',
      checkOut: '2026-03-06',
      inTime: '14:00',
      outTime: '12:00',
      title: 'Baanrai, stay',
      details: 'Line 1\nLine 2; ok',
      location: 'Pak Chong',
    });
    expect(click).toHaveBeenCalled();
    const text = await blob.text();
    expect(text).toContain('DTSTART:20260304T070000Z');
    expect(text).toContain('DTEND:20260306T050000Z');
    expect(text).toContain('SUMMARY:Baanrai\\, stay');
    expect(text).toContain('DESCRIPTION:Line 1\\nLine 2\\; ok');
    expect(text).toContain('LOCATION:Pak Chong');
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:ics');
    vi.useRealTimers();

    addToCalendar({ code: 'BR-2', checkIn: '2026-03-04', checkOut: '2026-03-05', inTime: '14:00', outTime: '12:00' });
    expect(await blob.text()).not.toContain('LOCATION');
  });
});
