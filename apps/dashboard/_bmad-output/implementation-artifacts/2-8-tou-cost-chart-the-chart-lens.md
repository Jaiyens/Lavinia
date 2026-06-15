---
baseline_commit: 788987f
---

# Story 2.8: TOU cost chart - the Chart lens

Status: done

## Story

As a grower,
I want to see my cost split by time-of-use period over time, with a year-over-year compare,
so that I can literally see where the expensive hours are and how this year compares.

## Acceptance Criteria

1. **Given** the Chart lens, **When** rendered, **Then** it shows TOU-stacked bars (Peak / Part-Peak / Off-Peak) over time built on visx, dollars on the axis, reading only the canonical shape and CSS-variable tokens (no hardcoded hex).

2. **Given** legacy three-tier meters, **When** rendered, **Then** Part-Peak renders; **Given** current two-tier meters, **Then** it is omitted.

3. **Given** the year-over-year toggle, **When** activated, **Then** it compares equivalent periods from the multi-period canonical shape.

4. **Given** a bar click, **When** activated, **Then** the meter drawer opens for that meter/period; Chart becomes the default lens face.

### AC interpretation notes (read before coding)

This story replaces the Chart placeholder with the default hero visual (FR-8 / UX-DR10 / AR-9). The bar unit follows AC4's contract ("a bar click opens the meter drawer for THAT METER/period"): **one stacked bar per reconciled meter-period**, ordered by period close date ascending (the "over time" axis) and by TOU total descending within a close date - so on today's single-cycle data the chart reads as "which pump is costing me, split by hours" (NFR-8), and it becomes a true time series as more cycles land. Bars show TOU ENERGY dollars (the FR-8 "energy split"); demand/other charges stay in the table and drawer.

- **Data reality (probed 2026-06-09):** real account: 39 reconciled periods, ALL closing in 2026-03 (one cycle); 32 of them carry `tou_energy` line items; TOU labels in the data are "Peak" (43), "Off-Peak" (39), "Off Peak" (4), "Super Off-Peak" (3), "Part-Peak" (1). No prior-year periods exist, so the YoY toggle has zero pairs today - it must degrade honestly (visible but disabled with a plain caption like "Needs a year of bills"), never fake a compare.
- **TOU buckets (AC1, AC2):** classify each `tou_energy` line item's label into `peak | part_peak | off_peak | super_off_peak | other` by normalized matching (super+off before off, part/partial before peak; null/unmatched -> `other` labeled "Other energy"). A bar stacks only the buckets its period actually has - so a two-tier meter naturally omits Part-Peak and a legacy three-tier meter naturally shows it (AC2 falls out of the data, no special casing). "Super Off-Peak" is a real PG&E period in this data - it gets its own segment, never folded into Off-Peak (that would misstate the cheap hours). The legend shows only buckets present in the rendered bars, each color ALWAYS paired with its label.
- **Coverage honesty:** reconciled meters only (the canonical gate); a reconciled period with NO tou_energy lines (7 of 39 today, e.g. flat-rate B1 meters) is omitted from the bars and counted in a plain caption ("N meters without time-of-use detail on this bill"), never rendered as a zero bar.
- **visx (AC1):** install `@visx/scale` ONLY (architecture pre-authorizes visx, AR-9). `@visx/shape`/`@visx/group` declare React <=18 peer ranges that break `npm install` on React 19; `@visx/scale` is React-free. Use `scaleBand`/`scaleLinear` from visx; bars are plain SVG `<rect>`s (the visx Bar is a rect wrapper anyway) and the dollar axis is hand-rolled from `scale.ticks()`. All segment fills read CSS-variable tokens via `var(--...)` - never literal hex: peak = `--alert` (the expensive hours, clay), part_peak = `--outline` (warm gray), off_peak = `--primary` (green), super_off_peak = `--primary-container`, other = `--surface-container-highest`. Three hue families max (green, clay, warm neutrals).
- **Responsive:** SVG sized to the container via a measured width (ResizeObserver on a wrapper ref, height fixed ~320px desktop / shorter on mobile). Bars get a sensible min/max width from scaleBand padding. No animation needed (the 2.2 Reveal already wraps the lens region; do not add a second motion moment).
- **YoY toggle (AC3):** a local-state toggle (like the table's sort - NOT a new nuqs key; the canonical keys are fixed). Pure `yoyPairs(bars)`: pair each bar with the same meter's period closing in the same calendar month one year earlier; when toggled on, render the prior-year bar dimmed beside the current bar for meters that HAVE a pair, and narrow the chart to paired meters; zero pairs -> toggle disabled + honest caption. Tested with synthetic two-year fixtures.
- **Drill-in (AC4):** each bar is a focusable element (`<a>`-less button semantics via role/tabIndex on the bar group or an overlaid button) with an aria-label ("Open meter {name}, {total} this cycle"); click/Enter sets the nuqs `meter` key - the same seam the table row uses; the 2.5 drawer opens. Filter keys narrow the chart through the same `filterMeters` predicate (2.6 contract).
- **Default lens (AC4):** the lens default becomes `chart` (today it defaults to the simplest available; the chart now exists). Find the `defaultLens()` / default-value logic in `lens-region.tsx`/`lens-toggle.tsx` and flip it; deep links with `?lens=table` etc. keep working; `clearOnDefault` semantics must keep the URL clean on the default face.
- **Empty states:** zero reconciled-with-TOU bars (e.g. filtered to flat-rate meters) -> calm "No time-of-use detail in this view" panel + (when a filter is active) the shared clear affordance pattern; an empty farm -> the table's emptyFarm equivalent line. Never a fabricated bar.

## Tasks / Subtasks

- [x] **Task 1: Install visx** - `npm install @visx/scale` (React-free; shape/group excluded for React 19 peer-dep integrity). No other new packages. (AC1)
- [x] **Task 2: Pure chart derivation** - `src/lib/dashboard/chart.ts`: `TouBucket` union + `classifyTou(label: string | null): TouBucket`; `toChartBars(meters: MeterView[]): { bars: ChartBar[]; metersWithoutTou: number }` where `ChartBar = { meterId, meterName, close (ISO), segments: { bucket, cents }[], totalCents }` - reconciled meters only, tou_energy lines only, periods with no TOU lines counted not barred, segments in fixed bucket order, bars ordered close asc then total desc; `yoyPairs(bars: ChartBar[]): { current: ChartBar; prior: ChartBar }[]` (same meter, same close month, prior year). Colocated `chart.test.ts`: classification (incl. "Off Peak" space variant, "Super Off-Peak" precedence over "Off", "Part-Peak", null -> other), reconciled-only gate, no-TOU-period counted not barred, segment stacking sums, ordering, YoY pairing + empty, purity. (AC1, AC2, AC3)
- [x] **Task 3: ChartLens island** - `src/app/(app)/_components/chart-lens.tsx` (client): reads nuqs `entity|ranch|rate` (filterMeters) + sets `meter` on bar activation; visx scaleBand/scaleLinear stacked bars; dollar ticks (`formatUsd`, tabular); legend of present buckets (color + label); YoY toggle (local state, disabled with caption at zero pairs; on = paired bars, prior dimmed); captions for metersWithoutTou; responsive width via ResizeObserver; bars keyboard-focusable with aria-labels; tokens only. (AC1-4)
- [x] **Task 4: Wire + default lens** - `lens-region.tsx`: `chart` branch -> `<ChartLens meters={meters} />` (keep `id="energy-lens"` on the rendered view); flip the default lens to `chart` (lens-region + lens-toggle agree; URL stays clean on default). (AC4)
- [x] **Task 5: Copy** - `src/copy/en.ts` `shell.chart`: bucket labels (Peak / Part-Peak / Off-Peak / Super Off-Peak / Other energy), YoY toggle label + disabled caption, metersWithoutTou caption (count-aware), empty-view line, bar aria-label fn, axis/legend a11y labels. Grower language; "expensive hours" framing welcome; no kW. (AC1-3)
- [x] **Task 6: Tests + validate** - chart.test.ts green; lint + tsc + full vitest green; `no-raw-source-in-ui` green. Browser-verify on the real account: `/` (no lens param) lands on the Chart face; 32 stacked bars render with the legend (Peak clay / Off-Peak green present); the dollar axis reads tabular dollars; the without-TOU caption reads 7; clicking the tallest bar opens the drawer (`?meter=` set); `?rate=B1 Bus Low Use` shows the honest no-TOU empty panel; the YoY toggle is visibly disabled with its caption; table/map deep links still work. (AC1-4)

### Review Findings

- [x] [Review][Patch] ResizeObserver bound only on mount; the chart stayed permanently unmeasured after an empty-state to data transition (clear filter from ?rate=NOPE) [chart-lens.tsx]
- [x] [Review][Patch] SVG width subtracted the wrapper padding a second time (contentRect already excludes it), clipping the right 24px of the chart [chart-lens.tsx]
- [x] [Review][Patch] role="img" on an SVG containing interactive bar buttons marks them presentational to assistive tech; role removed (the section carries the label) [chart-lens.tsx]
- [x] [Review][Patch] Keyboard focus on bar hit-targets was invisible (the global box-shadow ring cannot paint on SVG); stroke-based focus ring added [chart-lens.tsx, globals.css]
- [x] [Review][Patch] yoyPairs Map overwrote same-month rebills, double-counting one prior; now one-to-one in close order, with tests [chart.ts, chart.test.ts]
- [x] [Review][Patch] Bar aria-label called the TOU-energy subtotal "this cycle", overstating it as the bill total; copy now says "in time-of-use energy this cycle" [en.ts]
- [x] [Review][Patch] All-zero views (reachable: ?rate=AGA1) collapsed the y-scale to its midpoint with a floating $0 gridline; domain floored at 1 cent keeps $0 on the baseline, and tick labels dedupe at small magnitudes [chart-lens.tsx]
- [x] [Review][Patch] 14 zero-dollar TOU cycles rendered as invisible full-height click targets; they now draw an honest baseline tick [chart-lens.tsx]
- [x] [Review][Patch] Native <title> hover added so sighted users can identify a bar without clicking [chart-lens.tsx]
- [x] [Review][Patch] Pair lookup and band keys hardened against identical close instants (object-identity prior map; index-suffixed band keys); metersWithoutTou comment now states per-meter counting [chart-lens.tsx, chart.ts]
- [x] [Review][Defer] Negative TOU segment rendering (NEM credit inside a TOU period) needs a deliberate design; no data path today - recorded in deferred-work.md

## Dev Notes

### Scope boundary

- **Chart lens only.** Map is 2.9, Calendar is 3.5. The drawer is opened via the same `meter` key (2.5 built it); the filter contract is 2.6's.
- **No new motion moment** (the lens region is already inside the 2.2 Reveal).
- **TOU energy dollars only** in the bars; demand stays out of the chart (it has its own KPI card and drawer row).
- **Do not aggregate away the meter** - the bar unit is meter-period by AC4's drill-in contract.

### What exists to build on

- **`src/lib/dashboard/load.ts`** `MeterView.periods[].lineItems` (`kind: "tou_energy"`, label, amountCents, quantity, unit) - the only chart input; `coverageState` gate. **`table.ts`** `filterMeters` (2.6-hardened trim parity). **`format/money.ts`** `formatUsd`.
- **`lens-region.tsx`** - the branch point; `table` branch shows the pattern (pass meters, keep `id="energy-lens"`); check how the current default (`defaultLens()`, `clearOnDefault: true`) is implemented and flip to chart. **`lens-toggle.tsx`** - may carry its own default; keep both in agreement.
- **`meter-table.tsx` / `kpi-strip.tsx`** - client-island patterns: `useQueryState`, `useMemo` over `filterMeters`, `setMeter` seam, 44px targets, honest empty states with the clear-filter affordance (import `isActiveFilterValue` from `filter-bar.tsx` if needed).
- **Tokens:** `--alert`, `--outline`, `--primary`, `--primary-container`, `--surface-container-highest`, `--radius-lg` panel, `.type-num tnum`, `.type-caption`, `.type-label-caps`.
- **2.5/2.6/2.7 review lessons:** UTC for billing-date formatting (`timeZone: "UTC"` - the close-month grouping in `yoyPairs` must use the UTC month, and any axis date label too); every user-facing string in /copy; no duplicated label mappings; test fixture `meter()` builders need the full current MeterView shape.

### Critical guardrails

1. **AR-15.** Reconciled meters only; a period without TOU detail is counted in a caption, never a zero bar; no fabricated YoY compare.
2. **Tokens, never hex (AR-9/AC1).** Segment fills are `var(--token)` strings; the lint-visible kind of hex literal must not appear in the component.
3. **Canonical nuqs keys.** Chart reads `entity|ranch|rate`, writes only `meter` on drill-in; YoY is local state.
4. **One filter predicate** (`filterMeters`) and **one money formatter** (`formatUsd`).
5. **Pure derivations tested** in `/lib/dashboard/chart.ts`; the island renders only.
6. **Color never the only signal:** legend pairs every color with its label; bar aria-labels carry name + dollars.
7. **TS strict + no-`any` + `noUncheckedIndexedAccess`** (segment/array access guarded).
8. **Copy in /copy**; no em dashes/exclamation; no kW on the surface.
9. **UTC month math** for close-date grouping (the 2.5 date-shift lesson).

### Project Structure Notes

- New: `src/lib/dashboard/chart.ts` + `chart.test.ts`, `src/app/(app)/_components/chart-lens.tsx`.
- Modified: `lens-region.tsx` (+ possibly `lens-toggle.tsx` for the default), `src/copy/en.ts`, `package.json` (+@visx/scale).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.8] - the four ACs verbatim; FR-8.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-8] - energy split by TOU with YoY from the multi-period canonical shape; legacy three-tier renders Part-Peak.
- [Source: _bmad-output/planning-artifacts/architecture.md#AR-9, #Charts] - custom SVG on visx primitives; CSS-variable tokens, never literal hex.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md#cost-chart, EXPERIENCE.md#Chart lens] - TOU-stacked bars, dollars on the axis, click a bar -> drawer, the default hero face.
- [Source: src/lib/dashboard/load.ts, table.ts; src/app/(app)/_components/lens-region.tsx, meter-table.tsx] - the canonical input, predicate, branch point, island patterns.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- tsc exit 0; lint clean; npm test -> 54 files / 368 tests green (+9 chart.test.ts; 2 lens.test.ts expectations updated to the new chart default per this story's AC4). Browser-verified via Playwright on the real account: `/` with no lens param lands on the Chart face; 32 stacked bars render cost-descending (first bar aria "Open meter P054, $5,075.77 this cycle"); legend reads Peak / Part-Peak / Off-Peak / Super Off-Peak (only present buckets); whole-dollar tabular axis ticks; zero hex fills in the SVG; the without-TOU caption reads "7 meters have no time-of-use detail on their bills"; the YoY toggle is disabled with "Needs a year of bills to compare"; bar click opens the drawer and sets `?meter=`; `?rate=NOPE` shows the honest empty panel + "Show whole farm"; `?rate=B1 Bus Low Use` correctly RENDERS bars (3 of the 4 B1 meters genuinely carry TOU lines - the data corrected the story's assumption that B1 was flat-rate); `?lens=table` deep link still shows 46 rows. Desktop + mobile screenshots captured.

### Completion Notes List

- **The Chart lens is the default hero face.** One TOU-stacked bar per reconciled meter-period (the AC4 drill-in contract), close date ascending then TOU total descending - on today's single-cycle account it reads "which pump is costing me, split by hours" and becomes a time series as cycles land. TOU energy dollars only; demand stays in its KPI card and the drawer.
- **Buckets fall out of the data (AC2):** `classifyTou` handles the real label variants ("Off Peak", "Super Off-Peak" precedence, "Partial Peak"); a two-tier meter has no Part-Peak segment, a three-tier meter does, Super Off-Peak gets its own segment (never folded into Off-Peak), unmatched labels group honestly as "Other energy".
- **visx dependency decision:** `@visx/scale` only - `@visx/shape`/`@visx/group` declare React <=18 peer ranges that break `npm install` under React 19, and their components are thin rect/g wrappers; scales come from visx (AR-9's primitives), bars are plain SVG rects, the dollar axis is hand-rolled from `scale.ticks()` with a new `formatUsdWhole` in the one money module.
- **Honesty:** reconciled-only gate inside the pure `toChartBars`; flat-detail periods counted in a caption, never zero bars; the YoY toggle is visible but disabled with a plain caption at zero pairs (`yoyPairs` is pure + tested with synthetic two-year fixtures; compare mode narrows to paired meters and renders the prior year as a muted total bar).
- **Contract reuse:** narrows through `filterMeters`, opens the drawer via the `meter` key, YoY is local state (no new nuqs key), empty view reuses the clear-affordance pattern, tokens only (peak=alert clay, off-peak=primary green, part-peak=outline gray, super-off-peak=primary-container, other=surface-container-highest), every color paired with a legend label, bars keyboard-focusable with name+dollar aria-labels.
- **Default-lens flip** was one registry line (`lens.ts` chart available: true) - the 2.2 design anticipated this; lens-region branches chart -> `<ChartLens>`; stale `?lens=map` deep links now resolve to chart.

### File List

- `src/lib/dashboard/chart.ts` (new) - classifyTou / toChartBars / yoyPairs pure derivations.
- `src/lib/dashboard/chart.test.ts` (new) - 9 derivation tests.
- `src/app/(app)/_components/chart-lens.tsx` (new) - the Chart lens client island (visx scales + SVG rects).
- `src/lib/dashboard/lens.ts` (modified) - chart available: true (default face flips automatically).
- `src/lib/dashboard/lens.test.ts` (modified) - expectations updated to the chart default.
- `src/app/(app)/_components/lens-region.tsx` (modified) - chart branch.
- `src/lib/format/money.ts` (modified) - formatUsdWhole for axis ticks.
- `src/copy/en.ts` (modified) - `shell.chart` strings.
- `package.json` / `package-lock.json` (modified) - +@visx/scale.

## Code Review (2026-06-09)

Adversarial review across three parallel layers against baseline 788987f. Verdict after patches: AC1 MET (visx scales, token-only fills, tabular whole-dollar axis, canonical input; the two geometry/lifecycle defects found - right-edge clipping and the unmeasured-after-empty transition - are fixed and browser-re-verified), AC2 MET (bucket presence falls out of the data; directly tested), AC3 MET (one-to-one equivalent-period pairing, honest disabled toggle), AC4 MET (band hit-target opens the drawer; chart is the default face via the registry flip).

Triage: 10 fixes applied, 1 deferred (negative TOU segments - design decision, recorded in deferred-work.md), 3 dismissed-with-record (the YoY checkbox "remembering" its preference when pairs return is defensible UX; sprint-status.yaml stays out of the File List by house convention; band min/max width clamping is premature at 32 bars - revisit when multi-cycle growth makes bands shrink).

Post-review validation: tsc exit 0, lint clean, 54 files / 369 tests green; browser re-verified: svg spans the full content box (750/750), no role="img", 32 hover titles, TOU-accurate aria, chart renders 32 bars after clearing from the empty state, focus-ring class present on hit targets.

## Change Log

- 2026-06-09: Code review - 10 patches applied (observer lifecycle, clipping, ARIA role, SVG focus ring, one-to-one YoY pairing, honest aria copy, zero-domain baseline + tick dedupe, $0 baseline ticks, hover titles, collision hardening), 1 deferred, 3 dismissed with record. lint + tsc + 369 tests + browser re-verification green. Status -> done.
- 2026-06-09: Implemented Story 2.8 - the TOU cost chart as the default Chart lens (visx scales over token-only SVG rects, one stacked bar per reconciled meter-period, honest captions for flat-detail bills, disabled-not-faked YoY, drawer drill-in via the meter key, filter contract reused). lint + tsc + 368 tests + browser verification green. Status -> review.
