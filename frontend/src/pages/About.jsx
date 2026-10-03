import { Link } from 'react-router-dom';
import { SIGN_PHOTO } from '../lib/photos';
import { useLang } from '../i18n/lang';

const ABOUT_PHOTOS = ['hero-house', 'around-orchard', 'table-breakfast'];

// Static public page introducing the property. No data fetching.
export default function About() {
  const { t } = useLang();
  const captions = t('photos');
  return (
    <>
      <header className="page-banner" style={{ backgroundImage: `url(${SIGN_PHOTO})` }}>
        <div className="page-banner__inner">
          <p className="page-banner__eyebrow">{t('farm.eyebrow')}</p>
          <h1>{t('about.title')}</h1>
        </div>
      </header>

      <section className="page page--below-banner about">
        <p className="about__text">{t('about.text')}</p>
        <div className="about__photos">
          {ABOUT_PHOTOS.map((id) => (
            <img key={id} src={`/images/farm/${id}.jpg`} alt={captions[id]} loading="lazy" />
          ))}
        </div>
        <Link to="/book" className="page-cta">
          {t('nav.book')}
        </Link>
      </section>
    </>
  );
}
