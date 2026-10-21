import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useLang } from '../i18n/lang';
import { roomNames } from '../lib/booking';
import { useContact } from '../lib/contact';
import ChatThread from '../components/ChatThread';
import './AdminChat.css';

const POLL_MS = 4000;
const SIDE_MAX = 5;
const PER_PAGE = 6;
const TABS = ['nobook', 'today', 'all'];

const dayStart = (d) => new Date(new Date(d).toDateString());

function chatName(c) {
  return c.stay_booking_id ? c.guest_name || c.email : c.email;
}

function stayLine(c, t, lang, locale) {
  if (!c.stay_booking_id) return t('adm.chat.notBooked');
  const fmt = (d) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const room = c.room_name ? roomNames(c.room_name, lang).title : '';
  const dates = c.booked_for ? `${fmt(c.booked_for)}–${fmt(c.booked_until ?? c.booked_for)}` : '';
  return [room, dates].filter(Boolean).join(' · ');
}

function waitMinutes(c) {
  if (!c.last_at || c.last_from_admin) return 0;
  return Math.max(1, Math.round((Date.now() - new Date(c.last_at)) / 60000));
}

function waitLabel(min, t) {
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

function useChats() {
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
  return { messages, send };
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

function Avatar({ c }) {
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

function Tabs({ chats, tab, onTab, counts }) {
  const { t } = useLang();
  return (
    <nav className="achat__tabs" aria-label={t('adm.chat.allTitle')}>
      {TABS.map((id) => {
        const list = chats.filter((c) => inTab(c, id));
        const waiting = list.filter((c) => waitMinutes(c) > 0).length;
        return (
          <button key={id} type="button" className={id === tab ? 'on' : ''} aria-pressed={id === tab} onClick={() => onTab(id)}>
            {t(`adm.chat.tab.${id}`)}
            {counts && <em>{list.length}</em>}
            {waiting > 0 && <i>{waiting}</i>}
          </button>
        );
      })}
    </nav>
  );
}

function Thread({ chat, onSent }) {
  const { t, lang, locale } = useLang();
  const quick = useQuickReplies();
  const { messages, send } = useThread(chat?.user_id, onSent);
  const labels = { empty: t('adm.chat.empty'), placeholder: t('adm.chat.placeholder'), send: t('adm.chat.send') };
  if (!chat) return <p className="admin__empty achat__pick">{t('adm.chat.pick')}</p>;
  return (
    <>
      <header className="achat__head">
        <Avatar c={chat} />
        <div className="achat__who">
          <strong>{chatName(chat)}</strong>
          <span>{chat.stay_booking_id ? stayLine(chat, t, lang, locale) : t('adm.logd.member', { code: chat.member_code })}</span>
        </div>
        {chat.guest_phone && (
          <a className="achat__phone" href={`tel:${chat.guest_phone.replace(/[^\d+]/g, '')}`}>
            {chat.guest_phone}
          </a>
        )}
      </header>
      <ChatThread messages={messages} mine={(m) => m.from_admin} onSend={send} labels={labels} locale={locale} quick={quick} />
    </>
  );
}

function AllChats({ chats, tab, onTab, query, onQuery, onOpen, onBack }) {
  const { t, lang, locale } = useLang();
  const [page, setPage] = useState(1);
  const list = useMemo(() => filterChats(chats, tab, query), [chats, tab, query]);
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PER_PAGE;
  const rows = list.slice(start, start + PER_PAGE);
  const fillers = list.length > PER_PAGE ? PER_PAGE - rows.length : 0;

  return (
    <div className="achat-all">
      <button type="button" className="achat__link" onClick={onBack}>
        {t('adm.chat.back')}
      </button>
      <div className="achat-all__top">
        <h2>{t('adm.chat.allTitle')}</h2>
        <input type="search" className="admin__search" placeholder={t('adm.chat.search')} value={query} onChange={(e) => { onQuery(e.target.value); setPage(1); }} />
      </div>
      <Tabs chats={chats} tab={tab} onTab={(x) => { onTab(x); setPage(1); }} counts />
      <div className="achat-table">
        <div className="achat-row achat-row--head">
          <span>{t('adm.chat.col.guest')}</span>
          <span>{t('adm.chat.col.booking')}</span>
          <span>{t('adm.chat.col.last')}</span>
          <span>{t('adm.chat.col.status')}</span>
          <span />
        </div>
        {rows.length === 0 && <p className="admin__empty">{query ? t('adm.chat.noMatch') : t('adm.chat.listEmpty')}</p>}
        {rows.map((c) => (
          <div key={c.user_id} className="achat-row">
            <span className="achat-row__name"><Avatar c={c} />{chatName(c)}</span>
            <span className="achat-row__sub">{stayLine(c, t, lang, locale)}</span>
            <span className="achat-row__last">{c.last_body ? `${c.last_from_admin ? t('adm.chat.you') : ''}${c.last_body}` : t('adm.chat.none')}</span>
            <span><Status c={c} /></span>
            <button type="button" className="admin__btn" onClick={() => onOpen(c.user_id)}>{t('adm.chat.open')}</button>
          </div>
        ))}
        {Array.from({ length: fillers }, (_, i) => (
          <div key={`f${i}`} className="achat-row achat-row--fill" aria-hidden="true">
            <span className="achat-row__name"><span className="achat__av" />&nbsp;</span>
            <span /><span /><span />
            <button type="button" className="admin__btn" tabIndex={-1}>&nbsp;</button>
          </div>
        ))}
      </div>
      {list.length > PER_PAGE && (
        <nav className="achat-pager" aria-label={t('adm.chat.allTitle')}>
          <span>{t('adm.chat.showing', { from: start + 1, to: start + rows.length, total: list.length })}</span>
          <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="‹">‹</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" className={i + 1 === current ? 'on' : ''} aria-current={i + 1 === current ? 'page' : undefined} onClick={() => setPage(i + 1)}>
              {i + 1}
            </button>
          ))}
          <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="›">›</button>
        </nav>
      )}
    </div>
  );
}

function filterChats(chats, tab, query) {
  const q = query.trim().toLowerCase();
  return chats.filter(
    (c) => inTab(c, tab) && (!q || [c.email, c.guest_name, c.guest_phone, c.room_name, c.member_code].some((v) => v?.toLowerCase().includes(q)))
  );
}

function SideList({ chats, activeId, onOpen }) {
  const { t, lang, locale } = useLang();
  return (
    <ul className="achat__list">
      {chats.map((c) => (
        <li key={c.user_id}>
          <button type="button" className={`achat__item${c.user_id === activeId ? ' is-active' : ''}`} onClick={() => onOpen(c.user_id)}>
            <Avatar c={c} />
            <span className="achat__item-text">
              <b>{chatName(c)}</b>
              <span>{c.stay_booking_id ? stayLine(c, t, lang, locale) : c.last_body || t('adm.chat.none')}</span>
            </span>
            <Status c={c} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function AdminChat() {
  const { t } = useLang();
  const { chats, error, reload } = useChats();
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('main');

  const id = activeId ?? chats?.[0]?.user_id ?? null;
  const active = chats?.find((c) => c.user_id === id);

  if (error && !chats) return <p className="admin__error" role="alert">{error}</p>;
  if (!chats) return <p className="admin__muted">{t('adm.loading')}</p>;
  if (chats.length === 0) return <p className="admin__empty">{t('adm.chat.noAccounts')}</p>;

  if (view === 'all') {
    return (
      <AllChats
        chats={chats}
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
        onBack={() => setView('main')}
        onOpen={(x) => { setActiveId(x); setView('main'); }}
      />
    );
  }

  const list = filterChats(chats, tab, query);
  return (
    <div className="achat">
      <section className="achat__main">
        <Thread chat={active} onSent={reload} />
      </section>
      <aside className="achat__side">
        <input type="search" className="admin__search" placeholder={t('adm.chat.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Tabs chats={chats} tab={tab} onTab={setTab} />
        {list.length === 0 ? (
          <p className="admin__empty">{query ? t('adm.chat.noMatch') : t('adm.chat.listEmpty')}</p>
        ) : (
          <SideList chats={list.slice(0, SIDE_MAX)} activeId={id} onOpen={setActiveId} />
        )}
        {list.length > SIDE_MAX && (
          <button type="button" className="achat__link" onClick={() => setView('all')}>
            {t('adm.chat.seeAll', { n: list.length })}
          </button>
        )}
      </aside>
    </div>
  );
}

export function ChatFab() {
  const { t } = useLang();
  const { chats, reload } = useChats();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState('all');
  const waiting = chats?.filter((c) => waitMinutes(c) > 0).length ?? 0;
  const active = chats?.find((c) => c.user_id === activeId);

  return (
    <>
      {open && (
        <div className="achat-pop" role="dialog" aria-label={t('adm.chat.fab')}>
          <div className="achat-pop__bar">
            {active ? (
              <button type="button" className="achat__link" onClick={() => setActiveId(null)}>←</button>
            ) : (
              <b>{t('adm.chat.fab')}</b>
            )}
            <button type="button" className="achat-pop__x" onClick={() => setOpen(false)} aria-label={t('adm.chat.close')}>✕</button>
          </div>
          {active ? (
            <div className="achat-pop__thread"><Thread chat={active} onSent={reload} /></div>
          ) : (
            <div className="achat-pop__list">
              {chats && <Tabs chats={chats} tab={tab} onTab={setTab} />}
              {chats && <SideList chats={chats.filter((c) => inTab(c, tab))} activeId={null} onOpen={setActiveId} />}
            </div>
          )}
        </div>
      )}
      <button type="button" className="achat-fab" onClick={() => setOpen((o) => !o)} aria-label={t('adm.chat.fab')} aria-expanded={open}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
        {waiting > 0 && <em>{waiting}</em>}
      </button>
    </>
  );
}
