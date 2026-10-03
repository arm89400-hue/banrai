---
name: baanrai-ui
description: How to edit the look and layout of the Baanrai farmstay website (React + Vite frontend in this repo) - arranging buttons, menus, cards, forms, sections and admin tables, keeping them aligned, readable in Thai and English, and verified with screenshots before reporting. Use this skill whenever the user asks to change, move, redesign, align, center, resize, reorder, restyle or "make it look better" on any page, component, navbar, footer, room card, booking step, admin tab or dashboard of this site - including when they send a screenshot of something that looks wrong (e.g. "not centered", "shakes", "squeezed", "overlaps", "merge these"), ask for animation/motion, or ask for a new page or section that must match the existing design.
---

# Editing UI/UX on the Baanrai website

The site is a Thai farmstay (บ้านไร่ของพ่อ 344, Pak Chong). Guests are mostly Thai
families on phones; the owner manages bookings in an English-only admin dashboard.
Design decisions should serve those two audiences: guests find a room and book it
quickly, the owner sees what needs doing.

Read `references/design-system.md` for the tokens, components, page→file map and
breakpoints before editing. Two helper scripts live in `scripts/`:
- `ui_check.mjs` - screenshots + layout measurements (overflow, navbar overlaps,
  wrapped labels, `--center A B` offset). Run it from a scratch dir that has
  `puppeteer-core` installed; usage is in the file header.
- `i18n_parity.mjs` - fails if a Thai or English text key is missing its pair.

## Workflow

1. **Locate what the user means.** Users often send a cropped screenshot and a short
   phrase ("กิจกรรม ไม่ตรงกับ ยินดีต้อนรับ", "merge these", "icon looks squeeze").
   Find the component from the visible text (grep the Thai/English string in
   `frontend/src/i18n/*.js`, then the key in components/pages). If two readings are
   plausible and they change the result, ask one short question; otherwise pick the
   likely one and say which you chose.
2. **Read the current code first.** Files in this repo are often changed by other
   sessions or by the user. Never edit from memory - read the component and its CSS
   right before editing, and check `git status` for new files you don't know about.
3. **Measure before guessing** for alignment/size/shake complaints. Use
   `scripts/ui_check.mjs` (or a quick puppeteer evaluate) to get real numbers - e.g.
   "middle link center 476.5px vs hero text 485px". Fix the cause the numbers show,
   then re-measure and report the before/after numbers.
4. **Edit with the system, not around it**: existing tokens (`var(--brand)`, `--dur`,
   `--ease-out`…), existing component classes, BEM-ish class names per component
   (`navbar__links`, `room-card__cta`), one CSS file per component/page. All guest
   text goes through `t('key')` with both `th` and `en` entries.
5. **Verify visually** at 1400px, ~985px (the owner's laptop) and 390px (phone), in
   Thai (default) and, if text changed, English; and as each role the change affects
   (guest, member, room account, admin). Look at the screenshots - a passing build is
   not a passing layout. Run `npx oxlint` and `npm run build` in `frontend/`
   (one pre-existing warning in AuthContext.jsx is expected).
6. **Show it before it goes live** when the change is visible: rebuild the preview
   (see design-system.md → "Running") and give the user the URL. The live Docker site
   only changes when the user approves ("OK").
7. **Report** in the user's language (usually Thai): what changed, why it was wrong
   (one line), the measured result, what still isn't perfect, files touched.

## How to arrange options and objects

These are the rules that have worked on this site; follow the reasoning, not just
the rule.

**One main action per view.** The gold (`--sun`, hsl 44 92% 58%) style is reserved
for the single most important action - "จองห้องพัก", "จองเลย", "ส่งคำขอจอง", call
buttons in the footer. Everything else is green (`--brand`) or outlined. Two gold
buttons side by side compete; demote one.

**Order by what the user is trying to do.** Put things in the order the person needs
them, not the order they were built:
- Home: hero → search → rooms → farm story → amenities → good-to-know → footer.
- Booking: dates → room → details → review (each step only asks what it needs).
- Rooms: generation order (ห้องพ่อ, ห้องแม่, ลูก, หลาน, เหลน) = price order.
- Phone layouts: content first, then the action, then secondary links
  (room page: details → booking card → other rooms).

**Group related things, separate unrelated ones.** Proximity carries meaning: price
facts as one chip row, amenities in 4 labelled cards, contact buttons together in one
place. When the same information appears twice (phones in a band *and* footer), merge
into one place instead of styling both.

**Align to a real axis.** Centering inside a flex row centers in the *leftover* space,
which drifts when the sides differ in width. For a header with logo / links / actions
use `grid-template-columns: 1fr auto 1fr` (links truly centered). If a specific middle
item must line up with something below it, give the items equal width
(`grid-auto-columns: 1fr`). Keep padding symmetric (asymmetric padding = off-center).

**Fit before it wraps.** Labels like เข้าสู่ระบบ must not break onto two lines; use
`white-space: nowrap` and tighten spacing at medium widths (the 1180px breakpoint)
rather than letting things wrap or overlap. When a bar gains items (the admin header
has 7), size those items to their text and drop controls that don't apply there
(TH/EN is hidden in admin).

**Choose the control that matches the data.** Yes/no → checkbox. A quantity that
changes the price (guests, pets) → − / + counter with the price shown live. A date
range → the inline calendar that crosses out booked nights. Never ask for something
the system can work out (price, deposit, nights).

**Show state, don't make users guess.** Selected, disabled, loading, empty, error and
success all look different (status pills: gold = รอชำระมัดจำ, green = ยืนยันแล้ว,
red = ยกเลิกแล้ว). Empty states say what to do next. Errors say what happened and how
to fix it, in the guest's language.

**Role-aware layouts.** The same component shows different things per role: guests
see "จองห้องพัก", room accounts see "ห้องพักของฉัน" and no booking CTA, admins see the
dashboard sections as header links and no guest CTA. Check every role you touched.

## Motion

Motion explains something (a section arriving, a pill moving to the active link, a
card lifting under the cursor) - never decoration on everything. Use the shared
`fade-up` keyframes and `--dur`/`--ease-out` tokens; keep it under ~0.7s; animate
`transform`/`opacity`/`translate` only. Entrance animations should use the individual
`translate` property so they don't fight hover `transform`s. Everything must still
look right with `prefers-reduced-motion` (a global rule already disables motion).

## Thai and English

- Thai is the default language; every guest-facing string needs `th` and `en` in
  `frontend/src/i18n/strings.js` or `bookingStrings.js` (run the key-parity check in
  design-system.md after adding keys).
- Thai text breaks badly with wide letter-spacing (tone marks detach) - add the
  element to the `html:lang(th)` letter-spacing rule in `index.css`.
- Never split a Thai word across lines in titles: room names are stored
  "English · Thai" and rendered as title + subtitle (`roomNames()`).
- Use `text-wrap: balance` on short headings/leads so a single Thai word isn't left
  alone on the last line.
- Thai dates use the Buddhist year via `toLocaleDateString('th-TH')`; money uses
  `formatBaht()` (฿1,800).
- The admin dashboard is English-only by design.

## Pitfalls already hit on this site (check these first)

- **Hover beating a selected state**: `.x:hover:not(:disabled)` outranks `.x.is-edge`;
  list the selected selector with `:hover` too.
- **"Shaking" when switching views**: content collapses while loading → page height
  drops → scrollbar disappears → everything shifts 17px. Fixed globally with
  `scrollbar-gutter: stable`; also give loading panels a `min-height`.
- **Sticky card stretching rows**: a sticky card spanning two grid rows spreads its
  height across them; use `grid-template-rows: auto 1fr`.
- **Photo stretching a card**: tall images set the row height; position the `img`
  absolutely inside a `min-height` container.
- **Squeezed favicon/logo**: non-square images get squashed; pad to a square canvas.
- **React redirect undone**: an effect that syncs state to the URL (`setSearchParams`)
  runs after a child `<Navigate>` and cancels it - skip the sync while redirecting.
- **Headless screenshots lie about animations** (frozen mid-transition). If a frame
  looks half-faded, re-check with reduced motion or read computed styles.
- **Docker preview is a fixed build**: after editing, rebuild it or the user sees old code.

## Accessibility floor

Real `<button>`/`<a>` elements, visible `:focus-visible` (gold on dark backgrounds),
`aria-label` on icon-only buttons, `aria-pressed`/`aria-expanded`/`aria-current`
for toggles, tap targets ≥ 40px, text contrast ≥ 4.5:1, nothing that only works on hover.
