import { useState } from 'react';
import { api, mediaUrl } from '../lib/api';
import { shrinkImage } from '../lib/imageResize';
import { useLang } from '../i18n/lang';

export const MAX_PHOTOS = 6;

const isImage = (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name);

export default function AdminPhotos({ kind, itemId, photos, onChange, pending, onPendingChange }) {
  if (itemId == null) return <PendingPhotos pending={pending} onChange={onPendingChange} />;
  return <SavedPhotos kind={kind} itemId={itemId} photos={photos} onChange={onChange} />;
}

let nextKey = 0;

function PendingPhotos({ pending, onChange }) {
  const { t } = useLang();
  const [note, setNote] = useState(null);
  const free = MAX_PHOTOS - pending.length;

  function add(fileList) {
    const files = [...fileList].filter(isImage);
    if (!files.length) return;
    const skipped = files.length - free;
    setNote(skipped > 0 ? t('adm.photos.skipped', { free, max: MAX_PHOTOS, skipped }) : null);
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
      hint={t('adm.photos.uploadOnSave')}
      note={note}
    />
  );
}

function SavedPhotos({ kind, itemId, photos, onChange }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const free = MAX_PHOTOS - photos.length;

  async function upload(fileList) {
    const files = [...fileList].filter(isImage);
    if (!files.length) return;
    setError(null);
    const skipped = files.length - free;
    setNote(skipped > 0 ? t('adm.photos.skipped', { free, max: MAX_PHOTOS, skipped }) : null);
    const batch = files.slice(0, free);
    try {
      for (let i = 0; i < batch.length; i++) {
        setBusy(t('adm.photos.uploading', { n: i + 1, total: batch.length }));
        const body = await shrinkImage(batch[i]);
        const data = await api(`/api/admin/${kind}/${itemId}/photos`, {
          method: 'POST',
          body,
          headers: { 'Content-Type': body.type || 'application/octet-stream' },
        });
        onChange(data.photos);
      }
    } catch (err) {
      setError(err.status === 413 ? t('adm.photos.tooBig') : err.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(index) {
    const photo = photos[index];
    if (!window.confirm(t('adm.photos.askDelete'))) return;
    setError(null);
    setBusy(t('adm.del.deleting'));
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
    setBusy(t('adm.photos.savingOrder'));
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

function PhotoGrid({ items, onAdd, onRemove, onMove, busy = null, hint = null, note = null, error = null }) {
  const { t } = useLang();
  const free = MAX_PHOTOS - items.length;

  return (
    <section className="admin-photos" aria-label={t('adm.list.photos')}>
      <header className="admin-photos__head">
        <h3>
          {t('adm.list.photos')} <span className="admin-photos__count">{items.length} / {MAX_PHOTOS}</span>
        </h3>
      </header>

      <ol className="admin-photos__grid">
        {items.map((item, i) => (
          <li key={item.key} className="admin-photos__tile">
            <img src={item.src} alt={i === 0 ? t('adm.photos.cover') : t('adm.photos.number', { n: i + 1 })} loading="lazy" />
            {i === 0 && <span className="admin-photos__cover">{t('adm.photos.cover')}</span>}
            <div className="admin-photos__tools">
              {i > 0 && (
                <button type="button" onClick={() => onMove(i, -1)} disabled={Boolean(busy)} aria-label={t('adm.photos.left', { n: i + 1 })}>
                  ←
                </button>
              )}
              {i < items.length - 1 && (
                <button type="button" onClick={() => onMove(i, 1)} disabled={Boolean(busy)} aria-label={t('adm.photos.right', { n: i + 1 })}>
                  →
                </button>
              )}
              <button type="button" className="is-danger" onClick={() => onRemove(i)} disabled={Boolean(busy)} aria-label={t('adm.photos.delete', { n: i + 1 })}>
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
              {busy ?? t('adm.photos.add', { free })}
            </label>
          </li>
        )}
        {Array.from({ length: Math.max(0, free - 1) }, (_, i) => (
          <li key={`empty-${i}`} className="admin-photos__empty" aria-hidden="true" />
        ))}
      </ol>

      {free === 0 && <p className="admin__muted">{t('adm.photos.full', { max: MAX_PHOTOS })}</p>}
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
