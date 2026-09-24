// Sections of the admin dashboard. The navbar shows these as its links while
// an admin is on /admin, and the Admin page renders the matching panel.
export const ADMIN_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'activities', label: 'Activities' },
  { id: 'users', label: 'Users' },
  { id: 'messages', label: 'Messages' },
];

// Overview lives at /admin itself; every other section at /admin/<id>.
export const adminPath = (id) => (id === 'overview' ? '/admin' : `/admin/${id}`);
