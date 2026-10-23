import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ADMIN_NAV, ADMIN_PAGES, OLD_SECTIONS, adminPath, pageFromParams } from '../lib/adminSections';
import { useAdminBadges } from '../lib/adminData';
import { useGlide } from '../lib/glide';
import { useLang } from '../i18n/lang';
import AdminIcon from '../components/AdminIcons';
import { ConfirmProvider } from '../components/AdminUI';
import AdminChatDock from '../components/AdminChatDock';
import AdminPalette from '../components/AdminPalette';
import AdminToday from './AdminToday';
import { Bookings } from './AdminBookings';
import AdminChat from './AdminChat';
import AdminListings from './AdminListings';
import AdminPromotions from './AdminPromotions';
import AdminAnnouncements from './AdminAnnouncements';
import AdminContact from './AdminContact';
import { ActivityLog, Users } from './AdminPeople';
import '../components/Skeleton.css';
import './Admin.css';

const PAGES = {
  overview: AdminToday,
  bookings: Bookings,
  chat: AdminChat,
  rooms: () => <AdminListings kind="rooms" />,
  activities: () => <AdminListings kind="activities" />,
  promotions: AdminPromotions,
  announcements: AdminAnnouncements,
  contact: AdminContact,
  users: Users,
  log: ActivityLog,
};

function Menu({ page, badges, onPick }) {
  const { t } = useLang();
  const ref = useRef(null);
  useGlide(ref, page);
  return (
    <nav ref={ref} className="adm-nav" aria-label={t('adm.menu')}>
      <span className="glide" aria-hidden="true" />
      {ADMIN_NAV.map((g, i) => (
        <div key={g.group ?? i} className="adm-nav__group">
          {g.group && <p className="adm-nav__label">{t(g.group)}</p>}
          {g.items.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end
              className={`adm-nav__item${item.id === page ? ' is-on' : ''}`}
              aria-current={item.id === page ? 'page' : undefined}
              onClick={onPick}
            >
              <AdminIcon name={item.icon} size={20} />
              <span>{t(item.label)}</span>
              {item.badge && badges[item.badge] > 0 && <em>{badges[item.badge]}</em>}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function SearchButton({ onClick }) {
  const { t } = useLang();
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <button type="button" className="adm-find" onClick={onClick}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4-4" />
      </svg>
      <span>{t('adm.pal.button')}</span>
      <kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  );
}

function Foot({ user, onLogout }) {
  const { t, lang, setLang } = useLang();
  return (
    <div className="adm-side__foot">
      <div className="adm-lang" role="group" aria-label={t('adm.language')}>
        {['th', 'en'].map((code) => (
          <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}>
            {code === 'th' ? 'ไทย' : 'EN'}
          </button>
        ))}
      </div>
      <Link to="/home" className="adm-nav__item adm-nav__item--quiet">
        <AdminIcon name="site" size={20} />
        <span>{t('adm.viewSite')}</span>
      </Link>
      <button type="button" className="adm-nav__item adm-nav__item--quiet" onClick={onLogout}>
        <AdminIcon name="logout" size={20} />
        <span>
          {t('adm.logout')}
          <small>{user.email}</small>
        </span>
      </button>
    </div>
  );
}

function Brand() {
  const { t } = useLang();
  return (
    <Link to="/admin" className="adm-brand">
      <img src="/images/logo-mark.png" alt="" />
      <span>
        Baanrai
        <small>{t('adm.brand')}</small>
      </span>
    </Link>
  );
}

export default function Admin() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const { section, tab } = useParams();
  const { pathname } = useLocation();
  const isAdmin = Boolean(user?.is_admin);
  const page = pageFromParams(section, tab);
  const badges = useAdminBadges(isAdmin, page);
  const [menuOpen, setMenuOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [dockSignal, setDockSignal] = useState(null);
  const openChat = useCallback((id) => setDockSignal({ id, n: Date.now() }), []);

  // Ctrl+K / ⌘K / "/" opens the quick search from anywhere in the admin.
  useEffect(() => {
    if (!isAdmin) return undefined;
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAdmin]);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (!isAdmin) return <Navigate to="/home" replace />;
  if (!tab && OLD_SECTIONS[section]) return <Navigate to={adminPath(OLD_SECTIONS[section])} replace />;
  if (!page) return <Navigate to="/admin" replace />;
  if (section && !tab && (section === 'site' || section === 'people')) return <Navigate to={adminPath(page)} replace />;

  const Page = PAGES[page];
  const current = ADMIN_PAGES.find((p) => p.id === page);
  const totalBadge = badges.overview ?? 0;

  return (
    <ConfirmProvider>
      <div className="adm-shell">
        <aside className="adm-side">
          <Brand />
          <SearchButton onClick={() => setPalette(true)} />
          <Menu page={page} badges={badges} />
          <Foot user={user} onLogout={logout} />
        </aside>

        <header className="adm-bar">
          <Brand />
          <span className="adm-bar__page">{t(current.label)}</span>
          <button type="button" className="adm-bar__find" onClick={() => setPalette(true)} aria-label={t('adm.pal.button')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M20 20l-4-4" />
            </svg>
          </button>
          <button
            type="button"
            className="adm-bar__menu"
            aria-expanded={menuOpen}
            aria-controls="adm-sheet"
            onClick={() => setMenuOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            {t('adm.menu')}
            {totalBadge > 0 && <em>{totalBadge}</em>}
          </button>
        </header>

        <div id="adm-sheet" className={`adm-sheet${menuOpen ? ' is-open' : ''}`} inert={!menuOpen}>
          <div className="adm-sheet__shade" onClick={() => setMenuOpen(false)} />
          <div className="adm-sheet__panel" role="dialog" aria-modal="true" aria-label={t('adm.menu')}>
            <div className="adm-sheet__top">
              <Brand />
              <button type="button" className="adm-x" onClick={() => setMenuOpen(false)} aria-label={t('adm.close')}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <Menu page={page} badges={badges} onPick={() => setMenuOpen(false)} />
            <Foot user={user} onLogout={logout} />
          </div>
        </div>

        <main className={`adm-main adm-main--${page}`} key={page}>
          <Page onChat={openChat} />
        </main>
        <AdminChatDock hidden={page === 'chat'} openSignal={dockSignal} />
        <AdminPalette open={palette} onClose={() => setPalette(false)} onChat={openChat} />
      </div>
    </ConfirmProvider>
  );
}
