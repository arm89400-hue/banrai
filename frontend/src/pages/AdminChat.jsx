import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLang } from '../i18n/lang';
import { roomNames } from '../lib/booking';
import { useContact } from '../lib/contact';
import ChatThread from '../components/ChatThread';
import { sendChatImage } from '../lib/chatImage';
import { Empty, ErrorNote, PageHead, Seg } from '../components/AdminUI';
import { Loading, Sk } from '../components/Skeleton';
import './AdminChat.css';

const POLL_MS = 4000;
const TABS = ['nobook', 'today', 'all'];

const dayStart = (d) => new Date(new Date(d).toDateString());

export function chatName(c) {
  return c.stay_booking_id ? c.guest_name || c.email : c.email;
}

function stayLine(c, t, lang, locale) {
  if (!c.stay_booking_id) return t('adm.chat.notBooked');
  const fmt = (d) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const room = c.room_name ? roomNames(c.room_name, lang).title : '';
  const dates = c.booked_for ? `${fmt(c.booked_for)}–${fmt(c.booked_until ?? c.booked_for)}` : '';
  return [room, dates].filter(Boolean).join(' · ');
}

export function waitMinutes(c) {
  if (!c.last_at || c.last_from_admin) return 0;
  return Math.max(1, Math.round((Date.now() - new Date(c.last_at)) / 60000));
}

export function waitLabel(min, t) {
  if (min < 60) return t('adm.chat.min', { n: min });
  if (min < 60 * 24) return t('adm.chat.hr', { n: Math.round(min / 60) });
  return t('adm.chat.day', { n: Math.round(min / 1440) });
}

function inTab(c, tab) {
  if (tab === 'nobook') return !c.stay_booking_id;
  if (tab === 'today') {
    if (!c.stay_booking_id || !c.booked_for) return false;
    const today = dayStart(Date.now());
    return dayStart(c.booked_for) <= today && today < dayStart(c.booked_until ?? c.booked_for).getTime() + 86400000;
  }
  return true;
}

function sortChats(list) {
  return [...list].sort((a, b) => {
    const wa = waitMinutes(a);
    const wb = waitMinutes(b);
    if (!wa !== !wb) return wa ? -1 : 1;
    if (wa && wb) return wb - wa;
    return new Date(b.last_at ?? 0) - new Date(a.last_at ?? 0);
  });
}

export function useChats() {
  const [chats, setChats] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    api('/api/admin/chats')
      .then((data) => {
        setChats(sortChats(data.chats));
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);
  return { chats, error, reload: load };
}

function useThread(id, onSent) {
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    setMessages([]);
    if (id == null) return undefined;
    let cancelled = false;
    const load = () =>
      api(`/api/admin/chats/${id}`)
        .then((data) => {
          if (!cancelled) setMessages(data.messages ?? []);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);
  const send = async (body) => {
    const data = await api(`/api/admin/chats/${id}`, { method: 'POST', body: JSON.stringify({ body }) });
    setMessages((list) => [...list, data.message]);
    onSent?.();
  };
  const sendImage = async (file, text) => {
    const message = await sendChatImage(`/api/admin/chats/${id}/image`, file, text);
    setMessages((list) => [...list, message]);
    onSent?.();
  };
  return { messages, send, sendImage };
}

function useQuickReplies() {
  const { t } = useLang();
  const contact = useContact();
  const bookUrl = `${window.location.origin}/book`;
  return [
    ...['checkin', 'parking', 'pets', 'deposit', 'call'].map((k) => ({ label: t(`adm.chat.q.${k}`), text: t(`adm.chat.q.${k}Text`) })),
    contact?.maps && { label: t('adm.chat.q.map'), text: t('adm.chat.q.mapText', { url: contact.maps }) },
    { label: t('adm.chat.q.book'), text: t('adm.chat.q.bookText', { url: bookUrl }) },
  ].filter(Boolean);
}

export function Avatar({ c }) {
  const name = chatName(c) || '?';
  return (
    <span className={`achat__av achat__av--${c.user_id % 5}`} aria-hidden="true">
      {name.replace(/^(คุณ|k\.)\s*/i, '').charAt(0).toUpperCase()}
    </span>
  );
}

function Status({ c }) {
  const { t } = useLang();
  const min = waitMinutes(c);
  return min > 0 ? (
    <span className="achat__wait">{t('adm.chat.wait', { t: waitLabel(min, t) })}</span>
  ) : (
    <span className="achat__done">{t('adm.chat.answered')}</span>
  );
}

function Tabs({ chats, tab, onTab }) {
  const { t } = useLang();
  return (
    <Seg active={tab} className="achat__tabs" role="tablist" aria-label={t('adm.chat.allTitle')}>
      {TABS.map((id) => {
        const list = chats.filter((c) => inTab(c, id));
        const waiting = list.filter((c) => waitMinutes(c) > 0).length;
        return (
          <button key={id} type="button" role="tab" aria-selected={id === tab} onClick={() => onTab(id)}>
            {t(`adm.chat.tab.${id}`)}
            {waiting > 0 && <em>{waiting}</em>}
          </button>
        );
      })}
    </Seg>
  );
}

export function Thread({ chat, onSent, onBack }) {
  const { t, lang, locale } = useLang();
  const quick = useQuickReplies();
  const { messages, send, sendImage } = useThread(chat?.user_id, onSent);
  const labels = { empty: t('adm.chat.empty'), placeholder: t('adm.chat.placeholder'), send: t('adm.chat.send') };
  if (!chat) return <Empty title={t('adm.chat.pick')} />;
  return (
    <>
      <header className="achat__head">
        {onBack && (
          <button type="button" className="adm-x achat__back" onClick={onBack} aria-label={t('adm.chat.back')}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <Avatar c={chat} />
        <div className="achat__who">
          <strong>{chatName(chat)}</strong>
          <span>{chat.stay_booking_id ? stayLine(chat, t, lang, locale) : t('adm.logd.member', { code: chat.member_code })}</span>
        </div>
        {chat.guest_phone && (
          <a className="adm-btn adm-btn--sm achat__phone" href={`tel:${chat.guest_phone.replace(/[^\d+]/g, '')}`}>
            {chat.guest_phone}
          </a>
        )}
      </header>
      <ChatThread messages={messages} mine={(m) => m.from_admin} onSend={send} onSendImage={sendImage} labels={labels} locale={locale} quick={quick} />
    </>
  );
}

function filterChats(chats, tab, query) {
  const q = query.trim().toLowerCase();
  return chats.filter(
    (c) => inTab(c, tab) && (!q || [c.email, c.guest_name, c.guest_phone, c.room_name, c.member_code].some((v) => v?.toLowerCase().includes(q)))
  );
}

export function ChatList({ chats, activeId, onOpen }) {
  const { t, lang, locale } = useLang();
  return (
    <ul className="achat__list">
      {chats.map((c) => (
        <li key={c.user_id}>
          <button
            type="button"
            className={`achat__item${c.user_id === activeId ? ' is-active' : ''}`}
            aria-current={c.user_id === activeId ? 'true' : undefined}
            onClick={() => onOpen(c.user_id)}
          >
            <Avatar c={c} />
            <span className="achat__item-text">
              <b>{chatName(c)}</b>
              <span>{c.last_body || c.last_is_image ? `${c.last_from_admin ? t('adm.chat.you') : ''}${c.last_body || t('chat.photo')}` : stayLine(c, t, lang, locale)}</span>
            </span>
            <Status c={c} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ChatSkeleton() {
  const { t } = useLang();
  return (
    <Loading label={t('adm.loading')} className="achat">
      <aside className="achat__side adm-card">
        <div className="achat__side-top">
          <Sk h="44px" r="10px" />
          <Sk w="70%" h="38px" r="12px" />
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="achat__item">
            <Sk w="40px" h="40px" r="50%" />
            <span className="achat__item-text">
              <Sk w={`${60 - i * 6}%`} h="1em" />
              <Sk w="80%" h="0.8em" style={{ marginTop: 6 }} />
            </span>
          </div>
        ))}
      </aside>
      <section className="achat__main adm-card achat__main--sk">
        <Sk w="40%" h="1.2em" />
      </section>
    </Loading>
  );
}

export default function AdminChat() {
  const { t } = useLang();
  const { chats, error, reload } = useChats();
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const narrow = useNarrow();

  const waiting = chats?.filter((c) => waitMinutes(c) > 0).length ?? 0;
  const head = (
    <PageHead
      title={t('adm.nav.chat')}
      lead={waiting > 0 ? t('adm.chat.leadWaiting', { n: waiting }) : null}
    />
  );

  if (error && !chats) {
    return (
      <>
        {head}
        <ErrorNote>{error}</ErrorNote>
      </>
    );
  }
  if (!chats) {
    return (
      <>
        {head}
        <ChatSkeleton />
      </>
    );
  }
  if (chats.length === 0) {
    return (
      <>
        {head}
        <div className="adm-card">
          <Empty title={t('adm.chat.noAccounts')} />
        </div>
      </>
    );
  }

  const list = filterChats(chats, tab, query);
  // On a computer the first guest opens straight away; on a phone the list shows first.
  const id = activeId ?? (narrow ? null : list[0]?.user_id ?? chats[0]?.user_id ?? null);
  const active = chats.find((c) => c.user_id === id);
  const showThread = !narrow || active;

  return (
    <>
      {(!narrow || !active) && head}
      <div className={`achat${narrow && active ? ' is-thread' : ''}`}>
        {(!narrow || !active) && (
          <aside className="achat__side adm-card">
            <div className="achat__side-top">
              <label className="adm-search">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="M20 20l-4-4" />
                </svg>
                <input type="search" placeholder={t('adm.chat.search')} aria-label={t('adm.chat.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <Tabs chats={chats} tab={tab} onTab={setTab} />
            </div>
            {list.length === 0 ? (
              <Empty title={query ? t('adm.chat.noMatch') : t('adm.chat.listEmpty')} />
            ) : (
              <ChatList chats={list} activeId={id} onOpen={setActiveId} />
            )}
          </aside>
        )}
        {showThread && (
          <section className="achat__main adm-card">
            <Thread chat={active} onSent={reload} onBack={narrow ? () => setActiveId(null) : undefined} />
          </section>
        )}
      </div>
    </>
  );
}

function useNarrow() {
  const query = '(max-width: 860px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}
