import { useEffect, useRef, useState } from 'react';
import './ChatThread.css';

// The message list + composer shared by the guest's chat window
// (ChatWidget.jsx) and the admin's Chat section (AdminChat.jsx).
// `mine(message)` says which messages sit on the right; `onSend(text)`
// resolves once the message is stored. `labels` holds the visible strings:
// { empty, placeholder, send }.
export default function ChatThread({ messages, mine, onSend, labels, locale }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const count = messages.length;

  // Keeps the newest message in view when one arrives.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [count]);

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

  // Enter sends; Shift+Enter makes a new line.
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
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg${mine(m) ? ' chat-msg--mine' : ''}`}>
            <p>{m.body}</p>
            <time dateTime={m.created_at}>{fmtTime(m.created_at)}</time>
          </div>
        ))}
      </div>

      {error && <p className="chat-thread__error" role="alert">{error}</p>}
      <form className="chat-thread__form" onSubmit={handleSubmit}>
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
