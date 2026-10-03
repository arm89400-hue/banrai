# Baanrai design system and page map

Verify against the code before relying on any detail here - it reflects the site as
of early October 2026 and the code is the source of truth.

## Contents
1. Tokens
2. Type
3. Components and class prefixes
4. Page → file map
5. Breakpoints
6. Text (i18n)
7. Running, preview and checks

## 1. Tokens (`frontend/src/index.css` `:root`)

| Token | Use |
|---|---|
| `--brand` hsl(150 35% 30%) / `--brand-dark` / `--brand-hover` / `--brand-soft` | forest green: primary buttons, active states, soft backgrounds |
| `--sun` hsl(44 92% 58%) (defined in Navbar/Footer CSS) | the one gold accent: the main action only |
| `--bg` cream, `--bg-alt`, `--white`, `--border` | page and card surfaces |
| `--text`, `--text-h`, `--text-muted` | body, headings, secondary text |
| `--error`, `--success` | cancelled/errors, confirmed/done |
| `--shadow`, `--shadow-lg` | cards; floating things (navbar capsule, booking card) |
| `--ease-out`, `--dur-fast` .18s, `--dur` .35s, `--dur-slow` .7s | all motion |

Shared keyframes: `fade-up` (opacity + `translate`). Scroll reveal: `.reveal`
(scroll-driven where supported, staggered by `--i`).

## 2. Type

- `--serif`: Georgia + Noto Serif Thai - headings, room names, big numbers.
- `--sans`: system UI + Noto Sans Thai - everything else.
- Fonts load from Google Fonts in `frontend/index.html`.
- Eyebrows: 12px, 700, uppercase, wide letter-spacing (tightened for Thai).

## 3. Components and class prefixes

| Thing | Files | Notes |
|---|---|---|
| Navbar | `components/Navbar.jsx/.css` | transparent over Home hero, floating capsule elsewhere; grid `1fr auto 1fr`; sliding white pill on active link; equal-width links (natural width in admin via `.navbar--admin`); TH/EN switch; full-screen mobile sheet ≤900px |
| Footer | `components/Footer.jsx/.css` | one green block: booking CTA (hidden for admin/room accounts) + links + legal strip |
| Chat | `components/ChatWidget.*`, `ChatThread.*`, `pages/AdminChat.*` | floating button for everyone (login prompt for visitors), hidden for admin |
| Booking pieces | `components/BookingBits.*` | `.bk-page`, `.bk-btn(--primary/--sun/--block)`, `.bk-field`, `.bk-counter`, `PriceRows`, `StatusBadge`, `PromoTag` |
| Inline calendar | `components/InlineCalendar.*` | range picking, crossed-out booked nights |
| Search date picker | `components/DateRangePicker.*` | popup used in the Home search bar |
| Admin UI | `pages/Admin.css` | `.admin__btn(--primary/--danger)`, `.admin__table`, `.admin__segmented`, `.admin__status--*`, `.admin__tag--*` |

## 4. Page → file map

| Route | File | Who |
|---|---|---|
| `/home` | `pages/Home.jsx` + `HomeSections.jsx` | everyone |
| `/rooms/:id` | `pages/RoomPage.jsx` | everyone (booking needs login) |
| `/book` | `pages/BookFlow.jsx` | steps 1-2 everyone, 3-4 members |
| `/booking` | `pages/Booking.jsx` | members (my bookings, room logins, notices) |
| `/stay` | `pages/StayDashboard.jsx` | room accounts only |
| `/login` | `pages/Login.jsx` | everyone; `?next=` return path |
| `/activities`, `/about` | `pages/Activity.jsx`, `About.jsx` | everyone (dark `.page` style) |
| `/admin/:section` | `pages/Admin.jsx` (+ `AdminCalendar`, `AdminChat`, `AdminPromotions`) | admins; sections listed in `lib/adminSections.js` |

Shared data: `lib/site.js` (phones, map, Facebook, Thai name, check-in/out times),
`lib/booking.js` (dates, price breakdown, room names), `lib/money.js` (`formatBaht`).
Prices are computed by the backend (`backend/src/lib/pricing.js`); the frontend only
mirrors the breakdown.

## 5. Breakpoints

- ≤1180px: navbar tightens spacing.
- ≤900px: navbar → ☰ sheet; booking flow and room page go single-column.
- ≤800px / ≤640px: smaller headings, footer columns stack.
- Test widths: 1400, 985 (owner's laptop), 920 (tightest desktop), 390 (phone).

## 6. Text (i18n)

- `frontend/src/i18n/strings.js` (site) and `bookingStrings.js` (booking, room pages,
  status, pricing) - both `th` and `en`; `t('key', { var })` fills `{var}`.
- Key-parity check (exits 1 and lists missing keys if th/en differ):
  `node .claude/skills/baanrai-ui/scripts/i18n_parity.mjs`

## 7. Running, preview and checks

- Live site: `docker compose up -d --build` → http://localhost:5173 (API :4001, DB :5433).
  Docker Desktop may be closed; start it (`%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`).
- Preview without touching live (fixed build, rebuild after every edit):

```bash
docker build -q -t baanrai-preview --build-arg VITE_API_URL=http://localhost:4001 ./frontend
docker rm -f baanrai-preview; docker run -d --name baanrai-preview -p 5180:80 --restart unless-stopped baanrai-preview
```

- Lint/build: `cd frontend && npx oxlint && npm run build`.
- Screenshots/measurements: `scripts/ui_check.mjs` (see its header).
- New DB columns: add a numbered, re-runnable migration in `db/migrations/` and
  update `db/schema.sql`. Never re-run `002_room_availability.sql` - it replaces the
  current overlap constraint with an older one.
