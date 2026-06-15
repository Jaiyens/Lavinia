---
title: Terra Purchasing Agent
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
name: Terra Purchasing Agent
description: The design system for Terra Tool 2, the farmer-side input-procurement agent. It extends the Terra brand to make a grower's full input spend legible (every dollar, every dealer, every entity in one place) and surface the money hiding in it, in plain operator English on a phone in a truck.
colors:
  # Surfaces - warm paper canvas, stepping up through off-whites. Never pure white.
  surface: '#faf9f4'
  surface-dim: '#ece9e0'
  surface-bright: '#ffffff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f4ec'
  surface-container: '#f1eee4'
  surface-container-high: '#ebe8dd'
  surface-container-highest: '#e5e1d5'
  background: '#faf9f4'
  on-background: '#1a1a17'
  # Ink - warm charcoal, never pure black.
  on-surface: '#1a1a17'
  on-surface-variant: '#5a554c'
  inverse-surface: '#2c2c28'
  inverse-on-surface: '#f4f2ec'
  # Lines - hairline borders before shadows.
  outline: '#9a9384'
  outline-variant: '#d9d4c6'
  # Brand green - dominant: nav, primary actions, on-band / fair-price state.
  primary: '#2fa84f'
  on-primary: '#ffffff'
  primary-container: '#c9ebd2'
  on-primary-container: '#0c3d1c'
  # Savings-positive - the one second green: money recovered or saved, credits, in-the-money deltas.
  savings-positive: '#1fbf5a'
  on-savings-positive: '#ffffff'
  savings-positive-container: '#d6f2df'
  on-savings-positive-container: '#0c3d1c'
  # Over-band - warm clay/terracotta. The single alert tone: a line priced above the Market Band, an under-credited rebate, an over-budget entity. Carries `act` severity.
  over-band: '#bd4b34'
  on-over-band: '#ffffff'
  over-band-container: '#f7ddd4'
  on-over-band-container: '#4e1306'
  # Under-band - a quiet, favorable tone for a line sitting below the band (paying less than the band). A deeper savings green, distinct from primary so "below the band" reads as good news, not nav.
  under-band: '#1c7a2b'
  on-under-band: '#ffffff'
  # Watch - NO dedicated hue. Carried by typography and label only. Token names the
  #   gold accent reserved for non-alarming time pressure (a Prepay window closing),
  #   used as a thin marker, never a fill behind dollars.
  watch-accent: '#f2c14e'
  on-watch-accent: '#4a3a0c'
  # Advisor - a calm sky tone marking PCA / advisor presence and read-only shared scope.
  #   Never used for money or severity; identity only.
  advisor: '#7fb3c9'
  advisor-container: '#dcecf3'
  on-advisor-container: '#143844'
typography:
  # verified-savings figure - the ONE moment a dollar may lead: a loop-closed,
  #   attributed realized-savings figure (SM-1b) the instant it earns "verified".
  #   Never used for identified/pre-action savings (SM-1), and never larger than
  #   the data hero it sits inside. The only place a dollar is the loudest thing,
  #   and only after the loop closes.
  verified-savings:
    fontFamily: Inter, sans-serif
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.05'
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
  num-tabular-strong:
    fontFamily: Inter, sans-serif
    fontSize: 15px
    fontWeight: '600'
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
  spend-table-cell:
    background: '{colors.surface-container-lowest}'
    text: '{colors.on-surface}'
    font: '{typography.num-tabular}'
    over-band-text: '{colors.over-band}'
    under-band-text: '{colors.under-band}'
    needs-review-text: '{colors.on-surface-variant}'
    border: '{colors.outline-variant}'
    radius: '{rounded.sm}'
  market-band-bar:
    track: '{colors.surface-container-high}'
    band-fill: '{colors.primary-container}'
    band-edge: '{colors.outline-variant}'
    you-marker-on-band: '{colors.primary}'
    you-marker-over-band: '{colors.over-band}'
    you-marker-under-band: '{colors.under-band}'
    label: '{typography.label-caps}'
    value: '{typography.num-tabular-strong}'
    radius: '{rounded.full}'
  finding-card:
    background: '{colors.surface-container-low}'
    border: '{colors.outline-variant}'
    situation-text: '{colors.on-surface}'
    action-text: '{colors.on-surface}'
    impact-positive: '{colors.savings-positive}'
    impact-at-risk: '{colors.over-band}'
    impact-font: '{typography.num-tabular-strong}'
    act-accent: '{colors.over-band}'
    watch-accent: '{colors.watch-accent}'
    needs-confirmation-text: '{colors.on-surface-variant}'
    radius: '{rounded.md}'
    shadow: none
  buy-window-day:
    background: '{colors.surface-container-low}'
    today-ring: '{colors.primary}'
    forecast-marker: '{colors.primary}'
    prepay-close-marker: '{colors.watch-accent}'
    over-band-marker: '{colors.over-band}'
    label: '{typography.caption}'
    radius: '{rounded.DEFAULT}'
  one-tap-approval-card:
    background: '{colors.surface-container-lowest}'
    border: '{colors.outline-variant}'
    primary-action-fill: '{colors.primary}'
    primary-action-text: '{colors.on-primary}'
    dismiss-text: '{colors.on-surface-variant}'
    impact-font: '{typography.num-tabular-strong}'
    impact-positive: '{colors.savings-positive}'
    radius: '{rounded.md}'
    shadow: '{elevation.shadow-elevated}'
  advisor-badge:
    background: '{colors.advisor-container}'
    text: '{colors.on-advisor-container}'
    marker: '{colors.advisor}'
    font: '{typography.label-caps}'
    radius: '{rounded.full}'
  coverage-indicator:
    track: '{colors.surface-container-high}'
    attributed-fill: '{colors.primary}'
    needs-review-fill: '{colors.watch-accent}'
    unattributed-fill: '{colors.surface-dim}'
    label: '{typography.label-caps}'
    value: '{typography.num-tabular}'
    radius: '{rounded.full}'
  generic-equivalent-compare:
    background: '{colors.surface-container-low}'
    border: '{colors.outline-variant}'
    active-ingredient-label: '{typography.label-caps}'
    sku-text: '{colors.on-surface}'
    price-font: '{typography.num-tabular-strong}'
    gap-positive: '{colors.savings-positive}'
    estimate-caption: '{typography.caption}'
    radius: '{rounded.md}'
    shadow: none
---

## Brand & Style

The Terra Purchasing Agent is **Terra's Tool 2**, and it inherits the house style whole: it must feel like the same operating system the grower already knows from the energy tool, not a second product bolted on. The aesthetic is **warm agrarian, modern, alive**. The earlier Tool 1 spec leaned to refined minimalism; this system keeps the warm palette, Inter, and tabular money, and adopts **Magic UI (https://magicui.design/docs/components) as the primary component and animation vocabulary** per the current Terra direction. Reach for a Magic UI component first and compose from it; hand-roll only when the catalog has nothing that fits. Effects are welcome when they earn their place, and they are always **tinted into the Terra greens and golds**, never left as default neon.

The emotional target is **control through legibility**. A skeptical, low-software-literacy grower who buys inputs from four dealers across six entities opens the agent and, for the first time, feels he can see his whole input spend and knows where the money is going. Every choice serves that feeling. The grower learns line by line in Excel and does not trust a vendor headline, so the data hero leads (the **Spend Table**, the **Buy Window Calendar**, the **Price Band Chart**) and the dollars live inside the data. Money is the story, but it is **never the loudest or largest element on the screen**. The north star is the farm and its spend, known at a glance.

Voice in the UI is **plain operator English**: confident, never salesy, no exclamation marks, no em dashes. The grower's words (blocks, sets, acres, dealers, ranches, pumps, the band, prepay), never "SKU velocity," "active ingredient cardinality," or surface jargon. All user-facing copy lives in `/copy` for localization.

The product is **independent, not a store**. v1 does not sell, source, quote, or buy. The design never renders a buy button, a cart, or a store price as a call to action. Every action a tap exposes is a legibility or review action (mark for the dealer conversation, export, confirm, dismiss), and the one-tap-approval pattern is built but explicitly demoted and dollar-capped, present in the system so the agent can earn the right to act, absent from the v1 surface.

## Colors

One dominant green, one warm clay alert, and a tight set of semantic money tones. Everything else is warm neutral. The Tool 1 three-colors-on-a-screen discipline holds: at any moment a screen reads as **green, clay, and charcoal-on-paper**, with the savings and band tones being deliberate, sparing exceptions tied to specific data states.

- **Brand green `primary #2FA84F`** is the dominant color: navigation, the active agent in the rail, primary actions, and the **on-band** (fair-price) state. A line that sits inside the Market Band is green because there is nothing to do.
- **Warm paper `surface #FAF9F4`** is the canvas, never pure white. Containers step up through warm off-whites (`surface-container-*`), never gray cards on white.
- **Warm charcoal `on-surface #1A1A17`** is the ink, never pure black. Secondary text and the "needs review" / "possible, needs confirmation" states sit in muted warm gray `on-surface-variant #5A554C`, deliberately quiet so an unresolved line never shouts a number it cannot defend.
- **`savings-positive #1FBF5A`** is the one brighter second green, reserved for **money the agent recovered or saved**: a recovered under-credited rebate, a closed-loop verified delta, a generic-equivalent gap the grower could capture. This is the only place a saved dollar gets a celebratory tone, and even here it is the story, not a screaming hero number.
- **`over-band #BD4B34`** is the single alert tone, a warm clay/terracotta. It marks a line priced **above the Market Band** (an Overpayment), an under-credited rebate the grower is owed, and an over-budget entity. It carries `act` severity. It is the traffic-light "bad," kept warm so it belongs to the agrarian palette rather than a SaaS red. Use it sparingly; a table full of clay is a failure of triage.
- **`under-band #1C7A2B`** is a quiet, deeper green for a line sitting **below the band** (the grower paid less than the band). It is favorable but undramatic, distinct from `primary` so "below the band" reads as good news without competing with navigation.
- **`watch-accent #F2C14E`** is a gold marker for **non-alarming time pressure**, the canonical case being a **Prepay window closing**. `watch` severity has no fill color and no dollar tint; gold appears only as a thin edge, a calendar dot, or a small label. It never sits behind money.
- **`advisor #7FB3C9`** is a calm sky tone marking **PCA / advisor presence and read-only shared scope**. It is identity, never money or severity. When Manpreet (the PCA) is in a shared view, advisor sky tells everyone whose eyes are on the data and that the scope is read-only.

Borders are hairline `outline-variant #D9D4C6` at 1px. Use tonal warm-paper layering for structure before reaching for a border, and a border before reaching for a shadow. When a Magic UI effect adds a border or beam (Border Beam, Shine Border, Magic Card), tint it into greens and golds, and reserve it for moments that deserve attention (the first finding revealed on onboarding, a one-tap-approval card), never as ambient chrome on a 180-line table.

## Typography

**Inter across display, body, and data** (loaded via next/font), Arial as the system fallback. There is exactly one typeface. Hierarchy is built from **weight (400 against 600/700)** and **real size jumps**, never from mixing families. For animated text, compose from Magic UI (Text Animate, Typing Animation, Animated Shiny Text) but keep it to genuine moments, the reveal of the first dollar finding, an onboarding line, not on every label.

- `display-lg` carries section titles and the data-hero figures in heavy weight with tight tracking, always inside the data, never as a lone screaming number. `verified-savings` is the single exception where a dollar may lead, and it is scoped tight: it renders only on a loop-closed, attributed realized-savings figure (SM-1b) the moment it earns "verified," never on an identified/pre-action total (SM-1), and never larger than the data hero around it. No `money-hero`-scale token exists; money is the story, not the loudest or largest element.
- **All numeric, dollar, per-unit, and quantity values use tabular figures** (`num-tabular` / `num-tabular-strong`, `fontVariantNumeric: tabular-nums`) so per-unit prices, band lows and highs, and cell charges align to the digit down a column. This is non-negotiable on the Spend Table, the band bars, the budget summary, and the Findings rail.
- `num-tabular-strong` (weight 600) carries the load-bearing number in a finding: the impact dollar, the per-unit you-paid figure, the band edge.
- `label-caps` (tracked out, uppercase) labels the lens tabs, KPI strip, rail section headers, the advisor badge, and the coverage indicator.
- Body sits at `body-md`/`body-lg`; captions, the "needs review" state, and metadata at `caption`.

## Layout & Spacing

An **8px spacing scale** with generous margins. One primary decision per screen; depth is one tap away. The IA is the **three-views discipline carried directly from Tool 1, simplest first**, plus the **OS shell** (the agent rail and the persistent Findings rail) and the **lens toggle**.

- **Spend Table (the Excel bridge)** is the legibility floor: SKUs down, months across, charges in cells, filterable by Entity, Ranch, Dealer, and Active Ingredient, usable at 180-plus lines, one-click CSV export. Compose the table shell with Magic UI Bento Grid / Magic Card framing only for summary tiles above it, never for the dense grid itself.
- **Buy Window Calendar (the home hook)** is the graspable-in-seconds view: each forecast Input's buying window and Prepay close on a month grid, color-coded, one plain-language action line per entry.
- **Price Band Chart (behind a tap)** is the trends view: per-unit price history and the Market Band over time.

The desktop/tablet power surface is the **three-zone inverted-L + copilot**, identical to Tool 1: `agent-rail` (240px, left, with the Purchasing Agent as the active agent) · data hero (fluid center) · `findings-rail` (320px, right). The center hero stacks: KPI / coverage strip → lens toggle → the active lens (Calendar / Table / Chart) → shared drawer overlay (the SKU / line detail).

**Mobile is the core, not an afterthought** (the farmer is on a phone in a truck). The agent rail becomes a bottom tab bar (compose from Magic UI Dock), the center goes full width, and the Findings rail collapses to a peeking bottom sheet. The Buy Window Calendar fits a single entity on a phone screen with no horizontal scroll; the Spend Table degrades to a sortable, filterable list. Side margins hold at `margin-mobile` (20px) so content feels framed, never edge-bled.

## Elevation & Depth

Depth through **tonal warm-paper layering and soft ambient shadow** first, then sparing Magic UI effects.

- Containers are defined by stepping the warm-paper tone (`surface-container-*`) against the `surface` base.
- Shadows are diffuse and warm-tinted (`rgba(26,26,23,0.06)`), large blur, very low opacity, a soft light on paper. The line / SKU drawer, the mobile bottom sheet, and the one-tap-approval card are the only elements that lift meaningfully.
- Borders, when needed, are 1px `outline-variant`, a ghost line that barely separates.
- Magic UI motion and special effects (Border Beam, Shine Border, Particles, Animated Beam, Light Rays) are **moment effects, not ambient texture**, and always tinted to greens/golds. Use Animated List for the Findings rail filling on first ingest, Number Ticker for a settling savings total, and Border Beam to crown the single first finding on onboarding. Honor `prefers-reduced-motion`: every animated component must degrade to its static state.

## Shapes

**Soft (0.375rem default).** Sharp edges feel aggressive; full pills feel tech-y and are reserved for true pill objects (the market-band bar, the advisor badge, the coverage indicator). Subtle rounding reads calm and tactile. Larger objects (the line drawer, the bottom sheet, the chart frame, the one-tap-approval card, modals) use `lg` (0.75rem). Spend-table cells use the tightest radius (`sm`) so the dense grid stays crisp and aligned. Any imagery follows the same radius family so everything feels framed.

## Components

- **spend-table-cell** - one charge in the Excel-style ledger. Tabular figures, right-aligned, traces to its underlying Invoice line on tap. A cell on a line flagged over the band tints its value `over-band` clay; a line below the band tints `under-band` green; an unresolved line renders its value in muted `on-surface-variant` with a small "needs review" caption rather than a guessed number. The grid stays hairline-and-paper; color appears only on the few cells that carry a finding.
- **market-band-bar** - the trojan-horse visual: a horizontal pill showing the Market Band (low to high) as a `primary-container` fill on a `surface-container-high` track, with the band edges hairlined and a **you-marker** showing the grower's per-unit price. The marker is `primary` when on-band, `over-band` clay when above, `under-band` green when below. Labels in `label-caps`, the low/median/high and you-paid values in `num-tabular-strong`. When an Active Ingredient has too few points, the bar renders a flat "no reliable band yet" state in neutral tone with no marker judgment. Compose the fill reveal with a Magic UI motion primitive, tinted green.
- **finding-card** - the Recommendation unit in the Findings rail, in Terra's grammar: a situation line, one concrete action, the dollar impact (`num-tabular-strong`), severity, and a one-tap response. Impact reads `savings-positive` when it is money recovered (an under-credited rebate) and `over-band` clay when it is money at risk (an Overpayment). `act` cards carry the clay accent edge; `watch` is type-and-label only with at most a `watch-accent` gold marker; `info` is neutral. A low-confidence finding renders a "possible, needs confirmation" state in muted text and never asserts a dollar. The card is shaped to be executed later; v1 displays and records the tap (done / dismissed / overridden) and never transacts. The rail can animate in with Magic UI Animated List on first ingest.
- **buy-window-day** - a single day cell on the Buy Window Calendar. Carries a `primary` forecast marker for a buying window, a `watch-accent` gold dot for a Prepay close, and an `over-band` clay dot when a forecast line sits above the band. Today gets a `primary` ring. One plain-language action line in `caption` accompanies the active entry. No horizontal scroll for a single entity on a phone.
- **one-tap-approval-card** - the **earned-action pattern, built but demoted in v1**. A lifted `surface-container-lowest` card with a single `primary` primary action, a quiet `on-surface-variant` dismiss, the dollar impact in `num-tabular-strong`, and (when it ships) a visible dollar cap and the advisor badge showing the PCA can see it. In v1 this renders only in non-transacting contexts (mark for the dealer conversation, mark as claimed); it never fires a purchase or payment. Crown it with a tinted Border Beam for the single most important action, never more than one per screen.
- **advisor-badge** - a small `advisor` sky pill in `label-caps` marking that a PCA has read-only, entity-scoped visibility on the current view ("Manpreet can see this"). Identity only, never money or severity. Appears in shared views and on findings the advisor has confirmed or disputed, with the confirm/dispute state shown beside it.
- **coverage-indicator** - a thin pill / segmented bar showing how much of a farm's Input spend is attributed across every Ranch, Entity, and Account: `primary` for attributed, `watch-accent` gold for "needs review," `surface-dim` for not-yet-attributed, with the percentage in `num-tabular`. It makes legibility-coverage honest at Batth scale (unresolved lines are shown as a slice, never silently dropped) and is the leftmost tile of the KPI strip above the lens. Compose the count-up with Magic UI Number Ticker, tinted green.
- **generic-equivalent-compare** - the FR-7 comparison block, rendered inside the line drawer when a branded line has a known Generic Equivalent for the same Active Ingredient. It places the branded SKU and the generic SKU side by side, names the shared Active Ingredient in operator English (`label-caps`), shows each per-unit price in `num-tabular-strong`, and leads with the per-unit gap in `savings-positive` green labeled "(estimate)" while pre-action, because it is money the grower could keep. It is **legibility only, never a store**: it surfaces the equivalence and the gap and offers at most a non-transacting "flag for the dealer conversation" tap, never a buy button, a cart, a store price, or an order action (FR-7 surfaces but does not quote or source). When a branded line has **no known generic**, the block is omitted entirely, never shown as an empty or "none found" state that would read as an absence of savings.

## Do's and Don'ts

- **Do** make the data hero (Spend Table, Buy Window Calendar, Price Band Chart) the loudest thing on the screen; money is the story it tells, never a lone screaming hero number. Tabular figures everywhere a number appears.
- **Do** reach for a Magic UI component first and compose from it; tint every effect into the Terra greens and golds, and reserve motion and special effects for genuine moments (first finding, savings total settling, one-tap action), not ambient chrome.
- **Do** keep to three colors on a screen (green, clay, charcoal-on-paper); the savings, under-band, gold, and advisor tones are sparing, data-tied exceptions, not a fourth and fifth palette.
- **Do** show one data lens at a time; depth is one tap away; simplest view (Calendar) is home, the Excel bridge (Table) is the trust floor, the Chart is behind a tap.
- **Do** render unresolved work honestly: "needs review" and "possible, needs confirmation" sit in muted text with no asserted dollar, never a guessed number and never a grower-facing queue or wait time.
- **Do** honor `prefers-reduced-motion`; every animated Magic UI component must degrade to a clean static state.
- **Don't** render a store: no cart, no buy button, no store price as a call to action. v1 surfaces and recommends; the human decides.
- **Don't** label any pre-action Overpayment as "verified" or "saved"; the celebratory `savings-positive` green and the word "verified" are reserved for the loop-closed, attributable subset (recovered rebates first).
- **Don't** flood the Findings rail with low-confidence findings; a wall of clay or a flood of cards burns the trust the whole product runs on. Triage, then surface.
- **Don't** use pure white or pure black; the canvas is warm paper, the ink is warm charcoal.
- **Don't** add a status color beyond the system; `watch` is typography plus an optional gold marker, not a fill behind dollars; advisor sky is identity, never severity.
- **Don't** mix typefaces for hierarchy; Inter only, hierarchy from weight and size.
- **Don't** put kW, "SKU velocity," "active ingredient cardinality," or surface jargon on the surface; speak the grower's words (blocks, sets, acres, dealers, ranches, the band, prepay).
