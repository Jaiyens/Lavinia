---
baseline_commit: 0da11e4
---

# Story 2.6: Rollup and filter

Status: done

## Story

As a grower,
I want to filter the whole dashboard down to an entity, ranch, or rate,
so that 183 meters stay usable and I can study one slice at a time.

## Acceptance Criteria

1. **Given** an entity/ranch/rate filter, **When** applied via nuqs, **Then** both the KPI cards and the table recompute to that subset; clearing returns to the whole farm.

2. **Given** money rollups, **When** computed, **Then** they count only covered (reconciled) meters, and the coverage indicator reflects the active filter.

3. **Given** a filter matching no meters, **When** applied, **Then** the lens shows "No meters match" with a clear-filter affordance.

### AC interpretation notes (read before coding)

This story adds the filter CONTROL surface (the seam 2.4 left: the table already HONORS the nuqs `entity`/`ranch`/`rate` keys) and makes the KPI strip recompute under the same keys (FR-11). The architecture's law: every component reads/writes the SAME fixed nuqs keys (`lens|entity|ranch|rate|meter`); no new param names; filtering never touches `lens` or `meter`.

- **KPI recompute (AC1, AC2) - the central change:** `KpiStrip` currently receives a server-computed `KpiStrip` object built from ALL meters (`energy-dashboard.tsx` line ~28). Change its contract to receive the raw `meters: MeterView[]` and compute client-side in a `useMemo`: `computeKpiStrip(filterMeters(meters, { entity, ranch, rate }))` with the three keys read via `useQueryState`. Both `computeKpiStrip` (kpi.ts) and `filterMeters` (table.ts) are pure, DB-free functions - importable into a client island as-is. Coverage then reflects the filter automatically (`{ loaded, total }` are computed on the filtered array), and money rollups already count only reconciled meters inside `computeKpiStrip` (AR-15). Remove the server-side `computeKpiStrip` call from `energy-dashboard.tsx`. Do NOT use a server action for this (sub-second NFR-6; 46-183 meters is trivial client math).
- **Filter controls (AC1):** a `FilterBar` client island rendered between the lens toggle and the lens region. One control per dimension (entity, ranch, rate), each a native `<select>` (the house pattern - the mobile sort select in `meter-table.tsx`; no new dependency, no combobox library) with a `type-label-caps` label and an "All" default option. Options come from a pure tested `filterOptions(meters)` derivation: distinct non-null/non-empty values, sorted, per dimension. **A dimension with zero distinct values renders NO control** (the real account has ranch/entity null on all 46 meters, so today only the Rate select shows - honest, not a dead dropdown). Selecting "All" writes `null` to the key (clears it from the URL); selecting a value writes it verbatim (rate strings contain spaces - nuqs handles encoding; values must match `filterMeters`' exact-match semantics).
- **Clear affordance (AC1, AC3):** when any of the three keys is active, the FilterBar shows a "Show whole farm" clear button that nulls all three keys in one action (and ONLY those three - `lens`/`meter` survive). The table's "No meters match" empty state (built in 2.4) gains the same clear-filter button (the 2.4 deferred item). Easy to reach on the real account: any entity/ranch value matches zero meters... but since entity/ranch render no control today, the no-match state is reached via a stale deep link (e.g. `?rate=NOPE`) - still must work.
- **Rollup honesty (AC2):** no new money math. `computeKpiStrip` already withholds unreconciled meters from sums and hides the sparkline/delta/mover below 2 covered periods. Filtering just narrows its input. The coverage line ("N of M meters loaded") must read the FILTERED counts (loaded reconciled-in-subset, total subset size).
- **Drawer interaction:** the `MeterDrawer` keeps receiving the FULL meters array (a deep-linked `?meter=` for a filtered-out meter still opens - verified behavior in 2.5). Do not move it behind the filter.
- **Mover card under filter:** the biggest-mover card computes on the filtered subset (automatic). With the real data (only 2 multi-period meters, both needs_review) it stays hidden - honest.
- **A11y / design:** selects >= 44px tall, labeled (visible label + `aria-label` where needed); the active-filter state is visible (the select shows the chosen value); the clear button is a secondary-style control (one primary per screen stays the lens). Tokens only; copy in `src/copy/en.ts` (`shell.filter`), grower language, no em dashes/exclamation.

## Tasks / Subtasks

- [x] **Task 1: Pure filter options** - `src/lib/dashboard/filters.ts`: `filterOptions(meters: MeterView[]): { entities: string[]; ranches: string[]; rates: string[] }` - distinct, non-null/non-empty (trimmed), sorted (localeCompare). Colocated `filters.test.ts`: dedupe, null/empty skipped, sort order, empty input, whitespace-only values skipped. (AC1)
- [x] **Task 2: KPI strip recomputes under filter** - change `KpiStrip` props from `{ data: KpiStripData }` to `{ meters: MeterView[] }`; inside, read `entity`/`ranch`/`rate` via `useQueryState` and `useMemo` the strip: `computeKpiStrip(filterMeters(meters, { entity, ranch, rate }))`. Update `energy-dashboard.tsx`: drop the server-side `computeKpiStrip` call, pass `meters` to `<KpiStrip>`. Coverage indicator now reflects the filter (AC2). (AC1, AC2)
- [x] **Task 3: FilterBar client island** - `src/app/(app)/_components/filter-bar.tsx`: renders one labeled `<select>` per dimension THAT HAS OPTIONS (from `filterOptions`), "All ..." default, writes the nuqs key (null on "All"); a clear button ("Show whole farm") visible only when a filter is active, nulling exactly `entity`/`ranch`/`rate`. Selects min-h 44px, house select styling (the meter-table mobile sort select). (AC1, AC3)
- [x] **Task 4: Wire + empty-state clear affordance** - `energy-dashboard.tsx`: mount `<FilterBar meters={meters} />` between `<LensToggle />` and `<LensRegion />`. `meter-table.tsx`: the "No meters match" empty panel gains the same clear-filters button (nulls the three keys; only when a filter key is actually active - the empty-farm message keeps no button). (AC1, AC3)
- [x] **Task 5: Copy** - `src/copy/en.ts` `shell.filter`: labels per dimension ("Entity", "Ranch", "Rate"), all-option labels ("All entities", "All ranches", "All rates"), clear button ("Show whole farm"), a11y labels. (AC1, AC3)
- [x] **Task 6: Tests + validate** - `filters.test.ts` green; lint + tsc + full vitest green. Browser-verify on the real account: the Rate select shows the distinct real rates and no Entity/Ranch control renders; picking a rate narrows the table AND the KPI spend + coverage line to the subset (e.g. `?rate=B1 Bus Low Use` -> 4 meters, coverage "N of 4 meters loaded"); "Show whole farm" returns to 46 with full totals and leaves `lens`/`meter` intact (test with an open drawer); `?rate=NOPE` shows "No meters match" + the clear button, and clicking it restores the farm. (AC1-3)

### Review Findings

- [x] [Review][Patch] filterOptions trims values but filterMeters compared exact against the untrimmed field; an offered option could exclude the meter that produced it (extraction-path values can carry padding) [table.ts]
- [x] [Review][Patch] Controlled select with a stale URL value not among the options displayed no selection while actively filtering; the stale value now renders verbatim as the selected option [filter-bar.tsx]
- [x] [Review][Patch] "Active filter" meant non-null while the predicate treats blank as a no-op; ?entity= lit the clear affordance without filtering. Now active = non-blank after trim, shared helper [filter-bar.tsx, meter-table.tsx]
- [x] [Review][Patch] KPI spend card read "No bills loaded yet" on a zero-match subset, misattributing the filter to missing data; an empty subset now reads "No meters in this view" [kpi-strip.tsx, en.ts]
- [x] [Review][Patch] KpiStrip comment overclaimed that the cards describe "the same subset the lens shows" while non-table lenses are placeholders [kpi-strip.tsx]
- [x] [Review][Patch] Debug Log file count corrected (52 test files, not 53) [story file]

## Dev Notes

### Scope boundary

- **No new lens, no chart/map.** This story touches the KPI strip, a new FilterBar, and the table's empty state. The chart (2.8) and map (2.9) will read the same keys when they land.
- **No new dependency.** Native selects; pure client math.
- **CSV (2.7) will reuse** the same filtered rows - keep `filterMeters` the single predicate (do not fork filter logic into the FilterBar).
- **Do not change `filterMeters` semantics** (exact match, AND, trim-to-noop) - the table already depends on them; 18 tests pin them.

### What exists to build on

- **`src/lib/dashboard/table.ts`** `filterMeters(meters, { entity, ranch, rate })` - exact match, AND across keys, empty/whitespace key is a no-op. **`src/lib/dashboard/kpi.ts`** `computeKpiStrip(meters)` - pure; coverage `{ loaded: reconciled.length, total: meters.length }`; spend/demand sums over reconciled only; sparkline/delta need >=2 points; mover needs a meter with >=2 covered periods. Both import-safe in client code (no DB/Node deps).
- **`src/app/(app)/_components/kpi-strip.tsx`** - currently `{ data }: { data: KpiStripData }`, `"use client"`, already uses `useQueryState("meter")` for the mover card; its internal rendering (cards, sparkline, delta, scrollToLens) stays as-is - only the data source changes.
- **`src/app/(app)/_components/energy-dashboard.tsx`** - server component; currently `const kpi = computeKpiStrip(meters)` then `<KpiStrip data={kpi} />`; stacks KPI -> LensToggle -> LensRegion -> MeterDrawer.
- **`src/app/(app)/_components/meter-table.tsx`** - reads the three filter keys already; empty state distinguishes `emptyFarm` vs `noMatch` (the clear affordance slot is the `noMatch` branch); the mobile sort `<select>` (line ~167) is the styling precedent for FilterBar selects (`min-h-[44px] rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest px-3 type-body-md`).
- **Real data (probed in 2.4/2.5):** 46 meters; entity/ranch NULL on every meter; rateSchedule values mixed and messy ("AGB Ag35+ kW Med Use", "AGA2", "AG5B Large Time-of-Use Agricultural Power", "AG4C", "B1 Bus Low Use", ...) - filter values must be used verbatim; `?rate=B1 Bus Low Use` narrowed to 4 rows in the 2.4 browser pass.
- **Copy** - `shell.table.noMatch` / `emptyFarm` exist; `shell.kpi.coverage(loaded, total)` is the indicator line.

### Critical guardrails

1. **Canonical nuqs keys only.** FilterBar writes `entity`/`ranch`/`rate`; clear nulls exactly those three; `lens` and `meter` are never touched by any filter action.
2. **One filter predicate.** `filterMeters` is the single source of truth (table, KPI, and 2.7's CSV all narrow through it).
3. **AR-15 under filter.** Never let filtering fabricate a figure: the filtered KPI is `computeKpiStrip` over the subset (it already withholds unreconciled); the coverage line shows subset counts; an all-unreconciled subset shows the withheld spend state ("No bills loaded yet"), not $0.
4. **Honest controls.** A dimension with no values on this farm renders no control. Never render an empty dropdown or fabricate options.
5. **Pure derivations tested.** `filterOptions` in `/lib/dashboard/filters.ts` with colocated tests; components only render.
6. **TS strict + no-`any` + `noUncheckedIndexedAccess`.**
7. **Copy in /copy**, grower language ("Show whole farm", not "Reset filters"); no em dashes, no exclamation marks.
8. **A11y:** selects labeled and >= 44px; the no-match clear button >= 44px; color never the only signal.

### Previous story intelligence (2.5)

- The drawer reads the FULL meters array by design (deep link to a filtered-out meter opens) - keep `<MeterDrawer meters={meters} />` outside the filter path.
- 2.5 review patterns to apply here: every user-facing string in /copy from the start (the " to " literal was a review catch); `Intl` formatters need explicit timezone when dates are involved (not relevant here); test fixture builders for `MeterView` now require the 2.5 fields (cropName, trueUpMonth, solarKw, benefitingArrays) - reuse the existing `meter()` helpers in kpi.test.ts/table.test.ts as the pattern for filters.test.ts.
- Gates used: `npm run lint`, `npx tsc --noEmit`, `npm test` (346 green at 2.5 close), Playwright browser verification against :3000.

### Project Structure Notes

- New: `src/lib/dashboard/filters.ts` + `filters.test.ts`, `src/app/(app)/_components/filter-bar.tsx`.
- Modified: `src/app/(app)/_components/kpi-strip.tsx` (props + client recompute), `energy-dashboard.tsx` (drop server KPI compute, mount FilterBar), `meter-table.tsx` (no-match clear affordance), `src/copy/en.ts` (`shell.filter`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.6] - the three ACs verbatim; FR-11.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-11] - filtering recomputes cards + table; clearing returns to whole farm; rollups count only covered meters; coverage indicator reflects the filter.
- [Source: _bmad-output/planning-artifacts/architecture.md#URL state] - fixed nuqs keys; every component reads/writes the same keys; switching lens never drops filter or meter.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md#State patterns] - filtered-to-zero: "No meters match" + clear-filter affordance.
- [Source: _bmad-output/implementation-artifacts/2-4-meter-table-the-p0-lens.md#Deferred] - the clear-filter affordance on the empty state was explicitly deferred to this story; `filterMeters` purity kept for the KPI recompute.
- [Source: src/lib/dashboard/kpi.ts, table.ts; src/app/(app)/_components/kpi-strip.tsx, meter-table.tsx, energy-dashboard.tsx] - the pure functions and islands this story rewires.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` -> 52 files / 350 tests green (+4 filters.test.ts). Browser-verified via Playwright on the real account: only the Rate select renders (entity/ranch null on all 46 meters, honest controls); selecting "B1 Bus Low Use" narrows the table to 4 rows AND recomputes the KPI strip ($16,599.48 -> $1,235.14, coverage "4 of 4 meters loaded"); "Show whole farm" returns 46 rows with full totals and a clean URL; `?rate=NOPE` shows "No meters match" + the clear affordance and an honest KPI ("No bills loaded yet | 0 of 0 meters loaded"); the empty-state clear button restores the farm; filtering with an open drawer keeps `meter` in the URL and the dialog open.

### Completion Notes List

- **The cards and the table now describe the same subset.** `KpiStrip` takes the canonical `MeterView[]` and recomputes client-side under the nuqs `entity`/`ranch`/`rate` keys via the existing pure functions (`filterMeters` + `computeKpiStrip`) in a `useMemo`; the server-side KPI compute was removed from `energy-dashboard.tsx`. Coverage and money rollups reflect the filter automatically; unreconciled meters stay withheld (AR-15) at any subset size.
- **FilterBar** renders one labeled native `<select>` per dimension that actually has values on this farm (`filterOptions`, pure + tested) - today only Rate on the real account; entity/ranch controls appear automatically when Epic 1 backfills those fields. "All ..." writes null; "Show whole farm" clears exactly the three filter keys; `lens`/`meter` are never touched. The bar also renders when a stale deep link carries an active key with no available controls, so the clear affordance stays reachable.
- **The table's no-match empty state** gained the 2.4-deferred clear-filter button (only when a filter key is active; an empty farm keeps the plain message).
- **One filter predicate everywhere:** the FilterBar holds no filter logic; the table and KPI both narrow through `filterMeters`, ready for the 2.7 CSV to reuse.

### File List

- `src/lib/dashboard/filters.ts` (new) - pure `filterOptions` derivation.
- `src/lib/dashboard/filters.test.ts` (new) - 4 derivation tests.
- `src/app/(app)/_components/filter-bar.tsx` (new) - the filter controls client island.
- `src/app/(app)/_components/kpi-strip.tsx` (modified) - props `{ meters }`, client-side filtered recompute.
- `src/app/(app)/_components/energy-dashboard.tsx` (modified) - drop server KPI compute; mount FilterBar.
- `src/app/(app)/_components/meter-table.tsx` (modified) - no-match clear-filter affordance.
- `src/copy/en.ts` (modified) - `shell.filter` strings.

## Code Review (2026-06-09)

Adversarial review across three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) against baseline 0da11e4. Verdict: AC1 MET (FilterBar writes the canonical keys; cards and table narrow through the one filterMeters predicate; clearing restores the whole farm), AC2 MET (rollups reconciled-only at any subset size; coverage reflects the filter), AC3 MET (no-match + 44px clear affordance; empty farm keeps the plain message). The one real data-correctness defect found (trim asymmetry between the options derivation and the filter predicate) was patched with a both-sides trim and a pinning test.

Triage: 6 fixes applied, 0 deferred, 4 dismissed-with-record (the unreachable filteredOut-without-active-filter message branch is defensive; the duplicated clear affordance in bar + empty state is deliberate spec; sprint-status.yaml stays out of the File List by house convention; the demand card's "No demand charges this cycle" on an empty subset is technically true and left as-is).

### Fixed (patches applied this story)

- [Patch] **Trim parity in filterMeters** [table.ts] - Blind+Edge+Auditor, High. filterOptions trims values before deduping while filterMeters compared the stored field untrimmed, so a padded extraction value ("AGA2 ") produced an option that excluded its own meter. Both sides now compare trimmed; new test pins a padded stored value matching its trimmed option. (filterMeters' pinned semantics - exact match, AND, blank-key no-op - unchanged; all 19 table tests green.)
- [Patch] **Stale select value invisible** [filter-bar.tsx] - Blind+Edge+Auditor. A URL value not among the farm's options rendered an unselected control while actively filtering; the stale value now renders verbatim as the selected option (browser-verified: ?rate=NOPE shows "NOPE" selected).
- [Patch] **Blank key lit the clear affordance** [filter-bar.tsx, meter-table.tsx] - Edge. "Active" now means non-blank-after-trim (shared isActiveFilterValue), matching the predicate's no-op semantics; ?entity= shows the whole farm with no clear button (browser-verified).
- [Patch] **Zero-match subset misread as missing bills** [kpi-strip.tsx, en.ts] - Edge. The spend card on an empty filtered subset now reads "No meters in this view" instead of "No bills loaded yet" (browser-verified).
- [Patch] **Overclaiming comment** [kpi-strip.tsx] - Blind. Reworded to the actual contract (cards + table share the predicate; chart/map adopt the keys when they land).
- [Patch] **Debug Log file count** [story file] - Auditor. 52 test files, not 53.

Post-review validation: tsc exit 0, lint clean, 52 files / 351 tests green, browser re-verified (stale value visible, blank-key no-op, AG4C narrows to 1 row).

## Change Log

- 2026-06-09: Code review (3 adversarial layers) - 6 patches applied (filter trim parity + pinning test, stale-value visibility, active-filter blank parity, zero-subset KPI copy, comment honesty, bookkeeping), 0 deferred, 4 dismissed with record. lint + tsc + 351 tests + browser re-verification green. Status -> done.
- 2026-06-09: Implemented Story 2.6 - rollup and filter. KPI strip recomputes client-side under the canonical nuqs filter keys via the existing pure functions; new FilterBar island (honest per-dimension selects from the tested `filterOptions`, "Show whole farm" clear); the table's no-match state gained the clear affordance. lint + tsc + 350 tests + browser verification green. Status -> review.
