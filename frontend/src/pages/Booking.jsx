import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

// "My bookings" page: prompts a logged-out visitor to log in, otherwise
// lists the signed-in user's activity bookings.
export default function Booking() {
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  // Only fetches once a user is present, since the endpoint requires auth.
  useEffect(() => {
    if (!user) return;
    api('/api/bookings')
      .then((data) => setBookings(data.bookings))
      .catch((err) => setError(err.message));
  }, [user]);

  if (!user) {
    return (
      <section className="page">
        <h1>My bookings</h1>
        <p>
          <Link to="/login">Log in</Link> to see your bookings.
        </p>
      </section>
    );
  }

  return (
    <section className="page">
      <h1>My bookings</h1>
      {error && <p role="alert">{error}</p>}
      <ul>
        {bookings.map((booking) => (
          <li key={booking.id}>
            {booking.room_name ? (
              <>
                Room: {booking.room_name} · {new Date(booking.booked_for).toLocaleDateString()} –{' '}
                {new Date(booking.booked_until).toLocaleDateString()}
              </>
            ) : (
              <>
                Activity: {booking.activity_name} - {new Date(booking.booked_for).toLocaleString()}
              </>
            )}
          </li>
        ))}
      </ul>
      {!error && bookings.length === 0 && <p>No bookings yet.</p>}
    </section>
  );
}
