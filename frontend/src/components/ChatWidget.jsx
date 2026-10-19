import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { lineUrl, useContact } from '../lib/contact';
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
  const { t, lang, locale } = useLang();
  const contact = useContact();
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
  // The room dashboard has the conversation open on the page itself.
  if (user && pathname === '/stay') return null;

  async function send(body) {
    const data = await api('/api/chat', { method: 'POST', body: JSON.stringify({ body }) });
    setMessages((list) => [...list, data.message]);
  }

  return (
    <div className="chat-widget">
      {open && (
        <section className={`chat-widget__panel${enabled ? '' : ' chat-widget__panel--contact'}`} aria-label={t('chat.title')}>
          <header>
            <div>
              <strong>{enabled ? t('chat.title') : t('chat.visitorTitle')}</strong>
              <span>{enabled ? t('chat.subtitle') : t('chat.visitorSub')}</span>
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
            // Visitors: a question shouldn't need an account, so the phone
            // lines and Facebook come first; website chat is for members.
            <div className="chat-widget__gate">
              {contact.phones.map((p) => (
                <a key={p.tel} className="chat-widget__contact" href={`tel:${p.tel}`}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
                  </svg>
                  <b>{t('chat.call', { name: p.name[lang] })}</b>
                  <span>{p.display}</span>
                </a>
              ))}
              {contact.line && (
                <a className="chat-widget__contact" href={lineUrl(contact.line)} target="_blank" rel="noreferrer">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 5h16v11H9l-5 4z" />
                  </svg>
                  <b>{t('chat.lineAsk')}</b>
                  <span>{contact.line}</span>
                </a>
              )}
              {contact.facebook && (
                <a className="chat-widget__contact" href={contact.facebook} target="_blank" rel="noreferrer">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                    <path d="M14 8h3V4h-3c-2.8 0-4 1.7-4 4.3V10H7v4h3v8h4v-8h3l1-4h-4V8.6c0-.4.3-.6.6-.6z" />
                  </svg>
                  <b>{t('chat.facebook')}</b>
                  <span aria-hidden="true">›</span>
                </a>
              )}
              <p>
                {t('chat.haveAccount')}{' '}
                <Link to={`/login?next=${encodeURIComponent(pathname + search)}`} onClick={() => setOpen(false)}>
                  {t('chat.loginHere')}
                </Link>
              </p>
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
