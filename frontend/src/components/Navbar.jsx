import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import './Navbar.css';

const FLOAT_SCROLL_THRESHOLD = 24;

const PHOTO_TOP = ['/home', '/activities', '/about', '/stay'];

const MOBILE_QUERY = '(max-width: 900px)';

const PRIMARY_LINKS = [
  { to: '/home', label: 'nav.home' },
  { to: '/activities', label: 'nav.activities' },
  { to: '/about', label: 'nav.about' },
];

function LangSwitch({ lang, setLang, label, className = '' }) {
  return (
    <div className={`navbar__lang ${className}`} role="group" aria-label={label}>
      {[
        ['th', 'TH', 'ภาษาไทย'],
        ['en', 'EN', 'English'],
      ].map(([code, short, full]) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={lang === code}
          aria-label={full}
          onClick={() => setLang(code)}
        >
          {short}
        </button>
      ))}
    </div>
  );
}

const MenuIcon = ({ d }) => (
  <svg className="navbar__menu-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d={d} />
  </svg>
);

const Chevron = () => (
  <svg className="navbar__chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PersonIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

export default function Navbar() {
  const [scrolled, setScrolled] = useState(window.scrollY > FLOAT_SCROLL_THRESHOLD);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [indicator, setIndicator] = useState(null);
  const { user, logout } = useAuth();
  const { lang, setLang, t } = useLang();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const linksRef = useRef(null);
  const accountRef = useRef(null);
  const indicatorRef = useRef(null);
  const hasMeasuredRef = useRef(false);

  const floating = scrolled;
  const band = !floating && !PHOTO_TOP.includes(pathname);
  const isAdmin = Boolean(user?.is_admin);
  const isStay = Boolean(user?.is_stay);
  const memberLinks = isStay ? [{ to: '/stay', label: 'nav.myRoom' }, ...PRIMARY_LINKS.slice(1)] : PRIMARY_LINKS;
  const links = memberLinks.map((l) => ({ ...l, label: t(l.label) }));

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > FLOAT_SCROLL_THRESHOLD);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useLayoutEffect(() => {
    function measure() {
      const active = linksRef.current?.querySelector('a.active');
      setIndicator(active ? { x: active.offsetLeft, w: active.offsetWidth } : null);
      if (active && !hasMeasuredRef.current && indicatorRef.current) {
        hasMeasuredRef.current = true;
        const el = indicatorRef.current;
        el.style.transition = 'none';
        requestAnimationFrame(() => requestAnimationFrame(() => (el.style.transition = '')));
      }
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [pathname, lang]);

  useEffect(() => {
    if (!accountOpen) return;
    function handlePointer(e) {
      if (!accountRef.current?.contains(e.target)) setAccountOpen(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setAccountOpen(false);
    }
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [accountOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const mq = window.matchMedia(MOBILE_QUERY);
    function handleKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    function handleBreakpoint(e) {
      if (!e.matches) setMenuOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    mq.addEventListener('change', handleBreakpoint);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      mq.removeEventListener('change', handleBreakpoint);
    };
  }, [menuOpen]);

  function closeMenus() {
    setMenuOpen(false);
    setAccountOpen(false);
  }

  function handleLogout() {
    closeMenus();
    logout();
    navigate('/home');
  }

  return (
    <header
      className={`navbar${floating ? ' navbar--floating' : ''}${band ? ' navbar--band' : ''}${menuOpen ? ' navbar--menu-open' : ''}`}
    >
      <div className="navbar__inner">
        <Link to="/home" className="navbar__brand" onClick={closeMenus} aria-label="Baanrai Pachong, home">
          <img
            src="/images/logo.png"
            alt=""
            className="navbar__logo"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <span className="navbar__wordmark" aria-hidden="true">
            <span className="navbar__name">Baanrai</span>
            <span className="navbar__place">Pachong</span>
          </span>
        </Link>

        <nav className="navbar__links" ref={linksRef} aria-label="Main">
          <span
            ref={indicatorRef}
            className="navbar__indicator"
            aria-hidden="true"
            data-visible={Boolean(indicator)}
            style={indicator ? { '--x': `${indicator.x}px`, '--w': `${indicator.w}px` } : undefined}
          />
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar__actions">
          {user ? (
            <div className="navbar__account navbar__desktop-only" ref={accountRef}>
              <button
                type="button"
                className="navbar__account-btn"
                aria-expanded={accountOpen}
                aria-controls="navbar-account-menu"
                aria-label={t('nav.account', { email: user.email })}
                onClick={() => setAccountOpen((open) => !open)}
              >
                <svg className="navbar__person" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                </svg>
                <span>{t('nav.accountShort')}</span>
                <svg className="navbar__chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {accountOpen && (
                <div className="navbar__dropdown" id="navbar-account-menu">
                  <div className="navbar__dropdown-who">
                    <span>
                      <b>{user.email}</b>
                      {!isStay && user.member_code && (
                        <small>
                          {t('member.code')} {user.member_code}
                        </small>
                      )}
                    </span>
                  </div>
                  {isAdmin && (
                    <Link to="/admin" onClick={closeMenus}>
                      <MenuIcon d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />
                      {t('nav.admin')}
                      <Chevron />
                    </Link>
                  )}
                  {!isAdmin && !isStay && (
                    <>
                      <Link to="/booking" onClick={closeMenus}>
                        <MenuIcon d="M4 7h16v13H4zM4 11h16M8 3v4M16 3v4" />
                        {t('nav.myBookings')}
                        <Chevron />
                      </Link>
                      <Link to="/stay" onClick={closeMenus}>
                        <MenuIcon d="M3 18V8M3 14h18v4M21 18v-6a3 3 0 0 0-3-3h-7v5M7 11.5h.01" />
                        {t('nav.myRoom')}
                        <Chevron />
                      </Link>
                    </>
                  )}
                  <button type="button" className="navbar__dropdown-logout" onClick={handleLogout}>
                    <MenuIcon d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
                    {t('nav.logout')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <NavLink to="/login" className="navbar__login navbar__desktop-only">
              {t('nav.login')}
            </NavLink>
          )}

          <LangSwitch lang={lang} setLang={setLang} label={t('nav.language')} className="navbar__desktop-only" />

          {!isAdmin && !isStay && pathname !== '/home' && !pathname.startsWith('/rooms/') && pathname !== '/book' && (
            <Link to="/book" className="navbar__cta" onClick={closeMenus}>
              {t('nav.book')}
            </Link>
          )}

          <button
            type="button"
            className="navbar__burger"
            aria-expanded={menuOpen}
            aria-controls="navbar-sheet"
            aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      <div className="navbar__shade" aria-hidden="true" onClick={closeMenus} />
      <div id="navbar-sheet" className="navbar__sheet" inert={!menuOpen}>
        <nav className="navbar__sheet-links" aria-label="Main">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end onClick={closeMenus}>
              {link.label}
              <Chevron />
            </NavLink>
          ))}
        </nav>

        <div className="navbar__sheet-more">
          {user && (
            <p className="navbar__sheet-email">
              {user.email}
              {!isStay && user.member_code && ` · ${t('member.code')} ${user.member_code}`}
            </p>
          )}
          {!user && (
            <Link to="/login" onClick={closeMenus}>
              <span>
                <PersonIcon />
                {t('nav.login')}
              </span>
              <Chevron />
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" onClick={closeMenus}>
              <span>
                <PersonIcon />
                Admin dashboard
              </span>
              <Chevron />
            </Link>
          )}
          {user && !isAdmin && !isStay && (
            <Link to="/booking" onClick={closeMenus}>
              <span>
                <PersonIcon />
                {t('nav.myBookings')}
              </span>
              <Chevron />
            </Link>
          )}
          <button type="button" lang={lang === 'th' ? 'en' : 'th'} onClick={() => setLang(lang === 'th' ? 'en' : 'th')}>
            <span>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
              </svg>
              {lang === 'th' ? 'English' : 'ภาษาไทย'}
            </span>
            <small>{t('nav.language')}</small>
          </button>
          {user && (
            <button type="button" onClick={handleLogout}>
              <span>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
                </svg>
                {t('nav.logout')}
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
