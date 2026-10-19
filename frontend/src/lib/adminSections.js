// Sections of the admin dashboard: five in the menu, two of them with tabs.
// `label` and tab labels are translation keys (i18n/adminStrings.js);
// `icon` names an icon in components/AdminIcons.jsx. "overview" is Today.
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

// Today lives at /admin itself; every other section at /admin/<id>, and a
// tab at /admin/<id>/<tab> (the first tab when none is given).
export function adminPath(id, tab) {
  if (id === 'overview') return '/admin';
  return tab ? `/admin/${id}/${tab}` : `/admin/${id}`;
}

// Old one-level links (/admin/rooms, /admin/log, ...) -> where they live now.
export const OLD_SECTIONS = {
  rooms: ['site', 'rooms'],
  announcements: ['site', 'announcements'],
  activities: ['site', 'activities'],
  promotions: ['site', 'promotions'],
  users: ['people', 'users'],
  log: ['people', 'log'],
  calendar: ['overview'],
};
