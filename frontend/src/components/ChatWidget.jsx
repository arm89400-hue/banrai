import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import ChatThread from './ChatThread';
import './ChatWidget.css';

// How often the open chat is refreshed, and how often the unread badge is
// while the chat is closed.
const OPEN_POLL_MS = 4000;
const CLOSED_POLL_MS = 20000;

// Floating "chat with us" button on the public site. Signed-in members and
// room accounts get a small window with their conversation with the
// property (which answers from the admin dashboard's Chat section).
// Visitors who aren't signed in see the same button, and are asked to log
// in first - a conversation has to belong to an account. Renders nothing
// for admins.
export default function ChatWidget() {
  const { user } = useAuth();
  const { t, locale } = useLang();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const { pathname, search } = useLocation();
  // Has a conversation: any signed-in account except an admin.
  const enabled = Boolean(user) && !user.is_admin;
  const userId = user?.id;

  // Closed: only the unread count. Open: the conversation itself, which
  // also marks the property's messages as read.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = open
      ? () =>
          api('/api/chat')
            .then((data) => {
              if (cancelled) return;
              setMessages(data.messages);
              setUnread(0);
            })
            .catch(() => {})
      : () =>
          api('/api/chat/unread')
            .then((data) => {
              if (!cancelled) setUnread(data.unread);
            })
            .catch(() => {});
    load();
    const timer = setInterval(load, open ? OPEN_POLL_MS : CLOSED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, open, userId]);

  // Another account signing in must not see the previous one's messages.
  useEffect(() => {
    setOpen(false);
    setMessages([]);
    setUnread(0);
  }, [userId]);

  if (user?.is_admin) return null;
  // The login page is already where a visitor would be sent.
  if (!user && pathname === '/login') return null;

  async function send(body) {
    const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ body }) });
    setMessages((list) => [...list, data.message]);
  }

  return (
    <div className="chat-widget">
      {open && (
        <section className="chat-widget__panel" aria-label={t('chat.title')}>
          <header>
            <div>
              <strong>{t('chat.title')}</strong>
              <span>{t('chat.subtitle')}</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label={t('chat.close')}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>
          {enabled ? (
            <ChatThread
              messages={messages}
              mine={(m) => !m.from_admin}
              onSend={send}
              locale={locale}
              labels={{ empty: t('chat.empty'), placeholder: t('chat.placeholder'), send: t('chat.send') }}
            />
          ) : (
            <div className="chat-widget__gate">
              <p>{t('chat.loginFirst')}</p>
              <Link
                className="chat-widget__login"
                to={`/login?next=${encodeURIComponent(pathname + search)}`}
                onClick={() => setOpen(false)}
              >
                {t('chat.login')}
              </Link>
            </div>
          )}
        </section>
      )}

      <button
        type="button"
        className="chat-widget__toggle"
        aria-expanded={open}
        aria-label={open ? t('chat.close') : t('chat.open')}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        <span>{t('chat.open')}</span>
        {unread > 0 && <span className="chat-widget__badge">{unread}</span>}
      </button>
    </div>
  );
}
