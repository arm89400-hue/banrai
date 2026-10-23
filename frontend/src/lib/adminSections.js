// The admin menu, in the order the owner works: today's jobs first, then the
// website, then customer records. Every page is one click from the menu (no
// second row of tabs), and the URLs stay the same as before.
export const ADMIN_NAV = [
  {
    group: null,
    items: [
      { id: 'overview', path: '/admin', label: 'adm.nav.today', icon: 'overview', badge: 'overview' },
      { id: 'bookings', path: '/admin/bookings', label: 'adm.nav.bookings', icon: 'bookings' },
      { id: 'chat', path: '/admin/chat', label: 'adm.nav.chat', icon: 'chat', badge: 'chat' },
    ],
  },
  {
    group: 'adm.group.site',
    section: 'site',
    items: [
      { id: 'rooms', path: '/admin/site/rooms', label: 'adm.tab.rooms', icon: 'rooms' },
      { id: 'activities', path: '/admin/site/activities', label: 'adm.tab.activities', icon: 'activities' },
      { id: 'promotions', path: '/admin/site/promotions', label: 'adm.tab.promotions', icon: 'promotions' },
      { id: 'announcements', path: '/admin/site/announcements', label: 'adm.tab.announcements', icon: 'announcements' },
      { id: 'contact', path: '/admin/site/contact', label: 'adm.tab.contact', icon: 'phone' },
    ],
  },
  {
    group: 'adm.group.people',
    section: 'people',
    items: [
      { id: 'users', path: '/admin/people/users', label: 'adm.tab.users', icon: 'users' },
      { id: 'log', path: '/admin/people/log', label: 'adm.tab.log', icon: 'log' },
    ],
  },
];

export const ADMIN_PAGES = ADMIN_NAV.flatMap((g) => g.items);

// Turns /admin/:section/:tab into one page id, or null if it doesn't exist.
export function pageFromParams(section, tab) {
  if (!section) return 'overview';
  const group = ADMIN_NAV.find((g) => g.section === section);
  if (group) {
    if (!tab) return group.items[0].id;
    return group.items.some((i) => i.id === tab) ? tab : null;
  }
  return !tab && ADMIN_PAGES.some((p) => p.id === section && !p.path.includes('/site/') && !p.path.includes('/people/'))
    ? section
    : null;
}

export function adminPath(id) {
  return ADMIN_PAGES.find((p) => p.id === id)?.path ?? '/admin';
}

// Links from older versions of the dashboard.
export const OLD_SECTIONS = {
  rooms: 'rooms',
  announcements: 'announcements',
  activities: 'activities',
  promotions: 'promotions',
  users: 'users',
  log: 'log',
  calendar: 'overview',
};
