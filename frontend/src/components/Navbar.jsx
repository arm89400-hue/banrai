import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FACEBOOK_URL } from '../lib/site';
import FacebookIcon from './FacebookIcon';
import { ADMIN_SECTIONS, adminPath } from '../lib/adminSections';
import './Navbar.css';

// Past this scroll offset (and on every page other than Home, where there's
// no hero photo to sit on) the full-width transparent bar condenses into a
// floating, frosted capsule so it stays readable over any content.
const FLOAT_SCROLL_THRESHOLD = 24;

// Below this width the links move into the full-screen menu sheet.
const MOBILE_QUERY = '(max-width: 900px)';

const PRIMARY_LINKS = [
  { to: '/home', label: 'Home' },
  { to: '/activities', label: 'Activities' },
  { to: '/about', label: 'About' },
];

// Admins get the dashboard sections as their links instead of the public ones.
const ADMIN_LINKS = ADMIN_SECTIONS.map((s) => ({ to: adminPath(s.id), label: s.label }));

// Site-wide navigation (see App.jsx): brand, page links with a sliding
// "you are here" pill, and actions - account and the primary
// "Book a stay" call to action. Signed in as an admin, the links become the
// admin dashboard's sections and the guest-only items (Book a stay, My
// bookings) are hidden. On small screens everything except the brand and
// the CTA moves into a full-screen menu.
export default function Navbar() {
  const [scrolled, setScrolled] = useState(window.scrollY > FLOAT_SCROLL_THRESHOLD);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [indicator, setIndicator] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const linksRef = useRef(null);
  const accountRef = useRef(null);
  const indicatorRef = useRef(null);
  const hasMeasuredRef = useRef(false);

  const floating = scrolled || pathname !== '/home';
  const isAdmin = Boolean(user?.is_admin);
  const links = isAdmin ? ADMIN_LINKS : PRIMARY_LINKS;

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
  }, [pathname]);

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

  // "Book a stay" goes to the room list. Already on Home, it scrolls there
  // smoothly instead of reloading the page.
  function handleBook(e) {
    closeMenus();
    if (pathname === '/home') {
      e.preventDefault();
      document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' });
    }
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

        <nav className="navbar__links" ref={linksRef} aria-label={isAdmin ? 'Admin sections' : 'Main'}>
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
                aria-label={`Account: ${user.email}`}
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
                  <p className="navbar__dropdown-email">{user.email}</p>
                  {!isAdmin && (
                    <Link to="/booking" onClick={closeMenus}>
                      My bookings
                    </Link>
                  )}
                  <button type="button" className="navbar__dropdown-logout" onClick={handleLogout}>
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <NavLink to="/login" className="navbar__login navbar__desktop-only">
              Log in
            </NavLink>
          )}

          {!isAdmin && (
            <a href="/home#rooms" className="navbar__cta" onClick={handleBook}>
              Book a stay
            </a>
          )}

          <button
            type="button"
            className="navbar__burger"
            aria-expanded={menuOpen}
            aria-controls="navbar-sheet"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
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
        <nav className="navbar__sheet-links" aria-label={isAdmin ? 'Admin sections' : 'Main'}>
          {links.map((link, i) => (
            <NavLink key={link.to} to={link.to} end onClick={closeMenus} style={{ '--i': i }}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="navbar__sheet-footer" style={{ '--i': links.length }}>
          {user ? (
            <>
              <p className="navbar__sheet-email">Signed in as {user.email}</p>
              <div className="navbar__sheet-row">
                {!isAdmin && (
                  <Link to="/booking" onClick={closeMenus}>
                    My bookings
                  </Link>
                )}
                <button type="button" onClick={handleLogout}>
                  Log out
                </button>
              </div>
            </>
          ) : (
            <div className="navbar__sheet-row">
              <Link to="/login" onClick={closeMenus}>
                Log in
              </Link>
            </div>
          )}
          <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="navbar__sheet-social">
            <FacebookIcon size={18} /> Message us on Facebook
          </a>
        </div>
      </div>
    </header>
  );
}
