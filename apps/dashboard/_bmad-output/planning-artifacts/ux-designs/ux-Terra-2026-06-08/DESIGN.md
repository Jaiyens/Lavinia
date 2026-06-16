---
name: Terra
status: final
updated: 2026-06-15
colors:
  surface: '#faf9f4'
  surface-dim: '#ece9e0'
  surface-bright: '#ffffff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f4ec'
  surface-container: '#f1eee4'
  surface-container-high: '#ebe8dd'
  surface-container-highest: '#e5e1d5'
  on-surface: '#1a1a17'
  on-surface-variant: '#5a554c'
  inverse-surface: '#2c2c28'
  inverse-on-surface: '#f4f2ec'
  outline: '#9a9384'
  outline-variant: '#d9d4c6'
  primary: '#2fa84f'
  on-primary: '#ffffff'
  primary-container: '#c9ebd2'
  on-primary-container: '#0c3d1c'
  money-positive: '#1fbf5a'
  on-money-positive: '#ffffff'
  alert: '#bd4b34'
  on-alert: '#ffffff'
  alert-container: '#f7ddd4'
  on-alert-container: '#4e1306'
  gold: '#f2c14e'
  background: '#faf9f4'
  on-background: '#1a1a17'
typography:
  money-hero:
    fontFamily: Inter, sans-serif
    fontSize: 56px
    fontWeight: '700'
    lineHeight: '1.0'
    letterSpacing: -0.02em
    fontVariantNumeric: tabular-nums
  display-lg:
    fontFamily: Inter, sans-serif
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.05'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter, sans-serif
    fontSize: 30px
    fontWeight: '700'
    lineHeight: '1.05'
    letterSpacing: -0.01em
  headline:
    fontFamily: Inter, sans-serif
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  title:
    fontFamily: Inter, sans-serif
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter, sans-serif
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.5'
  body-md:
    fontFamily: Inter, sans-serif
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.5'
  num-tabular:
    fontFamily: Inter, sans-serif
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.4'
    fontVariantNumeric: tabular-nums
  label-caps:
    fontFamily: Inter, sans-serif
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: 0.08em
    textTransform: uppercase
  caption:
    fontFamily: Inter, sans-serif
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.375rem
  md: 0.5rem
  lg: 0.75rem
  xl: 1rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 48px
  agent-rail: 240px
  findings-rail: 320px
elevation:
  e0-flat: 'none'
  e1-resting: '0 1px 2px rgba(20,25,15,0.05), 0 1px 1px rgba(20,25,15,0.04)'
  e2-hover: '0 6px 16px rgba(20,25,15,0.07), 0 2px 4px rgba(20,25,15,0.05)'
  e3-overlay: '0 12px 32px rgba(20,25,15,0.10)'
  e4-modal: '0 24px 56px rgba(20,25,15,0.16)'
  hover-lift: 'translateY(-1px)'
  press: 'scale(0.98)'
  focus-ring: '0 0 0 2px {colors.surface}, 0 0 0 4px {colors.primary}'
motion:
  duration-instant: 120ms
  duration-fast: 180ms
  duration-base: 240ms
  duration-slow: 420ms
  duration-data: 900ms
  easing-standard: 'cubic-bezier(0.16, 1, 0.3, 1)'
  easing-exit: 'cubic-bezier(0.4, 0, 1, 1)'
  stagger: 60ms
  spring-data: 'stiffness 120, damping 20, no overshoot'
components:
  - card
  - agent-rail
  - kpi-card
  - lens-toggle
  - cost-chart
  - meter-table
  - meter-drawer
  - finding-card
  - farm-map
  - button
  - input
  - severity-badge
  - bottom-sheet
  - skeleton
---

## Brand & Style

Terra is an **operating system for California farmers**; this surface is its first agent, the PG&E energy tool. The aesthetic is **editorial agrarian-luxury**: calm, confident, expensive. It must read like the pitch deck, not a SaaS template.

The emotional target is **control through legibility**: a skeptical, low-software-literacy grower opens the app and *feels he can see his whole farm and knows what is happening on it.* Every visual choice serves that feeling. Hierarchy comes from weight and size, not decoration. The data hero — the chart, table, and map — is the loudest thing on the screen; money reads clearly as the story it tells, never a lone hero number. Everything else recedes to hairlines and warm paper.

**Refined minimalism, now with motivated motion and soft depth.** This is the 2026-06-15 reconciliation of the original restraint-first spine with the Magic-UI-era direction: we retire the blanket "no effects / one motion moment" clause, but we do *not* become a flashy SaaS toy. The bar is **restrained polish** (think Linear and Vercel, tuned to warm farm paper), not Awwwards. Effects serve legibility, never decorate:

- A soft lift on hover says *this is touchable*.
- A number that counts up once on load lets the grower *watch the dollars land*.
- A bar chart that grows from its baseline lets him *read magnitude as it builds*.

Every animation must be **motivated** — it communicates hierarchy, a state change, feedback, or a data story. If you cannot say in one sentence what an animation communicates, cut it. **Motion dials for this product (trust-first preset): variance low, motion low, density medium.** Still banned: glassmorphism, liquid glass, heavy or neon gradients, decorative infinite loops, and any third status color. When a Magic UI or Aceternity component is used, it is **tinted into the warm palette** (beams and shimmer in greens and golds, never default neon) and reserved for moments that earn it.

Voice in the UI is plain operator English: confident, never salesy, no exclamation marks, no em dashes. The grower's words — blocks, sets, hours, acres, pumps, ranches — never kW or "15-minute interval."

## Colors

One dominant color, one sharp accent, and a single restrained alert tone. Everything else is warm neutral.

- **Brand green `primary #2FA84F`** is the dominant color — navigation, primary actions, the in-the-money state, and the tint for any beam or shimmer effect.
- **Warm paper `surface #FAF9F4`** is the canvas, never pure white. Containers step up through warm off-whites (`surface-container-*`), never gray cards on white.
- **Warm charcoal `on-surface #1A1A17`** is the ink, never pure black. Secondary text is muted warm gray `on-surface-variant #5A554C`.
- **`money-positive #1FBF5A`** — a slightly brighter green reserved for *positive money*: savings found, credits, in-the-money deltas. The only place a second green appears.
- **`alert #BD4B34`** — a warm clay/terracotta, the single alert tone. Used sparingly for `act`-severity findings and high-dollar-at-risk map pins. The traffic-light "bad," kept warm so it belongs to the agrarian palette rather than a SaaS red.
- **`gold #F2C14E`** — not a content color. It exists only as the warm second stop for the `primary → gold` border beam / shimmer on the one "live" hero moment (the Energy agent card). Never used for text, state, or fills.
- **`watch` severity has no dedicated color.** It is carried by typography and label only. Three content colors max on any screen: green, clay, charcoal-on-paper.

Borders are hairline `outline-variant #D9D4C6` at 1px. **Color consistency lock:** green is the only accent; clay is the only alert. A green-accented screen does not grow a blue badge or a teal chip. Audit every component before shipping.

## Typography

**Inter across display, body, and data** (loaded via next/font), Arial as the system fallback. There is exactly one typeface. Hierarchy is built from **weight extremes (300/400 against 700)** and **real size jumps**, never from mixing families. (Inter is the deliberate, brand-mandated choice for a low-literacy audience and supersedes the stale "Helvetica" note in the original decision log.)

- `money-hero` and `display-lg` carry dollar figures and section titles in heavy weight with tight tracking.
- **All numeric, dollar, and usage values use tabular figures** (`num-tabular`, `fontVariantNumeric: tabular-nums`) so columns of meter costs align to the digit. Non-negotiable on the table, the KPI strip, the drawer, and the findings rail.
- Numbers that represent a headline quantity (KPI value, found savings, meter count) **count up once on load** via NumberTicker, landing on the exact tabular value. The animation is data, not decoration; reduced-motion renders the final value instantly.
- `label-caps` (tracked out, uppercase) labels KPI cards, lens tabs, and rail section headers.
- Body sits at `body-md`/`body-lg`; captions and metadata at `caption`.

## Layout & Spacing

An **8px spacing scale** with generous margins. One primary decision per screen; depth is one tap away.

The desktop/tablet power surface is a **three-zone inverted-L + copilot**: `agent-rail` (240px, left) · data hero (fluid center) · `findings-rail` (320px, right). The center hero stacks: KPI strip → lens toggle → the active lens (chart / table / map / calendar) → shared drawer overlay.

Mobile is the core, not an afterthought: the agent rail becomes a bottom tab bar, the center goes full width, and the findings rail collapses to a peeking bottom sheet. Side margins hold at `margin-mobile` (20px) so content feels framed, never edge-bled. Every multi-column layout declares its `< 768px` collapse explicitly; the dense table degrades to a card list, never a pinched grid.

## Elevation & Depth

Depth is now a **defined five-step scale**, warm-tinted, low-opacity, large-blur — a soft light on paper, never a sharp drop shadow and never a bright card on white. Tonal warm-paper layering still does most of the work; elevation is added on top of tone, not instead of it. This replaces the original "border before shadow, shadows only on the drawer" rule: cards may now rest at `e1` and lift to `e2` on hover.

- **`e0-flat`** — the paper base and flush table cells. Structure comes from `surface-container-*` tone and hairline `outline-variant`.
- **`e1-resting`** — the resting state of every card (KPI card, finding card, agent card, meter card). A whisper of a shadow plus an optional hairline border. This is the depth that was missing and made the old UI read flat.
- **`e2-hover`** — interactive lift. Any clickable card or row raises to `e2` and shifts by `{elevation.hover-lift}` over `{motion.duration-fast}`. Communicates "touchable."
- **`e3-overlay`** — the meter drawer, the mobile bottom sheet, popovers, and chart tooltips. The first level that reads as floating above the page.
- **`e4-modal`** — modal dialogs and the top of any stacking context. Used rarely.

Shadows are tinted to the page hue (`rgba(20,25,15,...)`), never pure black. **Focus** is a 2px paper-offset ring in `primary` (`{elevation.focus-ring}`) — visible on keyboard nav, suppressed on mouse where a hover lift already gives feedback.

## Shapes

**Soft (0.375rem default).** Sharp edges feel aggressive; pills feel tech-y. Subtle rounding reads calm and tactile. Larger objects — drawer, bottom sheet, map frame, modals, hero cards — use `lg` (0.75rem) or `xl` (1rem). The map and any imagery follow the same radius so everything feels framed.

**Shape consistency lock:** one radius scale, applied by role, everywhere. Controls (buttons, inputs, chips, KPI cards) = `DEFAULT`. Content cards = `lg`. Overlays and the map = `lg`/`xl`. Pills (`full`) appear only on the lens-toggle thumb and status dots. A square card on a page of soft cards is broken design.

## Motion & Animation

The house motion grammar. Tokens live in frontmatter `motion`; every value below references them so implementation and spec cannot drift.

- **Chrome motion is short and functional.** Hover, focus, color, and elevation transitions run at `{motion.duration-fast}` (180ms) with `{motion.easing-standard}`. Lens swaps and panel changes crossfade at `{motion.duration-base}` (240ms).
- **Entrance motion is one orchestrated reveal per view.** On first paint, a view's primary children fade-and-rise (`opacity 0→1`, `translateY 8px→0`) staggered by `{motion.stagger}` (60ms), at `{motion.duration-slow}` (420ms). Kept from the original spine — it is the calm "the farm assembles in front of you" beat. It fires once, not on every re-render.
- **Data motion earns the longest durations.** NumberTickers count up and chart bars grow from baseline at `{motion.duration-data}` (900ms) with `{motion.spring-data}` — no overshoot, no bounce. This is the only place motion is "slow," because the motion *is* the information.
- **Tactile feedback is mandatory on every control.** `:active` applies `{elevation.press}` (`scale 0.98`) and/or a 1px downward nudge, so a tap feels like a physical push. Buttons, rows, chips, toggle thumbs.
- **The drawer and bottom sheet** slide in (`e3` overlay) at `{motion.duration-slow}` with `{motion.easing-standard}`; exit uses `{motion.easing-exit}`.
- **`prefers-reduced-motion` is honored everywhere** — all of the above collapse to instant final states (no transforms, tickers jump to value, bars render at height). This is non-negotiable; a grower with motion sensitivity sees a complete, static, correct screen.
- **Motivated-only rule:** every animation answers "what does this communicate?" (hierarchy / state change / feedback / data story). No marquees, no perpetual loops, no scroll-hijack, no parallax. The one decorative exception is the `BorderBeam` on the single live "Energy" agent card, whose job is to say *this one is alive and ready*.

## Components

Per-component visual specs. The five the slice rebuilds first — **card, kpi-card, meter-table, cost-chart, finding-card** — carry the most detail.

- **card** *(shared primitive, new)* — the base surface for KPI cards, finding cards, agent cards, and mobile meter cards. `surface-container-lowest` fill, `rounded.lg`, resting at `{elevation.e1-resting}` with an optional hairline `outline-variant`. If interactive: hover → `{elevation.e2-hover}` + `{elevation.hover-lift}` over `{motion.duration-fast}`; `:active` → `{elevation.press}`; keyboard focus → `{elevation.focus-ring}`. One card variant, used everywhere; this is what replaces today's flat 1px boxes.
- **kpi-card** — a `card`, compact. `label-caps` heading + a `num-tabular` value rendered with **NumberTicker** (counts up once on load) + a small sparkline + a vs-prior delta (delta arrow in `money-positive`/`primary` when favorable, `alert` clay when adverse). Honest-coverage line in `caption` when data is partial. Never a lone hero number; a strip of 3–4 sits above the lens. Loading → a **skeleton** matching the card's exact shape (never a spinner). Hover lifts to `e2`; click filters/opens the drawer.
- **meter-table** — the Excel-brained bridge, upgraded for density *and* polish. Header row is **sticky** and gains `e1` shadow once the body scrolls beneath it. Rows are flush (`e0`) with hairline `outline-variant` dividers; row hover → `surface-container-low` fill plus a 2px `primary` accent bar that slides in on the left edge (`{motion.duration-fast}`); the open/active row holds `surface-container-high` + a persistent accent bar. Sortable headers show a chevron; on sort the rows re-flow at `{motion.duration-base}`. `$`-at-risk cells above threshold tint to `alert-container` with `on-alert-container` text (verified WCAG AA). All figures tabular. First load reveals rows with the view stagger. **Mobile:** collapses to a list of `card` rows (meter name + headline cost + status), not a horizontally-scrolled table. Decorative motion stays out — this is data; its only motion is functional (sort, hover, reveal).
- **cost-chart** — the default hero visual: TOU-stacked bars (`peak` clay / `part-peak` outline / `off-peak` primary / `super-off-peak` primary-container) over time, dollars on the axis, year-over-year compare. Bars **grow from the baseline** on load, staggered ~40ms, at `{motion.duration-data}`. Bar hover → a `e3` tooltip (meter, total `$`, TOU breakdown) while the hovered bar brightens and siblings dim slightly (`{motion.duration-fast}`). YoY toggle animates bars to new heights at `{motion.duration-base}`. Reduced-motion → final heights instantly, tooltip still on hover/focus.
- **finding-card** — a `card` in the rail: situation line + one concrete action + dollar impact (`num-tabular`) + severity badge + a one-tap response. `act` cards carry a 2px `alert` left-edge accent; `watch` is type-only; `info` is neutral. A freshly arrived finding plays a one-time `pulse-once` (kept). Response row: primary **"Mark done"** (solid `primary`) + ghost **"Dismiss"**; both get `:active` `{elevation.press}`. Acting on a finding animates it through its **full state cycle** to a resolved/collapsed state (not just a silent disappear). Shaped to be executed by the agent later; v1 displays/records.
- **agent-rail** — vertical list of agents (icon + label). Active agent uses `primary`; the live **Energy** card carries the single `BorderBeam` (`primary → gold`, palette-tinted) as the "alive" moment; future agents render at reduced opacity with a "coming" tag and are non-interactive. Hover → `surface-container-low`. Collapses to a bottom tab bar on mobile.
- **lens-toggle** — segmented control: Chart · Table · Map · Calendar. Chart is the default face. One lens visible at a time. Active thumb uses `primary` and a `full`-radius pill that slides between segments at `{motion.duration-base}`.
- **meter-drawer** — right-side (desktop) / full-height sheet (mobile) at `{elevation.e3-overlay}`, opened from any chart bar, table row, or map pin. Slides in at `{motion.duration-slow}`. The single meter-detail surface, shared across lenses.
- **farm-map** — zoomable, read-only; meter pins colored by `$`-at-risk (green → clay), tap opens the drawer. Map frame uses `rounded.lg`. Renders fully from inventory (PLSS/geocode) on day one.
- **button** — primary: solid `primary` fill, `on-primary` text, generous horizontal padding, `rounded.DEFAULT`; hover lifts a touch with a slight brightness gain; `:active` → `{elevation.press}` + 1px nudge. Secondary: 1px `outline-variant` with `on-surface` text. One primary per screen. The single highest-intent CTA in a flow (e.g. onboarding "Connect your data") may use a palette-tinted ShimmerButton — at most once per screen. **Contrast + single-line label are mandatory** (WCAG AA; primary CTAs ≤ 3 words).
- **input** — minimalist; `label-caps` above the field (never placeholder-as-label); hairline box in `outline-variant` going to `primary` on focus with the focus ring; helper text below in `caption`; error text below in `alert`.
- **severity-badge** — `info` / `watch` / `act`. `act` = `alert` fill/accent; `watch` = charcoal weight + label, no fill; `info` = muted. No fourth state, no extra hue.
- **bottom-sheet** — mobile findings collapse: a peeking summary ("3 findings · ~$78k ↑") at `e3` that expands to the rail's content; drag/tap to expand at `{motion.duration-slow}`.
- **skeleton** *(new)* — loading placeholder that matches the final element's shape and rhythm (card outline, table rows, chart baseline). A slow shimmer in `surface-container` → `surface-container-high`. Replaces every spinner; the layout never jumps when data lands.

## Do's and Don'ts

- **Do** make the data hero (chart, table, map) the loudest thing; money is the story it tells, never a lone hero number. Let everything else fall to hairlines and warm paper.
- **Do** give every card real but soft depth (`e1` resting, `e2` on hover). Flat 1px boxes are the old look we are leaving.
- **Do** make motion motivated and brief: feedback, hierarchy, state change, or a data story. If you can't name what it communicates, cut it.
- **Do** ship the **full interaction cycle** for every interactive element: resting, hover, `:active` (tactile press), focus, loading (skeleton), empty, and error. Never just the happy success state.
- **Do** use tabular figures everywhere a number appears, and count up headline numbers once on load.
- **Do** keep to three content colors on a screen: green, clay, charcoal-on-paper. Tint any beam/shimmer effect into greens/golds.
- **Do** verify WCAG AA contrast on every button, badge, input, and tinted `$`-at-risk cell before shipping.
- **Do** honor `prefers-reduced-motion` on every animation — instant, complete, correct static state.
- **Don't** build the 12-widget wall (the future-vision mock is the anti-pattern: stat soup + competing panels).
- **Don't** use pure white, pure black, glassmorphism, liquid glass, heavy/neon gradients, marquees, parallax, scroll-hijack, or perpetual decorative loops.
- **Don't** over-animate data tables; their motion is functional only (sort, hover accent, load reveal).
- **Don't** surface vanity metrics (soil %, health %) as heroes; the hero story is dollars.
- **Don't** mix typefaces or radius systems for hierarchy; use weight, size, and the one shape scale.
- **Don't** add a third status color; `watch` is typography, not a hue.
