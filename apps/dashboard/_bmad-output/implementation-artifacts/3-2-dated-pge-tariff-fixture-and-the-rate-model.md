---
baseline_commit: 4dd7a821ac383a8525ae203da6599627b18d7bfa
---

# Story 3.2: Dated PG&E tariff fixture and the rate model

Status: done

## Story

As a Terra engineer,
I want a dated, versioned PG&E ag tariff fixture and pure rate-compute functions,
so that rate findings and bill verification are computed from real, checkable rates and never a hardcoded number.

## Acceptance Criteria

1. **Given** `fixtures/pge-ag-rate-card.json`, **When** authored, **Then** it is a dated, versioned data file (per schedule: customer charge, TOU energy by season, demand charge, demand-charge limiter), bounded to Batth's schedules + current-equivalents, with no rate hardcoded in code.

2. **Given** the loader (`/lib/pge/rate-card.ts`), **When** it reads the fixture, **Then** it uses `process.cwd()`, and the fixture is added to `outputFileTracingIncludes`.

3. **Given** the rate compute, **When** implemented, **Then** it lives as pure functions in `/lib/energy` (rates / rate-compare) with colocated `*.test.ts`.

4. **Given** the two TOU clocks, **When** modeled, **Then** the rate peak (5-8pm) is kept separate in code from the DR window (4-9pm).

### AC interpretation notes (read before coding)

This is a BROWNFIELD EVOLUTION, not greenfield (FR-14 substrate / AR-13 / AR-14 / NFR-3). The fixture, loader, and a pure rate model ALREADY EXIST and feed the legacy demo engines (`loadRateCard` -> `run.ts` -> seed). This story makes the card sourced/dated/complete and adds the cycle-level pricing entry point that 3.3 (back-test gate) and 4.1 (bill verification) will consume - WITHOUT breaking the legacy consumers.

- **What exists today (probed 2026-06-09):** `fixtures/pge-ag-rate-card.json` is REPRESENTATIVE (its own $comment says "Replace with the official tariff sheet"; effectiveDate 2025-03-01; it also wrongly claims the rate peak is 4-9pm). Shape: `{ utility, effectiveDate, source, summerMonths, sizeBreakKw, plans[] }`, each plan `{ schedule, family, sizeClass, legacy, agricultural, customerChargePerMonth, summer/winter: { energy: {peak, partial_peak, off_peak}, demand: {maxDemandPerKw?, peakPeriodDemandPerKw?} } }`. `src/lib/pge/rate-card.ts` already reads via `process.cwd()` and validates families AG-A/B/C/4/5 in both size tiers. `src/lib/energy/rates.ts` carries the types + `seasonFor`/`sizeClassFor`/`familyOf`/`planFor`/`cycleCostUnderPlan` (USD floats, interval-derived `CycleUsage`); `rate-compare.ts` (`bucketUsage` from 15-min intervals + `rateOptimization`) feeds the LEGACY demo engines only.
- **The two TOU clocks (AC4) - the existing code is WRONG about one:** per PG&E's published ag tariff (ELEC_SCHEDS_AG.pdf, verified 2026-06-09) the AG rate peak is **5-8pm year-round, daily including holidays**; **4-9pm is the PDP/DR event window** (AR-14). The current fixture comment and `rates.ts`/`bucketUsage` treat 4-9pm as the rate peak. This story: define both clocks once in a new pure `src/lib/energy/tou.ts` (`RATE_PEAK_WINDOW` 17-20h, `DR_EVENT_WINDOW` 16-21h, each with a source/date comment, a test pinning they differ, and grower-free naming); fix the fixture's window claims. Do NOT rewire legacy `bucketUsage`'s 4-9pm bucketing - it is demo-only and 3.3 replaces that lever; leave a pointed comment there referencing `tou.ts`.
- **Sourcing the values (AC1 "dated, versioned"; AR-13 "values must be sourced/dated"):** two real sources, in priority order. (1) THE GROWER'S OWN BILLS - the extracted Feb/Mar 2026 line items in dev.db carry printed per-schedule rates: TOU energy $/kWh at 5dp (e.g. Peak 0.34015 / Off Peak 0.31089), demand $/kW printed in labels ("Max Demand 171.52 kW @ $20.54000", "@ $14.56000", "@ $21.43000" pre-March), customer charge per DAY ("18 days @ $1.19446", "@ $0.91565"). These date the winter-2026 values exactly (and capture the 03/01/2026 rate change). (2) PG&E's published tariff book (pge.com/tariffs, ELEC_SCHEDS_AG.pdf / ELEC_SCHEDS_AG-5.pdf) for structure + anything the winter bills cannot show (summer rates, schedules with no Batth bill). Values neither source yields stay representative and are MARKED so per-plan (a `source` note per plan or value-group). Honesty over completeness: the 3.3 back-test gate is designed to catch card inaccuracy and fall back to a qualitative finding - say what each number is, never present representative as sourced.
- **Fixture shape evolution (keep legacy compiling):** top-level gains `version` (e.g. "2026-06") and per-plan `sources`/note fields; plans gain `customerChargePerDay` (real bills bill the customer charge per day - the monthly figure cannot price a 30-vs-31-day cycle for 3.3/4.1; keep `customerChargePerMonth` for the legacy path) and, on AG-C family plans, `demandChargeLimiterPerKwh: 0.50` (the published AG-C Demand Charge Limiter: the summer peak-period demand charge is capped at $0.50 per peak-period kWh, protecting low-load-factor meters from one spike). Bounded to Batth's schedules + current equivalents = families AG-A/AG-B/AG-C (current) + AG-4/AG-5 (legacy, closed) - exactly what `validateRateCard` already requires; B1 (non-ag) stays OUT of the ag card. Real Batth printed tariffs to map: AGA1, AGA2, AGB, AGC, AG4C, AG5B, AG5C (with descriptor suffixes like "AGC Ag35+ kW High Use").
- **The new pricing entry point (AC3) - cycle-level, cents, no intervals:** the real account has NO interval data (FR-2 scopes it out), so 3.3/4.1 recompute from the canonical shape: TOU kWh quantities (tou_energy line items) + billed max demand kW (demand line items) + cycle day count. Add to `/lib/energy` a pure `priceCycleCents(input, plan)` where input = `{ days, season, energyKwh: Partial<Record<TouPeriod, number>>, maxDemandKw: number | null, peakWindowDemandKw?: number | null }`, returning an integer-cents breakdown `{ customerCents, energyCents, demandCents, totalCents }`. Round each component to cents before summing (mirrors how the bill prints rounded line items; AR-6 comparability with printed totals). Apply the demand-charge limiter where the plan carries it (cap the peak-period demand component at limiterPerKwh x peak-period kWh). Missing demand on a demand-carrying plan prices the demand component at 0 with the absence visible in the breakdown (null in, honest out) - never a fabricated kW. Existing `cycleCostUnderPlan`/`annualCostUnderRate` (USD floats, legacy) stay untouched.
- **The Vercel trap is REAL here (AC2):** `next.config.ts` `outputFileTracingIncludes` currently maps only `"/dashboard/pump-timing/**"` to `./fixtures/**/*` - the LEGACY route. Nothing traces fixtures for the `(app)` shell, so the first (app)-side `loadRateCard()` (3.3 renders findings from it) breaks on Vercel. Extend tracing so fixtures ship for the routes that will read them (e.g. add the `(app)` route globs or a root `"/**"` mapping). The loader itself already uses `process.cwd()` - keep it.
- **Validator:** extend `validateRateCard` for the new contract (version present, `customerChargePerDay` on every plan, limiter present on AG-C family plans). Loader behavior on a malformed card stays throw-on-load (a build/dev-time guard, not a user surface).
- **No UI in this story.** 3.2 ships data + pure math + loader. No findings are generated here (3.3 does that); the dashboard does not change. Legacy demo rec dollar values WILL shift when the card's numbers change - the demo seed is disposable by design (do not chase exact legacy demo dollars; just keep `npm test` green and the seed running).

## Tasks / Subtasks

- [x] **Task 1: TOU clocks module** - new `src/lib/energy/tou.ts`: `RATE_PEAK_WINDOW = { startHour: 17, endHour: 20 }` (PG&E ag rate peak, 5-8pm year-round daily, source ELEC_SCHEDS_AG.pdf, verified 2026-06-09) and `DR_EVENT_WINDOW = { startHour: 16, endHour: 21 }` (PDP/DR event window, 4-9pm) as separately named, separately documented exports + an `isInWindow(hour, window)` helper. Colocated `tou.test.ts` pinning the two windows differ and the boundary hours (17 in / 16 out of rate peak; 16 in DR). Leave a comment in `rate-compare.ts`'s `bucketUsage` noting its 4-9pm bucketing is the legacy demo path, superseded by `tou.ts` (do not rewire it). (AC4)
- [x] **Task 2: Evolve the fixture** - `fixtures/pge-ag-rate-card.json`: bump to a versioned, dated card (`version`, `effectiveDate` for the current rate change the bills show - 2026-03-01 - and an honest top-level `source`); correct the $comment's peak-window claim to 5-8pm rate peak vs 4-9pm DR; per plan add `customerChargePerDay`, AG-C family adds `demandChargeLimiterPerKwh: 0.50`; populate values from the real Batth bill line items where the winter-2026 bills show them (query dev.db BillingLineItem: tou_energy rates by period tariff, demand $/kW from labels, customer $/day from labels) and from the published tariff structure elsewhere, with per-plan `sources` notes marking sourced vs representative values; keep families AG-A/B/C/4/5 x small/large (Batth + current equivalents; no B1). (AC1)
- [x] **Task 3: Rate model types + cycle pricing** - `src/lib/energy/rates.ts`: extend `RatePlan`/`RateCard` types for the new fields (optional where legacy plans-in-tests omit them); add pure `priceCycleCents(input: CyclePriceInput, plan: RatePlan): CyclePriceBreakdown` (integer cents, per-component rounding, demand-charge limiter applied, null demand -> 0-priced component, partial energy record tolerated). Keep `seasonFor`/`sizeClassFor`/`familyOf`/`planFor`/`cycleCostUnderPlan`/`annualCostUnderRate` working unchanged. Extend `rates.test.ts`: breakdown arithmetic against hand-computed cents, limiter cap engages/does not engage, energy-only plan (no demand component), missing demand honesty, day-count proration of the customer charge, season selection. (AC3)
- [x] **Task 4: Loader + Vercel tracing** - `src/lib/pge/rate-card.ts`: validate the new contract (version, customerChargePerDay everywhere, limiter on AG-C plans); update its tracing comment. `next.config.ts`: extend `outputFileTracingIncludes` so committed fixtures ship for the (app) surface (not just the legacy pump-timing glob). (AC1, AC2)
- [x] **Task 5: Tests + validate** - new/extended tests green; `npm test` fully green (legacy rates/rate-compare/run suites must still pass with the evolved card shape); lint + tsc clean; `npm run db:reset` succeeds (the seed's `runEngines` consumes the evolved card); `npm run build` clean. State honestly in the Dev Agent Record which card values are bill-sourced (winter 2026) vs published-structure representative. (AC1-4)

### Review Findings

- [x] [Review][Patch] The loader validates paperwork, not prices: a card missing a season/bucket or carrying NaN/zero/negative prices, a 0 limiter, out-of-range summerMonths, an impossible effectiveDate, or perDay/perMonth drift loads clean and corrupts pricing downstream; AG-4/AG-5 validator errors do not say which tier [rate-card.ts]
- [x] [Review][Patch] priceCycleCents propagates NaN/Infinity/negative days silently; a negative peak kWh (NEM export) with the limiter present produces a negative demand component (a phantom credit); energy iterates the plan's keys so a malformed season silently drops billed kWh [rates.ts]
- [x] [Review][Patch] Half-cent products round DOWN through float drift (1 kWh @ 0.145 = 14.4999... -> 14 cents where the bill prints $0.15), tripping the future back-test gate by one cent per line [money.ts]
- [x] [Review][Patch] Stale conflating comments survive in rates.ts: DemandPrices still says "summer 4-9pm peak-window demand charge" and "(AG-A is energy-only)"; CycleUsage says "4-9pm window" unmarked as legacy; TouPeriod's partial_peak wording contradicts the card's current-plan carrier prices; ClockWindow does not document its start<end assumption [rates.ts, tou.ts]
- [x] [Review][Patch] The AG-A1 sourceNote claims its 12.33 demand rate is a post-03/01/2026 print, but every dated AGA1 demand print is pre-change; the dating is asserted, not shown [pge-ag-rate-card.json]
- [x] [Review][Defer] The legacy float lever (rateOptimization/cycleCostUnderPlan) never applies the demand-charge limiter and still buckets 4-9pm against 5-8pm-sourced prices - the documented demo-only conflation; 3.3 replaces the lever with priceCycleCents + tou.ts [rate-compare.ts]
- [x] [Review][Defer] familyOf cannot normalize the real bill-printed labels (AGA1, AGB, AGC, AG4C, AG5B, AG5C) - the meter-to-plan mapping is 3.3's lever scope [rates.ts]
- [x] [Review][Defer] A cycle straddling the 2026-03-01 rate change or a season boundary has no proration path - 3.3's back-test calibration owns sub-period splitting (real bills print split lines that extraction already captures) [rates.ts]
- [x] [Review][Defer] The limiter's kWh base (peak-period vs total cycle) is modeled as peak-period and unverified against the official sheet - verify during 3.3 calibration [rates.ts]

## Dev Notes

### Scope boundary

- **No lever, no findings, no UI.** 3.3 builds the back-test gate + rate-switch finding on top of `priceCycleCents`; 4.1 builds bill verification on it. This story is the substrate: data + pure math + loader.
- **Do not rewire the legacy engines** (`rate-compare.ts` engine half, `run.ts`, seed) beyond keeping them compiling and their tests green. Their 4-9pm bucketing and USD-float math are demo-only and die in 3.3.
- **Do not touch** `pge-meter-read-schedule.json` (3.5's fixture), the Prisma schema, or any `(app)` component.
- **Never hardcode a rate in code** (NFR-3): every $/kWh, $/kW, $/day, and the limiter figure live in the fixture; code carries only structure. The 35 kW size break and summer months stay card data (`sizeBreakKw`, `summerMonths`).

### What exists to build on

- **`src/lib/energy/rates.ts`** - the type vocabulary (`Season`, `TouPeriod`, `SizeClass`, `EnergyPrices`, `DemandPrices`, `RatePlan`, `RateCard`) and helpers (`seasonFor`, `sizeClassFor`, `familyOf`, `planFor`). Extend, do not fork: 3.3 should find ONE rate model. The new cents math imports nothing from the float path.
- **`src/lib/pge/rate-card.ts`** - loader with `process.cwd()` + family/tier validation; pattern for the validator extension.
- **`src/lib/format/money.ts`** - `centsFromDollars` for the rounding step (round each component via cents, AR-6). Pure energy code may implement its own `Math.round(x * 100)` if importing format feels cross-boundary - it does not: `/lib/format` is pure; reuse it.
- **Real bill values in dev.db** (the sourcing query surface): `BillingLineItem` joined through `BillingPeriod.tariff` - `kind='tou_energy'` rows carry `label` (Peak / Off Peak / Off-Peak spelling varies), `quantity` kWh, `rate` $/kWh 5dp; `kind='demand'` rows carry quantity kW with the $/kW printed in `kind='other'`-style labels ("Demand Charge ... @ $20.54000"); customer charge per day in labels ("18 days @ $1.19446"). Periods are Feb-Mar 2026 (winter); the 03/01/2026 rate change is visible (e.g. demand $21.43 -> $20.54).
- **Verified tariff facts (2026-06-09, pge.com/tariffs):** ag rate peak 5-8pm year-round daily including holidays; AG-C carries the Summer Peak Demand Charge plus the Demand Charge Limiter ($0.50/kWh cap protecting against one random spike); current families AG-A (energy-only, no demand) / AG-B (max-demand charge, lower energy) / AG-C (adds summer peak-period demand); AG-4/AG-5 closed legacy. Tariff book PDFs: ELEC_SCHEDS_AG.pdf, ELEC_SCHEDS_AG-5.pdf.
- **3.1's testing pattern**: pure module + colocated test, honesty laws tested explicitly (null in -> honest out), purity test (inputs not mutated).

### Critical guardrails

1. **Integer cents for anything compared to a bill** (AR-6): `priceCycleCents` returns cents; rates/usage keep full precision as inputs. Never float-dollar a computed total that 3.3/4.1 will compare to `printedTotalCents`.
2. **Honest absence**: null `maxDemandKw` on a demand-carrying plan must not invent a kW; the breakdown shows the 0-priced component so the caller can label it. A `Partial` energy record prices absent buckets as 0 kWh (absence of usage, not absence of data - document the distinction at the type).
3. **The limiter is AG-C's, summer-peak-window-scoped**: cap = `demandChargeLimiterPerKwh x peak-period kWh` applied to the peak-period demand component only, never to the max-demand component. Test both sides of the cap.
4. **Two clocks never conflate** (AR-14): `tou.ts` is the single home; rate math reads the rate window, DR copy (3.7) will read the DR window; the test pins them apart.
5. **TS strict + no-`any` + `noUncheckedIndexedAccess`**: the fixture parse is `unknown` -> validated; indexing `Partial<Record<TouPeriod, number>>` yields `number | undefined` - guard, don't assert.
6. **Keep the legacy suite green without chasing demo dollars**: rates.test.ts/rate-compare.test.ts build their own inline cards (verify); run.db tests and the seed consume the evolved fixture - shape compatibility is the contract, exact demo dollars are not.
7. **Fixture values carry their provenance**: per-plan source notes; the Dev Agent Record states which numbers are bill-sourced vs representative. No em dashes in any user-visible string (the fixture is data, not UI copy, but keep its notes plain).
8. **Vercel tracing**: AC2 is not satisfied by the loader alone - the (app) surface must trace fixtures or 3.3 breaks on deploy.

### Previous story intelligence (3.1)

- Review findings to carry forward: fail CLOSED on unrecognized stored unions; guard sub-cent/negative arithmetic explicitly; comments must not overclaim (the "load-bearing-looking orderBy" lesson - say when something is only a tiebreaker).
- The temp-data browser-verification pattern is not needed here (no UI); the verification surface is the test suite + db:reset + build.
- Gates at 3.1 close: lint, tsc, 56 files / 384 tests, production build. Match that bar.
- `npx vitest run <file>` for fast single-file iteration; full `npm test` before claiming green.

### Project Structure Notes

- New: `src/lib/energy/tou.ts` + `tou.test.ts`.
- Modified: `fixtures/pge-ag-rate-card.json`, `src/lib/energy/rates.ts` + `rates.test.ts`, `src/lib/pge/rate-card.ts` (+ its test if one exists), `next.config.ts`, a comment in `src/lib/energy/rate-compare.ts`.
- Untouched: prisma schema, seed, run.ts logic, all `(app)` UI, `pge-meter-read-schedule.json`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2] - the four ACs verbatim; FR-14 substrate; Epic 3 carries AR-13/AR-14.
- [Source: _bmad-output/planning-artifacts/architecture.md#AR-13] - dated/versioned runtime fixtures, `process.cwd()`, `outputFileTracingIncludes`, values sourced/dated, back-test band calibrated later (3.3).
- [Source: _bmad-output/planning-artifacts/architecture.md#AR-14, #Dates] - the two TOU clocks: rate peak 5-8pm vs DR 4-9pm, never conflated.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-14, #NFR-3] - no rate hardcoded in code; fixture bounded to Batth schedules + current equivalents.
- [Source: pge.com/tariffs ELEC_SCHEDS_AG.pdf + ELEC_SCHEDS_AG-5.pdf, verified 2026-06-09] - 5-8pm rate peak year-round daily; AG-C Summer Peak Demand Charge + Demand Charge Limiter ($0.50/kWh cap); AG-4/AG-5 closed.
- [Source: src/lib/energy/rates.ts, src/lib/pge/rate-card.ts, fixtures/pge-ag-rate-card.json] - the existing model this story evolves.
- [Source: dev.db BillingLineItem via BillingPeriod.tariff] - the real winter-2026 printed rates (the primary value source).

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- tsc exit 0; lint clean; npm test -> 57 files / 395 tests green (+2 tou.test.ts, +8 priceCycleCents tests, loader test extended; the fixture-coupled hero pins recomputed and hand-verified: AG-C2 38131.83, best AG-A, savings 2807.13 - the engine output matched the hand computation exactly). Seed + engines validated against the evolved card on a THROWAWAY db (`DATABASE_URL=file:./tmp-seed-check.db` migrate deploy + seed: 183 meters, 11 recommendations) because `db:reset` would have destroyed the real imported account in dev.db - dev.db untouched. `npm run build` clean.
- Bill-value extraction: queried dev.db BillingLineItem joined through BillingPeriod.tariff on the real account; identified the 2026-03-01 rate change from paired pre/post prints (e.g. AG5B demand 21.43 -> 20.54, AGC 26.03 -> 24.95) and used the post-change values as the current card.

### Completion Notes List

- **The card is now dated, versioned, and provenance-honest (v 2026-06.1, effective 2026-03-01).** Bill-sourced from the real account's Feb-Mar 2026 prints: customer charge per day (AGA 0.68895, AGB 0.91565, AGC 1.43343, AG4C 2.15003, AG5B 1.19446, AG5C 5.30871), max-demand $/kW (AGA1 12.33, AGA2 21.43, AGB 13.95, AGC 24.95, AG5B 20.54, AG5C 14.90), and winter TOU energy $/kWh at 5dp per schedule. Summer energy, partial_peak carriers, AG-C peak-period demand, and AG-4 energy/demand remain representative and say so in per-plan sourceNote fields; the top-level source + $comment state the split honestly.
- **Ground truth corrected the model:** the real AGA1/AGA2 bills print max-demand charges, so AG-A is no longer modeled energy-only (the loader test now pins the bill-sourced reality, while still asserting AG-A never carries a peak-period demand charge). AG-5's two tiers carry the AG5C (small meters) and AG5B (large meter) prints respectively, noted per plan.
- **The two TOU clocks live once in `tou.ts`:** RATE_PEAK_WINDOW 5-8pm (prices energy + peak-period demand, year-round daily per the published tariff) vs DR_EVENT_WINDOW 4-9pm (DR copy only), tested apart including the 4pm conflation hour. The legacy `bucketUsage` 4-9pm path is explicitly marked as the demo-only conflation that 3.3 replaces.
- **`priceCycleCents` is the cycle-level, integer-cents pricing entry 3.3/4.1 consume:** days x per-day customer charge, per-bucket rounded energy lines (matches a real printed line: 4.873 kWh @ 0.34015 = 166 cents), year-round max demand, summer peak-period demand with the AG-C Demand Charge Limiter cap (0.50/kWh of peak energy), null billed demand priced 0 (honest absence). Legacy float functions untouched.
- **Vercel trap closed:** `outputFileTracingIncludes` now traces `./fixtures/**/*` for every server route (`"/**"`), not just the legacy pump-timing route, so the (app) shell can read the card on deploy.
- **Validator hardened:** version, YYYY-MM-DD effectiveDate, per-plan customerChargePerDay + sourceNote, AG-C limiter - all load-time guards.

### File List

- `src/lib/energy/tou.ts` (new) - the two TOU clocks + isInWindow.
- `src/lib/energy/tou.test.ts` (new) - windows distinct + boundary hours.
- `fixtures/pge-ag-rate-card.json` (modified) - dated/versioned/provenance-noted card, bill-sourced winter values, customerChargePerDay, AG-C limiter.
- `src/lib/energy/rates.ts` (modified) - RatePlan/RateCard new optional fields; priceCycleCents + CyclePriceInput/CyclePriceBreakdown; TouPeriod comment corrected to the 5-8pm rate peak.
- `src/lib/energy/rates.test.ts` (modified) - 8 priceCycleCents tests (limiter both sides, energy-only, null demand, winter, real-bill line rounding, per-day derivation).
- `src/lib/pge/rate-card.ts` (modified) - validator extended (version, date shape, perDay, sourceNote, AG-C limiter); tracing comment updated.
- `src/lib/pge/rate-card.test.ts` (modified) - AG-A demand reality, provenance-to-the-plan, limiter assertions.
- `src/lib/energy/rate-compare.ts` (modified) - legacy-clock warning comment on bucketCycle.
- `src/lib/energy/rate-compare.test.ts` (modified) - hero pins recomputed against the 2026-06.1 card (hand-verified).
- `next.config.ts` (modified) - fixtures traced for all server routes.

## Code Review (2026-06-09)

Adversarial review (Blind Hunter diff-only + Edge Case Hunter with repo access + Acceptance Auditor against the spec) against baseline 4dd7a82. The auditor independently verified all 4 ACs hold (process.cwd loader, "/**" tracing matches every route, pure cents math with the limiter scoped to the peak-period component, the two clocks pinned apart), re-ran the gates, recomputed the hero arithmetic by hand, and cross-checked every fixture value against the real prints in dev.db - including confirming the AG-A demand correction is genuinely on the bills (AGA1 @$12.33, AGA2 @$21.43).

Triage of ~30 raw findings: 5 patch groups applied, 4 deferred with record, 8 dismissed with reason (AG-A demand verified real; AG-5 tier inversion is honest single-meter provenance, noted per plan; the "/**" tracing key verified and fixtures total 812K so the trace cost is negligible; committed rates are public tariff values, not grower financials or credentials; the db:reset substitution was disclosed and the intent met on a throwaway db; the 5-8pm window is sourced to PG&E's published tariff materials).

Patches: the loader now validates prices, not just paperwork (every season carries all three finite non-negative TOU prices and valid demand rates, summerMonths are real months, effectiveDate is a real date, the limiter must be positive, perDay/perMonth cannot drift, AG-4/AG-5 errors name their tier); priceCycleCents throws loudly on NaN/Infinity/negative structural inputs (negative kWh stays legal - NEM export - and prices as a credit line), floors the limiter cap at zero so net-export peak energy can never mint a phantom demand credit, and iterates the full TOU bucket union so billed kWh can never be silently dropped; centsFromDollars corrects binary float drift before rounding so a true half-cent line rounds up like the bill prints (1 kWh @ 0.145 = 15 cents, not 14); the stale 4-9pm and "AG-A is energy-only" comments in rates.ts were corrected and the ClockWindow same-day constraint documented; the AG-A1 sourceNote now states its 12.33 demand rate is the PRE-change print (no post-change AGA1 demand print exists).

Deferred with record (deferred-work.md): the legacy float lever's missing limiter + 4-9pm conflation (3.3 replaces it), familyOf vs real bill-printed labels (3.3's mapping), rate-change/season straddle proration (3.3 calibration), and the limiter's kWh base verification (3.3 calibration).

Post-review validation: tsc exit 0, lint clean, 57 files / 398 tests green (+3 review tests), production build clean.

## Change Log

- 2026-06-09: Code review - 5 patch groups (price-validating loader, loud input guards + zero-floored limiter cap + exhaustive bucket iteration in priceCycleCents, half-cent-correct centsFromDollars, conflating-comment fixes, AG-A1 provenance dating), 4 deferred with record, 8 dismissed with reason. lint + tsc + 398 tests + production build green. Status -> done.
- 2026-06-09: Implemented Story 3.2 - dated/versioned/bill-sourced rate card (winter 2026 prints from the real account, representative values marked per plan), the two TOU clocks in tou.ts (5-8pm rate peak vs 4-9pm DR window), pure integer-cents priceCycleCents with the AG-C demand-charge limiter, hardened loader validation, and fixtures traced for all server routes. lint + tsc + 395 tests + throwaway-db seed validation + production build green. Status -> review.
