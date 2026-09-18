import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import DateRangePicker from '../components/DateRangePicker';
import './Home.css';

// Public landing page: full-bleed hero with a quick-search bar (dates +
// guests) over the property photo, followed by a grid of available rooms
// fetched from the API.
export default function Home() {
  const [rooms, setRooms] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState({ checkIn: '', checkOut: '', guests: 2 });
  // Per-room booking status, keyed by room id: 'booking' | 'booked' | 'error'.
  const [bookingState, setBookingState] = useState({});
  const { user } = useAuth();
  const navigate = useNavigate();

  const hasRange = Boolean(search.checkIn && search.checkOut);

  // Loads the room list on mount, and again whenever the check-in/check-out
  // range changes - once both are picked, the API excludes any room that's
  // already booked for an overlapping range, so unavailable rooms simply
  // don't appear (rather than showing and then rejecting a booking attempt).
  useEffect(() => {
    const params = new URLSearchParams();
    if (hasRange) {
      params.set('checkIn', search.checkIn);
      params.set('checkOut', search.checkOut);
    }
    const qs = params.toString();

    api(`/api/rooms${qs ? `?${qs}` : ''}`)
      .then((data) => setRooms(data.rooms))
      .catch((err) => setError(err.message));
  }, [search.checkIn, search.checkOut, hasRange]);

  // Search doesn't need to do anything extra - the effect above already
  // refetches on date changes - so this just scrolls down to the rooms.
  function handleSearch(e) {
    e.preventDefault();
    document.getElementById('rooms')?.scrollIntoView({ behavior: 'smooth' });
  }

  // Books the given room for the check-in/check-out range picked in the
  // search bar (the button is disabled until both are picked - see below).
  // Sends logged-out visitors to /login instead of booking.
  async function handleBookRoom(room) {
    if (!hasRange) return;
    if (!user) {
      navigate('/login');
      return;
    }

    setBookingState((s) => ({ ...s, [room.id]: { status: 'booking' } }));
    try {
      await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          room_id: room.id,
          // Treat the picked calendar dates as UTC midnight directly
          // (no local Date/toISOString round-trip) so the stay range can't
          // shift a day depending on the browser's timezone.
          booked_for: `${search.checkIn}T00:00:00.000Z`,
          booked_until: `${search.checkOut}T00:00:00.000Z`,
        }),
      });
      setBookingState((s) => ({ ...s, [room.id]: { status: 'booked' } }));
    } catch (err) {
      setBookingState((s) => ({ ...s, [room.id]: { status: 'error', message: err.message } }));
      // Someone else may have just taken this room for these dates (or any
      // other overlapping range) - refresh so the grid reflects reality
      // instead of continuing to show a room that just became unavailable.
      api(`/api/rooms?checkIn=${search.checkIn}&checkOut=${search.checkOut}`)
        .then((data) => setRooms(data.rooms))
        .catch(() => {});
    }
  }

  return (
    <>
      <section className="hero">
        <div className="hero__overlay">
          <div className="hero__content">
            <h1>Welcome</h1>
            <h1>Escape to Nature</h1>
            <p>A quiet homestay retreat in Pak Chong, surrounded by nature.</p>
          </div>

          <form className="search-bar" onSubmit={handleSearch}>
            <DateRangePicker
              checkIn={search.checkIn}
              checkOut={search.checkOut}
              onChange={(dates) => setSearch({ ...search, ...dates })}
            />
            <label>
              <span>Guests</span>
              <input
                type="number"
                min="1"
                max="4"
                value={search.guests}
                onChange={(e) => {
                  const value = Math.min(4, Math.max(1, Number(e.target.value) || 1));
                  setSearch({ ...search, guests: value });
                }}
              />
            </label>
            <button type="submit">Search</button>
          </form>
        </div>
      </section>

      <section id="rooms" className="rooms-section">
        <h2>Available Rooms</h2>
        {error && <p role="alert">{error}</p>}
        <div className="rooms-grid">
          {rooms.map((room) => {
            const state = bookingState[room.id];
            return (
              <article key={room.id} className="room-card">
                <div className="room-card__image">
                  <img
                    src={room.image_url || `/images/rooms/room-${room.id}.jpg`}
                    alt={room.name}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                <div className="room-card__body">
                  <h3>{room.name}</h3>
                  {room.description && <p>{room.description}</p>}
                  <div className="room-card__footer">
                    <span className="room-card__price">${room.price} / night</span>
                    {room.capacity && <span>Up to {room.capacity} guests</span>}
                  </div>

                  <button
                    type="button"
                    className="room-card__book"
                    disabled={!hasRange || state?.status === 'booking' || state?.status === 'booked'}
                    title={!hasRange ? 'Pick check-in and check-out dates above first' : undefined}
                    onClick={() => handleBookRoom(room)}
                  >
                    {state?.status === 'booking' && 'Booking…'}
                    {state?.status === 'booked' && 'Booked ✓'}
                    {(!state || state.status === 'error') &&
                      (user ? 'Book this room' : 'Log in to book')}
                  </button>
                  {!hasRange && (
                    <p className="room-card__hint">
                      Select check-in and check-out dates above to book
                    </p>
                  )}
                  {state?.status === 'error' && (
                    <p className="room-card__error" role="alert">
                      {state.message}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
          {!error && rooms.length === 0 && (
            <p>{hasRange ? 'No rooms available for these dates.' : 'No rooms published yet.'}</p>
          )}
        </div>
      </section>
    </>
  );
}
