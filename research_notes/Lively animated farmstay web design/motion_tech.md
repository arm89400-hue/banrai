# Web motion tech for a small React 18/19 + Vite site (2025-2026)

Research date: 2026-10-18. Every source is from 2024-2026 unless marked [OLDER].

## Q1. Motion libraries: Motion, GSAP, Lenis, Lottie/Rive, AutoAnimate, React Spring (strengths, size, licence)

### Takeaway
For a small React + Vite site, the lightest workable stack is **Motion's `m` + `LazyMotion`** (about 5 KB at first render, with feature bundles loaded on demand) or **AutoAnimate** (about 3 KB) for list and accordion changes. **GSAP** is now free for commercial use, including every former Club plugin such as SplitText, ScrollTrigger and MorphSVG. Its licence is proprietary, not MIT, and it costs more bytes, so it only pays off for timeline or scroll storytelling. **dotLottie** carries about 500 KB of WASM, which is heavy for a mobile booking site. **Lenis** is small and respects reduced-motion by default, but smooth scrolling is optional and has a cost.

### Cited Findings
**Motion (formerly Framer Motion)**
- The official docs (current page) give these sizes: the full `motion` component is about **43 KB** and "can't be tree-shaken smaller" because of its declarative API. `m` + `LazyMotion` is "just over **5 KB**" at initial render. `domAnimation` adds **+24 KB** (animations, variants, exit, tap/hover/focus). `domMax` adds **+38 KB** (adds pan/drag and layout animations). `useAnimate` mini is **3.3 KB** (WAAPI only) and hybrid is **23 KB**. `useReducedMotion` alone is about 1 KB. Sizes were measured with Rollup, and Webpack output is slightly larger. — [Motion docs: Reduce bundle size](https://motion.dev/docs/react-reduce-bundle-size)
- Conflict: an earlier snapshot and mirrors quote 34 KB → 4.6 KB, domAnimation +15 KB, domMax +25 KB, and useAnimate mini 2.3 KB / hybrid 17 KB. A Mintlify mirror lists domAnimation at about 30 KB and domMax at about 50 KB. The numbers have grown across versions, so use the live page figures above. — [Mintlify mirror: LazyMotion](https://www.mintlify.com/motiondivision/motion/api/lazy-motion)
- `LazyMotion` takes a `strict` prop, which throws an error if a full `motion` component is used inside it. Its features can be loaded asynchronously through a dynamic `import()`. — [Mintlify mirror: LazyMotion](https://www.mintlify.com/motiondivision/motion/api/lazy-motion)
- Lenis integration docs are hosted on motion.dev. Since Lenis 1.3.26, Lenis respects `prefers-reduced-motion` by default: it turns smoothing off and makes `scrollTo()` jump. — [Motion docs: Lenis](https://motion.dev/docs/lenis)

**GSAP**
- Since the Webflow acquisition, GSAP and all its plugins are free for everyone, including commercial use, whether or not you use Webflow. This includes the former Club plugins. SplitText was rewritten to be about 50% smaller, with built-in screen-reader accessibility. — [Webflow: GSAP becomes free](https://webflow.com/updates/gsap-becomes-free); [Webflow blog](https://webflow.com/blog/gsap-becomes-free)
- The Standard License says "commercial usage is covered" at no charge and names SplitText and MorphSVG. The licence is **proprietary**: Webflow keeps the IP and the page does not say MIT. You may not use it to build no-code visual animation tools that compete with Webflow's builder. AI-generated GSAP code is explicitly allowed. — [GSAP Standard License](https://gsap.com/community/standard-license/)
- The `gsap-trial` npm package is deprecated. The normal `gsap` package now includes all bonus plugins. — [npm gsap-trial](https://npmjs.com/package/gsap-trial)

**Lenis**
- Reported sizes conflict: about 3.6 KB gzip (compared with Locomotive Scroll at 12.1 KB and GSAP ScrollSmoother at 32 KB), under 4 KB in a fork's README, and about 7-8 KB in tutorials. No authoritative figure was found. — [Lenis fork README](https://github.com/kushgaikwad/lenis); [svilenkovic tutorial](https://svilenkovic.com/3d/lenis-smooth-scroll-tutorial)
- `respectReducedMotion: false` turns off the reduced-motion behaviour. The docs say "not recommended". — [Lenis docs (Algolia mirror)](https://docsearch.algolia.com/mcp/docs/repo/darkroomengineering/lenis)
- Criticism from bloggers: eased scrolling can feel sluggish when reading long content, and badly done smooth scroll "fights the browser, drops frames, and breaks accessibility". — [hontran.dev](https://www.hontran.dev/blog/nextjs-smooth-scroll-gsap-lenis)
- [OLDER, 2019] WordPress's Twenty Twenty theme replaced its JS smooth scroll with CSS `scroll-behavior`, which honours reduced motion. — [WordPress changeset 46825](https://core.trac.wordpress.org/changeset/46825)

**Lottie / dotLottie and Rive**
- The dotLottie web player's WASM engine is about **500 KB compressed** and is fetched from a CDN the first time a player is created. Nothing renders until it downloads and compiles. `DotLottie.preload()` is recommended. The JS wrappers are 35-45 KB min+gzip (React 45 KB) on top of that. The default CPU renderer is the most compatible, and `DotLottieWebGL` uses WebGL2. — [LottieFiles: how the web player works](https://docs.lottiefiles.com/en/runtimes/distributions/js/v0.x/core-concepts); [LottieFiles: optimize performance](https://docs.lottiefiles.com/en/runtimes/distributions/js/v0.x/advanced/performance.md); [LottieFiles forum on WASM render delay](https://forum.lottiefiles.com/t/how-to-reduce-dotlottie-initial-rendering-time-due-to-wasm/6802)
- Rive and Lottie both render at runtime, and performance "depends heavily on the animation". Rive's native Android libraries are about 12.3 MB (an app measurement, not web). — [Wikimedia Phabricator T433250](https://phabricator.wikimedia.org/T433250); [Callstack: Lottie vs Rive](https://callstack.com/blog/lottie-vs-rive-optimizing-mobile-app-animation)

**AutoAnimate (FormKit)**
- About **3.28 KB gzip** with no dependencies. One line (`useAutoAnimate`) animates add, remove and move of children. Works with React, Vue, Svelte and vanilla JS. Latest version is 0.9.0. These figures come from secondary listings, not the official repo. — [skills.cat: auto-animate](https://skills.cat/skills/secondsky/claude-skills/auto-animate)

**React Spring**
- v10 is the React 19 line. It has a breaking change: the provider is now `SpringContextProvider`. v9 did not work with React 19. The latest stable seen is v10.1.2, with v11.0.0-beta.0 in beta. — [react-spring docs](https://www.react-spring.dev/docs); [releasealert: react-spring](https://releasealert.dev/github/pmndrs/react-spring)

### Inferences
- A farmstay booking site needs page and section reveals, hover and tap feedback, accordion and list changes, and maybe a hero photo fade. CSS plus AutoAnimate, or Motion `m`/`LazyMotion` with `domAnimation`, covers all of this for about 5-30 KB. GSAP adds more bytes and a proprietary licence for features the site would barely use.
- Lottie is worth it only for one or two illustrative moments, and then it should be lazy-loaded below the fold. Never put dotLottie in the critical path on a mobile booking page.
- Smooth scrolling (Lenis) is decoration. On phones, native momentum scrolling already feels good, and taking over scrolling can hurt long reading pages and assistive tech.

### Gaps
- No official Lenis or GSAP min+gzip sizes were confirmed. Check bundlephobia or pkg-size for the versions actually installed.
- No published Rive web WASM size, and no head-to-head Rive vs dotLottie web benchmark.
- AutoAnimate maintenance activity for 2025-2026 was not confirmed from GitHub.
- React Spring's maintenance and backing status was not stated explicitly by its maintainers.

## Q2. Native platform options and browser support (Oct 2026)

### Takeaway
The native CSS and DOM motion features are mostly usable now as progressive enhancement. **Same-document View Transitions** are Baseline (Firefox 144, Oct 2025), and React Router supports them with a `viewTransition` prop, but only in Data and Framework mode. **Cross-document view transitions** work in Chrome 126+ and Safari 18.2+, with partial support in Firefox. **Scroll-driven animations** work in Chromium 115+ and Safari 26+, but Firefox stable support is unclear or only very recent. **@starting-style** and **allow-discrete** have been Baseline since Aug 2024. **Anchor positioning** is fully supported only in Safari 27, and partial elsewhere. Wrap everything in `@supports` so unsupported browsers simply get no animation.

### Cited Findings
**View Transitions**
- Same-document view transitions: Chrome/Edge 111, Safari 18, Firefox 144 (stable Oct 14, 2025), which made them **Baseline Newly available**. Safari 18.4 added `view-transition-name: match-element`. Firefox's first implementation lacks `view-transition-types`, so the post recommends a `transitionHelper` fallback. `view-transition-class` was intended for Firefox 144. — [Chrome for Developers: What's new in view transitions (2025)](https://developer.chrome.com/blog/view-transitions-in-2025); [web.dev: same-document VT now Baseline (Oct 16 2025)](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available)
- Cross-document (`@view-transition { navigation: auto }`) support: Chrome 126+, Chrome Android (listed 155), Safari / iOS Safari 18.2+. Firefox is disabled by default in 143 and **partial in 144-161**. Samsung Internet is not supported up to 30. Global support is about 86.8% full, 88.8% including partial. — [caniuse: cross-document view transitions](https://caniuse.com/cross-document-view-transitions)
- Cross-document view transitions are an Interop 2026 focus area. — [Interop 2026 overview (secondary)](https://ecorpit.com/interop-2026-web-platform-developer-guide/)
- React `<ViewTransition>` went to react@experimental in Apr 2025 and moved to **react@canary** at React Conf in Oct 2025 ("design close to final"). It is **not in stable React**. — [Chrome blog 2025](https://developer.chrome.com/blog/view-transitions-in-2025); [react.dev ViewTransition](https://zh-hans.react.dev/reference/react/ViewTransition)
- React Router: the `viewTransition` prop on `Link`, `NavLink` and `Form`, or `navigate(to, { viewTransition: true })`, wraps the navigation in `document.startViewTransition()`, which gives a default cross-fade. Shared-element morphs use matching `view-transition-name`, plus `NavLink`'s `isTransitioning` render prop or `useViewTransitionState(href)`. **Available in Framework and Data mode, NOT in Declarative mode** (plain `<BrowserRouter>`). Browsers without support navigate without animation. Docs version: 8.4.0. — [React Router: View Transitions](https://reactrouter.com/how-to/view-transitions)

**Scroll-driven animations (`animation-timeline: scroll()` / `view()`)**
- caniuse for `animation-timeline: view()`: Chrome/Edge 115+, Safari and iOS Safari 26.0+, Samsung Internet 23+, Chrome Android listed (155). For Firefox it shows "161 only", which suggests it was enabled very recently. Global usage is 87.8%. — [caniuse: animation-timeline view()](https://caniuse.com/mdn-css_properties_animation-timeline_view)
- Conflict: a 2026 blog says Firefox 152 (June 2026) still had the feature behind `layout.css.scroll-driven-animations.enabled`. The same blog says Safari 26 shipped it in Sept 2025, with threaded scroll-driven animations in 26.4 and bug fixes in 26.5. — [buildmvpfast 2026 (secondary)](https://www.buildmvpfast.com/blog/css-scroll-driven-animations-replace-js-2026); [Chrome for Developers: scroll-driven animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations)

**Entry/exit effects**
- `@starting-style` and `transition-behavior: allow-discrete` became **Baseline Newly available with Firefox 129 (Aug 2024)**. Chrome/Edge 117 and Safari 17.4-17.5 also support them. `@starting-style` gives elements coming from `display:none` a starting state. `allow-discrete` swaps a discrete property such as `display` at the 50% point of the transition instead of 0%, which makes exit animations possible. — [web.dev: Now in Baseline: animating entry effects](https://web.dev/blog/baseline-entry-animations)

**CSS anchor positioning**
- Chrome 125-158: partial. Safari / iOS 26.x: partial, 27+: **full**. Firefox 145-146: behind a flag, 147-161: partial. Samsung 27-30: partial. The spec is still a Working Draft. — [caniuse: CSS anchor positioning](https://caniuse.com/css-anchor-positioning)

### Inferences
- With React Router in declarative `<BrowserRouter>` mode, the `viewTransition` prop is unavailable. You would either move to `createBrowserRouter` (Data mode) or call `document.startViewTransition()` by hand with `flushSync`.
- Scroll reveals in CSS (`animation-timeline: view()` inside `@supports`) reach most phones in Thailand: Android Chrome, Samsung and iOS 26+. Older iOS gets static content, which is fine.
- Anchor positioning is still too inconsistent for core UI such as tooltips or menus. Use it only as enhancement or not at all.

### Gaps
- `linear()` easing support was not checked in this session. From memory (unverified): Baseline since late 2023 (Chrome 113, Firefox 112, Safari 17.2).
- The exact Firefox stable version that turned on scroll-driven animations was not confirmed from Mozilla release notes.
- React Router minimum version for `viewTransition` was not stated in the docs. From memory (unverified): around v6.17.

## Q3. Performance rules (transform/opacity, will-change, INP/CLS, heroes, battery)

### Takeaway
Animate only `transform` and `opacity`. Add `will-change` only just before an animation and remove it afterwards. Animating layout properties (top/left/size) causes dropped frames and can count as layout shift (CLS). Blur and shadow animations are expensive to paint. No 2024-2026 numbers were found for hero video cost on mid-range Android or for battery use.

### Cited Findings
- Limit animations to `opacity` and `transform` (translate, rotate, scale) so they stay on the compositor. In one test, animating `top`/`left` dropped 50% of frames versus 1% with `transform`. Blur and shadow effects are expensive to paint. Use `will-change` sparingly, adding it with JS just before the change and removing it after. — [web.dev: high-performance CSS animations](https://web.dev/articles/animations-guide) [OLDER: last updated 2020-10-06; guidance still current]
- Layout shifts can be caused by "animation and transition effects", and animating `top`/`left` is the "common example" of animations that trigger layout. Changes to element size also cause shifts. — [web.dev: debug layout shifts (updated Feb 7 2025)](https://web.dev/articles/debug-layout-shifts)
- The dotLottie WASM download (about 500 KB) blocks the first render of a Lottie. — [LottieFiles docs](https://docs.lottiefiles.com/en/runtimes/distributions/js/v0.x/core-concepts)
- Safari 26.4 added threaded (off-main-thread) scroll-driven animations. — [buildmvpfast 2026 (secondary)](https://www.buildmvpfast.com/blog/css-scroll-driven-animations-replace-js-2026)

### Inferences
- Use CSS and WAAPI first (Motion's mini `animate` uses WAAPI) to keep the main thread free, which protects INP on mid-range Android.
- For a hero, prefer a well-compressed still image (AVIF/WebP, correct `sizes`, `fetchpriority="high"`) with a CSS fade or slow scale over an autoplay video. A video that loops for more than 5 seconds also brings WCAG 2.2.2 obligations (Q4).
- Do not animate `height` for accordions. Use `grid-template-rows: 0fr → 1fr` or a transform-based approach, or accept the cost for small elements.

### Gaps
- No 2024-2026 measurements were found of hero-video versus image cost (LCP, data, battery) on mid-range Android.
- No sourced guidance was found on INP impact of JS animation libraries specifically.
- No sourced battery-impact data was found for continuous animations such as rAF loops, Lenis, or looping Lottie.

## Q4. Accessibility: prefers-reduced-motion, WCAG 2.2.2, 2.3.3, vestibular disorders

### Takeaway
**2.2.2 (Level A, required):** anything that moves, blinks or scrolls, starts automatically, lasts more than 5 seconds and sits alongside other content needs a pause/stop/hide control. That covers autoplay carousels, looping hero videos and marquees. **2.3.3 (AAA):** motion triggered by interaction should be possible to turn off. In practice that means honouring `prefers-reduced-motion`, especially for parallax, zoom and slide transitions, by replacing them with fades or no animation.

### Cited Findings
- **SC 2.2.2 Pause, Stop, Hide (Level A):** moving, blinking or scrolling content that starts automatically, lasts more than 5 seconds and is shown in parallel with other content needs a mechanism to pause, stop or hide it, unless it is essential. Auto-updating content needs pause/stop/hide or a way to control how often it updates, and has no 5-second exception. A single page-wide control is recommended. A lone loading animation that isn't alongside other content is exempt. Rationale: 5 seconds is long enough to grab attention and short enough to wait out, and continuous motion hurts people with attention or cognitive disabilities. — [W3C Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
- **SC 2.3.3 Animation from Interactions (Level AAA):** "Motion animation triggered by interaction can be disabled, unless the animation is essential." Motion animation means movement or size change. Changes in colour, blur or opacity do not count unless they change perceived size, shape or position. Scrolling itself is fine because the user controls it, but motion added to scrolling (parallax) should be possible to disable. For vestibular disorders, non-essential motion can cause dizziness, nausea and headaches, and parallax is the classic trigger. Techniques: **C39** (CSS `prefers-reduced-motion`), **SCR40** (JS `matchMedia`), and a site-wide user setting. Example: a page transition disabled when reduce-motion is on. — [W3C Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- Lenis 1.3.26+ turns off smoothing under reduced motion by default. — [Motion docs: Lenis](https://motion.dev/docs/lenis)
- Webflow's rewritten SplitText includes screen-reader accessibility, so split letters still read as words. — [Webflow](https://webflow.com/updates/gsap-becomes-free)
- Motion ships a `useReducedMotion` hook (about 1 KB). — [Motion docs](https://motion.dev/docs/react-reduce-bundle-size)

### Inferences
- Pattern: write motion inside `@media (prefers-reduced-motion: no-preference) { ... }`, so the default is calm. Under `reduce`, swap movement for an opacity fade. Fades are allowed under 2.3.3 because opacity alone is not "motion animation".
- In Motion, set `<MotionConfig reducedMotion="user">` at the root. This is a known API, but its docs page was not fetched here.
- Any autoplay photo carousel or looping hero video needs a visible pause button, or should stop within 5 seconds. Simplest option: no autoplay.
- Text split into letters (SplitText-style) must keep an accessible label, or screen readers may spell it out letter by letter.

### Gaps
- Apple HIG motion page content could not be fetched (JS-rendered). Its Reduce Motion guidance (replace sweeping, zoom and parallax effects with crossfades) is from general knowledge and is unverified.
- Prevalence statistics for vestibular disorders were not gathered.

## Q5. Recommended durations and easings (Material 3, Carbon, Apple)

### Takeaway
IBM Carbon gives the clearest sourced scale: **70/110 ms** for micro-interactions, **150/240 ms** for small expansions and toasts, **400 ms** for large expansions, and **700 ms** for background dimming. Use "productive" curves for most UI and "expressive" curves only for occasional big moments. Material 3 tokens could not be fetched (JS-rendered page), and Apple gives no millisecond values that were found.

### Cited Findings
- **Carbon duration tokens:** fast-01 70 ms (buttons, toggles), fast-02 110 ms (fades), moderate-01 150 ms (small expansion, short movement), moderate-02 240 ms (expansion, system messages, toasts), slow-01 400 ms (large expansion, important notifications), slow-02 700 ms (background dimming). — [Carbon motion](https://carbondesignsystem.com/elements/motion/overview/)
- **Carbon easing:**
  - Productive standard `cubic-bezier(0.2,0,0.38,0.9)`, entrance `(0,0,0.38,0.9)`, exit `(0.2,0,1,0.9)`.
  - Expressive standard `(0.4,0.14,0.3,1)`, entrance `(0,0,0.3,1)`, exit `(0.4,0.14,1,1)`.
  - Productive is subtle and efficient and is used for button states, dropdowns and data. Expressive is for occasional significant moments such as opening a page or the primary action.
  — [Carbon motion](https://carbondesignsystem.com/elements/motion/overview/)
- Material 3 `short1` is reported as 50 ms. A proposal lists the emphasized curve as `cubic-bezier(0.2,0,0,1.5)`, which conflicts with the commonly cited `(0.2,0,0,1)`. Unverified secondary source. — [google-labs-code design.md issue #47](https://github.com/google-labs-code/design.md/issues/47)
- eBay Playbook for comparison: medium.2 = 333 ms, easing `cubic-bezier(0.3,0,0,1)`. — [eBay Playbook motion tokens](https://playbook.ebay.com/design-system/tokens/motion-tokens)

### Inferences
- For this site: hover and tap feedback 100-150 ms, menus and accordions 200-250 ms with ease-out on enter and ease-in on exit (exits about 20-30% shorter), page or view transitions 250-400 ms, scroll reveals 400-600 ms with small distances (8-16 px).
- One calm curve (Carbon productive/expressive or similar), used everywhere through CSS custom properties, keeps motion consistent and less "templated".

### Gaps
- The official Material 3 duration and easing tokens (short1-4, medium1-4, long1-4, extra-long1-4, standard/emphasized curves, M3 Expressive spring tokens) were not retrieved, because m3.material.io renders client-side. From memory (unverified): short 50-200 ms, medium 250-400 ms, long 450-600 ms, extra-long 700-1000 ms; standard `cubic-bezier(0.2,0,0,1)`; emphasized-decelerate `(0.05,0.7,0.1,1)`; emphasized-accelerate `(0.3,0,0.8,0.15)`.
- The Apple HIG motion page could not be fetched, so no sourced durations or quotes are available.
