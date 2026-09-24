import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatBaht } from '../lib/money';

// Public page listing all on-site activities available to book.
export default function Activity() {
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState(null);

  // Loads the activity list once on mount.
  useEffect(() => {
    api('/api/activities')
      .then((data) => setActivities(data.activities))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <section className="page">
      <h1>Activities</h1>
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
  );
}
