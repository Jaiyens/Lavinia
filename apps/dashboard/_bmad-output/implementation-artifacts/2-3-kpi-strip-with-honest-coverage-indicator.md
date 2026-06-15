---
baseline_commit: ee81c3b
---

# Story 2.3: KPI strip with honest coverage indicator

Status: done

## Story

As a grower,
I want a few compact cards that tell me my spend and where the pressure is, with an honest count of how much is loaded,
so that I grasp my situation in seconds without trusting a number I cannot check.

## Acceptance Criteria

1. **Given** the strip, **When** rendered, **Then** it shows compact cards: total PG&E spend (covered period) with a coverage indicator ("N of 183 meters loaded") beside it, demand-charge exposure ($), and biggest cost mover; never a lone hero number.

2. **Given** a card with >=2 covered periods, **When** rendered, **Then** it pairs the number with a sparkline + vs-last-period delta (green favorable, alert clay adverse); with one covered period the sparkline/delta degrade gracefully (hidden, not faked).

3. **Given** a meter with <2 covered periods, **When** rendered, **Then** the biggest-mover card is hidden gracefully, never faked.

4. **Given** a card tap, **When** activated, **Then** it filters/scrolls the lens to its driver.

5. **Given** the cards, **When** rendered, **Then** none presents overpayment, savings, or a projected bill; all figures are tabular; the coverage indicator reads 100% on the fully-loaded representative seed.

### AC interpretation notes (read before coding)

This story builds the **KPI strip** that sits in the slot above the lens toggle (the seam Story 2.2 left). It reads ONLY the canonical/DB shape, gates every figure through `coverageState` (AR-15: a number renders only for reconciled meters; needs_review / no_bill are excluded from the rollups, never zero-filled), and degrades gracefully when the data is thin. Pure rollups live in a tested `src/lib/dashboard/*` function; the component only renders.

- **Three compact cards (AC1), never a lone hero number:** (a) **Total PG&E spend** over the covered period = sum of each RECONCILED meter's latest-period `printedTotalCents`, with a coverage indicator beside it ("N of M meters loaded", N = reconciled count, M = total meters). (b) **Demand-charge exposure ($)** = sum of demand over reconciled meters (the `demand`-kind line items, falling back to `demandChargeUsd`). (c) **Biggest cost mover** = the reconciled meter with the largest period-over-period `printedTotalCents` change (needs >=2 covered periods).
- **Honest degradation (AC2, AC3):** the real demo account is sparse (most meters have ONE period; the legacy ag meters carry NO demand charge). So: a card's sparkline + vs-last delta render ONLY when its series has >=2 points; otherwise they are hidden, never faked. The biggest-mover card is hidden entirely when no reconciled meter has >=2 periods. The demand card, when no reconciled meter carries any demand charge, shows a calm "No demand charges this cycle" rather than a fabricated or misleading "$0 exposure" hero (honest: these meters are energy-only). Never invent or zero-fill a missing number.
- **Coverage gating (AR-15):** rollups count only reconciled meters; needs_review / no_bill meters are excluded from the dollar sums (they have no trustworthy figure) but ARE counted in the indicator's denominator M (the full inventory). So "39 of 46 meters loaded" on the real account: spend sums the 39 reconciled, the 7 needs_review are withheld, M=46.
- **No banned figures (AC5):** no overpayment, no savings, no projected/forecast bill (planner-not-live-meter; that is Epic 3/4). All money via `formatUsd(cents)` with tabular figures (the `.type-num`/`.tnum` roles). The delta color: favorable = green/`money-positive` semantics, adverse = `alert` clay; for SPEND a decrease is favorable (less spend) - label the direction honestly in the grower's terms, and pair color with a sign/arrow + value (color never the only signal).
- **Card tap (AC4):** tapping a card filters/scrolls the lens to its driver. The lens content (table) lands in 2.4; for now wire the tap to set the relevant nuqs key where one exists, or scroll to the lens region, and leave a clear seam. Minimum: the cards are buttons with accessible labels; the spend card's tap focuses/scrolls the lens; the mover card's tap sets the `meter` key (the open-drawer key) for its driver meter so 2.5's drawer opens to it. Do not fabricate a filter that does not exist yet; a scroll-to-lens is an acceptable v1 for the spend/demand cards.
- **The "100% on the representative seed" clause (AC5):** the dashboard farm is now the REAL reconciled account (`dataKind:"real"`, 39/46 loaded), so the indicator reads "39 of 46". The seed (representative fallback) currently has all meters `no_bill` (its periods were never run through the reconcile gate), so it would read 0% - a seed-DATA gap, not a KPI-logic bug. Build the indicator to read the true reconciled fraction; record the seed-coverage gap as deferred (the seed needs reconciled coverage to read 100%).
- **Read edge (shared with 2.4/2.5):** add `src/lib/dashboard/load.ts` - a DB edge taking an explicit `PrismaClient` that resolves the dashboard farm (via `dashboardFarm`) and projects its meters into a plain `MeterView[]` (canonical fields: id, name, serviceId, rateSchedule, isLegacy, status, coverageState, account number, ranch/entity name when present, latitude/longitude, gpm, isSolar, and `periods[]` with start/close/printedTotalCents/demandCents/tariff/touSplit/lineItems). This is the one read the table (2.4) and drawer (2.5) will reuse, so shape it for all three. It reads Prisma only - no raw-source import.

## Tasks / Subtasks

- [x] **Task 1: Dashboard read edge** - `src/lib/dashboard/load.ts`: `loadMetersForFarm(prisma, farmId)` (projection, connection-free, testable) + `loadDashboard(prisma)` (resolve via `dashboardFarm` then project). Plain typed `MeterView`/`MeterPeriodView`/`MeterLineItemView`; union narrowers for coverage/kind/unit; demand cents derived from `demand`-kind line items (else `demandChargeUsd`). No raw-source import. `load.db.test.ts` (throwaway SQLite) asserts the projection, coverage passthrough, demand-from-line-items, and the no-period meter.
- [x] **Task 2: Pure KPI rollups** - `src/lib/dashboard/kpi.ts`: `computeKpiStrip`. Sums ONLY reconciled meters; coverage `{loaded: reconciled, total: all}`; spend/demand monthly series (>=2 -> delta, else null); demand `{hasDemand:false}` when none; mover = max |latest-prior| among reconciled meters with >=2 periods, else null. `kpi.test.ts` (10 tests) covers reconciled-only summing, coverage denominator, 1-month degrade, >=2-month delta, no-demand honesty, demand sum, mover present/null, and the nothing-loaded case.
- [x] **Task 3: KPI strip + sparkline** - `kpi-strip.tsx` (3 cards, never a lone number; `.type-headline tnum` figures; spend withheld when nothing loaded; demand honest "No demand charges" empty; mover hidden when null), inline-SVG `sparkline.tsx` (tokens only, neutral stroke, hidden < 2 points). Cards are buttons: spend/demand scroll to the lens; mover sets the nuqs `meter` key + scrolls. Copy in `shell.kpi`.
- [x] **Task 4: Wire into the dashboard** - `energy-dashboard.tsx` loads via `loadDashboard`, computes via `computeKpiStrip`, renders `<KpiStrip>` in the slot above the lens toggle (a Reveal child). `lens-region.tsx` carries `id="energy-lens"` for the scroll target. No-farm + representative-badge paths kept.
- [x] **Task 5: Tests + validate** - `kpi.test.ts` + `load.db.test.ts` green; `npm run lint` clean, `npx tsc --noEmit` clean, `npm test` 49 files / 316 tests, `npm run build` clean; `no-raw-source-in-ui.test.ts` green; `db:import-fixture` green. **Browser check done:** the strip renders on the real account with "PG&E spend $16,599.48 / 39 of 46 meters loaded" and "Demand charges $3,397.55" (the demand exists, from demand-kind line items), the mover card honestly hidden (the only 2 multi-period meters are needs_review), tabular figures, no projected/savings number, above the lens toggle (screenshot captured).

## Dev Notes

### Scope boundary

- **KPI strip only.** No table content (2.4), no drawer (2.5 - but wire the mover card's tap to set the `meter` key so the seam exists), no chart/map, no findings. The lens region stays the placeholder from 2.2.
- **No new dependency.** Build a tiny inline-SVG sparkline (visx is Story 2.8). Reuse the 2.1 tokens/primitives + `formatUsd`.
- **No projection/forecast, no savings/overpayment** (AC5) - those are Epic 3/4.

### What exists to build on

- **`src/lib/onboarding/farm.ts`** `dashboardFarm(prisma)` -> `{ farm, dataKind }` (the farm-selection; `load.ts` calls it then loads the rich graph by `farm.id`). **`src/lib/db.ts`** `prisma`.
- **Real data shape (probed):** 46 pumps; 44 have 1 period, 2 have 4; 39 reconciled; sum reconciled `printedTotalCents` = 1659948 ($16,599.48); demand: 0 meters carry any demand charge (`demandChargeUsd` null, line items all `kind:"other"`); ranch/entity null on the real account; periods carry `printedTotalCents`, `tariff`, `start`/`close`, `billingLineItems[]`.
- **`src/lib/format/money.ts`** `formatUsd(cents)` -> tabular `$X,XXX.XX`. **`src/lib/recommendations/types.ts`** `CoverageState`, `BillingLineItemKind`. **`src/copy/en.ts`** `shell` namespace (add `kpi`). **`src/app/globals.css`** `.type-num`/`.type-label-caps`/tokens. **`src/components/ui/`** primitives.
- **nuqs** `meter` key (the open-drawer SA ID) for the mover card's tap; `useQueryState("meter")`.

### Critical guardrails

1. **AR-15 / never invent a number.** Rollups sum reconciled meters only; needs_review/no_bill are withheld (excluded from sums, counted in the indicator denominator). No zero-fill, no guess, no projection.
2. **Honest degradation.** Sparkline/delta only with >=2 points; mover hidden with <2 periods; demand shows a calm "no demand charges" when none exists. Never faked.
3. **Money in one place, tabular.** `formatUsd(cents)`; `.type-num` tabular figures. No hand-formatted money.
4. **Read only the canonical/DB shape in /app.** `load.ts` reads Prisma and returns plain objects; keep `no-raw-source-in-ui` green.
5. **Pure rollups are tested** (`/lib/dashboard`, no DB/UI in `kpi.ts`). The read edge takes an explicit `PrismaClient`.
6. **Copy in /copy, grower language**, tabular figures, no kW/jargon, no em dashes/exclamation. Coverage indicator in the grower's words ("N of M meters loaded").
7. **TS strict + no-`any` + `noUncheckedIndexedAccess`** - guard array access (period pairs, series points).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3] - the five ACs verbatim.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md#Components (kpi-card)] - compact: label-caps + num-tabular value + sparkline + vs-prior delta (delta green favorable, alert adverse); never a lone hero number; a strip of 3-4 above the lens.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md#Component Patterns (KPI strip)] - 3 compact cards (spend, demand exposure, biggest mover); tap filters/scrolls the lens to its driver; never a lone hero number; NO projected/forecast bill card (planner, not live meter).
- [Source: _bmad-output/planning-artifacts/architecture.md#Money & Numbers, #State unions, #URL state] - integer cents; `formatUsd`; reconciled-or-needs_review; nuqs keys.
- [Source: _bmad-output/project-context.md#hero-not-money-loudest] - money is the story the visuals tell, not a lone hero number.
- [Source: src/lib/onboarding/farm.ts, src/lib/format/money.ts, src/lib/recommendations/types.ts, src/copy/en.ts] - the read seam, the formatter, the unions, the copy home.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` -> 49 files / 316 tests (+12: 10 kpi + 3 load.db, minus overlap... net +12 over 2.2's 304). `npm run build` clean.
- Probe of the real account: spend $16,599.48, coverage 39 of 46; demand $3,397.55 (from `demand`-kind line items across reconciled meters); biggestMover null (the only two meters with >=2 periods - P038 and VINES IRR 75HP - are both `needs_review`, so honestly hidden); spend/demand series single-month -> no sparkline/delta. Screenshot confirmed the two cards above the lens toggle.

### Completion Notes List

- **KPI strip lands in the 2.2 slot, reading the canonical shape through a shared read edge.** `loadDashboard` (= `dashboardFarm` + `loadMetersForFarm`) projects the dashboard farm's meters into `MeterView[]` (shaped for 2.4 table + 2.5 drawer too); `computeKpiStrip` is a pure tested rollup. The strip renders three card TYPES (spend + coverage, demand, mover), never a lone hero number, money via `formatUsd` at `.type-headline` (24px - the data hero stays the loudest, money is not the 56px money-hero).
- **AR-15 honesty throughout:** every dollar sums ONLY reconciled meters; needs_review / no_bill are withheld from the sums but counted in the coverage denominator ("39 of 46 meters loaded"). Sparkline + delta render only with >=2 monthly points (else hidden, never faked). The biggest-mover card is hidden when no reconciled meter has >=2 periods. The demand card shows a calm "No demand charges this cycle" when none exists rather than a fabricated $0.
- **Review fix - the key one:** the spend card now WITHHOLDS its figure when nothing is reconciled (`loaded === 0`) - it shows "No bills loaded yet", not "$0.00" - so the representative seed (0 of 183 today) never renders a fabricated zero (the demand card already did this; spend now matches, AR-15).
- **Scope held:** KPI strip only. No table/drawer/chart/map content (the lens stays the 2.2 placeholder); only the mover -> `meter` nuqs seam is wired for 2.5. No new dependency (inline-SVG sparkline; visx is 2.8).

### File List

- `src/lib/dashboard/load.ts` (new) - the shared dashboard read edge (`loadMetersForFarm` + `loadDashboard`) projecting the canonical `MeterView[]`.
- `src/lib/dashboard/load.db.test.ts` (new) - read-edge projection test (throwaway SQLite).
- `src/lib/dashboard/kpi.ts` (new) - pure `computeKpiStrip` rollups.
- `src/lib/dashboard/kpi.test.ts` (new) - 10 KPI rollup tests.
- `src/app/(app)/_components/kpi-strip.tsx` (new) - the 3-card strip (buttons, deltas, withheld/empty states).
- `src/app/(app)/_components/sparkline.tsx` (new) - inline-SVG sparkline (tokens only).
- `src/app/(app)/_components/energy-dashboard.tsx` (modified) - load + compute + render the strip.
- `src/app/(app)/_components/lens-region.tsx` (modified) - `id="energy-lens"` scroll target.
- `src/copy/en.ts` (modified) - `shell.kpi` strings (+ `spendNotLoaded`).

## Code Review (2026-06-09)

Adversarial review across three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Verdict: AC1/AC2/AC3 MET; AC4 PARTIAL (scroll-to-lens is the licensed v1; the per-card "filter to driver" is deferred to 2.4/2.6 and the mover -> `meter` seam is unobservable until the 2.5 drawer); AC5 PARTIAL (KPI logic correct, tabular, no banned figures; the "100% on the representative seed" clause is an acknowledged seed-DATA gap, not a code bug). No correctness bugs in the AR-15 gating, integer-cents discipline, or index safety.

Triage: 5 patches, 7 defer, 0 dismissed.

### Fixed (patches applied this story)

- [Patch] **Fabricated-zero spend when nothing is loaded** [kpi-strip.tsx] - Edge Hunter (the key finding) + Blind. The spend card rendered `formatUsd(0)` = "$0.00" when `loaded === 0` (the representative seed's default state: 0 of 183), a proven-looking zero with no substantiation - the exact zero-fill AR-15 forbids and that the demand card already avoids. Now withholds ("No bills loaded yet") when `loaded === 0`, gated on loaded (not on `cents === 0`, so a genuine $0 across loaded meters is still shown).
- [Patch] **Demand presence conflated zero with absent** [load.ts] - Blind. The `demandLineCents > 0` guard let a demand-line set summing to 0 fall through to the `demandChargeUsd` fallback. Now distinguishes "demand lines present" (sum them) from "no demand lines" (fall back, else null).
- [Patch] **Figures bypassed the type scale** [kpi-strip.tsx] - Blind + Auditor. Money/name used raw `text-2xl font-bold`; switched to the project's `.type-headline` (+`tnum` on the money figures) for design-system consistency.
- [Patch] **Sparkline coupled to the delta tone** [kpi-strip.tsx, sparkline.tsx] - Auditor. The trend line inherited the latest delta's favorable/adverse color (misleading on a multi-step trend). The sparkline is now a neutral stroke; only the delta value + arrow carry tone. Also fixed the flat-series comment and dropped the redundant `role="presentation"`.
- [Patch] **Mover tap was a silent no-op** [kpi-strip.tsx] - Blind. The mover card set the `meter` key but the 2.5 drawer that reads it does not exist yet; it now also scrolls to the lens so the tap does something today.

### Deferred (recorded in deferred-work.md)

- [Defer] `monthKey` buckets the spend/demand series by UTC month; a Pacific close with a time-of-day could slip a month. Latent (current closes are UTC-midnight date-only); harden when real multi-month/time-of-day closes land.
- [Defer] `printedTotalCents` is typed nullable while a reconciled meter always has a non-null total; `coverage.loaded` counts the meter even if (impossibly today) its latest total were null. Tighten the invariant or comment when real data lands.
- [Defer] Spend headline (sum of each meter's LATEST period) can diverge from the sparkline's last bucket (per-month sum) when meters close in different months - both honest, a UX watch item for the real multi-month account.
- [Defer] Test-depth: a demand >=2-month series/delta test; the `demandChargeUsd`-fallback path at the DB edge; a negative-`printedTotalCents` (NEM credit) case.
- [Defer] AC4 per-card "filter to its driver" (spend/demand currently scroll to the lens top; wire real filters in 2.4/2.6); the mover -> `meter` seam is unobservable until the 2.5 drawer reads it.
- [Defer] AC5 "coverage reads 100% on the representative seed": the seed's periods were never run through the reconcile gate (all `no_bill`), so it reads 0%. Run the seed through the gate (or mark its periods reconciled) so the representative fallback reads 100%.
- [Defer] Negative spend headline display: if credits ever exceed charges across loaded meters the spend figure could read negative; honest, but get product sign-off on the display.

## Change Log

- 2026-06-09: Implemented Story 2.3 - the KPI strip with honest coverage. Added the shared dashboard read edge (`load.ts` -> `MeterView[]`, reused by 2.4/2.5), the pure tested `computeKpiStrip` rollups (reconciled-only sums, coverage loaded/total, graceful sparkline/delta + mover degradation, honest no-demand state), and the strip + inline sparkline in the 2.2 slot above the lens toggle. On the real account: spend $16,599.48 / 39 of 46 loaded, demand $3,397.55, mover honestly hidden. Review: fixed the fabricated-zero spend (withhold when nothing loaded), demand presence conflation, type-scale consistency, sparkline tone coupling, and the mover no-op tap. lint + tsc + 316 tests + clean build green; browser-verified. Status -> done.
