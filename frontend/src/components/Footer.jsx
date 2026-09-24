import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FACEBOOK_URL, MAPS_URL } from '../lib/site';
import FacebookIcon from './FacebookIcon';
import './Footer.css';

function MapPinIcon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

// Site-wide footer (see App.jsx): link columns, the property's legal line,
// and a row of the channels guests can reach the homestay on. Replaces the
// old Contact page as the place to find contact details.
export default function Footer() {
  const { user } = useAuth();
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer__top">
        <div className="footer__brand">
          <span className="footer__name">Baanrai</span>
          <span className="footer__place">Pachong</span>
          <p>A quiet homestay retreat in Pak Chong, surrounded by nature.</p>
        </div>

        <nav className="footer__col" aria-label="Explore">
          <h2>Explore</h2>
          <Link to="/home">Home</Link>
          <Link to="/activities">Activities</Link>
          <Link to="/about">About us</Link>
        </nav>

        <nav className="footer__col" aria-label="Your stay">
          <h2>Your stay</h2>
          {user ? (
            <Link to="/booking">My bookings</Link>
          ) : (
            <Link to="/login">Log in</Link>
          )}
          <a href="/home#rooms">Book a room</a>
        </nav>

        <div className="footer__col">
          <h2>Contact us</h2>
          <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
            Message us on Facebook
          </a>
          <a href={MAPS_URL} target="_blank" rel="noopener noreferrer">
            Pak Chong, Nakhon Ratchasima
          </a>
        </div>
      </div>

      <div className="footer__bottom">
        <div className="footer__legal">
          <p>All material herein © {year} Baanrai Pachong. All rights reserved.</p>
          <p>A homestay in Pak Chong, Nakhon Ratchasima, Thailand.</p>
        </div>

        <ul className="footer__channels" aria-label="Find us on">
          <li>
            <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
              <FacebookIcon size={18} />
              <span>Facebook</span>
            </a>
          </li>
          <li>
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer">
              <MapPinIcon size={18} />
              <span>Google Maps</span>
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
