import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../lib/api';
import { useLang } from '../i18n/lang';
import Lightbox from './Lightbox';
import './ChatThread.css';

export default function ChatThread({ messages, mine, onSend, onSendImage, labels, locale, starters, quick }) {
  const { t } = useLang();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [viewing, setViewing] = useState(null);
  const fileRef = useRef(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const count = messages.length;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count, preview]);

  // A photo goes out as soon as it is picked, with whatever is typed as its caption.
  async function pickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || sending) return;
    if (!file.type.startsWith('image/')) {
      setError(t('chat.photoOnly'));
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    setSending(true);
    setError(null);
    try {
      await onSendImage(file, text);
      setText('');
    } catch (err) {
      setError(err.reason === 'TOO_LARGE' ? t('chat.photoTooBig') : err.message);
    } finally {
      setSending(false);
      setPreview(null);
      URL.revokeObjectURL(url);
    }
  }

  const photos = messages.filter((m) => m.image).map((m) => ({ id: m.id, src: mediaUrl(m.image) }));

  async function handleSubmit(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(body);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      handleSubmit(e);
    }
  }

  const fmtTime = (d) => new Date(d).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="chat-thread">
      <div className="chat-thread__list" ref={listRef} aria-live="polite">
        {count === 0 && <p className="chat-thread__empty">{labels.empty}</p>}
        {count === 0 && starters?.length > 0 && (
          <div className="chat-thread__starters">
            {starters.map((q) => (
              <button key={q} type="button" onClick={() => setText(q)}>
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg${mine(m) ? ' chat-msg--mine' : ''}${m.image ? ' chat-msg--photo' : ''}`}>
            {m.image && (
              <button
                type="button"
                className="chat-msg__photo"
                onClick={() => setViewing(photos.findIndex((p) => p.id === m.id))}
                aria-label={t('chat.photoOpen')}
              >
                <img src={mediaUrl(m.image)} alt="" loading="lazy" />
              </button>
            )}
            {m.body && <p>{m.body}</p>}
            <time dateTime={m.created_at}>{fmtTime(m.created_at)}</time>
          </div>
        ))}
        {preview && (
          <div className="chat-msg chat-msg--mine chat-msg--photo is-sending" aria-label={t('chat.photoSending')}>
            <span className="chat-msg__photo">
              <img src={preview} alt="" />
            </span>
            <time>{t('chat.photoSending')}</time>
          </div>
        )}
      </div>
      {viewing !== null && photos[viewing] && (
        <Lightbox photos={photos} index={viewing} onChange={setViewing} onClose={() => setViewing(null)} />
      )}

      {error && <p className="chat-thread__error" role="alert">{error}</p>}
      {quick?.length > 0 && (
        <div className="chat-thread__quick">
          {quick.map((q) => (
            <button key={q.label} type="button" onClick={() => setText(q.text)}>
              {q.label}
            </button>
          ))}
        </div>
      )}
      <form className="chat-thread__form" onSubmit={handleSubmit}>
        {onSendImage && (
          <>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
            <button
              type="button"
              className="chat-thread__attach"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
              aria-label={t('chat.photoAdd')}
              title={t('chat.photoAdd')}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2.5" />
                <circle cx="9" cy="10" r="1.8" />
                <path d="M21 16l-5-5-8 8" />
              </svg>
            </button>
          </>
        )}
        <textarea
          rows={1}
          maxLength={2000}
          placeholder={labels.placeholder}
          aria-label={labels.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" disabled={sending || !text.trim()}>
          {labels.send}
        </button>
      </form>
    </div>
  );
}
