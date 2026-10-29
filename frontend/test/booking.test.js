import { describe, expect, it } from 'vitest';
import {
  addDays,
  bookedNightSet,
  dayOf,
  formatDay,
  formatDayShort,
  formatStay,
  isISODate,
  nearbyFreeStays,
  nextFreeStart,
  nightsBetween,
  priceStay,
  promoFor,
  promosForRoom,
  rangeIsFree,
  roomMaxGuests,
  roomNames,
  splitGuests,
  toISODate,
} from '../src/lib/booking';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

describe('dates', () => {
  it('reads and writes YYYY-MM-DD days', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-2-28')).toBe(false);
    expect(isISODate('2026-99-99')).toBe(false);
    expect(isISODate(undefined)).toBe(false);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(dayOf('2026-03-04T10:00:00Z')).toBe('2026-03-04');
  });

  it('counts nights, never below zero', () => {
    expect(nightsBetween('2026-03-01', '2026-03-04')).toBe(3);
    expect(nightsBetween('2026-03-04', '2026-03-01')).toBe(0);
    expect(nightsBetween('', '2026-03-01')).toBe(0);
  });

  it('formats days and stays', () => {
    expect(formatDay('2026-03-04', 'en-US')).toBe('Mar 4, 2026');
    expect(formatDayShort('2026-03-04', 'en-US', WD)).toBe('Wed Mar 4');
    expect(formatStay('2026-03-04', '2026-03-06', 'en-US', WD)).toBe('Wed 4 – Fri Mar 6');
    expect(formatStay('2026-03-30', '2026-04-02', 'en-US', WD)).toBe('Mar 30 – Apr 2');
    expect(formatStay('2026-03-04', null, 'en-US', WD)).toBe('Wed Mar 4 – ?');
  });
});

describe('free nights', () => {
  const booked = bookedNightSet([{ check_in: '2026-03-05', check_out: '2026-03-07' }]);

  it('knows which nights are taken', () => {
    expect([...booked]).toEqual(['2026-03-05', '2026-03-06']);
    expect(bookedNightSet(null).size).toBe(0);
    expect(rangeIsFree(booked, '2026-03-03', '2026-03-05')).toBe(true);
    expect(rangeIsFree(booked, '2026-03-04', '2026-03-06')).toBe(false);
  });

  it('finds the next free start', () => {
    expect(nextFreeStart(booked, '2026-03-04', 2)).toBe('2026-03-07');
    expect(nextFreeStart(new Set(['2026-03-02']), '2026-03-01', 1, 1)).toBeNull();
  });

  it('suggests nearby dates with enough beds, never in the past', () => {
    const rooms = [{ id: 1, capacity: 2, max_extra_guests: 1 }, { id: 2, capacity: 2 }];
    const taken = new Map([[1, booked], [2, booked]]);
    const found = nearbyFreeStays(rooms, taken, '2026-03-05', 2, 4, '2026-03-04');
    expect(found.map((f) => f.checkIn)).toEqual(['2026-03-07', '2026-03-08', '2026-03-09']);
    expect(nearbyFreeStays(rooms, taken, '2026-03-05', 1, 20, '2026-03-01')).toEqual([]);
    expect(nearbyFreeStays(rooms, new Map(), '2026-03-05', 1, 2, '2026-03-01')).toHaveLength(3);
  });
});

describe('rooms and prices', () => {
  it('splits a room name into Thai and English', () => {
    expect(roomNames("Father's Room · ห้องพ่อ", 'th')).toEqual({ title: 'ห้องพ่อ', subtitle: "Father's Room" });
    expect(roomNames("Father's Room · ห้องพ่อ", 'en')).toEqual({ title: "Father's Room", subtitle: 'ห้องพ่อ' });
    expect(roomNames('Barn', 'th')).toEqual({ title: 'Barn', subtitle: undefined });
    expect(roomNames(null, 'en').title).toBe('');
  });

  it('knows how many guests fit', () => {
    expect(roomMaxGuests({ capacity: 2, max_extra_guests: 2 })).toBe(4);
    expect(roomMaxGuests({ capacity: 3 })).toBe(3);
    expect(roomMaxGuests(null)).toBe(14);
    expect(splitGuests([{ capacity: 2, max_extra_guests: 1 }, { capacity: 2 }], 5)).toEqual([3, 2]);
    expect(splitGuests([{}], 14)).toEqual([14]);
    expect(splitGuests([], 1)).toBeNull();
    expect(splitGuests([{ capacity: 1 }], 3)).toBeNull();
  });

  it('prices a stay the same way as the server', () => {
    expect(priceStay({ price: 1800, capacity: 2 }, 2, 3, 500, 1, 100, { percent: 10 })).toEqual({
      base: 3600,
      extraGuests: 1,
      extraTotal: 1000,
      petTotal: 200,
      discount: 360,
      total: 4440,
    });
    expect(priceStay({ price: 500 }, 1, 9, 500).extraGuests).toBe(0);
  });

  it('picks the best promotion for a room and day', () => {
    const promos = [
      { room_id: null, percent: 10, starts_on: '2026-01-01', ends_on: '2026-12-31' },
      { room_id: 1, percent: 25, starts_on: '2026-06-01', ends_on: '2026-06-30' },
      { room_id: 2, percent: 50, starts_on: '2026-06-01', ends_on: '2026-06-30' },
    ];
    expect(promoFor(promos, 1, '2026-06-10').percent).toBe(25);
    expect(promoFor(promos, 1, '2027-01-01')).toBeNull();
    expect(promoFor(promos, 1, '')).toBeNull();
    expect(promoFor(null, 1, '2026-06-10')).toBeNull();
    expect(promosForRoom(promos, 1)).toHaveLength(2);
    expect(promosForRoom(undefined, 1)).toEqual([]);
  });
});
