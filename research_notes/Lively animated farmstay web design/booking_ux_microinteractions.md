# Booking UX and Micro-interactions for a Mobile-first Farmstay Site

Scope: search dates -> pick room -> details -> pay 50% deposit by PromptPay QR -> guest stay page with chat. Mobile web, older and less tech-savvy Thai users. Researched 2026-10-18.

## 1. Baymard / NN/g findings on hotel and travel booking UX (date pickers, room selection, price transparency, checkout, guest checkout, mobile)

### Takeaway
Baymard's 2022 accommodation study (992 hours, 364 guidelines) says guests decide on photos, detailed room info and a clear total price. They distrust any fee that appears late. The date picker should show which dates are free and roughly what they cost. Forcing an account loses about 1 in 5 buyers in general e-commerce, so the booking should run as a guest flow.

### Cited Findings
- Baymard's travel accommodations study (Feb 2022) ran 992 hours of testing and 317+ moderated think-aloud sessions on OTAs, hotel chains, boutique hotels and rental sites. It found 1,000+ medium-to-severe usability issues and produced 364 guidelines. — [Baymard: New research on travel accommodations](https://baymard.com/research-articles/new-research-travel-accommodations)
- Date pickers: users valued Expedia's calendar, which showed prices varying by day or weekend and clearly marked unavailable dates. NobleDEN's picker showed no nightly rates, so users couldn't tell whether shifting dates would save money. — [Baymard travel accommodations](https://baymard.com/research-articles/new-research-travel-accommodations)
- Baymard's date-picker collection: travel shoppers usually already have a date or range in mind. When the calendar doesn't communicate availability clearly and accurately, users spend extra effort checking it, which can lead to abandonment. — [Baymard date picker examples](https://baymard.com/ecommerce-design-examples/date-picker)
- The booking search is often a prerequisite for browsing, yet some sites hide it. At Marriott it sat below the fold, and a user had to scroll twice to find it. — [Baymard travel accommodations](https://baymard.com/research-articles/new-research-travel-accommodations)
- Room info: boutique hotel room descriptions need a lot of detail. Missing bathroom info plus missing room photos made one user give up and plan to phone instead. — [Baymard travel accommodations](https://baymard.com/research-articles/new-research-travel-accommodations)
- Photos: high-quality images were needed for users to get a sense of the property. Without them, many users were reluctant to book. Boutique users first browse the homepage for a "feel", then look for a gallery and an amenities list. They also dig into special features, events and the neighbourhood. — [Baymard travel accommodations](https://baymard.com/research-articles/new-research-travel-accommodations)
- Location: users need to see where the property is. One IHG user missed the "Map View" button and searched for the address elsewhere. — [Baymard travel accommodations](https://baymard.com/research-articles/new-research-travel-accommodations)
- Price transparency:
  - One hotel (Sohotel) listed four prices for the same room, all "Excluding Taxes & Fees", which confused users.
  - Accommodation users are more suspicious of last-minute fees than general e-commerce shoppers. They scrutinise the final cost summary, and some drop the property when new or unexplained fees appear.
  - Unclear special-offer messaging caused mistrust.
  — [Baymard travel accommodations](https://baymard.com/research-articles/new-research-travel-accommodations)
- Checkout:
  - Users carefully re-check reservation details.
  - They look for special-request options (early check-in, late check-out, extras).
  - On rental sites they like being able to contact the host during checkout.
  - Many optional add-ons (Marriott) add complexity and distract from completing the booking.
  — [Baymard travel accommodations](https://baymard.com/research-articles/new-research-travel-accommodations)
- Guest checkout: 18% of 1,026 surveyed US adults abandoned an order because they did not want to create an account (another version of the page says 19%). 62% of sites fail to make guest checkout the most prominent option. Overall cart abandonment is about 70%. Strict password rules can cause up to 19% abandonment among returning users. — [Baymard: Current state of checkout UX (Nov 2024, updated Nov 2025)](https://baymard.com/blog/current-state-of-checkout-ux)

### Inferences
- For Baanrai, the date picker should grey out booked nights clearly, ideally show a "from ฿X" per night, and sit at the top of the booking page, never below the fold.
- Show one all-in total (nights x rate, plus the 50% deposit amount and balance due) from room selection onward. Never add fees at the pay step.
- Room cards need real photos plus specifics (bed, bathroom, aircon or fan, guests). This matches the photo-first booking page already committed.
- Offer a contact or chat path (LINE or the in-site chat) during checkout, as rental sites do. Keep add-ons minimal.
- Use no account or password for booking. Identify the guest by phone or booking code, as the stay page already does.

### Gaps
- Baymard's detailed mobile accommodation guidelines and Airbnb date-picker highlights are behind a paywall. No mobile-specific accommodation stats were found.
- A widely repeated "67% prefer one-click date selection (Baymard 2023)" claim could not be verified on Baymard's site. Do not use it.
- I found no verified Baymard data on sticky booking or summary bars. Vendor blogs attribute a "7.9% lift" to Baymard without a source. One A/B write-up found sticky add-to-cart raised add-to-cart by 8.7% but lowered final conversion and revenue ([cleancommit](https://cleancommit.io/ab-tests/mobile-bottom-sticky-add-to-cart-button/)). The evidence is mixed.

## 2. Micro-interaction patterns for instant feedback

### Takeaway
Put feedback next to the element the user touched. Validate fields when the user leaves them (not while they type), and clear errors the moment the input is fixed. Use a skeleton when a whole page loads for 1-10 s and a spinner for a single module. Show nothing for loads under 1 s. Never use toasts for errors. Optimistic UI only suits actions that almost always succeed, which a payment is not. Web vibration does not work on iPhones.

### Cited Findings
- Inline validation (Baymard, Jan 2024): 31% of sites lack inline validation. Errors shown only after submit force users to stop, can cause abandonment, and often erase entries. Baymard's three rules:
  1. Avoid premature validation. Validate on blur or once the input reaches its expected length (phone number, ZIP code).
  2. Remove the error as soon as the input is corrected, rechecking on each keystroke once an error is showing.
  3. Use positive inline validation (checkmarks) on all fields.

  Inline validation does not replace submit-time error handling. — [Baymard: Usability testing of inline form validation](https://baymard.com/blog/inline-form-validation)
- Dissenting view: UX Movement reported that instant pre-submission validation increased errors in two studies. A commenter attributed this to a badly implemented validator that flagged email while the user was still typing. — [UX Movement](https://uxmovement.com/?p=10881) (as summarised in search results)
- Feedback types (NN/g):
  - Indicators sit near the element they describe and are passive.
  - Validations stay visible until the problem is fixed, are paired with an icon on the field, and say how to fix it ("Please enter your street address", not "Field is blank").
  - Toasts suit passive notifications only, never errors, because short-lived toasts can be missed.
  - Feedback should stay near the user's focus. A success banner placed far from the add-to-cart button was missed and led to duplicate purchases.
  - Don't auto-dismiss messages users must see.

  — [NN/g: Indicators, Validations, and Notifications](https://www.nngroup.com/articles/indicators-validations-notifications/)
- Toast conventions (community, not NN/g research): auto-dismiss success toasts after about 3-5 s (one system uses 4 s), keep error toasts until dismissed, stack no more than 3. — [ui-audit feedback patterns](https://cdn.jsdelivr.net/npm/ui-audit@1.0.2/references/25-patterns-feedback.md); [Syntax.fm #644](https://www.syntax.fm/show/644/user-feedback-ui-toasts-flash-validation)
- Skeleton vs spinner vs progress bar (NN/g, Jun 2023, reviewed Sep 2026):
  - Under 1 s, show no indicator.
  - From about 2 to 10 s, use a skeleton or a spinner.
  - Over 10 s, use a progress bar with a duration estimate.
  - Skeletons suit full-page loads. Spinners suit a single module (e.g. one card). Progress bars or step indicators suit process tasks such as uploads.
  - Animated shimmer skeletons can be distracting or cause accessibility problems. Frame-only skeletons are not recommended.
  - Skeletons do not replace real performance work.

  — [NN/g: Skeleton screens 101](https://www.nngroup.com/articles/skeleton-screens/)
- Optimistic UI: React's `useOptimistic` shows the expected result immediately and reverts automatically if the request fails. One guide recommends it only for actions with a 95%+ success rate and noticeable latency (over 100 ms), such as likes and bookmarks. Claims that it "cuts perceived wait 40%" or makes apps "2-3x faster" have no study behind them. — [freeCodeCamp](https://www.freecodecamp.org/news/how-to-use-the-optimistic-ui-pattern-with-the-useoptimistic-hook-in-react/); [OpenReplay](https://blog.openreplay.com/optimistic-updates-make-apps-faster/)
- Vibration API:
  - WebKit removed it in May 2017, citing annoyance and misuse.
  - The W3C implementation report (June 2024) shows Safari on iOS failing all manual and automated tests, i.e. not implemented. Firefox for Android also failed the manual tests.
  - A single unverified 2023 GitHub report claims it works on iOS.
  - Use feature detection (`'vibrate' in navigator`), because calls can silently do nothing.

  — [W3C device-apis log, Jun 2024](https://lists.w3.org/Archives/Public/public-device-apis-log/2024Jun/0061.html); [MDN BCD issue #29166](https://github.com/mdn/browser-compat-data/issues/29166)
- Motion durations (design-system conventions, not official M3 or web.dev, which I didn't retrieve):
  - Micro-interactions typically last 100-500 ms. Keep UI feedback under about 300 ms and avoid anything over 500 ms.
  - One checklist caps all durations at 400 ms and makes exits shorter than entrances.
  - Example tokens: 160 ms ease-out fade-in, 120 ms fade-out.
  - With `prefers-reduced-motion`, replace sliding with a roughly 200 ms crossfade, but keep functional feedback such as spinners and progress bars working (slowed down rather than removed).

  — [U-M Library design system: Motion](https://design-system.lib.umich.edu/visual-elements/motion); [Colorado DCS: Motion & Interaction](https://dcs.colorado.gov/ids/digital-guidelines/design-tokens/motion-interaction); [DEHN Motion design](https://designsystem.dehn.de/electrons/motion-design/)

### Inferences
- Button press: give an immediate pressed state (colour or shade change, slight scale such as 0.97, under 100 ms) and then a "working" label or spinner inside the button. Disable the button while the request runs, so impatient older users don't double-submit (compare NN/g's duplicate-purchase example).
- Slip upload or SlipOK check: this is a process task, so show text stages ("Uploading slip... Checking with bank... Confirmed") rather than a skeleton. Show the success confirmation inline in the payment panel, large and persistent, not as a toast.
- Phone and name fields: validate on blur, or when the phone reaches 10 digits. Show a green check when valid. Write errors as fix instructions in Thai and English.
- Don't use optimistic UI for bookings or payments. It is fine for sending a chat message on the stay page (show the bubble at once, mark it "sending...", and offer retry if it fails).
- Don't rely on vibration for feedback. If used, it is an Android-only extra behind feature detection.

### Gaps
- I found no NN/g or Baymard primary research on toast auto-dismiss timing. Those figures are community conventions.
- Official Material 3 motion tokens and Apple HIG motion guidance were not retrieved in this session.

## 3. Response-time thresholds, INP, perceived performance

### Takeaway
Under 0.1 s feels instant, under 1 s keeps the user's flow, and 10 s is the limit of attention. INP "good" is 200 ms or less at the 75th percentile of real page loads. Every tap should paint visible feedback well within that time, even when the server is slower.

### Cited Findings
- 0.1 s feels instantaneous, like direct manipulation, with no extra feedback needed. At 1 s the user's flow of thought is kept but the delay is noticed, so show that the system is working when a delay goes past 1 s. 10 s is the limit for attention. Beyond about 10 s, show a percent-done progress bar and a way to cancel. For 2-10 s, a lighter busy indicator is enough. — [NN/g: Response times, the 3 important limits](https://www.nngroup.com/articles/response-times-3-important-limits/)
- INP is good at 200 ms or less, needs improvement up to 500 ms, and is poor above 500 ms. It is measured at the 75th percentile of page loads, split mobile and desktop. It covers all clicks, taps and key presses: input delay, plus processing, plus the time to the next painted frame. One highest interaction is ignored per 50 interactions. INP succeeded FID, which measured only the first interaction's input delay. — [web.dev: INP](https://web.dev/articles/inp)
- Skeletons complement performance optimisation rather than replace it. A briefly flashing skeleton for loads under 1 s can annoy. — [NN/g: Skeleton screens](https://www.nngroup.com/articles/skeleton-screens/)

### Inferences
- Give feedback in the first frame (CSS `:active` or a pressed class) before any network work. That keeps INP low on cheap Android phones common among older Thai users.
- Delay showing spinners by about 300-500 ms so fast responses don't flash a loader (consistent with NN/g's under-1 s guidance).
- Waiting for slip verification may exceed 10 s. Show a stage message, an expectation ("usually under 1 minute"), and a fallback ("Pay at farm / contact us on LINE").

### Gaps
- The exact date INP replaced FID as a Core Web Vital (widely reported as March 2024) was not confirmed on the fetched page.

## 4. Designing for older adults and Thai users (targets, fonts, contrast, gestures, PromptPay/LINE habits, trust)

### Takeaway
Make targets at least 44-48 px (WCAG's 24 px is only a legal floor), use large text, and use visible buttons instead of gestures. In Thailand, PromptPay QR is the near-universal default way to pay. Most older Thais now use smartphones and LINE, often learned from their children, so a "pay by scanning QR, then send slip" flow matches what they already do.

### Cited Findings
- Target sizes:
  - WCAG 2.2 SC 2.5.8 (AA) requires a minimum of 24x24 CSS px, or enough spacing around the target.
  - SC 2.5.5 (AAA) requires 44x44 CSS px.
  - Apple HIG uses 44x44 pt. Google Material uses 48x48 dp.

  These figures come from secondary guides, so check them against the W3C pages. — [Front-End Checklist: touch targets](https://frontendchecklist.io/rules/accessibility/touch-targets); [AllAccessible: WCAG 2.5.8 guide](https://allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide)
- Older adults and targets:
  - A CHI 2006 study found 65-84-year-olds had low accuracy tapping standard-sized radio buttons, checkboxes and icons. Making targets 50% larger gave them a similar benefit to an alternative technique. — [Hourcade & Berkel 2006 (PDF)](https://course.ccs.neu.edu/csg170/ssl/hourcade06.pdf)
  - An ASSETS 2019 study found adults 60+ judged their own optimal target size better than younger adults did. Younger adults underestimated the smallest size they could accurately touch by almost 6 mm. — [Wobbrock et al., ASSETS 2019 (PDF)](https://faculty.washington.edu/wobbrock/pubs/assets-19.06.pdf)
- Font size: in one study, larger fonts reduced operation time for older users, and at 22 pt the older group performed as well as the young group. — [PMC7330495](https://pmc.ncbi.nlm.nih.gov/articles/PMC7330495)
- Practitioner guidance (anecdotal): 48 px is the bare minimum, and 60 px works better for users with arthritis or tremor. — [Glance: designing apps for elderly people](https://thisisglance.com/learning-centre/how-do-i-design-apps-for-elderly-people)
- Thai older users:
  - Internet use among Thais 60+ rose from 18.2% (2017) to 69.3% (2024).
  - 95% of the "Silver Age" group (50+) own smartphones.

  Source is a CMMU/Mahidol study via Thairath, Dec 2025, a secondary report. — [Thairath English](https://en.thairath.co.th/lifestyle/lifestyle45plus/2903927)
- Thai older users and LINE:
  - Older LINE users mainly use it to contact friends and family, and almost all learned it from their children (KMUTNB, 2019, n=16). — [KMUTNB journal](https://ojs.kmutnb.ac.th/index.php/kjournal/article/view/2233)
  - Small keypad buttons were a barrier for older Bangkok adults. — [Readiness of Thai elderly, TCI](https://so06.tci-thaijo.org/index.php/jmpr/article/view/283954) (via search summary)
- PromptPay scale:
  - Registrations: 77M+ (Dec 2023), nearly 80M (Jan 2025). — [Stripe: Payments in Thailand](https://stripe.com/resources/more/payments-in-thailand)
  - Monthly volume: about 2.1B transactions worth ฿4.43T (Mar 2025). — [Stripe](https://stripe.com/resources/more/payments-in-thailand)
  - Monthly volume: 2.38B transactions worth ฿4.70T (Dec 2025). — [Mastercard/NITMX](https://www.mastercard.com/europe/en/news-and-trends/Insights/2026/real-time-payments-ignite-thailand-as-an-economic-force.html)
  - Monthly volume: over 2.5B transactions worth nearly ฿5T (Mar 2026). — [Bangkok Bank research, Jul 2026](https://www.bangkokbank.com/th-TH/-/media/7987988529484de29125743bdd2ff585.ashx)
  - Registrations: 81.06M (Mar 2025). — [Tazapay](https://tazapay.com/en-sg/blog/promptpay-for-business-thailand-checkout-success) (secondary)
- Mobile banking and cards:
  - Thailand had about 35.7B mobile-banking transactions in 2024 (per BoT) and over 126M mobile-banking accounts by June 2025.
  - Only about 12% preferred cards for online shopping (2022).
  — [Stripe](https://stripe.com/resources/more/payments-in-thailand)
- Trust: accommodation users scrutinise totals and abandon over surprise fees. Unclear offer wording breeds mistrust. — [Baymard travel accommodations](https://baymard.com/research-articles/new-research-travel-accommodations)

### Inferences
- Targets: aim for 48 px minimum with 8 px or more between targets (the memory file shows the site already uses 44 px taps). Body text should be 16-18 px or larger, and key amounts like the deposit should be large. The 22 pt finding supports big type for prices and dates.
- Gestures: avoid swipe-only carousels, long-press and hidden menus. Pair every gesture with a visible button or arrow.
- QR payment: older Thais pay this way daily. The QR must show the fixed amount, the farm's account name (a trust signal, since banking apps show the payee name), and a "save QR image" button for paying from the same phone. It should also show clear next steps for sending the slip.
- Offer LINE as a familiar help channel next to the in-site chat.
- Trust signals: real farm photos, owner name, the exact amount, a booking code, and a printed or saved confirmation. Spell out the deposit and balance split as "pay ฿X now, ฿Y at the farm".

### Gaps
- I couldn't retrieve primary Bank of Thailand Payment Systems statistics. PromptPay figures come from Stripe, Mastercard/NITMX, Bangkok Bank and Tazapay, and differ slightly.
- No ETDA 2024/2025 Internet User Behaviour data on older users was found.
- No Thai UX community articles (UX Thailand, Skooldio) on booking or older-user UX turned up in English searches. A Thai-language search is needed.
- I found no research on the "save QR to gallery, then open in banking app" same-device flow or how older users manage it.
- No Thai-specific font-size research was found. Thai script has stacked vowels and tone marks and may need extra line-height (not verified here).

## 5. What makes a booking UI feel "lively" without slowing the task

### Takeaway
Liveliness comes from fast, honest feedback tied to the user's own actions: press states, a smooth summary update when dates or rooms change, check marks, and a warm confirmation moment. Decorative motion that delays the task does not create it. Keep motion short (under 300 ms), respect reduced-motion, and never make the user wait for an animation.

### Cited Findings
- Under 0.1 s feels like direct manipulation. — [NN/g response times](https://www.nngroup.com/articles/response-times-3-important-limits/)
- Positive inline validation (checkmarks) reduces cognitive load and reassures users. — [Baymard inline validation](https://baymard.com/blog/inline-form-validation)
- Feedback should sit near the user's focus. Distant success banners are missed. — [NN/g indicators/validations/notifications](https://www.nngroup.com/articles/indicators-validations-notifications/)
- Animated shimmer skeletons can distract or cause accessibility issues. — [NN/g skeleton screens](https://www.nngroup.com/articles/skeleton-screens/)
- Keep UI motion within about 100-300 ms (400 ms cap), make exits faster than entrances, and switch to a crossfade under reduced motion. — [U-M Library motion](https://design-system.lib.umich.edu/visual-elements/motion); [Colorado DCS motion](https://dcs.colorado.gov/ids/digital-guidelines/design-tokens/motion-interaction)
- Many optional add-ons distract from completing a booking. — [Baymard travel accommodations](https://baymard.com/research-articles/new-research-travel-accommodations)

### Inferences
Lively moments that cost the user no time:
- **Date selection:** the range highlight fills in, and the nights count and total update with a short number tween (about 200 ms).
- **Choosing a room:** the selected card gets a border, a check badge and a slight lift. The summary price updates in place.
- **Step changes:** a short slide or fade (about 200 ms) plus a step indicator ("Step 2 of 4") so users know where they are.
- **Payment confirmed:** one calm success state, such as a large check drawn once, "Deposit received", and the booking code. Then a clear next action (see your stay page / add to LINE). Avoid confetti loops that read as generated or template-like.
- **Stay page chat:** the message appears instantly, followed by a subtle "sent ✓" and then a "read" state, which feels responsive and familiar from LINE.

Rules: avoid looping decorative animation, parallax and auto-advancing carousels, all of which hurt older users and the farm's "human-made" brief. Every animation must be interruptible and must not block a tap.

### Gaps
- I found no controlled study quantifying how "delightful" micro-interactions affect booking conversion. The evidence here is heuristic.
