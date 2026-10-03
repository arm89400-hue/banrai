import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import ChatThread from '../components/ChatThread';
import './AdminChat.css';

// How often the conversation list and the open conversation are refreshed.
const POLL_MS = 4000;

const LABELS = {
  empty: 'No messages yet. Write the first one below.',
  placeholder: 'Write a message…',
  send: 'Send',
};

const fmtWhen = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// A room account is shown by its guest and room; a member by their email.
function chatName(c) {
  return c.stay_booking_id ? c.guest_name || c.email : c.email;
}
function chatSub(c) {
  return c.stay_booking_id ? `Room login ${c.email}${c.room_name ? ` · ${c.room_name}` : ''}` : `Member ${c.member_code}`;
}

// Admin "Chat" section: every account on the left (unread and most recent
// first), the chosen account's conversation on the right. Both refresh every
// few seconds, so replies show up without reloading the page.
export default function AdminChat() {
  const [chats, setChats] = useState(null);
  const [error, setError] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');

  const loadChats = useCallback(() => {
    api('/api/admin/chats')
      .then((data) => {
        setChats(data.chats);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadChats();
    const timer = setInterval(loadChats, POLL_MS);
    return () => clearInterval(timer);
  }, [loadChats]);

  // Loads the open conversation and keeps it fresh. `cancelled` drops a
  // response that arrives after switching to another conversation.
  useEffect(() => {
    if (activeId == null) return undefined;
    let cancelled = false;
    const load = () =>
      api(`/api/admin/chats/${activeId}`)
        .then((data) => {
          if (!cancelled) setMessages(data.messages);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId]);

  function open(id) {
    if (id === activeId) return;
    setMessages([]);
    setActiveId(id);
  }

  async function send(body) {
    const data = await api(`/api/admin/chats/${activeId}`, { method: 'POST', body: JSON.stringify({ body }) });
    setMessages((list) => [...list, data.message]);
    loadChats();
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats ?? [];
    return (chats ?? []).filter((c) =>
      [c.email, c.guest_name, c.room_name, c.member_code].some((v) => v?.toLowerCase().includes(q))
    );
  }, [chats, query]);

  const active = chats?.find((c) => c.user_id === activeId);

  if (error && !chats) return <p className="admin__error" role="alert">{error}</p>;
  if (!chats) return <p className="admin__muted">Loading…</p>;

  return (
    <div className={`achat${active ? ' achat--open' : ''}`}>
      <aside className="achat__list">
        <input
          type="search"
          className="admin__search"
          placeholder="Search name, email or room"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul>
          {shown.map((c) => (
            <li key={c.user_id}>
              <button
                type="button"
                className={`achat__item${c.user_id === activeId ? ' is-active' : ''}`}
                onClick={() => open(c.user_id)}
              >
                <span className="achat__name">
                  {chatName(c)}
                  {/* The open conversation is being read right now. */}
                  {c.unread > 0 && c.user_id !== activeId && <span className="achat__badge">{c.unread}</span>}
                </span>
                <span className="achat__sub">{chatSub(c)}</span>
                <span className="achat__last">
                  {c.last_body ? `${c.last_from_admin ? 'You: ' : ''}${c.last_body}` : 'No messages yet'}
                </span>
                {c.last_at && <span className="achat__when">{fmtWhen(c.last_at)}</span>}
              </button>
            </li>
          ))}
        </ul>
        {shown.length === 0 && (
          <p className="admin__empty">{chats.length === 0 ? 'No accounts to chat with yet.' : 'No accounts match.'}</p>
        )}
      </aside>

      <section className="achat__thread">
        {active ? (
          <>
            <header className="achat__head">
              <button type="button" className="admin__btn achat__back" onClick={() => setActiveId(null)}>
                ← All chats
              </button>
              <div>
                <strong>{chatName(active)}</strong>
                <span className="achat__sub">{chatSub(active)}</span>
              </div>
            </header>
            <ChatThread messages={messages} mine={(m) => m.from_admin} onSend={send} labels={LABELS} />
          </>
        ) : (
          <p className="admin__empty achat__pick">Choose an account on the left to read and reply.</p>
        )}
      </section>
    </div>
  );
}
