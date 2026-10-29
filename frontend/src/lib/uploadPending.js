import { api } from './api';
import { shrinkImage } from './imageResize';

export async function uploadPending(kind, itemId, pending) {
  let photos = [];
  try {
    for (const p of pending) {
      const body = await shrinkImage(p.file);
      const data = await api(`/api/admin/${kind}/${itemId}/photos`, {
        method: 'POST',
        body,
        headers: { 'Content-Type': body.type || 'application/octet-stream' },
      });
      photos = data.photos;
    }
  } catch (err) {
    err.photos = photos;
    if (err.status === 413) err.message = 'A photo was too large (max 8 MB).';
    throw err;
  }
  pending.forEach((p) => URL.revokeObjectURL(p.url));
  return photos;
}
