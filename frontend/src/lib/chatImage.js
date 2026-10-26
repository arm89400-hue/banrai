import { api } from './api';
import { shrinkImage } from './imageResize';

// Sends one photo to a chat (guest: /api/chat/image, admin:
// /api/admin/chats/:id/image). Large phone photos are shrunk first.
export async function sendChatImage(path, file, text = '') {
  const blob = await shrinkImage(file);
  const q = text.trim() ? `?text=${encodeURIComponent(text.trim())}` : '';
  const data = await api(`${path}${q}`, {
    method: 'POST',
    body: blob,
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
  });
  return data.message;
}
