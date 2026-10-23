import { useEffect, useRef, useState } from 'react';
import { useLang } from '../i18n/lang';
import { Avatar, ChatList, Thread, chatName, useChats, waitMinutes } from '../pages/AdminChat';
import './AdminChatDock.css';

// Chat with guests from any admin page: a button in the corner with the number
// waiting, a panel with the list and the conversation, and a short alert when
// a new message comes in (click it to answer straight away).
export default function AdminChatDock({ hidden = false, openSignal }) {
  // openSignal: { n, id? } — a new object each time something asks the dock to open.
  const { t } = useLang();
  const { chats, reload } = useChats();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [toast, setToast] = useState(null);
  const seen = useRef(null);

  const waiting = chats?.filter((c) => waitMinutes(c) > 0) ?? [];

  // Someone else (the Today page tile) can ask the dock to open.
  useEffect(() => {
    if (!openSignal) return;
    setOpen(true);
    setActiveId(openSignal.id ?? null);
  }, [openSignal]);

  // A guest's newest message we haven't seen yet → alert (not on first load).
  useEffect(() => {
    if (!chats) return;
    const latest = new Map(chats.filter((c) => c.last_at && !c.last_from_admin).map((c) => [c.user_id, c.last_at]));
    if (seen.current) {
      const fresh = chats.find((c) => latest.get(c.user_id) && seen.current.get(c.user_id) !== latest.get(c.user_id));
      if (fresh && !(open && activeId === fresh.user_id)) {
        setToast({ id: fresh.user_id, name: chatName(fresh), body: fresh.last_body, key: Date.now(), chat: fresh });
      }
    }
    seen.current = latest;
  }, [chats, open, activeId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && (activeId ? setActiveId(null) : setOpen(false));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, activeId]);

  if (hidden) return null;
  const active = chats?.find((c) => c.user_id === activeId);

  return (
    <>
      {toast && !open && (
        <button
          key={toast.key}
          type="button"
          className="adock-toast"
          onClick={() => {
            setOpen(true);
            setActiveId(toast.id);
            setToast(null);
          }}
        >
          <Avatar c={toast.chat} />
          <span>
            <b>{t('adm.dock.newFrom', { name: toast.name })}</b>
            <span>{toast.body}</span>
          </span>
          <em>{t('adm.dock.reply')}</em>
        </button>
      )}

      <div className={`adock${open ? ' is-open' : ''}`} role="dialog" aria-label={t('adm.nav.chat')} aria-hidden={!open} inert={!open}>
        <header className="adock__head">
          {active ? (
            <span className="adock__title">{t('adm.nav.chat')}</span>
          ) : (
            <span className="adock__title">
              {t('adm.nav.chat')}
              {waiting.length > 0 && <em>{t('adm.dock.waiting', { n: waiting.length })}</em>}
            </span>
          )}
          <button type="button" className="adm-x" onClick={() => setOpen(false)} aria-label={t('adm.close')}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>
        <div className="adock__body">
          {!chats ? (
            <p className="adock__empty">{t('adm.loading')}</p>
          ) : active ? (
            <div className="adock__thread achat">
              <section className="achat__main">
                <Thread chat={active} onSent={reload} onBack={() => setActiveId(null)} />
              </section>
            </div>
          ) : chats.length === 0 ? (
            <p className="adock__empty">{t('adm.chat.noAccounts')}</p>
          ) : (
            <div className="adock__list achat">
              <ChatList chats={chats} activeId={null} onOpen={setActiveId} />
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className={`adock-fab${waiting.length > 0 ? ' has-waiting' : ''}${open ? ' is-open' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={t('adm.dock.open')}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        {waiting.length > 0 && <em>{waiting.length}</em>}
      </button>
    </>
  );
}
