# What makes a web UI look "AI-generated" / template-made, and what designers do instead (2024-2026)

Source-quality note: Most 2025-2026 material on this topic comes from designer blogs, a widely shared blog post with a Hacker News thread, and "anti-slop" skill or checklist files written for AI coding tools. These are practitioner opinion, not controlled studies. The one academic source found (arXiv, July 2026) backs up the general point that outputs converge. I could not find a primary NN/g article on this topic; NN/g attributions seen in secondary blogs are unverified and left out of the findings.

## 1. Which specific patterns are named as "looks AI-made"?

### Takeaway
The tells come up again and again across independent sources: purple/indigo gradients (including gradient text), neon or cyan on dark with glows, glassmorphism, grids of identical rounded cards (cards everywhere, nested cards), an icon tile above every heading, eyebrow labels and pill badges above headlines, a "hero metric" (huge number + small label), pulsing status dots, emoji as icons, Inter/Geist/Roboto by default, uniform radius and soft shadow, centered hero + three feature cards, colored left-border side tabs, and hype or redundant copy ("Elevate", "Seamless", "Welcome to your Dashboard ✨"). The underlying complaint: "It treats every screen like a landing page rather than a functional tool."

### Cited Findings
**Layout / cards / bento**
- "Identical card grids": repeated icon + heading + text cards give every point equal weight. Fix: "Group related ideas and vary the layout." Also "Copy-paste layouts" (the same hero, metrics, and feature grid reused across products) and "Monotonous spacing" (equal gaps everywhere; keep related items close and separate groups with more space). — [impeccable.style, "The visible tells of AI design"](https://impeccable.style/slop)
- "Nested cards" / "Cardocalypse" (several stacked card layers around the same content). Fix: flatten with spacing, type, and dividers. — [impeccable.style](https://impeccable.style/slop)
- "Cards should be reserved for things that genuinely benefit from the affordance of a bounded, interactive object." Fix: group content with whitespace, proximity, and typography. — [Jeff Humble, Fountain Institute, "7 Signs a UI Has Been Vibe Coded"](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)
- "Cards Wrapping Everything": "The interface is more container than content." Fix: let text sit unboxed. "Rounded Rectangles with Generic Shadows": "Safe, forgettable, could be any AI output from any prompt." — [pixelslop AI Slop Pattern Catalog (npm package, v0.3.8)](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)
- "Finger Nail Cards": cards overused "in literally every vibecoded ui". — [Pranav Desai, "10 tells of a slop ui", 27 Sep 2026](https://godobject.dev/blog/10-tells-of-slop) (HN discussion: [news.ycombinator.com/item?id=49867038](https://news.ycombinator.com/item?id=49867038), summarised at [zeli.app](https://zeli.app/story/49867038))
- Anthropic's official frontend-design skill names the "SaaS card kit": identical rounded cards, one radius for everything, the same soft grey shadow, and gradient washes as decoration. — [anthropics/claude-code frontend-design SKILL.md](https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
- Bento grids are pitched as a 2026 "trend" by website-builder vendors, which helps explain why they now look generic. — [B12 guide on bento grids](https://www.b12.io/resource-center/website-design/web-design-guide-bento-grids-and-kinetic-typography/); see also ["bye bye bento" (Substack)](https://jpthehistorian.substack.com/p/bye-bye-bento) (not fetched)
- "Everything Centered" ("Just the safe default"; fix: left-align body text, use asymmetry) and "Generic Hero Sections" ("Indistinguishable from a template"). — [pixelslop catalog](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)
- The common AI output is Inter/Roboto + a purple-to-indigo gradient + a centered hero with one CTA + three rounded cards. — [superdesign.dev, "Why AI design looks generic"](https://superdesign.dev/blog/why-ai-design-looks-generic) (from search snippet)

**Side tabs / borders**
- "Multicolored side tabs": a differently colored left-edge bar on each block. "Nothing is emphasized when everything is emphasized." Fix: treat color as a shared resource. — [Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)
- "One-Sided Accent Borders": "The 'I need some color here' solution." — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md); also "Hairline border with wide shadow" (keep one or the other) and "Extreme border-radius on cards" (scale the curve to the card's size). — [impeccable.style](https://impeccable.style/slop)

**Eyebrows / pills / labels**
- "Label above a heading" that repeats the heading: remove it or fold it into the heading. "Pill badge above the main headline": looks clickable and competes with the message. "Tiny numbered section labels" (01, 02…) with no real sequence: keep numbers only for steps. — [impeccable.style](https://impeccable.style/slop)
- Anthropic's skill: avoid unnecessary labels above headings, all-caps labels, monospace for small data labels, and accenting one word of a headline with italics, bold, or color. Use numbered markers only for real sequences (steps, timelines). Avoid "template chrome" in copy: middle-dot meta strings ("A · B · C"), "WORD — fragment" labels with spaced em dashes, and arrows appended to link text. — [Anthropic frontend-design SKILL.md](https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
- "Pulsing badges": an "active" badge that pulses although "IT IS JUST NEVER INACTIVE", and a "verified" badge with no real check behind it. — [Desai](https://godobject.dev/blog/10-tells-of-slop)
- "Meaningless status dots": "If nothing is actually changing state, remove the dot entirely." — [Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)

**Icons / emoji**
- "Icon tile stacked above heading" (rounded-square icon over each feature heading): put the icon beside the heading or drop the container. "Massive icons": scale down so the content leads. — [impeccable.style](https://impeccable.style/slop)
- "Icon-Above-Heading": "The universal 'feature list' template." Fix: drop the icons, or keep them only where they aid recognition. — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)
- Emoji as icons/navigation: "Emojis belong in communication contexts where tone and personality matter." Fix: use one consistent icon set sized for its context. — [Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui); "AI LOVES emojis for whatever reason." — [Desai](https://godobject.dev/blog/10-tells-of-slop)
- The default vibe-coding stack is shadcn/ui + Radix + Lucide icons + Tailwind, so the same button and icon set shows up "verbatim in thousands of public repos". — [LinkedIn post (Marc F.)](https://il.linkedin.com/in/portfolio2) (one person's view); [SaaStr](https://www.saastr.com/gemini-3-solves-one-of-the-biggest-headaches-with-vibe-coding-now-your-site-doesnt-have-to-look-like-it-was-vibe-coded/) lists Lucide icons, Tailwind classes, purple-blue palettes, Inter-style fonts, and card-with-shadow patterns as the shared defaults.

**Typography**
- "Overused default font": Inter or Geist on unrelated products. Also "Italic serif display headline" as a shortcut to look "editorial" (an important caveat: the serif trend is itself becoming a tell), "Flat type hierarchy", "Crushed letter spacing", and "Gradient text". — [impeccable.style](https://impeccable.style/slop)
- Anthropic's skill warns against Inter, Roboto, and Arial (some mirrors add Space Grotesk as a convergence font) and asks for one family or two clearly distinct ones, "chosen for the brief." — [Anthropic SKILL.md](https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md); mirrors e.g. [skills.sh](https://skills.sh/anthropics/claude-code/frontend-design)
- Defaults to "Inter", or JetBrains Mono for anything tech, plus `//` decorations. — [Desai](https://godobject.dev/blog/10-tells-of-slop). "Monospace for 'Tech Vibes'": reserve monospace for code and data. — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)

**Color / gradients / surfaces**
- Purple gradients are "the Times New Roman of AI-generated design." Fix: derive color from the product, its values, and its audience. Neon palettes: "five or six competing for attention at the same time"; fix: one dominant color, one accent, one neutral. — [Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)
- One explanation traces the purple look to Tailwind's original indigo-500 default, copied through tutorials into training data (single source). — [aihola.com](https://aihola.com/article/vibe-coding-purple-landing-pages) (from search snippet)
- Anthropic's skill flags the newer AI-default palettes too: **warm cream background + terracotta accent**, near-black + one neon accent, and tinted near-black standing in for true black. — [Anthropic SKILL.md](https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md). "Cream/beige default: a warm cream surface chosen by habit. Keep it only if it belongs to the product." — [impeccable.style](https://impeccable.style/slop)
- Radial-gradient halo / spotlight behind hero, glassmorphism, cyan-on-dark, gray text on colored backgrounds. — [impeccable.style](https://impeccable.style/slop); "Glassmorphism … 1-2 uses can be fine; 3+ is a pattern." — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)
- "Rainbow Vomit": colors with no meaning that "don't go well together"; doesn't follow "the 70-30-10 rule". — [Desai](https://godobject.dev/blog/10-tells-of-slop)

**Hero / metrics**
- "Hero Metric Layout": "Big number (48-72px), small label beneath it, supporting stats in a row." Fix: show a number only with context (trend, comparison, target). "Decorative Sparklines": "Vibes-only data visualization." — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md); same tell at [impeccable.style](https://impeccable.style/slop) ("Lead with a metric only when it explains the product")
- "Oversized hero headline" filling the first screen. — [impeccable.style](https://impeccable.style/slop)

**Motion**
- Fade-and-slide entrances on every section and hover transitions on every card are generic defaults; prefer "one orchestrated moment". — [Anthropic SKILL.md](https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md). Bounce/elastic easing, hover zoom on images, marquee, decorative blinking cursor. — [impeccable.style](https://impeccable.style/slop)

**Copy**
- Generic taglines: "Elevate", "Seamless", "Supercharge"; "Welcome to your Dashboard, [Name] ✨"; text left over from the chat with the AI ("one campus. one app."). — [Desai](https://godobject.dev/blog/10-tells-of-slop)
- HN commenter vallerie: implementation detail leaking into user-facing prose is the biggest irritation; suggests moving all user-visible text into a translation file so a human can edit it. mjr00: many small details add up to the "this is slop" feeling. — [HN thread via zeli.app](https://zeli.app/story/49867038)
- Em-dash overuse, forced contrast ("Not a feature. A platform."), repeated label in one container, redundant UX writing. — [impeccable.style](https://impeccable.style/slop). "Our Features" followed by "Explore the features we offer"; repeated "Learn More"/"Get Started" labels; generic stock-photo alt text. — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)
- "Every Button is Primary": "When everything is loud, nothing is." — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)

**Why it converges (evidence)**
- Academic: a benchmark of 24 UI tasks and 120 interfaces from 5 generative UI tools found the outputs "converged in visual appearance and layout, with more variation in color"; over a quarter of the tools' stated design rationales were not implemented. — [Imteyaz et al., "Design Theater", arXiv 2607.22928, July 2026](https://arxiv.org/abs/2607.22928)

### Inferences
- The tells are moving targets. Purple gradients were the 2024-25 tell. Cream + terracotta, italic serif "editorial" headlines, and eyebrow labels are now listed as tells in 2026 too. So swapping one trendy default for another (e.g. purple → cream/serif) does not escape the look. HN commenters and the DeSlop project make the same point ([DeSlop](https://github.com/nate-zz/DeSlop), from search snippet).
- The common thread is decoration that means nothing (a dot, badge, border, icon, number, or glow with no information behind it) plus equal weight everywhere (identical cards, equal spacing, every button primary).

### Gaps
- No primary NN/g or Smashing Magazine article found that lists these tells. The "Frankenstein layout" / "good from afar, but far from good" NN/g quotes appear only in secondary blogs and are unverified.
- The Reddit r/web_design and r/UXDesign threads were not retrieved.
- Vercel v0's own docs on avoiding the generic look were not found.

## 2. What makes an interface feel authored by a person?

### Takeaway
Designers recommend starting from the subject (its materials, place, and vocabulary) rather than a template. Pick a small, deliberate palette and type system for the brief. Use real, specific photography. Let content be unboxed, with hierarchy from spacing and type. Be bold in one place only, and test each choice against "would a default have produced this?"

### Cited Findings
- Anthropic's skill: identify product, audience, primary job, and let "the subject's industry, materials, and vernacular drive visual choices". Treat the palette as a choice. "Spend boldness in one place": one memorable element, the rest disciplined. Plan a compact token system → check it against the brief for generic choices → build → critique with screenshots. Structure (borders, numbering, dividers, eyebrows) only when it carries meaning. — [Anthropic SKILL.md](https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
- Tests for authorship: "If another AI, given a similar prompt, would produce substantially the same output, you have failed." **Swap test** (swap in your usual typeface or a standard template: if nothing changes, it was a default). **Squint test** (hierarchy should still be visible when blurred). **Signature test** (point to five specific elements where the product's signature appears; "overall feel" doesn't count). — [interface-design skill (dammyjay93), ui-skills.com](https://www.ui-skills.com/skills/dammyjay93/interface-design); "Remove the product name. Could someone identify what this is for? If not, it's generic." — [same skill, skillselion mirror](https://skillselion.com/skills/dammyjay93/interface-design)
- Choose type for the product's character; "vary size, weight, and spacing before adding a second family"; use one solid color and get emphasis from size or weight instead of gradient text. — [impeccable.style](https://impeccable.style/slop)
- Fewer colors with defined roles: one dominant, one accent, one neutral. — [Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui). Tinted off-black and off-white instead of pure #000/#fff; radius and shadow chosen deliberately; a spacing scale that reflects how elements relate. — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)
- Trend commentary (opinion): human-centred work as "a rebellion against AI-generated content", with hand-drawn illustration, authentic photography, and natural textures. — [Click, "Expert digital design predictions for 2025"](https://click.co.uk/insights/expert-digital-design-predictions-for-2025). Magazine-style layout: large serif headings, white space, asymmetric grids. — [Majesty 2025 trends](https://majestyajans.com/en/blog/2025-design-trends.html) (agency blog; note impeccable.style now lists the italic-serif headline as a tell). Audiences "crave work with genuine character, texture, colour, and even 'weirdness'". — [Stills 2026 trends via Feedbagel](https://feedbagel.com/post/stills-2026-trends-report-points-to-the-rise-of-human-centred-design)
- Hospitality: the Hoxton's site does not call the hotel "stylish" or "contemporary"; it lets photography and copy show a specific guest personality, and "a hotel that tries to appeal to everyone attracts no one in particular". The Stillhouse Framer template is a photo-led scroll story with "no fake availability, no fake prices", handing dates to the real booking engine. Dark, dated, or stock images undercut the experience. — [framerwebsites.com hotel design](https://framerwebsites.com/blog/hotel-website-design); [Framer Stillhouse template](https://www.framer.com/marketplace/templates/stillhouse/) (vendor material)
- "Polish" comes from many small details together (HN, mjr00), and one HN commenter rewrote the model's defaults by hand (czhu12). — [zeli.app HN summary](https://zeli.app/story/49867038)
- Practical fix: write all user-facing text into one strings file and have a human edit it (HN, vallerie). — [zeli.app](https://zeli.app/story/49867038)

### Inferences
- For a farmstay booking/guest page, "authored" most likely means: real farm photos with specific captions; copy naming real things (fruit, rooms, the owner's own words); a palette taken from the place rather than a cream/terracotta default; and plain functional labels on account/stay pages instead of a landing-page tone.
- Restraint (removing icons, dots, pills, borders) is necessary but not sufficient. Each removal needs a deliberate replacement (spacing, type weight, a real photo).

### Gaps
- No controlled study shows which fixes users actually perceive as "less AI". The evidence is practitioner consensus.

## 3. How do dashboards avoid the generic SaaS-template look while staying easy to scan?

### Takeaway
Use the hero-metric, stat-card row, decorative sparkline, glow-on-dark, and card-in-card patterns only when the data calls for them. Give every number context. Pick one depth strategy and a deliberate density. Build hierarchy from weight and color (not just size or boxes). Use tabular numerals. Have one primary action per section, and keep a calm, tool-like tone instead of landing-page copy.

### Cited Findings
- Hero metric: show a number only with context (trend, comparison, target); flags `StatCard`/`MetricCard` components without context; decorative sparklines: label axes and values or remove. — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)
- "Dark Mode with Glowing Accents": "The 'AI dashboard' aesthetic." — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)
- Surfaces: a numbered elevation scale. Sidebars share the canvas background, popovers sit one level up, inputs are slightly darker. Low-opacity borders, with strength varied by how important the boundary is. Pick one depth strategy (borders, subtle shadows, layered shadows, or tonal shifts) and stick with it. Density: state padding in px; 12-16px feels like a dense workbench, 24px like a brochure. Metric typography: a small muted label, a large semibold value with **tabular numerals**, and a small colored delta. — [interface-design skill](https://www.ui-skills.com/skills/dammyjay93/interface-design)
- Separately generated screens drift in radii, padding, and blues. Lock brand rules (palette, fonts, radius) and limit metrics per screen. — [UX Magic, prompt templates for SaaS dashboards](https://uxmagic.ai/vi/blog/prompt-templates-saas-dashboards) (vendor, from search snippet)
- "Welcome to your Dashboard, [Name] ✨"; "treats every screen like a landing page rather than a functional tool". — [Desai](https://godobject.dev/blog/10-tells-of-slop)
- Modal overuse: keep modals for destructive confirmations and multi-step flows; handle the rest inline. — [pixelslop](https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md)
- Pulsing/"live" dots only for real state changes; otherwise use a text label. — [Fountain Institute](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui)

### Inferences
- For a guest "my stay" or account page: lead with the next real thing (date, room, amount owed) as a plain sentence or a simple list, not a row of equal stat tiles. Use status text ("Deposit paid 1,250 ฿ on 3 Oct") instead of colored pills or dots. Group with headings and dividers instead of a card per item.

### Gaps
- No NN/g-style dashboard research specific to "AI look" was retrieved. Classic dashboard guidance (Few, NN/g) predates 2024 and was not fetched.

## 4. Avoiding the look in Thai (non-Latin) scripts

### Takeaway
Very little is written about "AI look" in Thai specifically. Relevant craft facts: looped vs loopless Thai is a real stylistic choice (looped is perceived as more legible in dense text and preferred by older readers; loopless reads as modern/advertising). Thai needs generous line spacing because of stacked vowels and tone marks. Faux italic and letter-spacing in running Thai text are not native conventions.

### Cited Findings
- Typotheque/Chulalongkorn study (looped vs loopless Zed Text Thai, matched otherwise): "all age groups perceive looped fonts as more legible, especially in information-dense mediums like books and websites". The ATypI abstract says reading performance was not affected by loops, while the Granshan summary reports faster paragraph reading with looped. **These conflict.** Younger readers preferred loopless at small sizes; older readers preferred looped across conditions. — [Typotheque research](https://www.typotheque.com/research/effects-of-loops-in-thai); [ATypI abstract](https://atypi.org/?p=34632); [Granshan summary](https://granshan.com/insights/bridging-cultures-through-letters-typotheques-typographic-journey-in-thailand) (foundry-run research; caution)
- Looped Thai dominates traditional publishing, education, and official contexts; loopless is increasingly used in signage, advertising, and contemporary print. — [Granshan](https://granshan.com/insights/bridging-cultures-through-letters-typotheques-typographic-journey-in-thailand)
- Noto Sans Thai is the modern loopless style, aimed mainly at headlines, packaging, and advertising (so a less obvious choice for long body text). IBM Plex Sans Thai comes in looped and loopless styles, seven weights each; Anuphan is a loopless Thai from Cadson Demak / Mint Tantisuwanna based on IBM Plex. — [Fontsource Noto Sans Thai](https://fontsource.org/fonts/noto-sans-thai/about); [Fontpad, IBM Plex Thai](https://www.fontpad.co.uk/?p=1772); [Google Fonts Anuphan](https://fonts.google.com/specimen/Anuphan/about)
- Thai composite vowels can involve "up to 4 glyphs (plus a tone mark)" around the base consonant on up to 3 sides. Thai running text doesn't use inter-letter spacing (sometimes used in signage); spaces separate phrases, not words. — [W3C Thai Layout Requirements (2024)](https://www.w3.org/TR/2024/DNOTE-thai-lreq-20240430/)
- UK and Thai readers both preferred 1.5x or double line spacing on web text; Thai readers preferred justified text. — [White Rose eThesis](https://etheses.whiterose.ac.uk/id/oai_id/oai:etheses.whiterose.ac.uk:9027) (older thesis, date not checked)

### Inferences
- Letter-spaced all-caps "eyebrow" labels, a common AI tell, have no real Thai equivalent: tracking Thai text looks wrong (W3C notes it's not used in running text). This makes eyebrow labels look even more imported on Thai pages.
- A deliberate Thai choice (e.g. looped Thai for body, a loopless or distinct face for headings, matched to the Latin face) signals authorship more than leaving the browser's default Thai fallback under an Inter stack.
- Fake italic on Thai is risky; per the impeccable.style tell, the italic-serif "editorial" headline is an AI cliché anyway.

### Gaps
- No source found that discusses "AI-looking" UI specifically in Thai, or Thai designers' views on vibe-coded sites.
- No authoritative numeric line-height for Thai web UI; W3C lreq leaves it as an open question. Values of about 1.5-1.75 are practitioner convention, not sourced.
