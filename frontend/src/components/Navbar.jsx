import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import { FACEBOOK_URL } from '../lib/site';
import FacebookIcon from './FacebookIcon';
import './Navbar.css';

// Past this scroll offset (and on every page other than Home, where there's
// no hero photo to sit on) the full-width transparent bar condenses into a
// floating, frosted capsule so it stays readable over any content.
const FLOAT_SCROLL_THRESHOLD = 24;

// Below this width the links move into the full-screen menu sheet.
const MOBILE_QUERY = '(max-width: 900px)';

// `label` is a translation key (see i18n/strings.js).
const PRIMARY_LINKS = [
  { to: '/home', label: 'nav.home' },
  { to: '/activities', label: 'nav.activities' },
  { to: '/about', label: 'nav.about' },
];

// TH / EN toggle. Two buttons rather than a dropdown: both options are
// always visible and one tap switches.
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

// Site-wide navigation (see App.jsx): brand, page links with a sliding
// "you are here" pill, and actions - account and the primary
// "Book a stay" call to action. An admin browsing the public site gets a
// link back to the admin dashboard (a separate page, see Admin.jsx) in place
// of the guest-only items (Book a stay, My bookings). On small screens
// everything except the brand and the CTA moves into a full-screen menu.
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

  const floating = scrolled || pathname !== '/home';
  const isAdmin = Boolean(user?.is_admin);
  // A room account (the temporary login of a confirmed stay) only has its
  // room dashboard: no booking button, no "My bookings".
  const isStay = Boolean(user?.is_stay);
  const memberLinks = isStay ? [{ to: '/stay', label: 'nav.myRoom' }, ...PRIMARY_LINKS.slice(1)] : PRIMARY_LINKS;
  const links = memberLinks.map((l) => ({ ...l, label: t(l.label) }));

  // Tracks scroll position to switch between the over-hero and floating styles.
  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > FLOAT_SCROLL_THRESHOLD);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Positions the sliding pill under the active page link. Re-measured on
  // navigation and resize; hidden on pages that aren't in the main links.
  // The very first placement skips the slide so the pill doesn't fly in from
  // the left edge on page load.
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

  // Account dropdown: closes on outside click or Escape.
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

  // Mobile menu: locks page scroll while open, closes on Escape or when the
  // window grows past the mobile breakpoint.
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

  // Clears the session and sends the user back to the public Home page.
  function handleLogout() {
    closeMenus();
    logout();
    navigate('/home');
  }

  const initial = user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <header
      className={`navbar${floating ? ' navbar--floating' : ''}${menuOpen ? ' navbar--menu-open' : ''}`}
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
                <span className="navbar__avatar" aria-hidden="true">
                  {initial}
                </span>
                <svg className="navbar__chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {accountOpen && (
                <div className="navbar__dropdown" id="navbar-account-menu">
                  <p className="navbar__dropdown-email">
                    {user.email}
                    {!isStay && user.member_code && (
                      <span>
                        {t('member.code')} {user.member_code}
                      </span>
                    )}
                  </p>
                  {/* The admin dashboard is English-only, like this link to it. */}
                  {isAdmin && (
                    <Link to="/admin" onClick={closeMenus}>
                      Admin dashboard
                    </Link>
                  )}
                  {!isAdmin && !isStay && (
                    <Link to="/booking" onClick={closeMenus}>
                      {t('nav.myBookings')}
                    </Link>
                  )}
                  <button type="button" className="navbar__dropdown-logout" onClick={handleLogout}>
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

          {!isAdmin && !isStay && (
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

      {/* Mobile menu. `inert` keeps it out of the tab order while closed. */}
      <div id="navbar-sheet" className="navbar__sheet" inert={!menuOpen}>
        <nav className="navbar__sheet-links" aria-label="Main">
          {links.map((link, i) => (
            <NavLink key={link.to} to={link.to} end onClick={closeMenus} style={{ '--i': i }}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar__sheet-footer" style={{ '--i': links.length }}>
          {user ? (
            <>
              <p className="navbar__sheet-email">
                {t('nav.signedInAs', { email: user.email })}
                {!isStay && user.member_code && ` · ${t('member.code')} ${user.member_code}`}
              </p>
              <div className="navbar__sheet-row">
                {isAdmin && (
                  <Link to="/admin" onClick={closeMenus}>
                    Admin dashboard
                  </Link>
                )}
                {!isAdmin && !isStay && (
                  <Link to="/booking" onClick={closeMenus}>
                    {t('nav.myBookings')}
                  </Link>
                )}
                <button type="button" onClick={handleLogout}>
                  {t('nav.logout')}
                </button>
              </div>
            </>
          ) : (
            <div className="navbar__sheet-row">
              <Link to="/login" onClick={closeMenus}>
                {t('nav.login')}
              </Link>
            </div>
          )}
          <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="navbar__sheet-social">
            <FacebookIcon size={18} /> {t('nav.messageFb')}
          </a>
          <LangSwitch lang={lang} setLang={setLang} label={t('nav.language')} className="navbar__sheet-lang" />
        </div>
      </div>
    </header>
  );
}
