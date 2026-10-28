import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import LanguageProvider from '../src/i18n/LanguageProvider';
import { useLang } from '../src/i18n/lang';
import { STRINGS } from '../src/i18n/strings';
import { usePromotions } from '../src/lib/promotions';
import { useAdminBadges, useAdminData } from '../src/lib/adminData';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('language', () => {
  const wrapper = ({ children }) => <LanguageProvider>{children}</LanguageProvider>;

  it('starts in Thai, switches to English and remembers it', () => {
    const { result } = renderHook(() => useLang(), { wrapper });
    expect(result.current.lang).toBe('th');
    expect(result.current.locale).toBe('th-TH');
    act(() => result.current.setLang('en'));
    expect(result.current.locale).toBe('en-US');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
    act(() => result.current.setLang('fr'));
    expect(result.current.lang).toBe('en');
  });

  it('starts in the saved language, ignoring unknown ones', () => {
    localStorage.setItem('lang', 'en');
    expect(renderHook(() => useLang(), { wrapper }).result.current.lang).toBe('en');
    localStorage.setItem('lang', 'xx');
    expect(renderHook(() => useLang(), { wrapper }).result.current.lang).toBe('th');
  });

  it('still works when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useLang(), { wrapper });
    expect(result.current.lang).toBe('th');
    act(() => result.current.setLang('en'));
    expect(result.current.lang).toBe('en');
  });

  it('fills in words and plurals, and falls back to English or the key', () => {
    STRINGS.en['test.nights'] = '{n} {n|night|nights} in {room}, {missing} {x|a|b}';
    const { result } = renderHook(() => useLang(), { wrapper });
    act(() => result.current.setLang('en'));
    expect(result.current.t('test.nights', { n: 1, room: 'Barn' })).toBe('1 night in Barn, {missing} {x|a|b}');
    expect(result.current.t('test.nights', { n: 3, room: 'Barn' })).toBe('3 nights in Barn, {missing} {x|a|b}');
    act(() => result.current.setLang('th'));
    expect(result.current.t('test.nights')).toBe(STRINGS.en['test.nights']);
    expect(result.current.t('no.such.key', { n: 1 })).toBe('no.such.key');
    delete STRINGS.en['test.nights'];
  });

  it('must be used inside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useLang())).toThrow(/LanguageProvider/);
  });

  it('renders its children', () => {
    const { getByText } = render(<LanguageProvider>hello</LanguageProvider>);
    expect(getByText('hello')).toBeTruthy();
  });
});

describe('promotions hook', () => {
  it('loads the promotions, and ignores errors', async () => {
    vi.stubGlobal('fetch', async () => reply(200, { promotions: [{ id: 1 }] }));
    const { result } = renderHook(() => usePromotions());
    await waitFor(() => expect(result.current).toEqual([{ id: 1 }]));
    vi.stubGlobal('fetch', async () => reply(500, {}));
    const failed = renderHook(() => usePromotions());
    await new Promise((r) => setTimeout(r, 0));
    expect(failed.result.current).toEqual([]);
  });

  it('does not update after it is gone', async () => {
    let answer;
    vi.stubGlobal('fetch', () => new Promise((r) => (answer = r)));
    const { result, unmount } = renderHook(() => usePromotions());
    unmount();
    await act(async () => answer(reply(200, { promotions: [{ id: 2 }] })));
    expect(result.current).toEqual([]);
  });
});

describe('admin data hook', () => {
  it('loads, reloads keeping the old data, and reports errors', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply(200, { n: 1 })).mockResolvedValueOnce(reply(500, { error: 'Down' }));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useAdminData('/api/admin/x'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }));
    await act(() => result.current.reload());
    expect(result.current).toMatchObject({ data: { n: 1 }, error: 'Down', loading: false });
  });

  it('does not update after it is gone', async () => {
    let answer;
    vi.stubGlobal('fetch', () => new Promise((r) => (answer = r)));
    const { result, unmount } = renderHook(() => useAdminData('/api/admin/x'));
    unmount();
    await act(async () => answer(reply(200, { n: 1 })));
    expect(result.current.data).toBeNull();
  });

  it('counts jobs and waiting chats for the menu, every few seconds', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const today = new Date().toISOString().slice(0, 10);
    const fetch = vi.fn(async (url) =>
      url.endsWith('/stats')
        ? reply(200, { stats: { waiting_chats: 2 } })
        : reply(200, { bookings: [{ id: 1, room_id: 1, code: 'A', status: 'pending', booked_for: today, booked_until: '2999-01-01' }] })
    );
    vi.stubGlobal('fetch', fetch);
    const { result, unmount } = renderHook(() => useAdminBadges(true, 'overview'));
    // waitFor polls with setInterval, which is faked here, so let one real tick pass instead.
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(result.current).toEqual({ overview: 2, chat: 2 });
    vi.advanceTimersByTime(8000);
    expect(fetch).toHaveBeenCalledTimes(4);
    unmount();
  });

  it('falls back to unread chats, and stays quiet when turned off or failing', async () => {
    vi.stubGlobal('fetch', async (url) => (url.endsWith('/stats') ? reply(200, { stats: { unread_chats: 0 } }) : reply(200, { bookings: [] })));
    const { result } = renderHook(() => useAdminBadges(true, 'x'));
    await waitFor(() => expect(result.current).toEqual({ overview: 0, chat: 0 }));
    vi.stubGlobal('fetch', async (url) => (url.endsWith('/stats') ? reply(200, { stats: {} }) : reply(200, { bookings: [] })));
    const none = renderHook(() => useAdminBadges(true, 'y'));
    await waitFor(() => expect(none.result.current).toEqual({ overview: 0, chat: 0 }));
    const fetch = vi.fn(async () => reply(500, {}));
    vi.stubGlobal('fetch', fetch);
    expect(renderHook(() => useAdminBadges(false, 'x')).result.current).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
    const failing = renderHook(() => useAdminBadges(true, 'x'));
    await new Promise((r) => setTimeout(r, 0));
    expect(failing.result.current).toEqual({});
  });

  it('ignores an answer that comes after it is gone', async () => {
    let answer;
    vi.stubGlobal('fetch', () => new Promise((r) => (answer = r)));
    const { result, unmount } = renderHook(() => useAdminBadges(true, 'x'));
    unmount();
    await act(async () => answer(reply(200, { stats: {}, bookings: [] })));
    expect(result.current).toEqual({});
  });
});
