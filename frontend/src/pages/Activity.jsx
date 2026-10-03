import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';
import { useLang } from '../i18n/lang';

// Public page listing all on-site activities available to book.
export default function Activity() {
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState(null);
  const { t } = useLang();

  // Loads the activity list once on mount.
  useEffect(() => {
    api('/api/activities')
      .then((data) => setActivities(data.activities))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <header className="page-banner" style={{ backgroundImage: 'url(/images/farm/around-planting.jpg)' }}>
        <div className="page-banner__inner">
          <p className="page-banner__eyebrow">{t('farm.eyebrow')}</p>
          <h1>{t('activities.title')}</h1>
        </div>
      </header>

      <section className="page page--below-banner">
        {error && <p role="alert">{error}</p>}
        <ul>
          {activities.map((activity) => (
            <li key={activity.id}>
              <strong>{activity.name}</strong> - {formatBaht(activity.price)}
              {activity.description && <p>{activity.description}</p>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
