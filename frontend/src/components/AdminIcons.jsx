const PATHS = {
  overview: (
    <>
      <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5" rx="1.5" />
      <rect x="13.5" y="11" width="7.5" height="10" rx="1.5" />
      <rect x="3" y="15" width="7.5" height="6" rx="1.5" />
    </>
  ),
  bookings: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      <path d="M8.5 15l2.3 2.3 4.7-4.5" />
    </>
  ),
  rooms: (
    <>
      <path d="M3 19V6M21 19v-6a3 3 0 0 0-3-3h-8v6M3 15h18M3 19h18" />
      <circle cx="6.8" cy="11.3" r="1.8" />
    </>
  ),
  promotions: (
    <>
      <path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z" />
      <circle cx="8" cy="8" r="1.4" />
      <path d="M10 16l6-6" />
    </>
  ),
  announcements: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h3l6 4.5V5.5L7 10H4a1 1 0 0 0-1 1z" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  activities: (
    <>
      <path d="M5 20c0-8 5-14 15-15-.5 9.5-6 15-15 15z" />
      <path d="M5 20c3.5-5 7-8 11-10" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.8 3.4-6 6.5-6s5.7 2.2 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c1.9.8 3.1 2.7 3.5 5.7" />
    </>
  ),
  chat: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4.2A2.5 2.5 0 0 1 4 13.5z" />
      <path d="M8.5 8.5h7M8.5 11.5h4.5" />
    </>
  ),
  log: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 4v4.5h4.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  site: (
    <>
      <path d="M14 4h6v6M20 4l-8.5 8.5" />
      <path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </>
  ),
};

export default function AdminIcon({ name, size = 22 }) {
  return (
    <svg
      className="admin-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
