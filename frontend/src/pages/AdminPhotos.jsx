import { useState } from 'react';
import { api, mediaUrl } from '../lib/api';
import { shrinkImage } from '../lib/imageResize';

export const MAX_PHOTOS = 6;

const isImage = (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name);

// Photo manager for one room, activity or announcement in admin: up to 6
// photos, the first is the cover. Upload (several at once, shrunk in the
// browser first), delete, and move left/right. `photos` is [{ id, file }];
// every change reports the new list through onChange.
// Before the item is saved (`itemId` null) the same grid works on `pending`
// - picked files [{ key, file, url }] kept in the browser and reported
// through onPendingChange - which the form uploads with uploadPending()
// right after it creates the item (lib/uploadPending.js).
export default function AdminPhotos({ kind, itemId, photos, onChange, pending, onPendingChange }) {
  if (itemId == null) return <PendingPhotos pending={pending} onChange={onPendingChange} />;
  return <SavedPhotos kind={kind} itemId={itemId} photos={photos} onChange={onChange} />;
}

let nextKey = 0;

function PendingPhotos({ pending, onChange }) {
  const [note, setNote] = useState(null);
  const free = MAX_PHOTOS - pending.length;

  function add(fileList) {
    const files = [...fileList].filter(isImage);
    if (!files.length) return;
    const skipped = files.length - free;
    setNote(skipped > 0 ? `Only ${free} more fit (max ${MAX_PHOTOS}), so ${skipped} skipped.` : null);
    const added = files.slice(0, free).map((file) => ({ key: `p${nextKey++}`, file, url: URL.createObjectURL(file) }));
    onChange([...pending, ...added]);
  }

  function remove(index) {
    URL.revokeObjectURL(pending[index].url);
    onChange(pending.filter((_, i) => i !== index));
  }

  function move(index, step) {
    const next = [...pending];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  }

  return (
    <PhotoGrid
      items={pending.map((p) => ({ key: p.key, src: p.url }))}
      onAdd={add}
      onRemove={remove}
      onMove={move}
      hint="Photos upload when you press Save."
      note={note}
    />
  );
}

function SavedPhotos({ kind, itemId, photos, onChange }) {
  const [busy, setBusy] = useState(null); // status text while working
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const free = MAX_PHOTOS - photos.length;

  async function upload(fileList) {
    const files = [...fileList].filter(isImage);
    if (!files.length) return;
    setError(null);
    const skipped = files.length - free;
    setNote(skipped > 0 ? `Only ${free} more fit (max ${MAX_PHOTOS}), so ${skipped} skipped.` : null);
    const batch = files.slice(0, free);
    try {
      // One at a time, in the order picked, so the limit and order hold.
      for (let i = 0; i < batch.length; i++) {
        setBusy(`Uploading ${i + 1} of ${batch.length}…`);
        const body = await shrinkImage(batch[i]);
        const data = await api(`/api/admin/${kind}/${itemId}/photos`, {
          method: 'POST',
          body,
          headers: { 'Content-Type': body.type || 'application/octet-stream' },
        });
        onChange(data.photos);
      }
    } catch (err) {
      setError(err.status === 413 ? 'That photo is too large (max 8 MB).' : err.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(index) {
    const photo = photos[index];
    if (!window.confirm('Delete this photo? This can’t be undone.')) return;
    setError(null);
    setBusy('Deleting…');
    try {
      const data = await api(`/api/admin/photos/${photo.id}`, { method: 'DELETE' });
      onChange(data.photos);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function move(index, step) {
    const ids = photos.map((p) => p.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    setError(null);
    setBusy('Saving order…');
    try {
      const data = await api(`/api/admin/${kind}/${itemId}/photos/order`, {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      });
      onChange(data.photos);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PhotoGrid
      items={photos.map((p) => ({ key: p.id, src: mediaUrl(p.file) }))}
      onAdd={upload}
      onRemove={remove}
      onMove={move}
      busy={busy}
      note={note}
      error={error}
    />
  );
}

// The 6-slot grid both modes share: tiles with ← → ✕, then an "Add" tile.
function PhotoGrid({ items, onAdd, onRemove, onMove, busy = null, hint = null, note = null, error = null }) {
  const free = MAX_PHOTOS - items.length;

  return (
    <section className="admin-photos" aria-label="Photos">
      <header className="admin-photos__head">
        <h3>
          Photos <span className="admin-photos__count">{items.length} / {MAX_PHOTOS}</span>
        </h3>
      </header>

      <ol className="admin-photos__grid">
        {items.map((item, i) => (
          <li key={item.key} className="admin-photos__tile">
            <img src={item.src} alt={i === 0 ? 'Cover' : `Number ${i + 1}`} loading="lazy" />
            {i === 0 && <span className="admin-photos__cover">Cover</span>}
            <div className="admin-photos__tools">
              {i > 0 && (
                <button type="button" onClick={() => onMove(i, -1)} disabled={Boolean(busy)} aria-label={`Move photo ${i + 1} left`}>
                  ←
                </button>
              )}
              {i < items.length - 1 && (
                <button type="button" onClick={() => onMove(i, 1)} disabled={Boolean(busy)} aria-label={`Move photo ${i + 1} right`}>
                  →
                </button>
              )}
              <button type="button" className="is-danger" onClick={() => onRemove(i)} disabled={Boolean(busy)} aria-label={`Delete photo ${i + 1}`}>
                ✕
              </button>
            </div>
          </li>
        ))}
        {free > 0 && (
          <li className="admin-photos__add">
            <label className={busy ? 'is-busy' : ''}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                multiple
                disabled={Boolean(busy)}
                onChange={(e) => {
                  onAdd(e.target.files);
                  e.target.value = '';
                }}
              />
              <span aria-hidden="true">+</span>
              {busy ?? `Add photo${free > 1 ? 's' : ''} (${free} left)`}
            </label>
          </li>
        )}
        {Array.from({ length: Math.max(0, free - 1) }, (_, i) => (
          <li key={`empty-${i}`} className="admin-photos__empty" aria-hidden="true" />
        ))}
      </ol>

      {free === 0 && <p className="admin__muted">This has the maximum of {MAX_PHOTOS} photos. Delete one to add another.</p>}
      {busy && free === 0 && <p className="admin__muted">{busy}</p>}
      {hint && items.length > 0 && <p className="admin__muted">{hint}</p>}
      {note && <p className="admin__muted">{note}</p>}
      {error && (
        <p className="admin__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
