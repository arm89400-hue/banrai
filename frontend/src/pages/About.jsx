import { Link } from 'react-router-dom';
import HeroLife from '../components/HeroLife';
import { partOfDay } from '../lib/photos';
import { useLang } from '../i18n/lang';
import './About.css';

const ABOUT_PHOTOS = ['hero-house', 'around-orchard', 'table-breakfast'];

export default function About() {
  const { t } = useLang();
  const captions = t('photos');
  return (
    <div className="about-page">
      <header className="about-hero">
        <img src="/images/farm/around-orchard.jpg" alt="" />
        <HeroLife part={partOfDay()} pausable />
        <h1>{t('about.title')}</h1>
      </header>

      <div className="about">
        <p className="about__lead">{t('farm.lead')}</p>

        <ul className="about__highlights">
          {t('farm.highlights').map((item) => (
            <li key={item.icon}>
              <span>
                <strong>{item.title}</strong>
                {item.text}
              </span>
            </li>
          ))}
        </ul>

        <div className="about__photos">
          {ABOUT_PHOTOS.map((id) => (
            <img key={id} src={`/images/farm/${id}.jpg`} alt={captions[id]} loading="lazy" />
          ))}
        </div>

        <Link to="/book" className="bk-btn bk-btn--sun about__cta">
          {t('about.cta')}
        </Link>
      </div>
    </div>
  );
}
