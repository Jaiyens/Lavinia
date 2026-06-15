---
name: Terra
status: final
updated: 2026-06-08
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
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-mobile: 20px
  margin-desktop: 48px
  agent-rail: 240px
  findings-rail: 320px
components:
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
---

## Brand & Style

Terra is an **operating system for California farmers**; this surface is its first agent, the PG&E energy tool. The aesthetic is **editorial agrarian-luxury**: calm, confident, expensive. It must read like the pitch deck, not a SaaS template. Refined minimalism — restraint and precision over effects. No glassmorphism, no liquid glass, no heavy gradients.

The emotional target is **control through legibility**: a skeptical, low-software-literacy grower opens the app and *feels he can see his whole farm and knows what is happening on it.* Every visual choice serves that feeling. Hierarchy comes from weight and size, not decoration. The data hero — the chart, table, and map — is the loudest thing on the screen; money reads clearly as the story it tells, never a lone hero number. Everything else recedes to hairlines and warm paper.

Voice in the UI is plain operator English: confident, never salesy, no exclamation marks, no em dashes. The grower's words — blocks, sets, hours, acres, pumps, ranches — never kW or "15-minute interval."

## Colors

One dominant color, one sharp accent, and a single restrained alert tone. Everything else is warm neutral.

- **Brand green `primary #2FA84F`** is the dominant color — navigation, primary actions, the in-the-money state.
- **Warm paper `surface #FAF9F4`** is the canvas, never pure white. Containers step up through warm off-whites (`surface-container-*`), never gray cards on white.
- **Warm charcoal `on-surface #1A1A17`** is the ink, never pure black. Secondary text is muted warm gray `on-surface-variant #5A554C`.
- **`money-positive #1FBF5A`** — a slightly brighter green reserved for *positive money*: savings found, credits, in-the-money deltas. The only place a second green appears.
- **`alert #BD4B34`** — a warm clay/terracotta, the single alert tone. Used sparingly for `act`-severity findings and high-dollar-at-risk map pins. This is the traffic-light "bad," kept warm so it belongs to the agrarian palette rather than a SaaS red.
- **`watch` severity has no dedicated color.** It is carried by typography and label only. Three colors max on any screen: green, clay, charcoal-on-paper.

Borders are hairline `outline-variant #D9D4C6` at 1px. Use tonal warm-paper layering for structure before reaching for a border, and a border before reaching for a shadow.

## Typography

**Inter across display, body, and data** (loaded via next/font), Arial as the system fallback. There is exactly one typeface. Hierarchy is built from **weight extremes (300/400 against 700)** and **real size jumps**, never from mixing families.

- `money-hero` and `display-lg` carry dollar figures and section titles in heavy weight with tight tracking.
- **All numeric, dollar, and usage values use tabular figures** (`num-tabular`, `fontVariantNumeric: tabular-nums`) so columns of meter costs align to the digit. This is non-negotiable on the table, the KPI strip, the drawer, and the findings rail.
- `label-caps` (tracked out, uppercase) labels KPI cards, lens tabs, and rail section headers.
- Body sits at `body-md`/`body-lg`; captions and metadata at `caption`.

## Layout & Spacing

An **8px spacing scale** with generous margins. One primary decision per screen; depth is one tap away.

The desktop/tablet power surface is a **three-zone inverted-L + copilot**: `agent-rail` (240px, left) · data hero (fluid center) · `findings-rail` (320px, right). The center hero stacks: KPI strip → lens toggle → the active lens (chart / table / map / calendar) → shared drawer overlay.

Mobile is the core, not an afterthought: the agent rail becomes a bottom tab bar, the center goes full width, and the findings rail collapses to a peeking bottom sheet. Side margins hold at `margin-mobile` (20px) so content feels framed, never edge-bled.

## Elevation & Depth

Depth through **tonal warm-paper layering and soft ambient shadow**, never sharp borders or bright cards.

- Containers are defined by stepping the warm-paper tone (`surface-container-*`) against the `surface` base.
- Shadows are diffuse and warm-tinted (`rgba(26,26,23,0.06)`), large blur (20px+), very low opacity — a soft light on paper. The meter drawer and the mobile bottom sheet are the only elements that lift meaningfully.
- Borders, when needed, are 1px `outline-variant` — a ghost line that barely separates.

## Shapes

**Soft (0.375rem default).** Sharp edges feel aggressive; pills feel tech-y. Subtle rounding reads calm and tactile. Larger objects — drawer, bottom sheet, map frame, modals — use `lg` (0.75rem). The map and any imagery follow the same radius so everything feels framed.

## Components

- **agent-rail** — vertical list of agents with icon + label. Active agent uses `primary`; live agents are full-contrast; future agents render at reduced opacity with a "coming" tag and are non-interactive. Collapses to a bottom tab bar on mobile.
- **kpi-card** — compact: `label-caps` + a `num-tabular` value + a small sparkline + a vs-prior delta (delta green when favorable, `alert` clay when adverse). Never a lone hero number; a strip of 3–4 sits above the lens.
- **lens-toggle** — segmented control: Chart · Table · Map · Calendar. Chart is the default face. One lens visible at a time. Active tab uses `primary` underline/weight.
- **cost-chart** — TOU-stacked bars (peak / partial-peak / off-peak) over time with year-over-year compare. Dollars on the axis. The default hero visual.
- **meter-table** — dense, sortable, filterable; every meter a row; tabular figures; concerning values tinted (`alert` at high $-at-risk). Mobile degrades to a simplified sortable list.
- **meter-drawer** — right-side (desktop) / full-height sheet (mobile) opened from any chart bar, table row, or map pin. The single meter detail surface; shared across lenses.
- **finding-card** — the recommendation unit in the rail: situation line + one concrete action + dollar impact (`num-tabular`) + severity + a one-tap response. `act` cards carry the `alert` accent; `watch` is type-only; `info` is neutral. Shaped to be executed later; v1 displays/records.
- **farm-map** — zoomable, read-only map; meter pins colored by $-at-risk (green → clay), tap opens the drawer. Renders fully from inventory on day one.
- **button** — primary: solid `primary` fill, `on-primary` text, generous horizontal padding. Secondary: 1px `outline-variant` with `on-surface` text. One primary per screen.
- **input** — minimalist; `label-caps` above; hairline underline/box in `outline-variant` to `primary` on focus.
- **severity-badge** — `info` / `watch` / `act`. `act` = `alert`; `watch` = charcoal weight + label, no fill; `info` = muted.
- **bottom-sheet** — mobile findings collapse; a peeking summary ("3 findings · ~$78k ↑") that expands to the rail's content.

## Do's and Don'ts

- **Do** make the data hero (chart, table, map) the loudest thing; money is the story it tells, never a lone hero number. Let everything else fall to hairlines and warm paper.
- **Do** show one data lens at a time; depth is one tap away.
- **Do** use tabular figures everywhere a number appears.
- **Do** keep to three colors on a screen: green, clay, charcoal-on-paper.
- **Don't** build the 12-widget wall (the attached future-vision mock is the anti-pattern: stat soup + competing panels).
- **Don't** use pure white, pure black, glassmorphism, liquid glass, or heavy gradients.
- **Don't** surface vanity metrics (soil %, health %) as heroes; the hero story is dollars.
- **Don't** mix typefaces for hierarchy; use weight and size.
- **Don't** add a third status color; `watch` is typography, not a hue.
