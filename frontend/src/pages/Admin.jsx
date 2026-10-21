import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, useParams } from 'react-router-dom';
import { api, mediaUrl } from '../lib/api';
import { formatBaht } from '../lib/money';
import { roomNames, toISODate } from '../lib/booking';
import { groupRows, needsYou } from '../lib/adminBookings';
import { useAuth } from '../context/AuthContext';
import { ADMIN_SECTIONS, OLD_SECTIONS, adminPath } from '../lib/adminSections';
import { useLang } from '../i18n/lang';
import AdminIcon from '../components/AdminIcons';
import Pager, { usePaged } from '../components/Pager';
import { Bookings, Today } from './AdminBookings';
import AdminChat, { ChatFab } from './AdminChat';
import AdminPromotions from './AdminPromotions';
import AdminAnnouncements from './AdminAnnouncements';
import AdminContact from './AdminContact';
import AdminPhotos, { MAX_PHOTOS } from './AdminPhotos';
import { uploadPending } from '../lib/uploadPending';
import './Admin.css';

const fmtDate = (d, locale) =>
  d ? new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtDateTime = (d, locale) =>
  d ? new Date(d).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '-';

function useAdminData(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    api(path)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err) => setState({ data: null, error: err.message, loading: false }));
  }, [path]);

  useEffect(reload, [reload]);
  return { ...state, reload };
}

function useAdminBadges(enabled, tab) {
  const [badges, setBadges] = useState({});

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = () =>
      Promise.all([api('/api/admin/stats'), api('/api/admin/bookings')])
        .then(([stats, list]) => {
          if (cancelled) return;
          const today = toISODate(new Date());
          const todo = groupRows(list.bookings).filter((g) => needsYou(g, today)).length;
          setBadges({ overview: todo, chat: stats.stats.unread_chats ?? 0 });
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, tab]);

  return badges;
}

export default function Admin() {
  const { user, logout } = useAuth();
  const { t, lang, setLang, locale } = useLang();
  const { section, tab: tabParam } = useParams();
  const id = section ?? 'overview';
  const current = ADMIN_SECTIONS.find((s) => s.id === id);
  const tab = current?.tabs ? (current.tabs.find((x) => x.id === tabParam) ?? current.tabs[0]) : null;
  const isAdmin = Boolean(user?.is_admin);
  const badges = useAdminBadges(isAdmin, id);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) {
    return <Navigate to="/login?next=/admin" replace />;
  }
  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }

  if (OLD_SECTIONS[id]) {
    return <Navigate to={adminPath(...OLD_SECTIONS[id])} replace />;
  }
  if (!current) {
    return <Navigate to="/admin" replace />;
  }

  const title =
    id === 'overview' ? new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }) : t(current.label);
  const panel = tab ? tab.id : id;

  const menu = (
    <>
      <nav className="admin-side__nav" aria-label={t('adm.menu')}>
        {ADMIN_SECTIONS.map((s) => (
          <NavLink key={s.id} to={adminPath(s.id)} end={s.id === 'overview'} className="admin-side__item" onClick={() => setMenuOpen(false)}>
            <AdminIcon name={s.icon} />
            <span>{t(s.label)}</span>
            {badges[s.id] > 0 && <em>{badges[s.id]}</em>}
          </NavLink>
        ))}
      </nav>
      <div className="admin-side__foot">
        <div className="admin-lang" role="group" aria-label={t('adm.language')}>
          {['th', 'en'].map((code) => (
            <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <Link to="/home" className="admin-side__item">
          <AdminIcon name="site" />
          <span>{t('adm.viewSite')}</span>
        </Link>
        <button type="button" className="admin-side__item" onClick={logout} title={user.email}>
          <AdminIcon name="logout" />
          <span>{t('adm.logout')}</span>
        </button>
      </div>
    </>
  );

  const brand = (
    <Link to="/admin" className="admin-side__brand">
      <img src="/images/logo.png" alt="" />
      <span>
        Baanrai
        <small>{t('adm.brand')}</small>
      </span>
    </Link>
  );

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        {brand}
        {menu}
      </aside>

      <header className="admin-bar">
        {brand}
        <button type="button" className="admin-bar__menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          {t('adm.menu')}
          {badges.overview > 0 && <em>{badges.overview}</em>}
        </button>
      </header>
      {menuOpen && (
        <div className="admin-sheet" onClick={() => setMenuOpen(false)}>
          <div className="admin-sheet__panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="admin-sheet__close" onClick={() => setMenuOpen(false)}>
              {t('adm.close')}
            </button>
            {menu}
          </div>
        </div>
      )}

      <section className="admin">
        {id !== 'overview' && (
          <header className="admin__header">
            <h1>{title}</h1>
            {id === 'site' && <p className="admin__hint">{t('adm.siteHint')}</p>}
          </header>
        )}

        {current.tabs && (
          <nav className="admin-tabs" aria-label={t(current.label)}>
            {current.tabs.map((x) => (
              <NavLink key={x.id} to={adminPath(current.id, x.id)} className={x.id === tab.id ? 'active' : ''}>
                {t(x.label)}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="admin__panel" key={panel}>
          {panel === 'overview' && <Today />}
          {panel === 'bookings' && <Bookings />}
          {panel === 'chat' && <AdminChat />}
          {panel === 'rooms' && <Listings kind="rooms" />}
          {panel === 'announcements' && <AdminAnnouncements />}
          {panel === 'contact' && <AdminContact />}
          {panel === 'activities' && <Listings kind="activities" />}
          {panel === 'promotions' && <AdminPromotions />}
          {panel === 'users' && <Users />}
          {panel === 'log' && <ActivityLog />}
        </div>
        {panel !== 'chat' && <ChatFab />}
      </section>
    </div>
  );
}

function Status({ loading, error }) {
  const { t } = useLang();
  if (error) return <p className="admin__error" role="alert">{error}</p>;
  if (loading) return <p className="admin__muted">{t('adm.loading')}</p>;
  return null;
}

const LISTING_CONFIG = {
  rooms: { listPath: '/api/rooms', listKey: 'rooms', roomFields: true },
  activities: { listPath: '/api/activities', listKey: 'activities', roomFields: false },
};

const EMPTY_FORM = {
  name: '',
  name_th: '',
  description: '',
  description_th: '',
  tag: '',
  tag_th: '',
  price: '',
  position: '',
  capacity: '',
  max_extra_guests: '0',
  image_url: '',
};

const formFor = (item) =>
  Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, item[key] ?? EMPTY_FORM[key]]));

function Listings({ kind }) {
  const { t, lang } = useLang();
  const cfg = LISTING_CONFIG[kind];
  const k = (key, vars) => t(`adm.list.${kind}.${key}`, vars);
  const { data, error, loading, reload } = useAdminData(cfg.listPath);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photos, setPhotos] = useState([]);
  const [pending, setPending] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [savedNote, setSavedNote] = useState(null);

  function startEdit(item) {
    setEditing(item ? item.id : 'new');
    setFormError(null);
    setSavedNote(null);
    setForm(item ? formFor(item) : EMPTY_FORM);
    setPhotos(item?.photos ?? []);
    setPending([]);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const isNew = editing === 'new';
      const data = await api(`/api/admin/${kind}${isNew ? '' : `/${editing}`}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(form),
      });
      if (isNew) {
        const created = data.room ?? data.activity;
        setEditing(created.id);
        setForm(formFor(created));
        setPending([]);
        try {
          setPhotos(await uploadPending(kind, created.id, pending));
          setSavedNote(pending.length ? t('adm.list.savedPhotos', { n: pending.length }) : t('adm.list.saved'));
        } catch (err) {
          setPhotos(err.photos);
          setFormError(t('adm.list.savedSomePhotos', { error: err.message }));
        }
      } else {
        setEditing(null);
      }
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function photosChanged(next) {
    setPhotos(next);
    reload();
  }

  async function remove(item) {
    if (!window.confirm(k('askDelete', { name: item.name }))) return;
    try {
      await api(`/api/admin/${kind}/${item.id}`, { method: 'DELETE' });
      if (editing === item.id) setEditing(null);
      reload();
    } catch (err) {
      setFormError(err.message);
    }
  }

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm({ ...form, [key]: e.target.value }),
  });

  const items = cfg.roomFields ? [...(data?.rooms ?? [])].sort((a, b) => b.price - a.price) : (data?.[cfg.listKey] ?? []);
  const hasDesc = items.some((i) => i.description || i.description_th);
  const nameParts = (item) => {
    if (item.name_th && item.name_th !== item.name) return lang === 'th' ? [item.name_th, item.name] : [item.name, item.name_th];
    const n = roomNames(item.name, lang);
    return [n.title, n.subtitle];
  };

  return (
    <>
      <div className="admin__toolbar admin__toolbar--end">
        <button type="button" className="admin__btn admin__btn--primary adm-btn-lg" onClick={() => startEdit(null)}>
          {k('add')}
        </button>
      </div>

      {editing !== null && (
        <form className="admin__form" onSubmit={save}>
          <h2>{editing === 'new' ? k('new') : k('edit')}</h2>
          {savedNote && <p className="admin__notice">{savedNote}</p>}
          {cfg.roomFields ? (
            <div className="admin__form-grid">
              <label>
                <span>{t('adm.list.rooms.name')}</span>
                <input required placeholder="Father's Room · ห้องพ่อ" {...field('name')} />
              </label>
              <label>
                <span>{t('adm.list.rooms.price')}</span>
                <input required type="number" min="0" step="0.01" {...field('price')} />
              </label>
              <label>
                <span>{t('adm.list.rooms.capacity')}</span>
                <input type="number" min="1" {...field('capacity')} />
              </label>
              <label>
                <span>{t('adm.list.rooms.extra')}</span>
                <input type="number" min="0" max="10" {...field('max_extra_guests')} />
              </label>
              <label className="admin__form-wide">
                <span>{t('adm.list.rooms.description')}</span>
                <textarea rows={3} {...field('description')} />
              </label>
            </div>
          ) : (
            <div className="admin__form-grid">
              <label>
                <span>{t('adm.list.activities.nameEn')}</span>
                <input placeholder="Fruit picking" {...field('name')} />
              </label>
              <label>
                <span>{t('adm.list.activities.nameTh')}</span>
                <input lang="th" placeholder="เก็บผลไม้" {...field('name_th')} />
              </label>
              <label>
                <span>{t('adm.list.activities.tagEn')}</span>
                <input placeholder="Every morning" maxLength={60} {...field('tag')} />
              </label>
              <label>
                <span>{t('adm.list.activities.tagTh')}</span>
                <input lang="th" placeholder="ทุกเช้า" maxLength={60} {...field('tag_th')} />
              </label>
              <label>
                <span>{t('adm.list.activities.price')}</span>
                <input type="number" min="0" step="0.01" {...field('price')} />
              </label>
              <label>
                <span>{t('adm.list.activities.position')}</span>
                <input type="number" min="0" placeholder={t('adm.list.activities.last')} {...field('position')} />
              </label>
              <label className="admin__form-wide">
                <span>{t('adm.list.activities.descEn')}</span>
                <textarea rows={2} {...field('description')} />
              </label>
              <label className="admin__form-wide">
                <span>{t('adm.list.activities.descTh')}</span>
                <textarea lang="th" rows={2} {...field('description_th')} />
              </label>
            </div>
          )}
          <AdminPhotos
            kind={kind}
            itemId={editing === 'new' ? null : editing}
            photos={photos}
            onChange={photosChanged}
            pending={pending}
            onPendingChange={setPending}
          />
          {formError && <p className="admin__error" role="alert">{formError}</p>}
          <div className="admin__form-actions">
            <button type="button" className="admin__btn adm-btn-lg" onClick={() => setEditing(null)}>
              {editing === 'new' ? t('adm.list.cancel') : t('adm.list.close')}
            </button>
            <button type="submit" className="admin__btn admin__btn--primary adm-btn-lg" disabled={saving}>
              {saving ? t('adm.contact.saving') : t('adm.contact.save')}
            </button>
          </div>
        </form>
      )}

      <Status loading={loading && !data} error={error} />
      {data && (
        <div className="admin__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>{t('adm.list.photos')}</th>
                <th>{t('adm.list.name')}</th>
                {!cfg.roomFields && <th>{t('adm.list.tag')}</th>}
                <th>{t('adm.list.price')}</th>
                {cfg.roomFields && <th>{t('adm.list.guests')}</th>}
                {hasDesc && <th>{t('adm.list.description')}</th>}
                <th aria-label={t('adm.list.actions')} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={editing === item.id ? 'is-editing' : ''}>
                  <td>
                    <button
                      type="button"
                      className="admin-thumb"
                      onClick={() => startEdit(item)}
                      aria-label={t('adm.list.photosOf', { name: item.name, n: item.photos?.length ?? 0, max: MAX_PHOTOS })}
                    >
                      {item.photos?.[0] ? <img src={mediaUrl(item.photos[0].file)} alt="" loading="lazy" /> : <span>{t('adm.list.noPhoto')}</span>}
                      <em>
                        {item.photos?.length ?? 0}/{MAX_PHOTOS}
                      </em>
                    </button>
                  </td>
                  <td>
                    <strong>{nameParts(item)[0]}</strong>
                    {nameParts(item)[1] && <div className="admin__muted">{nameParts(item)[1]}</div>}
                  </td>
                  {!cfg.roomFields && <td className="admin__muted">{item.tag || item.tag_th || '-'}</td>}
                  <td>{Number(item.price) > 0 || cfg.roomFields ? formatBaht(item.price) : t('adm.list.free')}</td>
                  {cfg.roomFields && (
                    <td>
                      {item.capacity ?? '-'}
                      {item.max_extra_guests > 0 && ` ${t('adm.list.plusExtra', { n: item.max_extra_guests })}`}
                    </td>
                  )}
                  {hasDesc && <td className="admin__muted admin__clip">{item.description || '-'}</td>}
                  <td className="admin__actions">
                    <button type="button" className="admin__btn" onClick={() => startEdit(item)}>
                      {t('adm.list.editBtn')}
                    </button>
                    <button type="button" className="admin__btn admin__btn--danger" onClick={() => remove(item)}>
                      {t('adm.list.deleteBtn')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="admin__empty">{t('adm.list.empty')}</p>}
        </div>
      )}
    </>
  );
}

function Users() {
  const { t, locale } = useLang();
  const { data, error, loading } = useAdminData('/api/admin/users');
  const paged = usePaged(data?.users ?? [], 10, '');
  return (
    <>
      <Status loading={loading && !data} error={error} />
      {data && (
        <>
        <div className="admin__table-wrap" ref={paged.boxRef} style={paged.boxStyle}>
          <table className="admin__table">
            <thead>
              <tr>
                <th>{t('adm.users.id')}</th>
                <th>{t('adm.users.account')}</th>
                <th>{t('adm.users.type')}</th>
                <th>{t('adm.users.joined')}</th>
                <th>{t('adm.users.bookings')}</th>
                <th>{t('adm.users.expires')}</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((u) => (
                <tr key={u.id}>
                  <td className="admin__muted">{u.stay_booking_id ? '-' : u.member_code}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`admin__tag admin__tag--${u.stay_booking_id ? 'activity' : 'room'}`}>
                      {u.stay_booking_id ? t('adm.users.roomLogin') : t('adm.users.member')}
                    </span>
                  </td>
                  <td>{fmtDate(u.created_at, locale)}</td>
                  <td>{u.stay_booking_id ? '-' : u.booking_count}</td>
                  <td className="admin__muted">{fmtDateTime(u.account_expires_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.users.length === 0 && <p className="admin__empty">{t('adm.users.empty')}</p>}
        </div>
        <Pager {...paged.pager} />
        </>
      )}
    </>
  );
}

const LOG_TYPES = {
  'booking.requested': { group: 'bookings', tone: 'pending' },
  'booking.confirmed': { group: 'bookings', tone: 'confirmed' },
  'booking.cancelled': { group: 'bookings', tone: 'cancelled' },
  'booking.reopened': { group: 'bookings', tone: 'pending' },
  'booking.deleted': { group: 'bookings', tone: 'cancelled' },
  'booking.repriced': { group: 'bookings', tone: 'pending' },
  'booking.slip_sent': { group: 'bookings', tone: 'pending' },
  'booking.balance_paid': { group: 'bookings', tone: 'confirmed' },
  'booking.balance_unpaid': { group: 'bookings', tone: 'pending' },
  'booking.slip_rejected': { group: 'bookings', tone: 'cancelled' },
  'promotion.created': { group: 'bookings', tone: 'confirmed' },
  'promotion.deleted': { group: 'bookings', tone: 'cancelled' },
  'settings.contact': { group: 'bookings', tone: 'confirmed' },
  'member.registered': { group: 'accounts', tone: 'confirmed' },
  'login.member': { group: 'logins', tone: 'neutral' },
  'login.room': { group: 'logins', tone: 'neutral' },
  'login.admin': { group: 'logins', tone: 'neutral' },
  'login.expired': { group: 'logins', tone: 'cancelled' },
};
const LOG_FILTERS = ['all', 'bookings', 'accounts', 'logins'];

function logLabel(t, type) {
  const key = `adm.log.${type}`;
  const text = t(key);
  return text === key ? type : text;
}

function LogDetails({ entry }) {
  const { t, locale } = useLang();
  const d = entry.details ?? {};
  const stay = [d.room, d.check_in && `${d.check_in} → ${d.check_out}`].filter(Boolean).join(' · ');

  return (
    <>
      {(d.code || d.guest) && (
        <div>
          {d.code && <strong>{d.code}</strong>}
          {d.guest && ` ${d.guest}`}
          {d.phone && ` · ${d.phone}`}
        </div>
      )}
      {stay && <div className="admin__sub">{stay}</div>}
      {d.extra_guests > 0 && <div className="admin__sub">{t('adm.logd.extraGuests', { n: d.extra_guests })}</div>}
      {d.pets > 0 && <div className="admin__sub">{t('adm.logd.pets', { n: d.pets })}</div>}
      {d.name && (
        <div>
          <strong>{d.name}</strong>
          {d.percent != null && ` · ${t('adm.logd.percentOff', { n: d.percent })}`}
        </div>
      )}
      {d.promotion && <div className="admin__sub">{t('adm.logd.promotion', { name: d.promotion })}</div>}
      {d.total != null && (
        <div className="admin__sub">
          {t('adm.logd.total', { money: formatBaht(d.total) })}
          {d.old_total != null && ` ${t('adm.logd.was', { money: formatBaht(d.old_total) })}`}
          {d.deposit != null && ` · ${t('adm.logd.deposit', { money: formatBaht(d.deposit) })}`}
        </div>
      )}
      {d.member_code && <div className="admin__sub">{t('adm.logd.member', { code: d.member_code })}</div>}
      {d.via && <div className="admin__sub">{t('adm.logd.via', { via: d.via })}</div>}
      {d.was && <div className="admin__sub">{t('adm.logd.wasStatus', { was: d.was })}</div>}
      {d.reason && <div className="admin__sub">{t('adm.logd.reason', { reason: d.reason })}</div>}
      {d.notified != null && <div className="admin__sub">{d.notified ? t('adm.logd.notified') : t('adm.logd.noAccount')}</div>}
      {d.room_login_removed && <div className="admin__sub">{t('adm.logd.loginRemoved', { user: d.room_login_removed })}</div>}
      {d.expired_at && <div className="admin__sub">{t('adm.logd.expired', { when: fmtDateTime(d.expired_at, locale) })}</div>}
      {d.phones != null && <div className="admin__sub">{t('adm.logd.phones', { n: d.phones })}</div>}
      {d.room_username && (
        <div className="admin__login">
          <span>{t('adm.panel.login')}</span>
          <code>{d.room_username}</code>
          <code>{d.room_password}</code>
          <span>{t('adm.logd.until', { when: fmtDateTime(d.expires_at, locale) })}</span>
        </div>
      )}
    </>
  );
}

function ActivityLog() {
  const { t, locale } = useLang();
  const { data, error, loading, reload } = useAdminData('/api/admin/log');
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.log ?? []).filter((entry) => {
      const meta = LOG_TYPES[entry.type];
      if (group !== 'all' && meta?.group !== group) return false;
      if (!q) return true;
      return [entry.actor, logLabel(t, entry.type), ...Object.values(entry.details ?? {})].some((v) =>
        String(v ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, group, query, t]);

  const paged = usePaged(rows, 12, `${group}|${query}`);
  return (
    <>
      <div className="admin__toolbar">
        <div className="admin__toolbar-group">
          <div className="admin__segmented">
            {LOG_FILTERS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={group === id}
                className={group === id ? 'is-active' : ''}
                onClick={() => setGroup(id)}
              >
                {t(`adm.logf.${id}`)}
              </button>
            ))}
          </div>
          <button type="button" className="admin__btn" onClick={reload} disabled={loading}>
            {loading ? t('adm.log.refreshing') : t('adm.log.refresh')}
          </button>
        </div>
        <input
          type="search"
          className="admin__search"
          placeholder={t('adm.log.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <Status loading={loading && !data} error={error} />
      {data && (
        <>
        <div className="admin__table-wrap" ref={paged.boxRef} style={paged.boxStyle}>
          <table className="admin__table">
            <thead>
              <tr>
                <th>{t('adm.log.when')}</th>
                <th>{t('adm.log.event')}</th>
                <th>{t('adm.log.by')}</th>
                <th>{t('adm.log.details')}</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((entry) => {
                const meta = LOG_TYPES[entry.type] ?? { tone: 'neutral' };
                return (
                  <tr key={entry.id}>
                    <td className="admin__muted admin__nowrap">{fmtDateTime(entry.created_at, locale)}</td>
                    <td>
                      <span className={`admin__status admin__status--${meta.tone}`}>{logLabel(t, entry.type)}</span>
                    </td>
                    <td>{entry.actor ?? t('adm.log.system')}</td>
                    <td>
                      <LogDetails entry={entry} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="admin__empty">{t('adm.log.empty')}</p>}
        </div>
        <Pager {...paged.pager} />
        </>
      )}
    </>
  );
}
