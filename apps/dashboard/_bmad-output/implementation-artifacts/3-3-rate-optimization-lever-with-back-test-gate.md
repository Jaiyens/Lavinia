---
baseline_commit: 94d94e69dee6c7ba239b8389677a618e1ffb1713
---

# Story 3.3: Rate optimization lever with back-test gate

Status: done

## Story

As a grower,
I want to know which meters are on the wrong rate and what switching would save, with the math I can check,
so that I can capture savings with zero operational change and trust the number.

## Acceptance Criteria

1. **Given** a meter on a legacy/non-optimal schedule, **When** analyzed, **Then** the lever computes the dollar impact of switching to the cheapest eligible schedule using the dated fixture + the meter's own usage; the 27 legacy-flagged meters lead.

2. **Given** the back-test gate, **When** the meter's current charges are recomputed from the fixture + its TOU usage and billed demand and the result is within the calibrated percentage band, **Then** the finding shows savings as a labeled estimate ("estimated savings ~$X") with the rates used and the rate effective date.

3. **Given** a back-test outside the band, **When** evaluated, **Then** the meter falls back to a qualitative legacy -> current finding with no dollar number.

4. **Given** eligibility, **When** the finding is built, **Then** it respects the 35 kW threshold and notes the once-per-12-months switch constraint.

5. **Given** the savings number, **When** displayed, **Then** it is never presented as cent-exact; the rate math is pure and tested.

### AC interpretation notes (read before coding)

This is the FIRST REAL LEVER (FR-14). 3.1 built the surface (rail/sheet/drawer/card), 3.2 built the substrate (dated card + `priceCycleCents` + the tou.ts clocks). This story builds the engine that turns the real account's reconciled bills into persisted rate-switch Recommendations - and the gate that keeps untrustworthy dollars off the screen. No new UI: findings render through the existing 3.1 surface. The legacy demo engines (`rate-compare.ts` engine half, `run.ts`) stay untouched and keep serving the demo seed.

- **Data reality (probed 2026-06-09 in dev.db, the real account `real-4699664587-8`):** 46 meters, 39 reconciled. Printed schedule labels are the BILL'S spellings, both bare and descriptor-suffixed: `AG4C` (1), `AG5B` / `AG5B Large Time-of-Use Agricultural Power` (5), `AG5C` / `AG5C Large Time-of-Use Agricultural Power` (4), `AGA1` / `AGA1 Ag<35 kW Low Use` (9), `AGA2` / `AGA2 Ag<35 kW High Use` (6), `AGB Ag35+ kW Med Use` (5), `AGC Ag35+ kW High Use` (12), `B1 Bus Low Use` (4, NON-AG, always excluded). `Pump.isLegacy` is FALSE on every real meter (the known Epic-1 import gap; deferred-work 2-4) - legacy-ness must be derived from the schedule mapping, never read from that column. 10 real meters are legacy (AG4C/AG5B/AG5C). No real meter is solar (`isSolar=0` everywhere; NEM persistence is a 1-8 deferral), so the solar-exclusion rule has no live targets but must still exist for the demo path and the future.
- **The epics' "27 legacy-flagged meters lead" is the MASTER-SPREADSHEET farm count, not this account.** The real imported account has 10 legacy meters. Do not fabricate 27: "lead" means legacy meters' findings rank first (severity + impact via the existing `compareFindings` sort), and every legacy meter gets a finding (dollar or qualitative). State the honest count in copy.
- **Cycle shape (the back-test input):** real periods span 2025-12-11 to 2026-03-12 and the Feb-Mar cycles STRADDLE the 2026-03-01 rate change. Extraction captured the printed split: `tou_energy` line items appear once PER SUB-PERIOD (same "Peak"/"Off-Peak" label, different 5dp `rate` print), customer-charge prints live in `other` labels ("18 days @ $1.19446" / "12 days @ $0.68895"), and demand prints live in `other` labels with the $/kW AND the sub-period kW ("Demand Charge Max Demand (02/11-02/28) 244.320000 kW @$26.03000"). CAUTION: the `demand`-KIND rows are aggregates - their `quantity` can be the SUM of sub-period kW (278.88 = sub-period kWs added), NOT the billed max demand, and demand dollars are PRORATED by sub-period days (244.32 kW @ 26.03 x 18-of-cycle days = $3,815.79). Derive billed kWh from `tou_energy` quantities (sum sub-periods per bucket), days from the period's own start/close, and billed demand kW carefully (max of parsed sub-period kW, or the period's `peakKw` when set - probe it; never the summed `demand` row quantity).
- **The card prices ONE vintage (effective 2026-03-01, post-change values).** Pre-change sub-periods recompute ~4% hot on demand (26.03 printed vs 24.95 carded) plus small out-of-fixture lines (Energy Commission Tax). That drift is exactly what the PRD's percentage band exists to absorb (FR-14: "riders, baseline adjustments, and credits outside the fixture"). CALIBRATE the band against the 39 reconciled SAs: run the back-test across all of them, look at the deviation distribution, pick the tightest band that passes the genuinely-clean meters, and RECORD the calibration evidence (distribution summary + chosen band + rationale) in the Dev Agent Record. The band is a named constant with a sourced comment - it is a model tolerance, not a rate, so a code constant is legal (NFR-3 bars rates, not tolerances).
- **Schedule mapping is THIS story's deferred-work item (from 3.2):** `familyOf()` cannot parse the bill spellings. Build a pure, tested label normalizer in the new lever module that maps every real printed label (bare + suffixed) to a card plan: AGA1 -> AG-A1 (small), AGA2 -> AG-A2 (the card's row; note the bill prints "<35 kW" while the card models AG-A2 as the large tier - map by SCHEDULE label, document the tension, do not silently re-tier), AGB -> AG-B large, AGC -> AG-C large, AG4C -> AG-4 (tier by billed demand vs `card.sizeBreakKw`), AG5B -> AG-5 large, AG5C -> AG-5 small (the 3.2 card's per-plan sourceNotes pin AG5B=large / AG5C=small from the real prints). `B1*` and any unmapped label -> null (no finding, log-free silence; never a guess). Case/whitespace tolerant.
- **Eligibility (AC4) - the 35 kW threshold is a one-way ratchet:** candidate targets are CURRENT (non-legacy), AGRICULTURAL plans from the card only. Size class: a meter whose current schedule is a 35+ class (AGB/AGC/AG5B) or whose billed demand on ANY cycle is >= `card.sizeBreakKw` must only see large-tier candidates - NEVER propose a <35 kW schedule from winter-only observation (winter demand understates summer; proposing AG-A to a 100HP pump would be a false promise). Small-class meters (AGA1/AGA2/AG5C/AG4C-with-small-demand) see small-tier candidates. The once-per-12-months switch constraint is a COPY note on the finding (no enforcement data exists), in `/copy`.
- **The savings number is over the meter's OWN billed cycles, never annualized (AC5 + honesty law):** only winter cycles exist (Dec-Mar). Extrapolating a year from winter would fabricate summer. Savings = (current-schedule recompute - cheapest-candidate recompute) summed over the meter's RECONCILED cycles, surfaced as "estimated savings ~$X over your last N days of bills" style copy (impactUsd carries the float dollars per the existing column; display rounds to whole dollars via the 3.1 path, and `~` labeled estimate wording is mandatory). Candidates are priced with `priceCycleCents` on the SAME `CyclePriceInput` the back-test used - one usage, two schedules, integer cents both sides.
- **The gate (AC2/AC3), precisely:** per meter, recompute each reconciled cycle's CURRENT charges with `priceCycleCents` (current plan from the mapping) and compare `totalCents` to `printedTotalCents` (both integer cents). Pass = aggregate deviation across the meter's reconciled cycles within the band (decide and document whether any single wild cycle also fails it - recommend yes, fail closed). On pass + positive savings -> the dollar finding (severity `act`), copy carrying the rates used (schedule names) + the card's effective date. On fail: LEGACY meters fall back to the qualitative legacy->current finding (severity `watch`, `impactNote`, NO dollar); non-legacy off-band meters get NO finding (silence beats an unverified number; FR-13 already hides no-impact-no-note findings). Negative printed totals (P002 has -$149.11, a NEM-credit cycle) and zero-usage cycles must not crash or produce nonsense - a credit cycle is not back-testable against a consumption-only recompute; exclude such cycles from the gate with the exclusion visible in the lever's returned reasoning.
- **Where it runs + persists:** new pure lever module in `/lib/energy` + a new DB runner edge in `/lib/recommendations` (do NOT extend `runEngines` - it is the demo-interval engine). The runner takes a PrismaClient, loads the farm's meters/periods/line items, runs the pure lever, and persists drafts under the EXISTING `RATE_OPTIMIZATION_TOOL` key idempotently (delete this farm's PENDING recs for that tool, re-insert - exactly the `runEngines` idempotency contract, scoped to the one tool). Per-meter linkage via `action.params.pumpId` (the 3.1 card/drawer/trace contract). Trigger: a small `scripts/run-levers.ts` (npm script `levers:run`) + call it at the end of `scripts/persist-demo-fixture.ts` so `db:import-fixture` lands findings. The demo seed keeps using `runEngines`; never run the new lever and `runEngines` against the same farm (both own the same tool key).
- **Close the `isLegacy` deferred item (2-4) while you own the mapping:** when the runner maps a meter's schedule to a legacy plan, backfill `Pump.isLegacy = true` (and false when current) so the table's legacy column finally lights up. Cheap, in-scope, closes a recorded deferral.

## Tasks / Subtasks

- [x] **Task 1: Pure lever module** - new `src/lib/energy/rate-lever.ts` (+ colocated `rate-lever.test.ts`):
  - [x] `planFromLabel(label: string, card: RateCard, billedMaxKw: number | null): RatePlan | null` - the bill-spelling normalizer per the mapping table above (closes the 3.2 deferral). Tests: every real spelling (bare + suffixed), B1 -> null, unknown -> null, AG4C tiering by demand, case/whitespace tolerance.
  - [x] Cycle projection: a typed `LeverCycle` built from the canonical period (days from start/close, energyKwh per TOU bucket summed across sub-period `tou_energy` rows, billed demand kW (document the source: parsed/peakKw - probe which is reliable), season via `seasonFor`, `printedTotalCents`). Negative-total / zero-usage exclusion rules with reasons.
  - [x] `backTestMeter(cycles, plan): { deviationPct, perCycle, testedCycles, excluded }` - `priceCycleCents` recompute vs printed cents, aggregate + per-cycle deviation. Tests: hand-computed deviations, exclusion of credit cycles, empty input.
  - [x] `rateLever(input, card, band): RateLeverResult` - eligibility-filtered candidates (current + agricultural + size-ratchet), cheapest candidate by the same-cycles recompute, gate decision, savings cents, and a structured reasoning record (band, deviation, rates used, effective date, cycles/days basis). Tests: gate pass -> dollar finding data; legacy off-band -> qualitative; non-legacy off-band -> none; size ratchet (35+ meter never sees small candidates); savings never negative-surfaced (a meter already on the cheapest rate gets no finding); purity (inputs not mutated).
- [x] **Task 2: Copy** - extend `en.rateOptimization` with the real-lever strings: situation (meter + current schedule + plain "wrong rate / cheaper rate exists" framing), action ("Move it to AG-A1" style), impact line carrying "estimated savings ~$X" + the rates used (schedule names) + effective date + the billed-days basis, the once-per-12-months note, and the per-meter qualitative legacy fallback (situation + note, no dollar). Plain operator English; no em dashes; no exclamation marks; never kW jargon in surface copy (the 35 kW threshold is internal logic, not copy; "bigger pumps use a different rate family" is the legal phrasing if needed). (AC2, AC3, AC4)
- [x] **Task 3: Runner edge** - new `src/lib/recommendations/run-rate-lever.ts`: `runRateLever(prisma, farmId, asOf?)` - load meters + reconciled periods + line items (reuse `loadMetersForFarm` if its shape serves; otherwise a lean query), map schedules, run the pure lever per meter, build drafts via `draftRecommendation` (tool = `RATE_OPTIMIZATION_TOOL`, `action.params.pumpId`, severity act/watch per the gate), delete-pending-then-insert idempotently for that tool only, backfill `Pump.isLegacy` from the mapping. Colocated `run-rate-lever.db.test.ts`: idempotency (re-run no dupes, resolved recs untouched), tool-scoping (other tools' recs survive), isLegacy backfill, linkage params. (AC1)
- [x] **Task 4: Trigger** - `scripts/run-levers.ts` (tsx; resolves the dashboard farm or takes a farm id arg, runs `runRateLever`, prints the per-tool counts) + `"levers:run"` npm script; append a `runRateLever` call to `scripts/persist-demo-fixture.ts` after persistence. Do not touch `prisma/seed.ts` (the demo seed stays on `runEngines`). (AC1)
- [x] **Task 5: Calibrate the band against the real account** - run the back-test across the 39 reconciled SAs, capture the deviation distribution, choose the band, record the evidence + the chosen constant in the Dev Agent Record, and verify the resulting finding set is defensible (legacy meters lead, dollar findings carry the labeled-estimate copy, off-band meters fall back honestly). Browser-verify on the real account: rail shows the rate findings (legacy first), a finding's trace opens the right meter, dollars render whole-dollar via the 3.1 path. (AC1-5)
- [x] **Task 6: Gates** - lint + tsc clean; full `npm test` green (legacy rates/rate-compare/run suites untouched and green); `npm run build` clean. State honestly in the Dev Agent Record which meters got dollar findings vs qualitative vs none, and why.

### Review Findings

- [x] [Review][Patch][High] The solar exclusion never fired: persistExtraction never set isSolar, and ALL FOUR legacy dollar findings (P017/P018/P003/P028) were NEM generating SAs whose monthly bills are partial (energy settles at the annual true-up) - the quoted "savings over the last 30 days" was computed from customer/demand charges alone. Importer now flags NEM generating SAs isSolar; the runner never prices solar meters; solar legacy meters get the qualitative finding with an honest solar true-up note [import.ts, run-rate-lever.ts, en.ts]
- [x] [Review][Patch] A $0 printed total passed the `< 0` credit exclusion, forced its per-cycle deviation to 0 (a free pass through the band), and inflated the savings base; now excluded (`zero_total`), and a hand-built non-positive cycle back-tests to an infinite deviation [rate-lever.ts]
- [x] [Review][Patch] The aggregate deviation used the signed net, so a +9% and a -9% cycle cancelled to a clean 0%; now the sum of ABSOLUTE per-cycle errors over the printed total [rate-lever.ts]
- [x] [Review][Patch] Quoted savings could be pure model drift (the gate admits up to 5%); the savings floor is now max($1, the meter's own summed absolute back-test error) so a dollar is never indistinguishable from drift [rate-lever.ts]
- [x] [Review][Patch] Dismissed/done findings resurrected as fresh pending twins on every re-run (and db:import-fixture now re-runs the lever every import); drafts matching a resolved twin (kind + pumpId + target) are skipped [run-rate-lever.ts]
- [x] [Review][Patch] The qualitative legacy note claimed "could not match this meter's bills" even when the bills matched and there were simply no savings; reason-honest notes added (no_savings, solar true-up, cannot-match) and the dead no_usage_basis remap removed [rate-lever.ts, run-rate-lever.ts, en.ts]
- [x] [Review][Patch] A straddling cycle with mixed customer-charge label formats (one sub-period prints a day count, one does not) silently undercounted days; printed day sums are now trusted only within 2 days of the inclusive span. A close-before-start period threw out of priceCycleCents and aborted the whole farm run; now excluded (`invalid_period`) [rate-lever.ts]
- [x] [Review][Patch] The 35 kW ratchet read demand only off testable cycles, so a credit cycle carrying the meter's real peak could let a <35 kW candidate through; demand is now read off every period. A summer cycle could be priced into AG-C2 with its peak-period demand component silently 0 (no peak-window kW exists in the canonical shape); peak-demand-charging candidates are now skipped for summer cycles [rate-lever.ts]
- [x] [Review][Patch] scripts/run-levers.ts's refusal message invited "pass a farm id explicitly to override" - a footgun pointing at the runEngines tool-key collision; wording fixed [run-levers.ts]
- [x] [Review][Defer] Current-to-current swap estimates rest on winter-only observation (the 4 live estimates: P060, SWANSON, PUMP 73, PUMP 55); the basis is honestly labeled ("over the last 30 days of bills") per the spec, but seasonal representativeness for usage-tiered swaps should be revisited when summer bills land [deferred-work.md]
- [x] [Review][Defer] Cycle straddling the 2026-03-01 rate change still prices one vintage (the band absorbs ~4 percent drift today) - already recorded from 3.2; unchanged [deferred-work.md]
- [x] [Review][Defer] isSolar-from-NEM is the minimum stopgap signal; full NEM persistence (SolarArray graph, monthly net usage, true-up) remains the recorded 1-8 deferral that 3.4 needs [deferred-work.md]

## Dev Notes

### Scope boundary

- **No UI components change.** The 3.1 surface renders whatever the runner persists. Copy strings are the only render-adjacent change. If the finding card turns out to need nothing new, touch nothing in `(app)`.
- **Do not rewire the legacy demo engines** (`rate-compare.ts`'s `rateOptimization`/`bucketUsage`, `run.ts`, the seed). They serve the demo farm until it is rebuilt. Their tests stay green as-is.
- **Do not touch** the 3.5 fixture (`pge-meter-read-schedule.json`), the solar lever (3.4), bill verification (4.1 - it reuses `priceCycleCents` + this band experience but is its own story), or the Prisma schema (no migration; `isLegacy` is an existing column).
- **Never hardcode a rate.** The band constant is a tolerance, not a rate; every $/kWh, $/kW, $/day figure flows from the loaded card.

### What exists to build on

- **`src/lib/energy/rates.ts`** - `priceCycleCents(CyclePriceInput, plan)` integer-cents breakdown (per-component rounding, AG-C limiter, null-demand honesty), `seasonFor`, `sizeClassFor`, `planFor` (family+size; your `planFromLabel` should resolve to a plan, reusing these where they fit), `TOU_PERIODS`.
- **`src/lib/pge/rate-card.ts`** - `loadRateCard()` (validated, throws on malformed). Card v2026-06.1: families AG-A/B/C (current) + AG-4/AG-5 (legacy) x small/large; per-plan `sourceNote` provenance; `customerChargePerDay`; AG-C `demandChargeLimiterPerKwh`.
- **`src/lib/dashboard/load.ts`** - `loadMetersForFarm` already projects exactly the inputs the lever needs (`rateSchedule`, `coverageState`, `periods[].{start,close,printedTotalCents,tariff,peakKw,lineItems[]}` with typed kinds). Reusing it keeps one projection; it is a dashboard edge but lives on the same plain-shapes contract - acceptable, or write a lean twin in the runner. Dev's choice; do not duplicate the line-item narrowing logic a third way.
- **`src/lib/recommendations/{build,types,top-finding}.ts`** - `draftRecommendation`, the grammar, `compareFindings` (severity desc, impact desc - this is what makes legacy/dollar findings "lead" in the rail with zero new sort code).
- **`src/lib/recommendations/run.ts`** - the idempotency + persistence pattern to mirror (delete pending by tool, `createMany`, `as unknown as Prisma.InputJsonValue` for writes).
- **3.1's surface contract:** `action.params.pumpId` = Pump cuid for the trace; `impactUsd` Float DOLLARS (not cents - display rounds); a finding with no impact and no note is invisible.
- **`scripts/persist-demo-fixture.ts`** - the existing fixture-import script to append the runner call to; `scripts/import-demo-account.ts` exists but costs a paid Gateway pass (do NOT run it).

### Critical guardrails

1. **Fail closed, everywhere.** Unmapped schedule -> no finding. Off-band non-legacy -> no finding. Off-band legacy -> qualitative only. Credit/zero cycles -> excluded from the gate, visibly. A wrong dollar on this surface costs the product its trust thesis.
2. **Integer cents in the gate; float dollars only at the Recommendation column boundary** (`impactUsd` is the legacy Float column - convert once, at draft-build time, `savingsCents / 100`).
3. **Size-class ratchet is non-negotiable** (AC4): winter-only data must never downgrade a meter's tier. Test it explicitly.
4. **The two TOU clocks:** all pricing reads the card's 5-8pm-sourced prices via `priceCycleCents`; nothing in this story touches the 4-9pm DR window (3.7's surface). Do not import the legacy `bucketUsage`.
5. **TS strict + no-`any` + `noUncheckedIndexedAccess`:** the line-item walk and label parsing are the traps; narrow, never assert.
6. **Copy honesty (AC5):** "estimated savings ~$X", never cent-precise, never "you will save". The once-per-12-months constraint is stated. No em dashes, no exclamation marks, grower language.
7. **Idempotent + tool-scoped persistence:** re-running the lever never duplicates, never resurrects resolved findings, never touches other tools' rows.
8. **Demo/real never merge:** the runner runs on the farm it is given; the script resolves the dashboard farm explicitly. Never call `runEngines` and `runRateLever` on the same farm.

### Previous story intelligence (3.2 / 3.1)

- 3.2's review hardened `priceCycleCents` for exactly this story: it throws on NaN/negative structural inputs (so validate/exclude BEFORE calling), negative kWh is legal (NEM export prices as a credit line), the limiter cap floors at 0. `centsFromDollars` is half-cent-correct. Trust these; do not re-implement rounding.
- 3.2 deferred FOUR items to this story (deferred-work.md): the label mapping (Task 1), sub-period/straddle pricing (the band calibration owns it - decide whether to price sub-periods separately or absorb the drift in the band, and DOCUMENT the choice), the limiter's kWh base verification (check during calibration whether the AG-C recompute lands inside the band with the peak-period-kWh base; note the finding), and the legacy float lever's conflations (resolved by not using it here).
- 3.1's review lessons: fail CLOSED on unrecognized unions; atomic writes (`deleteMany`+`createMany` in a `$transaction` if interleaving is possible); comments must not overclaim; `npx vitest run <file>` for iteration, full `npm test` before claiming green.
- Gates at 3.2 close: lint, tsc, 57 files / 398 tests, production build. Match or beat.

### Project Structure Notes

- New: `src/lib/energy/rate-lever.ts` + `rate-lever.test.ts`, `src/lib/recommendations/run-rate-lever.ts` + `run-rate-lever.db.test.ts`, `scripts/run-levers.ts`.
- Modified: `src/copy/en.ts` (rateOptimization strings), `package.json` (levers:run), `scripts/persist-demo-fixture.ts` (append runner call).
- Untouched: `(app)` components, prisma schema, seed, `run.ts`, `rate-compare.ts`, fixtures.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3] - the five ACs verbatim.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-14] - back-test gate semantics, percentage band (not one cent), labeled estimate, qualitative fallback, 35 kW + once-per-12-months, bounded fixture scope; #SM-4 - softened bar: back-test honest about meters it cannot reconcile; #Open Q2 - band calibrated during build.
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns] - integer-cents comparisons (AR-6), recommendation grammar verbatim, pure math + colocated tests, DB edges take PrismaClient.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#3-2] - the four carried items this story owns; #2-4 - the isLegacy backfill this story closes.
- [Source: _bmad-output/implementation-artifacts/3-2-*.md#Dev Agent Record] - card provenance (which values are bill-sourced), AG5B=large/AG5C=small tiering, the 03/01/2026 rate-change evidence.
- [Source: dev.db real-4699664587-8, probed 2026-06-09] - schedule label spellings + counts, sub-period split line items, demand-row aggregation caution, the -$149.11 credit cycle, 39 reconciled SAs.
- [Source: src/lib/recommendations/run.ts] - the idempotent persistence pattern; src/lib/dashboard/findings.ts - what the surface reads.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- tsc exit 0; lint clean; npm test -> 59 files / 428 tests green (+27 rate-lever.test.ts, +3 run-rate-lever.db.test.ts); `npm run build` clean.
- Band calibration (temporary probe script against dev.db, deleted after): 34 testable reconciled SAs (39 reconciled minus 4 non-ag B1 minus 1 NEM-credit cycle P002). Deviation distribution: 27 within 2%, 28 within 3%, 30 within 4%, 31 within 5%, 32 within 6%, 34 within 15%. Chose 5%: it holds the headline $11,727.33 pump P054 (4.59% drift, dominated by its pre-03/01 demand sub-period priced on the post-change card) while excluding the genuine outliers (AGA2 meter at 6.0%, two small-dollar meters at 12.2%/12.4% whose prints the card recompute genuinely misses). Recorded in the BACK_TEST_BAND_PCT comment with the same numbers.
- Live run on the real account (`npm run levers:run`): 14 findings - 8 dollar estimates (P017 AG-4 -> AG-A1 ~$44; P028 AG-5 -> AG-A1 ~$139; P003/P018 AG-5 -> AG-B2 ~$8 each; P060 AG-A1 -> AG-A2 ~$38; FARM SHOP SWANSON AG-A2 -> AG-A1 ~$26; PUMP #55/PUMP 73 AG-C2 -> AG-B2 ~$14-15) + 6 qualitative legacy (the AG5B/AG5C meters whose coverage is needs_review plus the credit-cycle P002); 10 meters backfilled isLegacy=true. Meters that stay silent and why: the 4 B1 meters (non-ag, unmapped by design), the 12 idle AGC meters (zero tested usage - the no_usage_basis guard; an idle-winter customer-charge delta is not a defensible reason to swap usage-tiered current schedules), P054 (back-tests clean and is already on its cheapest eligible schedule - the honest answer is no finding), the off-band non-legacy meters (6%/12% deviations fail closed with no number).
- Browser-verified against the production build on the real account: the rail renders "Estimated savings ~$139 over the last 30 days of bills, figured from PG&E's published AG5C and AG-A1 rates effective March 1, 2026. PG&E allows one rate change per 12 months." under the dollar figure, the qualitative legacy cards ("still on AG5B, a closed rate PG&E no longer offers"), and the action labels; the estimate copy and the 12-month constraint both present in the served HTML.

### Completion Notes List

- **The first real lever is live and gated.** `rateLever` (pure, 27 tests) maps the bill's printed schedule spellings to card plans (closing the 3.2 familyOf deferral), reduces reconciled periods to priceable cycles (sub-period TOU rows summed per bucket, days from the customer-charge prints with an inclusive-span fallback, billed demand from the printed demand labels - the `demand`-kind rows aggregate sub-periods and are only a hot-biased fallback), back-tests the meter's CURRENT charges against the printed totals in integer cents, and only quotes savings inside the calibrated 5% band (per-cycle cap 2x). Credit cycles, unmappable buckets, and missing totals are excluded with visible reasons.
- **Real-world eligibility beats the card's internal tiers.** During calibration the lever initially proposed AG-A2 (a <35 kW schedule per the bill's own print) to 35+ kW AG-C meters because the card models AG-A2 as its large row. The mapping now carries `realTier` (published size eligibility) separate from the card pricing row, and candidates come from real-tier sets (small: AG-A1/AG-A2; large: AG-B2/AG-C2). The 35 kW ratchet is one-way: winter observation can promote a small meter, never downgrade a large one.
- **The idle-winter guard.** A current-schedule meter with zero tested kWh gets NO swap finding (`no_usage_basis`): an idle meter's customer-charge delta between usage-tiered current schedules flips with summer usage and would be a false promise. Legacy meters are exempt - the move off a closed schedule is structurally right (its day-rate delta holds year round), so idle legacy meters still get their dollar.
- **Savings are model-vs-model over the meter's own billed span, never annualized.** currentCost and targetCost are both card recomputes over the same cycles (riders cancel), surfaced as "~$X over the last N days of bills" with the rates used and the card's effective date; impactUsd carries the float-dollar column, display rounds whole-dollar.
- **The runner is idempotent, tool-scoped, transactional**, and backfills `Pump.isLegacy` from the mapping (closing the 2-4 deferral - the table's legacy column now lights up on the real account). `scripts/run-levers.ts` (npm `levers:run`) refuses to run against the demo seed (runEngines owns that farm's findings); `db:import-fixture` now lands findings automatically after persisting the fixture.
- **One render-adjacent change (AC2):** the finding card now shows `impactNote` even when a dollar is present - the note carries the labeled estimate with the rates used and effective date, which AC2 requires on the visible card. Note-only findings render exactly as before.

### File List

- `src/lib/energy/rate-lever.ts` (new) - planFromLabel/mapScheduleLabel, cycleFromPeriod, backTestMeter, costUnderPlanCents, rateLever; BACK_TEST_BAND_PCT calibrated constant.
- `src/lib/energy/rate-lever.test.ts` (new) - 27 tests: label mapping, bucket mapping, cycle projection, back-test arithmetic, gate outcomes, size ratchet, idle guards, purity.
- `src/lib/recommendations/run-rate-lever.ts` (new) - the DB runner edge: idempotent tool-scoped persistence + isLegacy backfill in one transaction.
- `src/lib/recommendations/run-rate-lever.db.test.ts` (new) - 3 tests: gated estimate + backfill + linkage, idempotency + tool scoping, off-band fallback to qualitative.
- `src/copy/en.ts` (modified) - rateOptimization.lever strings (situation, labeled estimate with rates + effective date + 12-month note, qualitative legacy set).
- `src/app/(app)/_components/finding-card.tsx` (modified) - impactNote renders alongside the dollar (AC2's rates-used/effective-date line).
- `scripts/run-levers.ts` (new) - CLI trigger; refuses the demo seed.
- `scripts/persist-demo-fixture.ts` (modified) - runs the lever after persisting the fixture.
- `package.json` (modified) - `levers:run` script.

## Code Review (2026-06-09)

Adversarial review (Blind Hunter diff-only + Edge Case Hunter with repo access + Acceptance Auditor against the spec) against baseline 94d94e6. The auditor independently re-ran the gates (tsc, lint, full suite), re-queried dev.db (14 pending findings, linkage to real pumps, 10 isLegacy flags, demo farm untouched), re-executed the pure lever read-only to verify every silent meter's reason, and passed all five ACs.

Triage of ~28 raw findings: 9 patch groups applied, 3 deferred with record, 6 dismissed with reason (the 35 kW `>` boundary verified consistent across sizeClassFor and the ratchet; the frozen asOf default matches run.ts's deterministic contract and both callers pass now(); the inclusive day-span fallback verified against the real prints, span+1 equals the printed 30; "legacy meters lead" via compareFindings is the spec's own definition; the finding-card impactNote change is AC2-required and declared; the browser/calibration claims verified by proxy at the copy, DB, and component level).

The headline patch: the Edge Case Hunter proved all four legacy dollar findings sat on NEM solar meters whose monthly bills omit the energy that settles at the annual true-up - the importer never set isSolar, so the lever's solar gate never fired. After the patch set, the live result is honest: 4 dollar estimates on non-solar meters with real usage (P060 ~$38, FARM SHOP SWANSON ~$26, PUMP 73 ~$15, PUMP 55 ~$14), 10 qualitative closed-rate findings on the legacy NEM meters with the true-up note, and the gate hardened (absolute-error aggregate, zero-total exclusion, savings floored above the meter's own model error, resolved findings sticky).

Post-review validation: tsc exit 0, lint clean, 60 files / 435 tests green (+5 lever tests, +2 db tests), production build clean, dev.db refreshed via db:import-fixture (isSolar set on the 14 NEM SAs, findings regenerated through the corrected lever).

## Change Log

- 2026-06-09: Code review - 9 patch groups (live solar gate via importer isSolar flagging, zero-total exclusion, absolute-error aggregate, savings floor above model error, sticky resolved findings, reason-honest qualitative copy, day-count sanity + invalid-period exclusion, all-period ratchet demand + summer candidate guard, script wording), 3 deferred with record, 6 dismissed with reason. lint + tsc + 435 tests + production build green; dev.db regenerated. Status -> done.
- 2026-06-09: Implemented Story 3.3 - the rate-optimization lever with the back-test gate: pure lever module (bill-label -> plan mapping with real-tier eligibility, cycle projection from reconciled line items, integer-cents back-test, calibrated 5% band, fail-closed fallbacks), idempotent runner edge with isLegacy backfill, CLI + fixture-import triggers, labeled-estimate copy. Live on the real account: 14 findings (8 dollar, 6 qualitative), 10 legacy flags. lint + tsc + 428 tests + production build + served-HTML verification green. Status -> review.
