import { useLang } from '../i18n/lang';
import { MAPS_URL, PHONES } from '../lib/site';
import './About.css';

const ABOUT_PHOTOS = ['hero-house', 'around-orchard', 'table-breakfast'];

// One small drawn icon per highlight (i18n `farm.highlights[].icon`).
const HIGHLIGHT_ICONS = {
  leaf: <path d="M5 19c0-8 6-13 14-14-1 8-6 14-14 14zM5 19l7-7" />,
  egg: <path d="M12 3c-4 0-7 6-7 10a7 7 0 0 0 14 0c0-4-3-10-7-10z" />,
  bowl: <path d="M3 11h18a9 9 0 0 1-18 0zM8 7c0-1 1-1 1-2M12 7c0-1 1-1 1-2M16 7c0-1 1-1 1-2" />,
};

const PHONE_PATH = 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z';

// Static public page introducing the property: the farm in a few lines,
// what's special about it, photos, and how to get there. No booking button
// of its own - the header's "จองห้องพัก" is on every page.
export default function About() {
  const { lang, t } = useLang();
  const captions = t('photos');
  return (
    <div className="about-page">
      <header className="about-hero">
        <img src="/images/farm/around-orchard.jpg" alt="" />
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

        <section className="about__visit">
          <h2>{t('about.visitTitle')}</h2>
          <p>{t('about.visitWhere')}</p>
          <a href={MAPS_URL} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            {t('about.maps')}
            <span aria-hidden="true">›</span>
          </a>
          {PHONES.map((p) => (
            <a key={p.tel} href={`tel:${p.tel}`}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                <path d={PHONE_PATH} />
              </svg>
              {t('chat.call', { name: p.name[lang] })}
              <span>{p.display}</span>
            </a>
          ))}
        </section>
      </div>
    </div>
  );
}
