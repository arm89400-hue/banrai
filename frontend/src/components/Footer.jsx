import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/lang';
import { FACEBOOK_URL, MAPS_URL, PHONES, THAI_NAME } from '../lib/site';
import FacebookIcon from './FacebookIcon';
import './Footer.css';

function Icon({ children, size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const PHONE_PATH = 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z';

// Site-wide footer (see App.jsx), laid out like a travel site's in four
// columns: brand (logo, tagline, Facebook / Maps), explore, your stay, and
// contact (the phone lines as tiles), then a legal strip. It's the single place for contact details,
// so they aren't repeated elsewhere on the page.
export default function Footer() {
  const { user } = useAuth();
  const { t } = useLang();
  const year = new Date().getFullYear();

  return (
    <footer className="footer" id="contact">
      <div className="footer__main">
        <div className="footer__brand">
          <Link to="/home" className="footer__logo" aria-label="Baanrai Pachong">
            <img src="/images/logo.png" alt="" width="48" height="48" />
            <span>
              <span className="footer__name">Baanrai</span>
              <span className="footer__place">Pachong</span>
            </span>
          </Link>
          <p className="footer__tagline">{t('footer.tagline')}</p>
          <div className="footer__social" aria-label={t('footer.findUs')}>
            <a href={FACEBOOK_URL} target="_blank" rel="noopener noreferrer">
              <span className="footer__social-icon footer__social-icon--fb"><FacebookIcon size={16} /></span>
              Facebook
            </a>
            <a href={MAPS_URL} target="_blank" rel="noopener noreferrer">
              <span className="footer__social-icon footer__social-icon--map">
                <Icon size={16}>
                  <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </Icon>
              </span>
              Google Maps
            </a>
          </div>
        </div>

        <nav className="footer__col" aria-label={t('footer.explore')}>
          <h2 className="footer__heading">{t('footer.explore')}</h2>
          <Link to="/home">{t('nav.home')}</Link>
          <Link to="/activities">{t('nav.activities')}</Link>
          <Link to="/about">{t('footer.aboutUs')}</Link>
        </nav>

        <nav className="footer__col" aria-label={t('footer.stay')}>
          <h2 className="footer__heading">{t('footer.stay')}</h2>
          {user?.is_stay ? (
            <Link to="/stay">{t('nav.myRoom')}</Link>
          ) : (
            <>
              <Link to="/book">{t('footer.bookRoom')}</Link>
              <Link to="/booking">{t('nav.myBookings')}</Link>
            </>
          )}
          {!user && <Link to="/login">{t('nav.login')}</Link>}
        </nav>

        <div className="footer__col footer__contact">
          <h2 className="footer__heading">{t('footer.contact')}</h2>
          {PHONES.map((p) => (
            <a key={p.tel} className="footer__phone" href={`tel:${p.tel}`}>
              <span className="footer__phone-icon">
                <Icon size={18}><path d={PHONE_PATH} /></Icon>
              </span>
              <span>
                <span>{p.display}</span>
              </span>
            </a>
          ))}
        </div>
      </div>

      <div className="footer__legal">
        <p>{t('footer.copyright', { year })}</p>
        <p>
          <span lang="th">{THAI_NAME}</span> · {t('footer.address')}
        </p>
      </div>
    </footer>
  );
}
