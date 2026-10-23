import HeroLife from '../components/HeroLife';
import { partOfDay } from '../lib/photos';
import { useLang } from '../i18n/lang';
import './About.css';

const ABOUT_PHOTOS = ['hero-house', 'around-orchard', 'table-breakfast'];

const HIGHLIGHT_ICONS = {
  leaf: <path d="M5 19c0-8 6-13 14-14-1 8-6 14-14 14zM5 19l7-7" />,
  egg: <path d="M12 3c-4 0-7 6-7 10a7 7 0 0 0 14 0c0-4-3-10-7-10z" />,
  bowl: <path d="M3 11h18a9 9 0 0 1-18 0zM8 7c0-1 1-1 1-2M12 7c0-1 1-1 1-2M16 7c0-1 1-1 1-2" />,
};

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
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {HIGHLIGHT_ICONS[item.icon]}
              </svg>
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
      </div>
    </div>
  );
}
