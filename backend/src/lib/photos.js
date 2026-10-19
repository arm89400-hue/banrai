import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, join, resolve } from 'node:path';

export const MAX_PHOTOS = 6;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? 'uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

export const PHOTO_OWNERS = {
  rooms: { table: 'rooms', column: 'room_id' },
  activities: { table: 'activities', column: 'activity_id' },
  announcements: { table: 'announcements', column: 'announcement_id' },
};

export const photosJson = (column, idRef) => `coalesce((
  SELECT json_agg(json_build_object('id', p.id, 'file', p.file) ORDER BY p.position, p.id)
  FROM photos p WHERE p.${column} = ${idRef}
), '[]'::json)`;

export function imageExtension(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export async function saveUpload(buf, ext, prefix) {
  const name = `${prefix}-${randomUUID()}.${ext}`;
  await writeFile(join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}

export async function removeUploads(files) {
  await Promise.all(
    files
      .filter((file) => typeof file === 'string' && file.startsWith('/uploads/'))
      .map((file) => unlink(join(UPLOAD_DIR, basename(file))).catch(() => {}))
  );
}
