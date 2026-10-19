import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useLang } from '../i18n/lang';
import { roomNames } from '../lib/booking';
import ChatThread from '../components/ChatThread';
import './AdminChat.css';

const POLL_MS = 4000;

const fmtWhen = (d, locale) => new Date(d).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

function chatName(c) {
  return c.stay_booking_id ? c.guest_name || c.email : c.email;
}
function chatSub(c, t, lang) {
  if (!c.stay_booking_id) return t('adm.logd.member', { code: c.member_code });
  const room = c.room_name ? ` · ${roomNames(c.room_name, lang).title}` : '';
  return `${t('adm.panel.login')} ${c.email}${room}`;
}

export default function AdminChat() {
  const { t, lang, locale } = useLang();
  const labels = { empty: t('adm.chat.empty'), placeholder: t('adm.chat.placeholder'), send: t('adm.chat.send') };
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
  if (!chats) return <p className="admin__muted">{t('adm.loading')}</p>;

  return (
    <div className={`achat${active ? ' achat--open' : ''}`}>
      <aside className="achat__list">
        <input
          type="search"
          className="admin__search"
          placeholder={t('adm.chat.search')}
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
                  {c.unread > 0 && c.user_id !== activeId && <span className="achat__badge">{c.unread}</span>}
                </span>
                <span className="achat__sub">{chatSub(c, t, lang)}</span>
                <span className="achat__last">
                  {c.last_body ? `${c.last_from_admin ? t('adm.chat.you') : ''}${c.last_body}` : t('adm.chat.none')}
                </span>
                {c.last_at && <span className="achat__when">{fmtWhen(c.last_at, locale)}</span>}
              </button>
            </li>
          ))}
        </ul>
        {shown.length === 0 && (
          <p className="admin__empty">{chats.length === 0 ? t('adm.chat.noAccounts') : t('adm.chat.noMatch')}</p>
        )}
      </aside>

      <section className="achat__thread">
        {active ? (
          <>
            <header className="achat__head">
              <button type="button" className="admin__btn achat__back" onClick={() => setActiveId(null)}>
                ← {t('adm.chat.all')}
              </button>
              <div>
                <strong>{chatName(active)}</strong>
                <span className="achat__sub">{chatSub(active, t, lang)}</span>
              </div>
            </header>
            <ChatThread messages={messages} mine={(m) => m.from_admin} onSend={send} labels={labels} />
          </>
        ) : (
          <p className="admin__empty achat__pick">{t('adm.chat.pick')}</p>
        )}
      </section>
    </div>
  );
}
