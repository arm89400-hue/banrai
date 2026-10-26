import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { groupRows } from '../lib/adminBookings';
import { ADMIN_PAGES } from '../lib/adminSections';
import { useLang } from '../i18n/lang';
import AdminIcon from './AdminIcons';
import './AdminPalette.css';

// Ctrl+K (or ⌘K, or "/"): one box to jump anywhere — a page, a booking by
// code, name or phone, or straight into a chat with a guest.
export default function AdminPalette({ open, onClose, onChat }) {
  const { t, lang, locale } = useLang();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const [data, setData] = useState(null);
  const input = useRef(null);
  const list = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setAt(0);
    requestAnimationFrame(() => input.current?.focus());
    Promise.all([api('/api/admin/bookings'), api('/api/admin/chats')])
      .then(([b, c]) => setData({ groups: groupRows(b.bookings ?? [], lang).filter((g) => g.isRoom), chats: c.chats ?? [] }))
      .catch(() => setData({ groups: [], chats: [] }));
  }, [open, lang]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const has = (...vals) => !needle || vals.some((v) => v && String(v).toLowerCase().includes(needle));
    const fmt = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    const pages = ADMIN_PAGES.filter((p) => has(t(p.label), p.id)).map((p) => ({
      kind: 'page',
      key: `p-${p.id}`,
      icon: p.icon,
      title: t(p.label),
      sub: t('adm.pal.page'),
      run: () => navigate(p.path),
    }));
    if (!data) return pages;
    const bookings = data.groups
      .filter((g) => needle && has(g.code, g.lead.guest_name, g.lead.guest_phone, g.lead.guest_email, g.rooms))
      .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
      .slice(0, 6)
      .map((g) => ({
        kind: 'booking',
        key: `b-${g.key}`,
        icon: 'bookings',
        title: `${g.lead.guest_name || g.code} · ${g.rooms}`,
        sub: `${g.code} · ${fmt(g.checkIn)}–${fmt(g.checkOut)} · ${t(`adm.bk.status.${g.status}`)}`,
        run: () => navigate(`/admin/bookings?open=${encodeURIComponent(g.key)}`),
      }));
    const chats = data.chats
      .filter((c) => needle && has(c.guest_name, c.email, c.guest_phone, c.member_code))
      .slice(0, 5)
      .map((c) => ({
        kind: 'chat',
        key: `c-${c.user_id}`,
        icon: 'chat',
        title: t('adm.pal.chatWith', { name: c.guest_name || c.email }),
        sub: c.last_body || (c.last_is_image ? t('chat.photo') : c.email),
        run: () => onChat(c.user_id),
      }));
    return [...pages, ...bookings, ...chats];
  }, [q, data, t, locale, navigate, onChat]);

  useEffect(() => setAt(0), [q]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  if (!open) return null;

  function pick(r) {
    onClose();
    r.run();
  }
  function onKey(e) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAt((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAt((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && results[at]) {
      e.preventDefault();
      pick(results[at]);
    }
  }

  return (
    <div className="apal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="apal__box" role="dialog" aria-modal="true" aria-label={t('adm.pal.title')}>
        <label className="apal__search">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={t('adm.pal.placeholder')}
            aria-label={t('adm.pal.title')}
            role="combobox"
            aria-expanded="true"
            aria-controls="apal-list"
            aria-activedescendant={results[at] ? `apal-${results[at].key}` : undefined}
          />
          <kbd>Esc</kbd>
        </label>
        <ul ref={list} id="apal-list" className="apal__list" role="listbox">
          {results.length === 0 && <li className="apal__none">{data ? t('adm.pal.none') : t('adm.loading')}</li>}
          {results.map((r, i) => (
            <li
              key={r.key}
              id={`apal-${r.key}`}
              role="option"
              aria-selected={i === at}
              className={`apal__item apal__item--${r.kind}`}
              onMouseEnter={() => setAt(i)}
              onClick={() => pick(r)}
              style={{ '--i': Math.min(i, 8) }}
            >
              <span className="apal__icon">
                <AdminIcon name={r.icon} size={18} />
              </span>
              <span className="apal__text">
                <b>{r.title}</b>
                <small>{r.sub}</small>
              </span>
              <span className="apal__go" aria-hidden="true">
                ↵
              </span>
            </li>
          ))}
        </ul>
        <p className="apal__hint">{t('adm.pal.hint')}</p>
      </div>
    </div>
  );
}
