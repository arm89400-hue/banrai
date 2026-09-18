import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

// Below this scroll offset the navbar stays transparent, absolutely
// positioned over the hero image. Past it, it pins to the top of the
// viewport with a solid background so it never blends into page text.
const SOLID_SCROLL_THRESHOLD = 0;

// Site-wide navigation bar rendered on every page (see App.jsx). Starts
// transparent/floating over the hero image and pins solid on scroll (see
// SOLID_SCROLL_THRESHOLD above); shows Login or the signed-in user's email
// + Log out depending on auth state.
export default function Navbar() {
  const [solid, setSolid] = useState(window.scrollY > SOLID_SCROLL_THRESHOLD);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Tracks scroll position so the bar can switch between the transparent
  // (over-hero) and solid (pinned) styles as the user scrolls.
  useEffect(() => {
    function handleScroll() {
      setSolid(window.scrollY > SOLID_SCROLL_THRESHOLD);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Clears the session and sends the user back to the public Home page.
  function handleLogout() {
    logout();
    navigate('/home');
  }

  return (
    <header className={`navbar${solid ? ' navbar--solid' : ''}`}>
      <div className="navbar__brand">
        <img src="/images/logo.png"
          alt=""
          className="navbar__logo"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
        <span>BAANRAI PACHONG</span>
      </div>

      <nav className="navbar__links">
        <NavLink to="/home" end>
          Home
        </NavLink>
        <a href="/home#rooms">Rooms</a>
        <NavLink to="/activities">Activities</NavLink>
        <NavLink to="/about">About</NavLink>
        <NavLink to="/contact">Contact</NavLink>
        {user ? (
          <>
            <NavLink to="/booking">My Bookings</NavLink>
            <span className="navbar__user">{user.email}</span>
            <button type="button" className="navbar__cta" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <NavLink to="/login" className="navbar__cta">
            Login
          </NavLink>
        )}
      </nav>
    </header>
  );
}
