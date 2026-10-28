import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, mediaUrl } from '../src/lib/api';
import { shrinkImage } from '../src/lib/imageResize';
import { uploadPending } from '../src/lib/uploadPending';
import { sendChatImage } from '../src/lib/chatImage';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('sends the token and returns the answer', async () => {
    localStorage.setItem('token', 'abc');
    const fetch = vi.fn(async () => reply(200, { ok: 1 }));
    vi.stubGlobal('fetch', fetch);
    expect(await api('/api/x', { method: 'POST', headers: { 'X-A': '1' } })).toEqual({ ok: 1 });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('http://localhost:4000/api/x');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer abc', 'X-A': '1' });
  });

  it('throws the server message with its reason and status', async () => {
    vi.stubGlobal('fetch', async () => reply(409, { error: 'Taken', reason: 'ROOM_TAKEN' }));
    await expect(api('/api/x')).rejects.toMatchObject({ message: 'Taken', reason: 'ROOM_TAKEN', status: 409 });
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 502, json: async () => Promise.reject(new Error('not json')) }));
    await expect(api('/api/x')).rejects.toThrow('Request failed with 502');
  });

  it('logs out when the account expired or the session ended', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const reason of ['ACCOUNT_EXPIRED', 'SESSION_ENDED']) {
      localStorage.setItem('token', 'abc');
      localStorage.setItem('user', '{}');
      vi.stubGlobal('fetch', async () => reply(401, { reason }));
      await expect(api('/api/x')).rejects.toMatchObject({ reason });
      expect(localStorage.getItem('token')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    }
  });

  it('only rewrites uploaded files to the API address', () => {
    expect(mediaUrl('/uploads/a.jpg')).toBe('http://localhost:4000/uploads/a.jpg');
    expect(mediaUrl('/images/b.jpg')).toBe('/images/b.jpg');
    expect(mediaUrl(undefined)).toBeUndefined();
  });
});

function fakeCanvas(blob) {
  const drawImage = vi.fn();
  const canvas = { getContext: () => ({ drawImage }), toBlob: (cb) => cb(blob) };
  const make = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'canvas' ? canvas : make(tag)));
  return { canvas, drawImage };
}

describe('shrinking photos', () => {
  it('scales a big photo down to 1800 px on its long side', async () => {
    const out = new Blob(['jpg'], { type: 'image/jpeg' });
    const { canvas } = fakeCanvas(out);
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', async () => ({ width: 3600, height: 2400, close }));
    expect(await shrinkImage(new Blob(['x']))).toBe(out);
    expect([canvas.width, canvas.height]).toEqual([1800, 1200]);
    expect(close).toHaveBeenCalled();
  });

  it('keeps small photos their size and falls back to the original file', async () => {
    const file = new Blob(['x']);
    const { canvas } = fakeCanvas(null);
    vi.stubGlobal('createImageBitmap', async () => ({ width: 800, height: 600 }));
    expect(await shrinkImage(file)).toBe(file);
    expect(canvas.width).toBe(800);
    vi.stubGlobal('createImageBitmap', async () => Promise.reject(new Error('not an image')));
    expect(await shrinkImage(file)).toBe(file);
  });
});

describe('uploading photos', () => {
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', async () => Promise.reject(new Error('skip')));
    URL.revokeObjectURL = vi.fn();
  });

  it('uploads each pending photo and frees the previews', async () => {
    const fetch = vi.fn(async () => reply(201, { photos: [{ id: fetch.mock.calls.length }] }));
    vi.stubGlobal('fetch', fetch);
    const pending = [
      { file: new Blob(['a'], { type: 'image/png' }), url: 'blob:a' },
      { file: new Blob(['b']), url: 'blob:b' },
    ];
    expect(await uploadPending('rooms', 3, pending)).toEqual([{ id: 2 }]);
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:4000/api/admin/rooms/3/photos');
    expect(fetch.mock.calls[0][1].headers['Content-Type']).toBe('image/png');
    expect(fetch.mock.calls[1][1].headers['Content-Type']).toBe('application/octet-stream');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it('keeps the photos already uploaded when one fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(reply(201, { photos: [{ id: 1 }] })).mockResolvedValueOnce(reply(413, {}))
    );
    const pending = [{ file: new Blob(['a']) }, { file: new Blob(['b']) }];
    await expect(uploadPending('rooms', 1, pending)).rejects.toMatchObject({ photos: [{ id: 1 }], message: expect.stringMatching(/8 MB/) });
    vi.stubGlobal('fetch', async () => reply(500, { error: 'Boom' }));
    await expect(uploadPending('rooms', 1, pending)).rejects.toMatchObject({ photos: [], message: 'Boom' });
  });

  it('sends a chat photo with an optional caption', async () => {
    const fetch = vi.fn(async () => reply(201, { message: { id: 5 } }));
    vi.stubGlobal('fetch', fetch);
    expect(await sendChatImage('/api/chat/image', new Blob(['a'], { type: 'image/webp' }), '  Hi there ')).toEqual({ id: 5 });
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:4000/api/chat/image?text=Hi%20there');
    expect(fetch.mock.calls[0][1].headers['Content-Type']).toBe('image/webp');
    await sendChatImage('/api/chat/image', new Blob(['a']));
    expect(fetch.mock.calls[1][0]).toBe('http://localhost:4000/api/chat/image');
    expect(fetch.mock.calls[1][1].headers['Content-Type']).toBe('image/jpeg');
  });
});
