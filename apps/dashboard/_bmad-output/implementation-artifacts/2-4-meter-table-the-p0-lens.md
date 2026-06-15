---
baseline_commit: 777f8e2
---

# Story 2.4: Meter table - the P0 lens

Status: done

## Story

As a grower,
I want a dense, sortable, filterable table of every meter,
so that I can live in the one Excel-style view I trust and find any pump fast.

## Acceptance Criteria

1. **Given** the Table lens, **When** rendered, **Then** it shows one dense row per meter with columns: real name, ranch, entity, rate schedule, legacy flag, this-cycle cost, demand charge ($), status, coverage.

2. **Given** any column header, **When** clicked, **Then** the table sorts by it; **Given** entity/ranch/rate, **When** applied, **Then** the table filters by them.

3. **Given** concerning cells, **When** rendered, **Then** they are traffic-light tinted (watch/act earn amber/clay) with the value/label also present (color never the only signal).

4. **Given** a meter with no reconciled billing, **When** rendered, **Then** its inventory row still shows with a coverage state, never blank or a fabricated cost.

5. **Given** a row click, **When** activated, **Then** the meter drawer opens; **Given** mobile, **When** rendered, **Then** the table degrades to a simplified sortable list; the table reads only the canonical shape.

### AC interpretation notes (read before coding)

This story replaces the lens region's placeholder (the seam Story 2.2/2.3 left) with the real **Table lens** - the P0 view the grower already trusts. It reads ONLY the canonical `MeterView[]` (the shared read edge `src/lib/dashboard/load.ts` shaped in 2.3), renders every meter as a row, and gates every figure through `coverageState` (AR-15). All derivations (the per-cell projection, the sort comparator, the filter predicate) are pure tested functions in `src/lib/dashboard/*`; the component only renders.

- **One dense row per meter, the AC1 columns (AC1):** real name (`m.name`), ranch (`m.ranchName`), entity (`m.entityName`), rate schedule (`m.rateSchedule`), legacy flag (`m.isLegacy`), this-cycle cost (the LATEST period's `printedTotalCents`), demand charge ($) (the latest period's `demandCents`), status (`m.status`, the master-sheet pump health), coverage (`m.coverageState`). The real account is SPARSE: ranch/entity are NULL on every meter (render the em-dash placeholder, never fabricate), status is NULL on every meter (render the placeholder), `isLegacy` is false on every meter today (so the legacy column shows no flags - honest; the AG4/AG5 meters not being marked legacy is an Epic 1 data gap to note, not fabricate here). 23 of 46 meters carry a real demand charge on their latest period; one meter has a NEGATIVE latest total (a NEM credit) - render it honestly ("-$X.XX"), never clamp to zero.
- **Sort by any column (AC2):** clicking a header sorts by that column; clicking again toggles asc/desc. Sort is **ephemeral local component state** (`useState`), NOT a nuqs key - the canonical nuqs keys are fixed at `lens|entity|ranch|rate|meter` and no component invents its own param (architecture). Nulls (unreconciled cost/demand, null ranch/entity/status) sort to the END regardless of direction so a real value is never hidden under a blank. Coverage sorts by a defined severity order (reconciled, needs_review, no_bill).
- **Filter by entity/ranch/rate (AC2):** the table READS the nuqs `entity`/`ranch`/`rate` keys and narrows its rows to the matching subset via a pure `filterMeters` predicate. The filter CONTROL UI (chips/selects), the KPI-cards-also-recompute behavior, the coverage-reflects-filter indicator, and the clear-filter affordance are **Story 2.6** - this story only makes the table HONOR an active filter key (so a deep link `?rate=AGC...` narrows it). When a filter matches no meters the table shows a calm "No meters match" (the clear-filter affordance arrives in 2.6). Keep the predicate pure + tested so 2.6 reuses it for the KPI recompute.
- **Traffic-light tinted concerning cells (AC3):** the ONLY honest concern signals in the data today are (a) `coverageState` - needs_review / no_bill cells render the one coverage render-treatment (the clay/alert-container tint for needs_review, a muted treatment for no_bill) WITH the explicit text label ("Needs review" / "No bill yet"), so color is never the only signal; and (b) `status === "BAD"` - the flagged master-sheet pump health renders the alert tint + the "BAD" label. Do NOT invent a $-threshold tint on the cost/demand cells (there is no $-at-risk / overpayment model until Epic 3 - "never invent a number"); the finding-driven watch/act severity tints arrive with the recommendation engine (Epic 3). The coverage union has ONE render treatment everywhere (table cell here, drawer in 2.5, map pin in 2.9, CSV in 2.7).
- **Unreconciled rows still render (AC4):** a needs_review / no_bill meter still shows its full inventory row (name/ranch/entity/rate/legacy/status from inventory); its cost and demand cells show the coverage treatment ("Needs review" / "No bill yet"), NEVER blank and NEVER a fabricated `$0`. A reconciled meter that legitimately carries no demand charge shows a neutral "None"/em-dash on the demand cell (honest absence, distinct from the unreconciled treatment).
- **Row click opens the drawer; mobile degrades (AC5):** a row click sets the nuqs `meter` key to the meter's id (the open-drawer key - the same seam the 2.3 mover card uses). The drawer that READS `meter` lands in Story 2.5; in this story the click sets the key (observable in the URL, drawer renders in 2.5). The dense multi-column table is desktop (`hidden md:table`); on mobile it degrades to a **simplified sortable list** (stacked cards: name + rate + this-cycle cost + coverage, with a compact sort `<select>` since there are no clickable headers on a card list). Both the table and the mobile list read the same sorted/filtered rows and both row-tap -> set `meter`. Tap targets >= 44px.
- **Canonical shape only (AC5):** read `MeterView` from `@/lib/dashboard/load` only; no raw-source import (keep `no-raw-source-in-ui.test.ts` green). Money via `formatUsd(cents)`, tabular figures (`.type-num`/`tnum`). Copy in `src/copy/en.ts` (`shell.table`), grower language, no kW/jargon, no em dashes, no exclamation.

## Tasks / Subtasks

- [x] **Task 1: Pure table derivations** - `src/lib/dashboard/table.ts`: `toMeterRow` (cost/demand gated on reconciled, `isFlagged` for status === "BAD"), `filterMeters` (exact match, AND across keys, empty/whitespace key is a no-op), `sortRows` (nulls last in BOTH directions, coverage by attention order, name tiebreak, pure). `SortKey`/`SortDir`/`MeterRow`/`MeterFilter` types. `table.test.ts`: 18 cases (projection reconciled-vs-unreconciled, reconciled-no-demand null, latest-period cost, BAD flag, negative NEM credit preserved; filter match/AND/no-match/empty-key/whitespace; sort each key, nulls-last asc+desc, coverage order, purity).
- [x] **Task 2: Meter table component** - `src/app/(app)/_components/meter-table.tsx` (client island): desktop `<table hidden md:block>` with the nine AC columns, clickable `<th>` + `aria-sort` (local `useState` sort, `defaultDir` numeric-desc); mobile `<ul md:hidden>` simplified card list + a sort `<select>` + direction toggle. Row/card click sets the nuqs `meter` key. Coverage/status cells use the shared treatment (tint + label). Money via `formatUsd`, tabular. Honest empty states (empty-farm vs "No meters match"). Reads `meters` + the nuqs `entity|ranch|rate` keys.
- [x] **Task 3: Coverage cell helper** - `src/app/(app)/_components/coverage-pill.tsx`: `coverageLabel(state)` + `<CoveragePill>` (one `CoverageState -> {tint, label}` mapping; needs_review clay, no_bill muted, reconciled calm; color always paired with the label). Reused by 2.5/2.7/2.9. Labels in `shell.table.coverage`.
- [x] **Task 4: Wire the Table lens** - `lens-region.tsx` branches: `table` -> `<MeterTable meters={meters} />`, others keep the honest placeholder; `id="energy-lens"` lives on whichever view renders. `energy-dashboard.tsx` passes `meters` to `<LensRegion meters={meters} />`.
- [x] **Task 5: Copy** - `src/copy/en.ts` `shell.table`: nine column headers, coverage labels, "No meters match", empty-farm line, demand "None", legacy flag, mobile sort labels, a11y labels.
- [x] **Task 6: Tests + validate** - `table.test.ts` 18 green; `npm run lint` clean, `npx tsc --noEmit` clean, `npm test` 50 files / 334 tests green; `no-raw-source-in-ui.test.ts` green. **Browser-verified** at :3000: 46 rows on the real account, all nine headers, sort on header click (cost-desc surfaces the $11,727.33 pump + $2,783.22 demand), `?rate=B1 Bus Low Use` narrows to 4, an unreconciled row reads "Needs review" (no fabricated $0.00), row click sets `?meter=<id>`, mobile shows 46 cards with the desktop table hidden; screenshots captured (desktop + mobile).

## Dev Notes

### Scope boundary

- **Table lens only.** This is the renderable P0 lens. The drawer that the row-click `meter` key opens is **Story 2.5** (this story only sets the key). The filter CONTROL UI + KPI-recompute-under-filter + clear-filter affordance + coverage-reflects-filter are **Story 2.6** (this story makes the table HONOR an active filter key and shows the bare "No meters match"). The chart is 2.8, the map 2.9, the calendar 3.5 - those lenses keep the 2.2 placeholder.
- **No new dependency.** Plain HTML `<table>` + Tailwind tokens; no table/grid library. visx is 2.8, maplibre 2.9.
- **No fabricated figure.** Unreconciled cost/demand -> coverage treatment, never `$0`. No invented $-at-risk threshold tint (Epic 3). The negative NEM-credit total renders honestly.

### What exists to build on

- **`src/lib/dashboard/load.ts`** `loadDashboard(prisma)` -> `{ farm, dataKind, meters: MeterView[] }`; `MeterView` carries id, name, serviceId, rateSchedule, isLegacy, status, coverageState, accountNumber, ranchName, entityName, latitude, longitude, gpm, isSolar, nemType, growerPumpId, periods[] (start, close, printedTotalCents, demandCents, peakKw, tariff, lineItems[]). The latest period = `periods[periods.length - 1]` (periods are start-ascending).
- **Real data shape (probed):** 46 meters; coverage {reconciled: 39, needs_review: 7}; status NULL on all; isLegacy false on all; ranch/entity NULL on all; lat/lng NULL on all; 23 meters carry a demand charge on their latest period; 2 meters have >=2 periods (both needs_review); 1 meter has a negative latest printedTotalCents (NEM credit); rateSchedule values are mixed and messy ("AGB Ag35+ kW Med Use", "AGA2", "AG5B Large Time-of-Use Agricultural Power", "AG4C", "B1 Bus Low Use", ...) - render verbatim, the rate filter (2.6) keys off these exact strings.
- **`src/app/(app)/_components/kpi-strip.tsx`** - the client-island pattern: `useQueryState("meter")` to set the open-drawer key, `formatUsd`, `.type-headline`/`.type-num tnum`, `cn`, token classes. **`src/app/(app)/_components/lens-region.tsx`** - the lens branch point (reads the `lens` key) + the `id="energy-lens"` scroll target. **`src/app/(app)/_components/energy-dashboard.tsx`** - the server component that loads + passes data down.
- **`src/components/ui/severity-badge.tsx`** - the badge treatment (act = alert-container, watch = weight-only, info = muted); model the coverage pill on it. **`src/lib/format/money.ts`** `formatUsd`. **`src/lib/recommendations/types.ts`** `CoverageState`, `PumpStatus`. **`src/app/globals.css`** tokens (`bg-alert-container`/`text-on-alert-container`, `border-outline-variant`, `bg-surface-container-*`, `.type-num`, `.type-label-caps`). **`src/lib/cn`** `cn`.
- **nuqs** keys: `entity`/`ranch`/`rate` (read for the filter; `useQueryState` with no default), `meter` (set on row click).

### Critical guardrails

1. **AR-15 / never invent a number.** Cost/demand render only for reconciled meters; needs_review / no_bill -> the coverage treatment (label + tint), never `$0`, blank, or a guess. A reconciled meter with no demand shows a neutral "None" (honest absence). The negative NEM-credit total renders as "-$X.XX".
2. **One coverage render treatment.** `CoverageState -> {tint, label}` defined once and reused by 2.5/2.7/2.9. Color always paired with the text label (the a11y floor).
3. **Canonical shape only in /app.** Read `MeterView` from `@/lib/dashboard/load`; keep `no-raw-source-in-ui` green.
4. **Pure derivations are tested.** `toMeterRow`/`filterMeters`/`sortRows` in `/lib/dashboard/table.ts` (no DB, no UI); the component only renders.
5. **Canonical nuqs keys only.** Filter reads `entity|ranch|rate`; row click sets `meter`. Sort is local state (not a new URL param). Switching sort never touches the filter or `meter` keys.
6. **Money in one place, tabular.** `formatUsd(cents)`; `.type-num`/`tnum`. No hand-formatted money.
7. **Copy in /copy, grower language**, tabular figures, no kW/jargon, no em dashes/exclamation.
8. **TS strict + no-`any` + `noUncheckedIndexedAccess`** - guard array access (latest period, sort pairs).
9. **Mobile-first / a11y.** Desktop dense table, mobile simplified list; tap targets >= 44px; `aria-sort` on headers; the row button announces "Open meter {name}".

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4] - the five ACs verbatim.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md#Components (meter-table)] - dense, sortable, filterable; every meter a row; tabular figures; concerning values tinted alert at high $-at-risk; mobile -> simplified sortable list. [#Color] coverage/severity: act = alert clay, watch = typography only (no third hue); color never the only signal.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md#Table lens] - sort by any column; filter by entity/ranch/rate; row click -> drawer; concerning values tinted alert; CSV export respects active filter (2.7); mobile -> simplified sortable list.
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture, #URL state, #State unions, #Money & Numbers] - RSC + client islands; canonical nuqs keys (lens|entity|ranch|rate|meter); coverageState one union one treatment; integer cents + formatUsd.
- [Source: _bmad-output/project-context.md] - read only the canonical shape; no fabricated numbers; data hero (the table) is the loudest, money the story it tells.
- [Source: src/lib/dashboard/load.ts, src/lib/dashboard/kpi.ts, src/app/(app)/_components/kpi-strip.tsx, src/components/ui/severity-badge.tsx] - the read edge, the pure-derivation pattern, the client-island pattern, the badge treatment.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` -> 50 files / 334 tests (+18 table.test.ts). Browser-verified via Playwright on the real account: 46 rows; headers METER/RANCH/ENTITY/RATE/LEGACY/THIS CYCLE/DEMAND CHARGE/STATUS/COVERAGE; "Needs review" present in withheld cells, no "$0.00"; cost-desc sort puts P054 ($11,727.33 / demand $2,783.22) on top; row click -> `?meter=cmq6is675009pg7spwr1axtqm`; `?rate=B1 Bus Low Use` -> 4 rows; `?rate=NOPE` -> "No meters match"; mobile -> 46 cards, desktop table hidden. Post-review re-check: 0 mobile cards with a stacked-duplicate coverage label.

### Completion Notes List

- **The Table lens is live**, replacing the 2.2/2.3 placeholder. `lens-region.tsx` now branches: `table` -> `<MeterTable>`, the other lenses keep the honest "coming" placeholder. `energy-dashboard.tsx` passes the canonical `MeterView[]` down. One dense row per meter, nine columns, sortable by any header (local state, not a URL key), honoring the nuqs entity/ranch/rate filter keys (controls land in 2.6).
- **AR-15 throughout:** cost/demand render a dollar figure ONLY for reconciled meters; an unreconciled meter reads its coverage state ("Needs review" / "No bill yet"), never a fabricated $0; a reconciled meter with no demand charge reads a neutral "None" (honest absence, distinct from withheld); the one negative NEM-credit total renders "-$X.XX", never clamped. All derivations are pure + tested in `table.ts`.
- **One coverage render treatment** (`coverage-pill.tsx`): needs_review = clay alert-container, no_bill = muted, reconciled = calm, color always paired with the text label - shared verbatim with the 2.5 drawer, 2.7 CSV (label), and 2.9 map pin.
- **Concern signals (AC3)** are the two real ones today: `coverageState === needs_review` (clay) and `status === "BAD"` (clay), both tinted AND labeled. No invented $-threshold tint (no $-at-risk model until Epic 3).
- **Mobile** degrades to a simplified sortable card list (name + rate + this-cycle cost + coverage pill) with a sort `<select>` + direction toggle; tap targets >= 44px.
- **Review fixes (3):** mobile unreconciled cards no longer stack a duplicate coverage label (the pill alone carries the state); the empty state distinguishes a genuinely empty farm ("No meters on this account yet") from a filter that excluded everyone ("No meters match"); the mobile rate subtitle treats an empty-string rate like null (parity with the desktop cell). Plus an unused copy string removed and the row-vs-name-button keyboard intent documented.

### File List

- `src/lib/dashboard/table.ts` (new) - pure `toMeterRow` / `filterMeters` / `sortRows` derivations.
- `src/lib/dashboard/table.test.ts` (new) - 18 derivation tests.
- `src/app/(app)/_components/meter-table.tsx` (new) - the Table lens client island (desktop table + mobile list).
- `src/app/(app)/_components/coverage-pill.tsx` (new) - the shared coverage render treatment (label + tint).
- `src/app/(app)/_components/lens-region.tsx` (modified) - branch the active lens to the table; pass `meters`.
- `src/app/(app)/_components/energy-dashboard.tsx` (modified) - pass `meters` to `<LensRegion>`.
- `src/copy/en.ts` (modified) - `shell.table` strings.

## Code Review (2026-06-09)

Adversarial review across three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Verdict: AC1 MET, AC2 MET (sort + filter-key honoring; the filter CONTROL UI is the licensed 2.6 deferral), AC3 MET (against the two honest concern signals available today - coverage needs_review + status BAD - each tinted and labeled; the finding-driven watch/act tints arrive with Epic 3, no fabricated threshold), AC4 MET (unreconciled rows render full inventory + the coverage state, never blank, never $0), AC5 MET (row click sets the `meter` seam the 2.5 drawer reads; mobile degrades to the simplified list; canonical shape only). No correctness or data-fidelity bugs found in the pure derivations: the null-last sort holds in both directions, the reconciled-no-demand vs unreconciled distinction is un-conflated, the negative NEM credit is preserved, RSC->client serialization is plain JSON, and the canonical-import law holds.

Triage: 5 fixes applied, 4 deferred, 0 dismissed-without-record.

### Fixed (patches applied this story)

- [Patch] **Mobile unreconciled cards stacked a duplicate coverage label** [meter-table.tsx] - Blind. On the 7 needs_review meters the mobile card rendered the withheld-cost label ("Needs review") and the coverage pill (the same words) stacked. Now the mobile cost figure renders only for reconciled meters; the pill alone carries the state for unreconciled. (Verified 0 stacked duplicates post-fix.)
- [Patch] **"No meters match" shown for a legitimately empty farm** [meter-table.tsx] - Edge. The zero-rows early return always read "No meters match", which is dishonest for a farm that has no meters at all (no filter set). Now distinguishes `meters.length === 0` ("No meters on this account yet") from a filter excluding everyone ("No meters match"). Latent on the 46-meter demo, real for an empty-inventory account.
- [Patch] **Mobile rate subtitle inconsistent with the desktop cell** [meter-table.tsx] - Edge. The desktop `TextCell` treats `""` and `null` alike (the dash); the mobile subtitle used `?? `, which only catches `null`, so an empty-string rate would render a blank line on mobile. Now uses the same emptiness test. Latent (no empty rates today).
- [Patch] **Unused copy string** [en.ts] - Auditor. Removed `shell.table.empty` ("Not on file"), which no cell used (cells use `emptyShort`).
- [Patch] **Row-vs-name-button keyboard intent undocumented** [meter-table.tsx] - Blind. Documented that the desktop clickable `<tr>` is a mouse-convenience target while the focusable name `<button>` is the keyboard / assistive-tech path to the same drawer (the a11y floor is met by the button; no `role`/`tabindex` hack on the `<tr>`).

### Deferred (recorded in deferred-work.md)

- [Defer] Clear-filter affordance + active-filter summary on the empty state - this is Story 2.6's AC3; wire it into the empty panel when 2.6 lands the filter controls. (Easy to reach against the real account: entity/ranch are null on every meter, so any entity/ranch filter matches zero.)
- [Defer] The legacy column shows no flags because `isLegacy` is false on every real meter (the AG4/AG5 codes are not marked legacy at import) - an Epic 1 upstream data gap; the table renders the canonical field honestly.
- [Defer] Component-level render-state tests (empty-farm vs no-match split, mobile withholding, `aria-sort`) - the pure derivations are unit-tested; add an RTL/Playwright test alongside the 2.6 filter UI.
- [Defer/examined-not-defects] The mobile select resetting direction on a new column matches desktop (`defaultDir`) and is not silently reachable on a same-value re-pick; `aria-live` on the 46-row table was declined (over-announce; the lens toggle already announces the lens).

## Change Log

- 2026-06-09: Implemented Story 2.4 - the Table lens (the P0 view). Added the pure tested table derivations (`table.ts`: projection, exact-match filter, null-last sort), the shared coverage render treatment (`coverage-pill.tsx`), and the dense sortable table + simplified mobile card list (`meter-table.tsx`), wired into the lens region over the canonical `MeterView[]`. Every figure gated on coverage (AR-15): withheld cells read their state, never a fabricated $0; the negative NEM credit renders honestly. Review: fixed the mobile stacked-duplicate label, the empty-farm-vs-no-match honesty, the mobile rate empty-string parity, an unused copy string, and documented the row keyboard path. lint + tsc + 334 tests + browser-verified (desktop + mobile) green. Status -> done.
