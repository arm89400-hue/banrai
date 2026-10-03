// Sections of the admin dashboard. The Admin page shows these as its sidebar
// links and renders the matching panel.
export const ADMIN_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'promotions', label: 'Promotions' },
  { id: 'activities', label: 'Activities' },
  { id: 'users', label: 'Users' },
  { id: 'chat', label: 'Chat' },
  { id: 'messages', label: 'Messages' },
  { id: 'log', label: 'Log' },
];

// Overview lives at /admin itself; every other section at /admin/<id>.
export const adminPath = (id) => (id === 'overview' ? '/admin' : `/admin/${id}`);
