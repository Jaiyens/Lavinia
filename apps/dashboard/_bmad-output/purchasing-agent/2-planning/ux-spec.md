---
title: Terra Purchasing Agent
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# UX Specification: Terra Purchasing Agent

This is the UX specification for the Terra Purchasing Agent (Terra Tool 2), the farmer-side input-procurement agent. It is the experience contract that sits between the [PRD](./prd.md) (what we build and why), the [epics](./epics.md) (how the work is sliced), and the [design system](./design.md) (the visual vocabulary). It does not restate any of them. It defines the information architecture, the key screens, the screen-by-screen flows for every user journey, and the accessibility and honesty floors.

Every screen names the FR-N and UJ-N it realizes, verbatim from the PRD. Every component named is a Terra design-system component (from `design.md`) or a named Magic UI component composed into one. Terra voice holds throughout: plain operator English (blocks, sets, acres, dealers, ranches, pumps, the band, prepay), confident, not salesy, no exclamation marks, no em dashes, all copy in `/copy`. Numbers ranged as projections are labeled "(estimate)."

The product is Tool 2 on the same operating system the grower already knows from Tool 1. The grower must feel he turned on a new capability inside Terra, not opened a second app. So the shell, the rail, the lens toggle, and the three-views discipline are inherited whole, and only the data hero changes.

---

## 1. Information Architecture

### 1.1 The OS shell (inherited from Tool 1)

The Purchasing Agent lives inside the existing Terra shell. There is no new chrome to learn. The shell is the **three-zone inverted-L plus copilot** on the power surface, and a **single column with a Dock and a peeking sheet** on the phone. (NFR-6; Platform cluster.)

- **Agent rail** (`agent-rail`, 240px, left): the list of Terra tools as agents. The energy tool and the Purchasing Agent both sit here; the Purchasing Agent is the active agent (`primary` green marker) when the grower is in Tool 2. Turning the Purchasing Agent on happens from this rail, from the same home screen as the energy tool. (Story 1.1.)
- **Data hero** (fluid center): the active lens. The data leads, money lives inside it (NFR-8). The center stacks top to bottom: KPI / coverage strip, then the lens toggle, then the active lens, with the line / SKU detail arriving as a drawer overlay.
- **Findings rail** (`findings-rail`, 320px, right): the persistent list of pending Recommendations, carried straight from the Tool 1 OS shell (FR-11, UX-DR4). Always present on the power surface, peeking sheet on the phone.

### 1.2 The lens toggle across the three views

One lens at a time, simplest first, depth one tap away. This is the Tool 1 three-views discipline carried directly over. The toggle is a `label-caps` segmented control sitting under the KPI strip, three lenses:

| Lens | Default | Purpose | Realizes |
|---|---|---|---|
| **Buy Window Calendar** | Home (default on open) | What is coming to buy and when, graspable in seconds | FR-4, UX-DR1 |
| **Spend Table** | One tap | The Excel-style ledger, the trust floor | FR-13, UX-DR2 |
| **Price Band Chart** | One tap (also reachable from a band bar) | Per-unit trends against the band | FR-6, UX-DR3 |

The lens toggle never changes the data, only the view onto it. The same farm, the same spend, three readings. The grower lands on the Calendar (the hook), drops to the Table (to check it line by line in Excel terms), and taps into the Chart (to see the trend) only when he wants the depth.

### 1.3 The persistent Findings rail

The Findings rail is the constant. Whatever lens is active, the rail holds the pending Recommendations (FR-11). It is the spine that turns legibility into a checkable to-do list. A finding in the rail links to the cell, calendar entry, or band bar that produced it, so the grower can always trace a dollar back to the data. On the phone the rail collapses to a bottom sheet that peeks one finding (the highest-severity pending item) above the Dock, and pulls up to the full list.

### 1.4 Surface map

| Surface | Reached from | Purpose | Realizes |
|---|---|---|---|
| KPI / coverage strip | Standing header above every lens (inherited shell) | Coverage, the canonical identified-savings total (SM-1), and the budget entry point at a glance | SM-1, SM-5; FR-14 |
| Onboarding / connect a source | Turn on Purchasing Agent in the agent rail | Connect by invoice photo, PDF, or email forward; see first attributed spend and first finding the same day | UJ-1; FR-1, FR-2 |
| Buy Window Calendar (home) | Default lens on open | The buying calendar, graspable in seconds | UJ-3; FR-3, FR-4 |
| Spend Table | Lens toggle | The Excel-style cross-entity ledger | UJ-1, UJ-5; FR-13 |
| Price Band Chart | Lens toggle, or tap a band bar | Per-unit price history against the band | UJ-1, UJ-3; FR-6 |
| Finding card / Findings rail | Persistent right rail / phone bottom sheet | The display-only Recommendation list | UJ-1, UJ-2, UJ-3; FR-11 |
| Rebate-audit finding detail | Tap a rebate finding | The threshold math behind an owed rebate | UJ-2; FR-9, FR-12 |
| Spend-vs-budget (cross-entity) | KPI strip "budget" tile (2.0), or Spend Table summary | Forecast plus committed spend against budget, all entities | UJ-5; FR-14 |
| Advisor (PCA) view + confirm/dispute | Grower grants visibility; PCA opens shared scope | Read-only advisor view, confirm or dispute a flag | UJ-4; FR-15, FR-16 |
| Review queue (internal ops) | Terra ops only, never grower-facing | Resolve low-confidence work and feed it back | UJ-1, UJ-2 edge cases; FR-17 |

Modal / drawer depth never exceeds one level (the line / SKU detail drawer over a lens). The advisor view is a scope on the same surfaces, not a separate app.

---

## 2. Key Screens

Each screen below carries: purpose, layout, primary components (named design-system components and the Magic UI primitives they compose from), states (empty, loading, low-confidence, honest-coverage), and the FR / UJ it realizes.

### 2.0 KPI / coverage strip (the data hero header)

**Realizes:** the standing header above every lens; surfaces SM-1 (identified savings), SM-5 (coverage), and the FR-14 budget entry point. Not a stand-alone destination, the first band of the data hero, present on every lens and inherited from the Tool 1 shell.

**Purpose.** Before the grower reads any lens, a quiet, honest line tells him three things: how much of his spend is attributed (coverage), how much money the agent has identified (SM-1), and whether any entity is tracking over budget. It is the at-a-glance state of the farm, never a marketing banner, never a screaming number.

**Canonical SM-1 home.** The KPI strip is the **single canonical home of the identified-savings total (SM-1)**, shown once per surface as "$X identified (estimate)" in `num-tabular-strong`, never `verified-savings`-scale, because SM-1 is pre-action and never "verified." The Findings rail header echoes the same figure as a count-with-total ("4 findings, $X identified (estimate)") that **links up to the canonical KPI tile rather than computing its own**, so the number has one source of truth and can never disagree with itself across the two places the grower sees it.

**Layout.** A single horizontal strip sitting directly above the lens toggle, three tiles left to right: a **coverage** tile (the `coverage-indicator` with attributed / needs-review / not-yet-attributed shares), an **identified-savings** tile (the SM-1 total, labeled "(estimate)"), and a **budget** tile (the cross-entity budget position, the entry point to the spend-vs-budget view 2.7). On the phone the strip becomes a single horizontally-quiet row that collapses to the coverage tile plus a tappable summary, the budget and savings tiles reachable by tap, no number competing with the lens below it.

**Primary components.**
- `coverage-indicator` (design.md) as the leftmost tile, the count-up composed with **Magic UI Number Ticker**, tinted green, settling once.
- The identified-savings tile in `num-tabular-strong` with the "(estimate)" label in `caption`; **Number Ticker** on settle, never the `verified-savings` token (SM-1 is never verified).
- The budget tile as a plain `label-caps` summary ("on budget" / "1 entity over") that taps through to the spend-vs-budget view (2.7); an over-budget state carries the `over-band` clay marker and word, never a fill behind the dollars.

**States.**
- **Empty (pre-connect):** the strip is absent until the first attribution runs; no fabricated coverage or savings figure is ever shown on an empty farm.
- **Loading:** the coverage tile fills as attribution resolves; the savings tile settles last, after the Findings have triaged, so the number never jumps.
- **Low-confidence:** needs-review spend is the gold slice of the coverage tile and is **held out of the identified-savings total** (FR-17); the savings figure only ever sums findings the agent can defend.
- **Honest-coverage:** the coverage tile is always present wherever spend is summarized, so the grower reads the SM-1 total against the share of spend it was computed from, never a savings number divorced from its coverage (SM-5).

**Responsive collapse.** On the phone the strip is one quiet row above the lens toggle; coverage stays visible, the savings and budget tiles tuck into a tap so the lens remains the loudest thing on the screen (NFR-8).

### 2.1 Onboarding / connect a source

**Realizes:** UJ-1; FR-1 (ingest by photo, PDF, email forward), FR-2 (attribute to Ranch, Entity, Account). Activation target SM-3 (same-day legible table and first finding).

**Purpose.** The lowest-friction path from a stack of paper and a cluttered inbox to one legible, attributed ledger, with the first dollar finding surfaced the same day. The grower never types a line and never hands over a dealer login (FR-1, NFR-1).

**Layout (mobile-first).** A single value-honest connect-a-source screen, three equal-weight paths on one card, no wizard:

1. **Photo a stack**: opens the camera; multi-shot, one invoice per frame.
2. **Upload a PDF**: file picker.
3. **Forward your email**: shows the grower a dedicated forwarding address to send invoices to, with a copy control.

Below the three paths, a single honest line of copy frames the data use ("Your invoices stay yours. No dealer login, ever."). After the grower connects, the screen transitions to an **ingest progress** state, then reveals the first attributed spend and the first finding without a page change.

**Primary components.**
- The three-path card composed from **Magic UI Magic Card** (one card, three tappable zones), tinted into the warm palette, hairline `outline-variant`.
- Ingest progress as a **Magic UI Animated List** filling row by row as each invoice resolves ("West Ranch · Wilbur-Ellis · 14 lines read"), so the grower watches his paperwork become structured (the emotional beat of UJ-1).
- The first-finding reveal crowned with a single tinted-green **Magic UI Border Beam** on one `finding-card`, the only beam on the screen (design.md: Border Beam crowns the single first finding on onboarding).
- A `coverage-indicator` appears as soon as attribution runs, showing attributed / needs-review / not-yet-attributed as honest slices (FR-2; SM-5).
- The settling first-finding dollar uses **Magic UI Number Ticker**, tinted green, one moment only.

**States.**
- **Empty (pre-connect):** the three paths, no data hero yet, no fabricated preview. Copy: "Connect last season to see your whole input spend in one place."
- **Loading (ingesting):** Animated List filling; per-invoice rows resolve in place. No spinner-only dead state; the grower always sees progress against real invoice names.
- **Low-confidence:** a line the agent cannot read confidently shows as **needs review** in muted `on-surface-variant`, never a guessed number, and is excluded from any band comparison (FR-1, FR-17). The grower sees only the line state, never a queue, wait time, or SLA (FR-17). This is the UJ-1 blurry-photo edge case.
- **Honest-coverage:** the `coverage-indicator` shows unresolved lines as a `watch-accent` gold slice and not-yet-attributed as a `surface-dim` slice, never silently dropped (SM-5). A line that resolves to no clear Entity or Account is flagged for grower confirmation inline, correctable, and the correction persists (FR-2).

**Responsive collapse.** This is the canonical mobile-first screen. On the power surface the three paths sit as a centered card with the Animated List below; the agent rail and Findings rail are present but quiet until the first finding lands in the rail.

### 2.2 Spend Table

**Realizes:** UJ-1, UJ-5; FR-13 (all spend, filterable, CSV export), and surfaces FR-14 budget context. The Excel bridge, the trust floor (UX-DR2).

**Purpose.** The Excel-brained grower checks the agent line by line. Every dollar he ever spent on inputs, in one ledger he can filter, trace, and export. This is where skepticism is answered: every cell traces to its invoice line (FR-13).

**Layout.** SKUs (or Active Ingredients, toggleable) down the side, months across the top, charges in cells. A filter bar above the grid: **Entity · Ranch · Dealer · Active Ingredient** (FR-13). A summary row of `coverage-indicator` and total-spend tiles sits above the grid (Bento / Magic Card framing for the tiles only, never the dense grid). One-click **Export CSV** of the current filtered view, top-right.

**Primary components.**
- `spend-table-cell` for every charge: tabular figures, right-aligned, traces to its underlying invoice line on tap (opens the line drawer). A cell on a line over the band tints `over-band` clay; below the band tints `under-band` green; a needs-review line renders its value muted with a "needs review" caption, never a guessed number (design.md spend-table-cell).
- Summary tiles composed from **Magic UI Bento Grid** with **Number Ticker** for the settling totals, tinted green.
- The filter bar as a row of plain segmented controls and chips, `label-caps`.
- The line / SKU drawer (single-level overlay, `lg` radius, the one element that lifts) shows the invoice line, its attribution (Ranch, Entity, Account, Dealer), its normalized per-unit price, and a `market-band-bar`.

**States.**
- **Empty:** before any invoice is ingested, the table shows its frame with a single line: "Connect a source to fill this in." No fabricated rows.
- **Loading:** cells fill as ingestion resolves; partially filled months are honest (a month with no invoices yet is blank, not zero-filled).
- **Low-confidence:** needs-review cells in muted text with the caption, held out of totals that assert a finding, included in raw spend only where the dollar total is known (FR-17).
- **Honest-coverage:** the coverage tile is always visible at the top so the grower knows what share of spend is attributed at Batth scale (180-plus lines, many Accounts). Unresolved lines are a visible filter ("show needs-review"), never dropped (FR-13, SM-5).

**Responsive collapse.** On the phone the dense grid degrades to a **sortable, filterable list** (design.md Layout): one row per line, the month and charge inline, the filter bar becomes a sheet. The filter set and CSV export are preserved. No horizontal scroll is forced on the phone; the grower sorts and filters instead of panning a wide grid.

### 2.3 Buy Window Calendar (home)

**Realizes:** UJ-3; FR-3 (Bill of Materials forecast), FR-4 (buying windows and Prepay closes on the calendar). The home hook (UX-DR1).

**Purpose.** Graspable in seconds. What each block needs to buy and when, before the Dealer order sheet arrives. The first thing the grower sees, and the thing two real growers asked for in Tool 1: a calendar that reads in one glance.

**Layout.** A month grid for the active Entity. Each forecast Input sits on its buying window; a Prepay close lands as a gold marker; a forecast line sitting above the band carries a clay marker. Each active entry carries one plain-language action line in `caption` ("Buy your dormant-spray oil for the home ranch by Jan 15. Prepay closes Dec 20."). Today gets a `primary` ring.

**Primary components.**
- `buy-window-day` cells: `primary` forecast marker for a buying window, `watch-accent` gold dot for a Prepay close, `over-band` clay dot when a forecast line is above the band, `primary` today ring (design.md buy-window-day).
- A month/entity selector at the top in `label-caps`.
- Tapping a day or an entry opens the line drawer (the same single-level overlay as the Spend Table) showing the forecast quantity, the `market-band-bar`, the Prepay timing note (FR-10), and any Generic Equivalent (FR-7).
- When the branded line has a known Generic Equivalent for the same Active Ingredient, the drawer carries a **`generic-equivalent-compare`** block (design.md): the branded SKU and the generic SKU side by side, same Active Ingredient named in operator English, each with its per-unit price in `num-tabular-strong`, and the per-unit gap as the headline ("Same active ingredient, generic runs $X per unit less"). The gap reads `savings-positive` green because it is money the grower could keep, labeled "(estimate)" while pre-action (FR-7).
- The compare block is **legibility only, never a store**: it surfaces the equivalence and the gap and offers at most a non-transacting "flag for the dealer conversation" tap. It renders **no buy button, no cart, no store price, no order action** (FR-7 does not quote or source; NFR-3; design.md Do's and Don'ts).

**States.**
- **Empty:** a Block with no Crop Plan data produces no forecast lines, shown as an honest empty calendar for that scope with the line "No crop plan yet for this block," never a fabricated estimate (FR-3, NFR-4).
- **Loading:** the forecast recomputes when the Crop Plan changes (FR-3); during recompute the grid shows the prior forecast, not a blank.
- **Low-confidence:** a forecast line whose Active Ingredient has no reliable band carries no clay marker and no overpayment claim; its day cell is a plain `primary` forecast marker only (FR-3, FR-6, NFR-4).
- **No generic equivalent:** a branded line with no known Generic Equivalent shows **no compare block at all**, not an empty one and not a "none found" placeholder that reads as an absence of savings. The drawer simply omits the section; the grower sees the band read on its own (FR-7). v1 surfaces an equivalence only where one is genuinely known; it never implies a generic exists, and never goes shopping for one (sourcing is POST-MVP; design.md).
- **Honest-coverage:** a Prepay close with an ambiguous program term shows the buying window but labels the prepay note "possible, needs confirmation" rather than asserting a discount it cannot defend (FR-9, FR-17).

**Responsive collapse.** The calendar fits **a single Entity on a phone with no horizontal scroll** (FR-4, NFR-5). Multiple entities are reached by the entity selector, never by panning a wide multi-entity grid. The action line for the selected entry sits below the grid on the phone so it is always readable.

### 2.4 Price Band Chart (behind a tap)

**Realizes:** UJ-1, UJ-3; FR-6 (Market Band per Active Ingredient, single-grower, openable math). The trends view (UX-DR3).

**Purpose.** For the grower who wants the depth: how his per-unit price for one Active Ingredient has tracked against the band over the season. Behind a tap, never on the home view, consistent with the three-views discipline.

**Layout.** A chart frame (`lg` radius) for one chosen Active Ingredient: per-unit price history as a line, the Market Band (low to high) as a tinted `primary-container` zone behind it, the median as a hairline. Each purchase point is tappable to its invoice line. A header names the Active Ingredient in operator English and carries the single-grower disclosure ("Band built from your own invoices") so it is never read as a network benchmark (FR-6, NFR-4).

**Primary components.**
- The band zone and line composed from a charting primitive with the band fill tinted green; the band reveal uses a Magic UI motion primitive, tinted, one moment.
- `market-band-bar` repeated as the compact summary above the chart (low / median / high / you-paid in `num-tabular-strong`).
- "Open the math" control and **Export CSV**, both inheriting FR-6 (the grower can open the underlying math and export it).

**States.**
- **Empty:** an Active Ingredient the grower has never bought is not selectable; the chart only offers Active Ingredients with real lines.
- **Loading:** the chart frame and axis render first, the band and points settle in.
- **Low-confidence / no reliable band yet:** the headline honest state. An Active Ingredient with too few comparable points shows the **price history alone, no band zone, no marker judgment**, with the label "no reliable band yet" (FR-6, NFR-4). No Overpayment is ever charted against it (FR-8). This is the UJ-3 thin-product edge case made visual.
- **Honest-coverage:** the single-grower basis is always on the chart, never hidden.

**Responsive collapse.** Full-width chart on the phone; the `market-band-bar` summary stacks above it; the point detail opens the same line drawer.

### 2.5 Finding card and Findings rail

**Realizes:** UJ-1, UJ-2, UJ-3; FR-11 (display-only Recommendation in the grammar), FR-12 (loop closure). The persistent rail (UX-DR4).

**Purpose.** The rail is the one clear list of items to review, each with a dollar figure the grower can check, none acting on its own. The finding card is the Recommendation unit in Terra's grammar.

**Layout (card).** Top to bottom: the **situation** line (one sentence, plain English, e.g. "Your glyphosate on West Ranch ran above the band last spring"), the **action** (one concrete thing, e.g. "Send this line back to your dealer"), the **impactUsd** in `num-tabular-strong`, a **severity** marker, and a **one-tap response** (mark done / dismiss / override). Impact reads `savings-positive` green when it is money recovered (a rebate owed) and `over-band` clay when it is money at risk (an Overpayment) (design.md finding-card).

**Layout (rail).** Pending findings stacked by severity (`act` first, then `watch`, then `info`), each card linking back to the cell, calendar entry, or band bar that produced it. A small summary at the top of the rail ("4 findings, $X identified (estimate)") **echoes the canonical identified-savings total (SM-1) from the KPI strip (2.0), it does not compute its own**, so the figure has a single source of truth and the rail count and the KPI tile can never disagree. The rail header links up to the KPI tile; the KPI strip remains the canonical SM-1 home.

**Primary components.**
- `finding-card` (design.md), one per Recommendation.
- `act` cards carry the clay accent edge; `watch` is type-and-label only with at most a `watch-accent` gold marker; `info` is neutral (design.md).
- The rail fills with **Magic UI Animated List** on first ingest, one moment (design.md).
- The echoed identified-savings total uses **Number Ticker**, tinted, settling once, reading the same SM-1 figure as the canonical KPI tile (2.0).
- One-tap response composed from the `one-tap-approval-card` pattern **only in its non-transacting form** (mark for the dealer conversation, mark as claimed); it never renders a buy button, cart, or store price (design.md Do's and Don'ts; NFR-3).

**States.**
- **Empty:** "No findings yet. Connect more invoices to check them against the band." Never a fabricated finding to fill the rail.
- **Loading:** Animated List fills as findings resolve; the total settles last.
- **Low-confidence:** a finding the agent cannot defend renders the **possible, needs confirmation** state in muted `on-surface-variant` and **never asserts a dollar** (FR-9, FR-11, NFR-9). It does not count toward the identified-savings total (FR-17). This is honesty, not a bug state.
- **Loop-closed (verified):** once a relevant invoice posts, the card fills its `result` with predicted versus actual (FR-12). Only the loop-closed, attributable subset earns the `savings-positive` green, the `verified-savings` type token (design.md), and the word "verified" (NFR-4). A done-without-posted-invoice card stays open for loop closure and counts only toward identified savings, never "verified," and never renders `verified-savings` (FR-12).

**Anti-pattern guard.** The rail must not flood with low-confidence cards; Recommendation count is not a goal (SM-C3, NFR-4). Triage before surfacing. A wall of clay is a triage failure (design.md).

**Responsive collapse.** The rail becomes a **peeking bottom sheet** on the phone (design.md Layout): the single highest-severity pending finding peeks above the Dock; pulling up reveals the full list. The card layout is identical; only the container changes.

### 2.6 Rebate-audit finding detail

**Realizes:** UJ-2; FR-9 (audit against Rebate / Program Pricing, flag under-credited Rebates), FR-12 (loop closure on the credit). The capability nobody builds grower-side.

**Purpose.** The grower reads "you earned this rebate and were never credited, $X" and recognizes it as true because it is built from invoices he recognizes (UJ-2 climax). The detail shows the threshold math so the recognition is earned, not asserted.

**Layout.** Opened from a rebate finding in the rail. Top: the situation ("You crossed the early-fill threshold on the [program] program last fall"). Below: the **threshold math**, the program tier and threshold, the grower's ingested volume against it, and the credit that should have posted but did not, traced to the invoices that crossed it (FR-9). The **action**: "Claim the under-credited rebate of $X from [Dealer]." The impact in `num-tabular-strong`, `savings-positive` green because a recovered rebate is the cleanly attributable, celebratory case (SM-1b; design.md). A one-tap **mark as claimed** (non-transacting), which moves the finding to pending-claimed to wait for loop closure (UJ-2 resolution).

**Primary components.**
- A `finding-card` expanded into the detail drawer (single level, `lg` radius).
- The threshold math as a small, openable ledger of invoice lines (every figure traceable, NFR-4).
- `one-tap-approval-card` in non-transacting "mark as claimed" form, crownable with a single tinted Border Beam.
- A `savings-positive` impact figure with Number Ticker on reveal.

**States.**
- **Loading:** the math assembles from the contributing invoices.
- **Low-confidence:** when the program terms are ambiguous or not machine-readable, the detail shows the **possible, needs confirmation** state at lower confidence and **does not assert a dollar figure**; the item is routed to the internal Review queue (FR-9, FR-17). The grower sees only "possible, needs confirmation," never a queue or wait time (UJ-2 edge case).
- **Loop-closed:** once a later invoice shows the credit posting, the finding fills its `result` (predicted versus actual) and this is the first figure that earns "verified" (SM-1b, FR-12). This is the one place the `verified-savings` type token (design.md) is permitted, settling once with Number Ticker, still inside the detail and never larger than the threshold ledger that earned it.

**Responsive collapse.** Full-screen drawer on the phone, the threshold ledger scrolls, the mark-as-claimed action pinned at the bottom within thumb reach.

### 2.7 Spend-vs-budget (cross-entity view)

**Realizes:** UJ-5; FR-14 (Spend Budget per Entity, Forecast plus Committed spend tracked, over-budget attributed). Cross-entity spend control the grower never had.

**Purpose.** Before the season commits, see forecast plus committed spend against budget across every Entity and Account in one place, and see which entity is tracking over and why.

**Layout.** A per-Entity summary, one row per Entity: the Spend Budget, the Forecast spend, the Committed spend, and the position against budget. An over-budget Entity is flagged `over-band` clay with the overage attributed to the **driving Ranches and Dealers** (FR-14). Reached from the KPI-strip "budget" tile (2.0) or from the Spend Table summary. A control to **set or review a Spend Budget** per Entity.

**Primary components.**
- A per-Entity ledger using `num-tabular` / `num-tabular-strong` throughout; budget, forecast, and committed columns align to the digit.
- Over-budget rows carry the `over-band` clay edge; the attribution ("driven by Home Ranch · Nutrien, +12% on fertilizer (estimate)") sits inline.
- A budget-set control (plain input, no fabricated default).
- Export to spreadsheet (NFR-7).

**States.**
- **Empty / budget not set:** an Entity with no Spend Budget shows forecast and committed spend with budget marked **"not set,"** never a fabricated target (FR-14, NFR-4). This is the UJ-5 edge case.
- **Loading:** committed spend updates at the obligating event (signed Dealer order sheet line, accepted Prepay, posted Invoice); a still-projected Bill of Materials line counts as Forecast spend, not Committed (FR-14, Glossary). The view shows which is which.
- **Low-confidence:** forecast lines built on partial Crop Plans are labeled "(estimate)" and the affected Block's contribution is shown as forecast, not committed.
- **Honest-coverage:** the cross-entity total only sums attributed spend; the coverage share carries over from the Spend Table so the grower knows the budget view is as complete as his attribution (SM-5).

**Responsive collapse.** The per-Entity rows stack as cards on the phone, one Entity per card, the over-budget attribution and the set-budget control inline. No wide multi-column table forced on a phone.

### 2.8 Advisor (PCA) read-only view plus confirm / dispute

**Realizes:** UJ-4; FR-15 (grant read-only, Entity-scoped visibility, revocable), FR-16 (confirm or dispute a flagged line). Arm the advisor, do not route around her.

**Purpose.** Manpreet, the PCA, sees the same Spend Table, Findings, and Recommendations Harjit sees, scoped to the Entities he shared, and can confirm a flag is correct or note a false positive. Her confirmation feeds the retrospective accuracy metric (SM-2).

**Layout (grower side, granting).** A share control on the Entity scope: choose Entities, grant a PCA read-only visibility, revoke at any time. The grant is plainly framed ("Manpreet can see the spend and findings for these entities. She cannot change anything or act for you. You can revoke anytime."). (FR-15.)

**Layout (PCA side).** The same three lenses and Findings rail, **read-only**, scoped to the shared Entities only. Every shared view carries the `advisor-badge` sky pill ("you are viewing as advisor, read-only"). On each flagged Overpayment or Rebate finding, two controls: **confirm true** and **dispute** (FR-16). A disputed finding records the PCA's note (e.g. "specialty adjuvant, the band mispriced this") visible to the grower (UJ-4 climax).

**Primary components.**
- `advisor-badge` (design.md): `advisor` sky, identity only, never money or severity, on every shared view and on findings the advisor has acted on, with the confirm / dispute state beside it.
- The grower-side grant control: plain toggles per Entity, a revoke action.
- Confirm / dispute controls on each `finding-card` in the PCA scope, read-only everywhere else.

**States.**
- **No advisor granted:** the grower view shows no advisor badge; the share control invites granting, never pre-fills a PCA.
- **Read-only enforced:** the PCA cannot edit data, set a Spend Budget, or act on a Recommendation; every non-confirm/dispute control is absent, not merely disabled, in the PCA scope (FR-15, NFR-3).
- **Revoked:** revoking ends the PCA's access immediately and leaves no retained copy (FR-15, NFR-7). The UJ-4 revoke edge case: access ends at once.
- **Low-confidence:** a "possible, needs confirmation" finding is visible to the PCA but carries no asserted dollar; she can still note it.

**Responsive collapse.** The PCA is on her own device, often a phone. The shared scope uses the same mobile shell (Dock, peeking findings sheet) with the advisor badge persistent in the header so she always knows the scope is read-only.

### 2.9 Review queue (internal ops, never grower-facing)

**Realizes:** UJ-1 and UJ-2 edge cases; FR-17 (route low-confidence work, hold out of the numbers, feed resolved value back). The human side of the HITL posture.

**Purpose.** A Terra ops work surface, **never shown to the grower**. Blurry or unreadable invoice lines (FR-1), un-normalizable units (FR-5), and ambiguous Rebate terms (FR-9) route here, are held out of any asserted dollar figure, and the resolved value flows back into the pipeline.

**Layout (internal).** A work list of queue items, each with the affected line, the source invoice image, the reason it routed (unreadable, un-normalizable unit, ambiguous Rebate term), and a resolution control (confirm unit and quantity, normalize the unit, or confirm the Rebate term). Resolving writes the value back to the line, which re-enters normalization or the Rebate audit (FR-17). This surface is functional, not part of the grower's design language; it is an ops tool.

**Primary components.**
- An internal queue list (plain, ops-grade, not the warm grower aesthetic).
- A line-resolution form per item.
- A back-reference to the source invoice image.

**States (the only ones that matter, all grower-facing-by-proxy).**
- **Grower-facing reflection:** the grower **never sees this queue, a wait time, or an SLA** (FR-17). The affected line shows only **"needs review"** (an invoice line) or **"possible, needs confirmation"** (a Rebate term) until it resolves.
- **Held out of the numbers:** a pending item is never counted toward identified savings (SM-1) or attributed realized savings (SM-1b) and is never surfaced as a confidently asserted Recommendation (FR-17, NFR-4).
- **Resolved:** the grower-facing line state clears from "needs review" / "possible, needs confirmation" to resolved, and the line can now contribute to a band comparison or an asserted Rebate dollar where it could not before (FR-17).

**Out of scope (FR-17).** No grower-facing review surface, self-service confirmation flow, or turnaround SLA. This screen is internal-ops-only in v1.

---

## 3. User-journey flows, screen by screen

Each flow maps a PRD user journey (UJ-1..UJ-5) to a concrete path across the screens above.

### UJ-1. Harjit connects last season and sees his whole input spend on one screen for the first time

1. **Agent rail (home).** Harjit, already authenticated through his Terra account, turns on the Purchasing Agent from the same home screen as the energy tool. (Story 1.1.)
2. **Onboarding / connect a source (2.1).** He forwards last season's invoices from his email and photos a stack of paper. He never types a line, never gives a dealer login (FR-1).
3. **Onboarding ingest state (2.1).** The Animated List fills as each invoice resolves to a Ranch, Entity, and Account on the shared data model (FR-2). The `coverage-indicator` shows the attributed share honestly.
4. **Spend Table (2.2).** Meters of paperwork collapse into one Excel-style ledger: SKUs down, months across, dollars in cells, filterable by Entity, Ranch, Dealer, Active Ingredient (FR-13). He filters to West Ranch to check it line by line.
5. **Finding card / Findings rail (2.5).** The same day, the first finding lands: a glyphosate line on West Ranch at $X per unit against a band of $Y to $Z, flagged over the band, crowned with one Border Beam, the math openable line by line (FR-8, FR-11; SM-3 same-day activation).
6. **Resolution.** Harjit has one legible ledger and a first checkable dollar finding, plus a Findings rail of items to review, none acting on its own.
7. **Edge case (blurry photo).** A line too blurry to read shows **needs review** in muted text and routes to the internal Review queue (2.9); Harjit sees only the line state, never a queue or wait time (FR-1, FR-17).

### UJ-2. The agent catches a rebate Harjit earned and was never credited

1. **Findings rail (2.5).** On the home screen, reviewing the rail, Harjit sees a `savings-positive`-green rebate finding.
2. **Rebate-audit finding detail (2.6).** He opens it: "You crossed the early-fill threshold on the [program] program, $X never credited," with the threshold math traced to the invoices he recognizes (FR-9, UJ-2 climax).
3. **One-tap response (2.6).** He taps **mark as claimed** (non-transacting). The Recommendation moves to pending-claimed (FR-11; UJ-2 resolution).
4. **Loop closure (2.6 / 2.5).** When the credit posts on a future invoice, the finding fills its `result` predicted versus actual and becomes the first "verified" figure (FR-12; SM-1b).
5. **Edge case (ambiguous program).** If the program terms are ambiguous, the finding shows **possible, needs confirmation** at lower confidence, asserts no dollar, and routes to the Review queue (2.9); Harjit sees only the line state (FR-9, FR-17).

### UJ-3. Harjit reads the Dealer order sheet against the band before he signs it

1. **Buy Window Calendar (2.3, home).** With the prior season ingested, Harjit opens the calendar and sees what each block needs and when each Prepay window closes, forecast from the Bill of Materials (FR-3, FR-4). The Crop Plan that feeds this forecast is net-new, not reused from Tool 1 (Tool 1's `Crop` carries no program or growth stage); per the recommended v1 path the calendar is forecast from a repeat-buy projection off prior-season Invoices first, with a net-new `CropProgram` ingestion as the later path to the full agronomic forecast ([architecture §4.6](../3-solutioning/architecture.md)).
2. **Line drawer (2.3).** He taps a forecast Input and reads it against its `market-band-bar` and last year's paid price, with the Prepay timing note (FR-10) and, where one exists, the `generic-equivalent-compare` block showing the branded and generic SKUs side by side with the per-unit gap (FR-7). A line with no known generic shows no compare block at all, never a "none found" placeholder.
3. **Findings rail (2.5).** Three lines on the Dealer order sheet sit above the band; each is a Recommendation with the dollar gap and, where a generic exists, the same per-unit comparison, offering only a non-transacting flag for the dealer conversation, never a buy button or store price (FR-7, FR-8, NFR-3).
4. **Price Band Chart (2.4).** For a line he wants to understand, he taps into the chart to see his per-unit history against the band, single-grower basis disclosed (FR-6).
5. **Resolution.** He sends the Dealer order sheet back with three lines flagged, keeping his dealer and his PCA, buying from knowledge. The acted-on buy recommendations queue to close the loop when the invoices post (FR-12).
6. **Edge case (no clean band).** A thin or specialty line shows **no reliable band yet** on its band bar and in the chart; no overpayment is flagged on it (FR-6, FR-8).

### UJ-4. Manpreet, Harjit's PCA, sees what the agent sees

1. **Grower grant (2.8, grower side).** Harjit grants Manpreet read-only visibility scoped to chosen Entities (FR-15).
2. **Advisor view (2.8, PCA side).** Manpreet opens the shared scope on her own device and sees the same Spend Table (2.2), Findings (2.5), and Recommendations Harjit sees, limited to the shared Entities, every view carrying the `advisor-badge` (FR-15). She can see the band math and the rebate audit.
3. **Confirm / dispute (2.8).** She confirms two flagged lines and disputes one false positive (a specialty adjuvant the band mispriced), recording her note against the finding, visible to Harjit (FR-16; UJ-4 climax).
4. **Resolution.** Her confirmations feed the retrospective accuracy metric (SM-2). She is never asked to approve a purchase, because v1 does not transact (FR-16, NFR-3).
5. **Edge case (revoke).** Harjit revokes her visibility; her access ends immediately with no retained copy (FR-15).

### UJ-5. Harjit checks the budget across all six entities before the season commits

1. **KPI strip / budget tile (2.0).** Harjit opens the spend-vs-budget view from the KPI strip budget tile or the Spend Table summary.
2. **Spend-vs-budget (2.7).** He sets or reviews a Spend Budget per Entity and sees Forecast spend plus Committed spend against budget across every Entity and Account in one place (FR-14).
3. **Over-budget attribution (2.7).** One Entity is tracking 12 percent over its fertilizer budget (estimate); the view flags it `over-band` clay and attributes the overage to the driving Ranches and Dealers (FR-14).
4. **Export (2.7 / 2.2).** He exports the view to a spreadsheet (FR-13 CSV, NFR-7).
5. **Resolution.** Harjit has cross-entity spend control he never had, in plain operator English.
6. **Edge case (no budget set).** An Entity with no Spend Budget shows forecast and committed spend with budget marked **"not set,"** never a fabricated target (FR-14).

---

## 4. Accessibility and honesty notes

### 4.1 WCAG AA

- **Contrast.** All text meets WCAG AA against warm paper. `over-band` clay on `over-band-container`, `savings-positive` on `savings-positive-container`, and muted `on-surface-variant` for needs-review states are all verified to AA (verify each token pair at build time). Color is never the only signal: the over-band state carries the clay edge **and** a label, needs-review carries muted text **and** a "needs review" caption, advisor carries the sky pill **and** the "read-only" word.
- **Tap targets.** Minimum 44px on the phone for every interactive element: lens toggle tabs, filter chips, finding-card one-tap response, the Dock, calendar day cells (FR-4 graspable on a phone implies thumb-reachable controls).
- **Focus traversal.** Reading order on every surface: KPI strip, lens toggle, active lens, then Findings rail. The line drawer traps focus while open and returns it on close. The lens toggle is keyboard-operable as a tablist.
- **Labels and roles.** Every cell, marker, and badge has a role and state label. A `spend-table-cell` over the band announces "above the band, $X, traces to invoice line." The coverage-indicator announces its attributed / needs-review / not-yet-attributed shares. The advisor badge announces "advisor read-only scope."
- **Export as an accessibility path.** CSV export (FR-13) is itself an accessibility affordance for the Excel-brained grower and for screen-reader users who prefer their own tools.

### 4.2 Reduced motion

Every animated Magic UI component degrades to its static state under `prefers-reduced-motion` (design.md; NFR honoring reduced motion):

- **Animated List** (onboarding ingest, Findings rail fill) renders the final list immediately, no row-by-row reveal.
- **Number Ticker** (savings total, coverage count) renders the final figure immediately, no count-up.
- **Border Beam** (first finding, one-tap-approval crown) renders a static tinted edge, no traveling beam.
- **Band reveal** (Price Band Chart, market-band-bar fill) renders the filled band immediately, no grow animation.

No motion is load-bearing; every state is fully legible static.

### 4.3 Tabular figures

All numeric, dollar, per-unit, and quantity values use tabular figures (`num-tabular` / `num-tabular-strong`, `fontVariantNumeric: tabular-nums`), non-negotiable on the Spend Table, the market-band bars, the budget summary, and the Findings rail (design.md Typography; NFR-8). Per-unit prices, band lows and highs, and cell charges align to the digit down a column so the Excel-brained grower can scan them like a spreadsheet. Money is the story but never the loudest or largest element; the data hero leads (NFR-8).

### 4.4 Honest-coverage and no-reliable-band-yet treatment

The product's trust runs on never asserting a number it cannot defend (NFR-4, NFR-9). Three honest treatments are first-class UX states, not error states:

- **Honest coverage.** The `coverage-indicator` is present wherever spend is summarized (onboarding, Spend Table, budget view). Attributed spend is `primary`, needs-review is `watch-accent` gold, not-yet-attributed is `surface-dim`. Unresolved lines are always a visible slice and a filter, **never silently dropped** (FR-2, FR-13; SM-5). Legibility stays honest at Batth scale (180-plus lines, many Accounts).
- **No reliable band yet.** An Active Ingredient with too few comparable points renders a flat neutral state on the `market-band-bar` and shows price history alone on the Price Band Chart, with the label "no reliable band yet" and **no marker judgment and no Overpayment** (FR-6, FR-8, NFR-4). The single-grower basis ("band built from your own invoices") is always disclosed and never presented as a network benchmark (FR-6; SM-C1).
- **Needs review / possible, needs confirmation.** A line the agent cannot read confidently, an un-normalizable unit, or an ambiguous Rebate term sits in muted `on-surface-variant` with its honest caption, **asserts no dollar**, and is held out of every total and Recommendation until the internal Review queue resolves it (FR-1, FR-5, FR-9, FR-17). The grower never sees a queue, a wait time, or an SLA, only the line state (FR-17). These states are deliberately quiet so an unresolved line never shouts a number it cannot defend (design.md Colors).

These three treatments are the visible spine of the honest-number discipline (NFR-4): the agent surfaces and recommends, the human decides, and the design never renders a store, a buy button, or a "verified" label on a number that has not closed the loop.
