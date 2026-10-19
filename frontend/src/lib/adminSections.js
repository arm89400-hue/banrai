export const ADMIN_SECTIONS = [
  { id: 'overview', label: 'adm.nav.today', icon: 'overview' },
  { id: 'bookings', label: 'adm.nav.bookings', icon: 'bookings' },
  { id: 'chat', label: 'adm.nav.chat', icon: 'chat' },
  {
    id: 'site',
    label: 'adm.nav.site',
    icon: 'rooms',
    tabs: [
      { id: 'rooms', label: 'adm.tab.rooms' },
      { id: 'announcements', label: 'adm.tab.announcements' },
      { id: 'contact', label: 'adm.tab.contact' },
      { id: 'activities', label: 'adm.tab.activities' },
      { id: 'promotions', label: 'adm.tab.promotions' },
    ],
  },
  {
    id: 'people',
    label: 'adm.nav.people',
    icon: 'users',
    tabs: [
      { id: 'users', label: 'adm.tab.users' },
      { id: 'log', label: 'adm.tab.log' },
    ],
  },
];

export function adminPath(id, tab) {
  if (id === 'overview') return '/admin';
  return tab ? `/admin/${id}/${tab}` : `/admin/${id}`;
}

export const OLD_SECTIONS = {
  rooms: ['site', 'rooms'],
  announcements: ['site', 'announcements'],
  activities: ['site', 'activities'],
  promotions: ['site', 'promotions'],
  users: ['people', 'users'],
  log: ['people', 'log'],
  calendar: ['overview'],
};
