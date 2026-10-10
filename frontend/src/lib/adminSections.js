// Sections of the admin dashboard. The Admin page shows these as its menu
// and renders the matching panel. `icon` names an icon in
// components/AdminIcons.jsx; `group` splits the menu with a thin line
// between groups. "overview" is the Today page.
export const ADMIN_SECTIONS = [
  { id: 'overview', label: 'Today', icon: 'overview', group: 'bookings', tab: true },
  { id: 'bookings', label: 'Bookings', icon: 'bookings', group: 'bookings', tab: true },
  { id: 'promotions', label: 'Promotions', icon: 'promotions', group: 'bookings' },
  { id: 'announcements', label: 'Announcements', icon: 'announcements', group: 'bookings' },
  { id: 'rooms', label: 'Rooms', icon: 'rooms', group: 'property', tab: true },
  { id: 'activities', label: 'Activities', icon: 'activities', group: 'property' },
  { id: 'users', label: 'Users', icon: 'users', group: 'people' },
  { id: 'chat', label: 'Chat', icon: 'chat', group: 'people', tab: true },
  { id: 'log', label: 'Log', icon: 'log', group: 'people' },
];

// Today lives at /admin itself; every other section at /admin/<id>.
export const adminPath = (id) => (id === 'overview' ? '/admin' : `/admin/${id}`);
