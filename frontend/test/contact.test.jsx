import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const reply = (body) => ({ ok: true, status: 200, json: async () => body });

// contact.js keeps one shared copy for the whole page, so each test loads it fresh.
const load = () => import('../src/lib/contact');

describe('contact hook', () => {
  it('shows the built-in numbers, then the saved contact, loading it only once', async () => {
    const fetch = vi.fn(async () =>
      reply({ contact: { phones: [{ name_th: 'จิต', name_en: 'Jit', number: '089-202-9053' }], line: '@b', facebook: '', maps: '' } })
    );
    vi.stubGlobal('fetch', fetch);
    const { useContact } = await load();
    const { result } = renderHook(() => useContact());
    expect(result.current.facebook).toMatch(/^https:/);
    await waitFor(() => expect(result.current.line).toBe('@b'));
    expect(result.current.phones).toEqual([{ name: { th: 'จิต', en: 'Jit' }, display: '089-202-9053', tel: '+66892029053' }]);
    renderHook(() => useContact());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('updates every page when the admin saves', async () => {
    vi.stubGlobal('fetch', async () => reply({ contact: null }));
    const { setContact, useContact } = await load();
    const { result, unmount } = renderHook(() => useContact());
    act(() => setContact({ phones: [], line: '', facebook: 'https://fb', maps: 'https://maps' }));
    expect(result.current).toEqual({ phones: [], line: '', facebook: 'https://fb', maps: 'https://maps' });
    unmount();
  });

  it('keeps the built-in numbers when loading fails', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const { useContact } = await load();
    const { result } = renderHook(() => useContact());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.phones.length).toBeGreaterThan(0);
  });
});
