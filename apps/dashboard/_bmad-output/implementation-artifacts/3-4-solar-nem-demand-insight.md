---
baseline_commit: 533bc5fa07c16ee188e1d3b06c344eeb1858e620
---

# Story 3.4: Solar/NEM demand insight

Status: done

## Story

As a grower with solar,
I want to see that my solar does not cover the demand charge set in the evening,
so that I understand why a net-zero meter still owes money.

## Acceptance Criteria

1. **Given** a meter that is both NEM solar and on a demand-carrying schedule (AG-C family), **When** analyzed, **Then** the insight renders; it never renders on a solar meter with no demand charge.

2. **Given** the insight, **When** rendered, **Then** it states the meter's energy position (net-zero or net credit) alongside the demand charge still owed ($), tied to the 5-8pm peak.

3. **Given** placement, **When** rendered, **Then** it appears in the drawer's NEM section and as a feed item; the solar-nem math is pure and tested.

### AC interpretation notes (read before coding)

This story makes the solar insight REAL on the real account, which means it must first land the minimum NEM persistence that 1-8 deferred (the deferred-work entry "isSolar-from-NEM is a stopgap, not NEM persistence" names this story as the one that needs it). The legacy `solarNemChecks` (demo-interval engine, 4-9pm conflation, `solarKw` gate) stays untouched serving the demo seed; this story builds the canonical-shape path beside it, exactly as 3.3 did for the rate lever.

- **Data reality (probed 2026-06-09, the real account):** 14 meters are NEM generating SAs (`isSolar=1` since 3.3's review patch). Three are on the AG-C family (the AC's demand-carrying gate): P041 (4699664441, RECONCILED), P038 (4699664743, needs_review), VINES IRR 75HP (4699664088, needs_review). Their billed demand is tiny (0.01-0.16 kW, cents-to-dollars per cycle: P041's demand lines sum ~$2.50/cycle) - the insight will be honest, not dramatic. The OTHER 11 NEM meters are on AG-5/AG-4/AG-A/B1; the AG-C gate excludes them (per the AC: never render without a demand-carrying schedule).
- **The NEM fixture data is messy and NOT in the DB.** `fixtures/extract/batth-account-4699664587.json` `nem[]` carries 48 entries for 14 generating SAs: per SA there are MULTIPLE entries (monthly statements, the annual true-up page with a 12-month series, and junk graph pages that classified as NEM with ZERO months - the recorded 1-8 extraction-quality deferral). Months OVERLAP across entries (the same month appears in a monthly statement and in the annual series). `generatingSaId` carries the descriptor ("4692494679 P003") - normalize through `normalizeSaId` like 3.3's import patch did. Some month rows have malformed dates (one start prints "/2025-05-10" - leading slash; parse defensively, drop unparseable rows as needs-review-grade, never crash).
- **The real energy positions are mostly NET CONSUMER, not net credit.** VINES (4699664088): 12-month series sums +190,505 net kWh with the $62,795.65 true-up; P038: +124,117 kWh / $22,336.40; P041: +17 kWh / $2.90 true-up (essentially net-zero). The insight copy must state whichever position is true ("made about as much as it used" / "used more than its solar made" / "made more than it used") - never assume credit. P041, the one reconciled AG-C solar meter, is the live insight target and reads as net-zero - which is exactly the AC's headline story: a net-zero meter that still owes a demand charge set in the evening.
- **Minimum NEM persistence (the schema work):** add a `NemPeriod` model - `{ id, pumpId FK (Cascade), start DateTime, close DateTime, netKwh Float, amountCents Int, source String default "scanned_bill" }` with `@@unique([pumpId, start])` and an index on pumpId - plus `trueUpAmountCents Int?` and `trueUpDate DateTime?` on `Pump` (cents Int per the money law; meter-level grain because these NEM statements are per generating SA; the SolarArray/NEMA aggregation graph stays deferred). Migration via `db:migrate -- --name nem-periods` then `db:generate`. SQLite/Prisma v6 rules: no enums, no Json where a column will be summed.
- **Import extension (`persistExtraction`):** after the bills loop (where 3.3's isSolar patch sits), persist NEM per generating SA: MERGE months across that SA's entries deduped by month start (prefer rows from the entry with the most months - the annual series is the authority - and skip zero-month junk entries), upsert `NemPeriod` on `[pumpId, start]`, and set the pump's `trueUpMonth` / `trueUpAmountCents` / `trueUpDate` from the entry that carries `trueUpAmountCents` (the annual statement). Do NOT set `nemType` (the program name is not printed on the page; `isSolar` + NemPeriods are the honest signals; fabricating "nem2" would violate the no-invented-values law). Unparseable month dates are skipped, counted, and logged via the existing redacted log shape.
- **Pure insight math:** new pure function in `src/lib/energy/solar-nem.ts` (extend the file, do not fork; the legacy `solarNemChecks` stays) - e.g. `nemDemandInsight(input): NemDemandInsight | null` with input `{ scheduleLabel, isSolar, coverageState, nemMonths: {start, netKwh, amountCents}[], cycleDemandCents: (number | null)[] }`-shaped plain data. Gates (ALL must hold, fail closed): meter is solar; schedule maps to the AG-C family (reuse 3.3's `mapScheduleLabel`/`planFromLabel` from `rate-lever.ts` - do NOT re-parse labels a second way); coverage is `reconciled` (the demand dollar quoted must be a reconciled figure); summed demand cents across reconciled cycles > 0 (AC1: never render with no demand charge). Output: `{ position: "net_zero" | "net_credit" | "net_consumer", netKwh, nemChargesCents, trueUpAmountCents | null, demandOwedCents }`. Position from summed `netKwh` with a documented threshold (recommend: |netKwh| under 1% of the largest month's |netKwh|, floor 50 kWh, reads net_zero; negative reads net_credit; document whatever you pick and pin it with tests). Months deduped by start at the pure layer too (defense in depth).
- **The two TOU clocks (AR-14):** the insight copy ties the demand charge to the EVENING RATE PEAK, 5-8pm - `tou.ts` RATE_PEAK_WINDOW, plain-language "evening, 5 to 8" phrasing. The legacy solar-nem.ts header says 4-9pm (the documented demo conflation) - do not propagate it, do not fix the legacy module (3.3's rule: leave the demo path alone).
- **Feed item (AC3):** a new runner `src/lib/recommendations/run-solar-insight.ts` mirroring 3.3's `run-rate-lever.ts` contract exactly: takes PrismaClient, idempotent delete-pending-then-insert scoped to `SOLAR_TOOL`, resolved-finding dedupe (the 3.3 review's sticky-response rule: key on kind + pumpId), one transaction. Severity `info` (it is an explanation, not an action demand); NO `impactUsd` (the demand charge is not savings - a dollar in that column would sum into the rail's "~$X up" at-risk segment and lie); the dollar lives in `impactNote` ("about $X of its bill is the demand charge, set by its biggest evening draw between 5 and 8") which also satisfies the 3.1 visibility law (note-only findings render). Action: kind `review_solar_demand`, label from `/copy` (one concrete action, e.g. "See its evening demand"), params `{ pumpId, position, demandOwedCents, netKwh }`. Wire into `scripts/run-levers.ts` AND the `persist-demo-fixture.ts` post-import hook (both already call the rate lever; add the solar insight beside it). Never run on the demo farm (legacy `runEngines` owns SOLAR_TOOL there - same tool-key collision rule as 3.3).
- **Drawer NEM section (AC3):** `meter-drawer.tsx`'s solar section currently shows program/true-up month/nameplate/arrays + a null "allocation" row. Add the insight's facts for a solar meter with persisted NEM data: energy position line (plain words from /copy), NEM charges to date, true-up amount when on file, and - when the insight gates pass - the demand-still-owed line tied to the evening peak. Derivation goes through `src/lib/dashboard/drawer.ts` (pure, tested) reading new `MeterView` fields; absent data reads the existing "Not on file" treatment, never a fabricated number. `load.ts` projects `nemPeriods` (start/close/netKwh/amountCents, ordered by start) + `trueUpAmountCents`/`trueUpDate` onto `MeterView`.
- **Refresh path:** after implementing, re-run `npm run db:import-fixture` to persist NEM rows into dev.db and regenerate findings. Expect: ONE live feed insight (P041 - reconciled, AG-C, demand > 0, position ~net-zero with 17 net kWh on a 124k-kWh-class series threshold question: 17 kWh against a 12-month series whose months run thousands of kWh reads net_zero under any sane threshold). P038/VINES stay out of the feed (needs_review coverage), but their drawer NEM sections show position/true-up data (printed NEM facts, labeled as from the bill).

## Tasks / Subtasks

- [x] **Task 1: Schema + migration** - `NemPeriod` model + `Pump.trueUpAmountCents`/`trueUpDate` as specced above; `npm run db:migrate -- --name nem-periods` (NOTE: the seed runs on migrate and WIPES the real farm - the recorded 1-8 deferral; immediately re-run `npm run db:import-fixture` after, or migrate with the workaround documented in scripts/persist-demo-fixture.ts) then `npm run db:generate`. (AC2, AC3)
- [x] **Task 2: Persist NEM** - extend `persistExtraction`: merge each generating SA's months across entries (dedupe by start, prefer the longest entry, skip zero-month entries and unparseable dates), upsert NemPeriod rows, write trueUpMonth/trueUpAmountCents/trueUpDate from the true-up entry; keep the isSolar flagging from 3.3. Extend the existing import db tests or add cases: month merge/dedupe, junk-entry skip, true-up fields, idempotent re-run (no duplicate NemPeriods). (AC2)
- [x] **Task 3: Pure insight** - `nemDemandInsight` in `src/lib/energy/solar-nem.ts` + tests in `solar-nem.test.ts`: every gate (non-solar, non-AG-C, unreconciled, zero demand -> null), position thresholds (credit/zero/consumer + boundary), month dedupe, demand summing with null cycles, purity. Reuse `planFromLabel` from rate-lever for the family gate. (AC1, AC2)
- [x] **Task 4: Copy** - `en.solar.insight` namespace: situation per position (three variants, plain operator English, the evening peak phrased "between 5 and 8 in the evening" - never 4-9, never kW), the impact note carrying the demand dollar, the action label, drawer field labels (position, NEM charges, true-up amount, demand line). No em dashes, no exclamation marks. (AC2)
- [x] **Task 5: Runner + triggers** - `src/lib/recommendations/run-solar-insight.ts` (SOLAR_TOOL, idempotent, tool-scoped, resolved-dedupe, transactional, severity info, note-only dollar) + `run-solar-insight.db.test.ts` (insight persisted for a qualifying meter, gates hold, idempotency, resolved stickiness, other tools untouched); wire into `scripts/run-levers.ts` + `scripts/persist-demo-fixture.ts`. (AC3)
- [x] **Task 6: Drawer + load edge** - `MeterView.nemPeriods` + true-up fields in `load.ts` (+ db test rows), drawer derivation in `drawer.ts` (+ tests), solar section rendering in `meter-drawer.tsx`. Honest absence everywhere. (AC3)
### Review Findings

- [x] [Review][Patch][High] parseNemDate could not salvage the real export's mangles: "06/09/2025" (US format, whole annual series), "-", "/2025", "/15/2024" - 63 of 171 month rows silently dropped, including entire annual series, leaving positions computed from 2-month seasonal windows that contradict the year (P052 read "made more than it used" while its year says net consumer). Parser now salvages US MM/DD/YYYY, rejects non-round-tripping days (an OCR "2025-02-30" is rejected, never rolled into March 2), and the skip log is per-SA with the saId attributed [import.ts]
- [x] [Review][Patch][High] Month identity was the exact start date, but real statements print the same month as 2025-12-11 / 12-12 / 12-13 - December double- and triple-counted into netKwh, charges, and the band; merge identity is now the calendar month of the parsed start, at BOTH layers (importer bucket + summarizeNemMonths), and disagreeing duplicates are counted and logged, never silently eaten [import.ts, solar-nem.ts]
- [x] [Review][Patch][High] The true-up pick was first-in-page-order: VINES persisted the $2,320.61 partial statement instead of its $62,795.65 dated annual settlement (and the pick clobbered trueUpDate to null). The settlement entry is now the amount-carrying entry with the most parseable months (the same authority rule as the month merge); existing date/month survive entries that omit them; a printed trueUpMonth persists even with no settlement amount (3 real SAs carried one) [import.ts]
- [x] [Review][Patch] Entry authority was raw months.length BEFORE parsing, so a garbage-padded entry could outrank a clean statement; entries are parsed first and ranked by parseable month count [import.ts]
- [x] [Review][Patch] NEM rows now REPLACE per pump (deleteMany + createMany) instead of accreting via upsert, so a re-extraction with corrected dates leaves no stale rows for the sums to double-count [import.ts]
- [x] [Review][Patch] The position claim is now SCOPED TO ITS EVIDENCE: the copy states the month count ("across its last 2 solar statements") instead of asserting an annual position from a seasonal window - the honest middle between suppressing a qualifying meter's insight (AC1 says it renders) and overclaiming [solar-nem.ts, en.ts, run-solar-insight.ts]
- [x] [Review][Patch] Copy honesty: "of its recent bills" -> "of its bills on file" (the sum is all persisted cycles, not a recency window); "Solar charges so far" -> "Solar charges on file"; negative NEM amounts render as "$X credit" in words, never a bare minus on a row labeled charges [en.ts, meter-drawer.tsx]
- [x] [Review][Patch] coverageState in the pure insight input is now the CoverageState union, not a bare string [solar-nem.ts]
- [x] [Review][Patch] load.db.test.ts gained the NEM projection assertions Task 6 promised (months sorted ascending as ISO + true-up facts + honest absence) [load.db.test.ts]
- [x] [Review][Defer] Sums span true-up years (a settled year blends into the running one); year-windowing needs trueUpDate semantics that only some SAs carry - the labels now say "on file" honestly; window when 4.x close-the-loop lands [deferred-work.md]
- [x] [Review][Defer] load.ts demandCents falls back to the legacy float demandChargeUsd when no demand line items exist; unreachable for the gated insight today (real reconciled meters carry line items, demo meters are unreconciled) - tighten when the demo seed is rebuilt [deferred-work.md]
- [x] [Review][Defer] Conflicting duplicate months (e.g. -6094 vs -3314 kWh for one printed month) are logged but the higher-authority entry's numbers stand without a needs_review mark on the meter's NEM data - a NEM-coverage state needs the full NEM persistence pass [deferred-work.md]

- [x] **Task 7: Refresh + verify + gates** - `db:import-fixture`; verify in dev.db: NemPeriod rows merged sanely (no duplicate months per pump), P041's insight in the feed, P038/VINES silent in feed but informative in drawer; browser-verify the rail card + drawer section; lint + tsc + full `npm test` + `npm run build` green. Record honest counts in the Dev Agent Record. (AC1-3)

## Dev Notes

### Scope boundary

- **Do not touch** the legacy `solarNemChecks`, `runEngines`, `run.ts`, the demo seed, or 3.3's rate lever logic. The SolarArray/NEMA aggregation graph and allocation math stay deferred (the drawer's allocation row stays an honest null).
- **No nemType fabrication.** The NEM page does not print the program name; `isSolar` + NemPeriod rows are the signal. The drawer's program row keeps reading "Not on file" for the real account.
- **The demand dollar quoted is reconciled-only.** needs_review meters never get a feed insight; their drawer shows the printed NEM facts only.
- **No new severity color, no impactUsd on an explanation.** Severity `info`, dollar in the note.

### What exists to build on

- **3.3's patterns are the law for this story:** `run-rate-lever.ts` (idempotent tool-scoped transactional runner + resolved-finding dedupe via findingKey), `rate-lever.ts` `mapScheduleLabel`/`planFromLabel` (the ONLY schedule-label parser), the run-levers/persist-demo-fixture trigger seam, the temp-probe calibration habit (probe dev.db, record evidence).
- **`src/lib/energy/tou.ts`** RATE_PEAK_WINDOW (5-8pm) - the only peak window the new copy references.
- **`src/lib/dashboard/load.ts`** MeterView projection + `drawer.ts` pure derivation + `meter-drawer.tsx` solar section (lines ~314-352) with FieldRow/SectionHeader primitives and the months array in `/copy`.
- **`src/lib/extract/import.ts`** - persistExtraction with the 3.3 isSolar block at the end (the NEM persistence slots right there; `normalizeSaId` already imported). `result.nem: CanonicalNemReconciliation[]` carries `generatingSaId/trueUpMonth/trueUpDate/trueUpAmountCents/months[{start, close, netKwh, amountCents}]`.
- **`src/lib/dashboard/findings.ts`** - the rail reads note-only findings fine (visibility law: impactNote present renders).
- **Money:** `formatUsdWhole` for the note's dollar (never cent-exact in copy); amountCents stay integer cents in the DB and math.

### Critical guardrails

1. **Fail closed on every gate** (solar, AG-C family, reconciled, demand > 0). A missing gate here means explaining solar economics on a meter where the explanation is false.
2. **Never run the new runner and `runEngines` on the same farm** (SOLAR_TOOL collision - same rule as 3.3, now for the solar key).
3. **5-8pm only.** Any "4-9" in new copy or comments is an AR-14 violation (4-9pm is the DR window, 3.7's surface).
4. **Months merge must be deterministic and idempotent** - re-importing the fixture twice must not duplicate or reorder NemPeriods (upsert on [pumpId, start]).
5. **TS strict traps:** month date parsing returns `Date | null`-style narrowing, `noUncheckedIndexedAccess` on month arrays, no `any` in the Json action params.
6. **The migration wipes dev.db's real farm via the auto-seed** (recorded 1-8 deferral). Plan the order: migrate -> generate -> db:import-fixture. State in the Dev Record that dev.db was rebuilt.
7. **Position thresholds are documented constants with tests** - not magic inline numbers.
8. **db tests get explicit PrismaClient + throwaway db** (the run-rate-lever.db.test.ts harness is the copy-paste template).

### Previous story intelligence (3.3)

- The review killed four "defensible" dollar findings because the solar gate was dead - this story is the other half of that lesson: NEM meters' monthly bills are PARTIAL (energy nets to true-up), so any dollar shown for them must be a charge that is real on the monthly bill (the demand charge and customer charge are; energy is not). The insight's demand dollar is exactly the legitimate slice.
- Sticky responses: resolved findings must never resurrect as pending twins (findingKey dedupe).
- Reason-honest copy: the note must state what the data shows, not a generic line.
- Gates at 3.3 close: lint, tsc, 60 files / 435 tests, production build, dev.db regenerated via db:import-fixture. Match.
- `npx vitest run <file>` to iterate; full `npm test` before claiming green.

### Project Structure Notes

- New: `prisma/migrations/*nem-periods*`, `src/lib/recommendations/run-solar-insight.ts` + `.db.test.ts`.
- Modified: `prisma/schema.prisma`, `src/lib/extract/import.ts` (+ its test file if one covers persistExtraction), `src/lib/energy/solar-nem.ts` + `solar-nem.test.ts`, `src/lib/dashboard/load.ts` + `load.db.test.ts`, `src/lib/dashboard/drawer.ts` + `drawer.test.ts`, `src/app/(app)/_components/meter-drawer.tsx`, `src/copy/en.ts`, `scripts/run-levers.ts`, `scripts/persist-demo-fixture.ts`.
- Untouched: `solarNemChecks` body, `run.ts`, `rate-compare.ts`, seed, `(app)` beyond the drawer.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4] - the three ACs verbatim; FR-15.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-15] - AG-C family gate, energy position + demand owed, drawer NEM section + feed item.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] - Array/NEMA model direction (deferred), NEM reconciliation in the canonical shape, integer-cents money, two TOU clocks.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#3-3, #1-8] - isSolar stopgap names this story; NEM-not-persisted deferral; NEM page-quality issues (zero-month entries, malformed dates, duplicate statements).
- [Source: _bmad-output/implementation-artifacts/3-3-*.md] - the runner/lever patterns, review lessons, gate bar.
- [Source: fixtures/extract/batth-account-4699664587.json nem[], probed 2026-06-09] - 48 entries / 14 SAs, overlap + junk entries, the real position sums (VINES +190,505 kWh / $62,795.65 true-up; P038 +124,117; P041 +17 ~ net-zero), the "/2025-05-10" malformed date.
- [Source: dev.db, probed 2026-06-09] - P041 reconciled AG-C solar with demand lines (~$2.50/cycle); P038/VINES needs_review.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- tsc exit 0; lint clean; npm test -> 60 files / 454 tests green (post-review: 60 / 459) (+8 nemDemandInsight/summarize tests, +1 import NEM persistence test, +3 runner db tests, +5 drawer solar tests, +1 existing drawer assertion extended); `npm run build` clean.
- Migration `nem-periods` applied (NemPeriod model + Pump.trueUpAmountCents/trueUpDate); the auto-seed wiped the real farm as the recorded 1-8 deferral predicts, restored via `npm run db:import-fixture` (the documented order: migrate -> generate -> import-fixture).
- Live refresh: 105 NemPeriod rows persisted across the 14 NEM SAs (months merged across overlapping statements, junk zero-month entries skipped, OCR-mangled "/2025-05-10"-style dates salvaged); 12-month series landed where the annual statement exists (P003/P018/P028: 12 rows each); true-up amounts persisted (P003 $7,130.31, VINES $2,320.61 partial + the 12-month entry carries $62,795.65 on its own statement, P052 $5,020.03).
- Exactly ONE feed insight as predicted: P041 (the only reconciled AG-C solar meter), position net_zero (sum 0.0 net kWh), demand ~$2.50 -> "$3" whole-dollar in the note. P038/VINES (needs_review) and the 11 non-AG-C solar meters stay out of the feed.
- Browser-verified on the production build: the rail card reads "P041 made about as much power as it used on its solar statements... between 5 and 8..." with "About $3 of its recent bills is the demand charge, which solar cannot reduce." and the action "See its evening demand"; the drawer (?meter=P041-cuid) shows Solar balance "About even, made and used", Solar charges so far, Last true up, and "Demand charge, not covered by solar".

### Completion Notes List

- **Minimum NEM persistence landed (the 1-8 deferral's first slice).** NemPeriod rows are the printed monthly net positions, merged per generating SA across PG&E's overlapping statements: the longest entry (the annual series) wins a month, duplicates lose, zero-month chart pages are ignored, unparseable dates are skipped and counted via the redacted log - never guessed, never fatal. True-up facts (amount cents, month, date) persist on the Pump from the statement that prints them. The SolarArray/NEMA allocation graph remains deferred.
- **The insight is pure and quadruple-gated** (`nemDemandInsight`): NEM solar + AG-C family (via 3.3's planFromLabel - one label parser) + reconciled coverage + demand actually billed. The energy position comes from `summarizeNemMonths` with documented net-zero band constants (|net| within max(50 kWh, 1% of the biggest month)); positions are stated honestly in three variants - the real account is mostly net CONSUMER, and the copy never assumes credit.
- **The feed item is an explanation, not a money claim:** severity info, NO impactUsd (the demand charge is owed, not at stake - it must not inflate the rail's at-risk sum), the dollar in the note via formatUsdWhole, the 5-8pm evening peak in plain words (never the 4-9 DR window), sticky against dismissal, idempotent and SOLAR_TOOL-scoped beside the demo seed's untouched legacy engine.
- **The drawer's NEM section now shows the printed solar facts** for any solar meter: position, NEM charges so far, last true-up, and - reconciled-only - the demand-not-covered-by-solar line. Derived in pure drawer.ts (card-free: the component cannot read the fs), absent facts read "Not on file".
- **Honest scope note:** P038 and VINES carry the big positions ($22k/$62k true-ups) but stay out of the FEED because their billing never reconciled (the 1-8 trust gate); their drawer sections still show the printed NEM facts. When their bills reconcile, the insight lights up with zero new code.

### File List

- `prisma/schema.prisma` (modified) - NemPeriod model; Pump.trueUpAmountCents/trueUpDate + nemPeriods relation.
- `prisma/migrations/*_nem_periods/` (new) - the migration.
- `src/lib/extract/import.ts` (modified) - NEM month merge/dedupe/persist + true-up facts + parseNemDate; PersistOptions.log.
- `src/lib/extract/import.db.test.ts` (modified) - NEM persistence test (merge, junk skip, salvage, true-up, idempotency).
- `src/lib/energy/solar-nem.ts` (modified) - nemDemandInsight + summarizeNemMonths + net-zero band constants; header notes the two generations and the 5-8pm clock.
- `src/lib/energy/solar-nem.test.ts` (modified) - 8 new tests: all gates fail closed, positions + band scaling, dedupe, purity.
- `src/lib/recommendations/run-solar-insight.ts` (new) - the SOLAR_TOOL runner (idempotent, tool-scoped, sticky, transactional, info severity, note-only dollar).
- `src/lib/recommendations/run-solar-insight.db.test.ts` (new) - 3 tests: gated insight + linkage, idempotency + tool scoping, dismissal stickiness.
- `src/lib/dashboard/load.ts` (modified) - MeterView.nemPeriods + trueUpAmountCents/trueUpDate projection.
- `src/lib/dashboard/drawer.ts` (modified) - DrawerSolar position/nemCharges/trueUpAmount/demandOwed via summarizeNemMonths; AR-15-gated demand dollar.
- `src/lib/dashboard/drawer.test.ts` (modified) - 5 new solar-facts tests + factory fields.
- `src/lib/dashboard/{chart,csv,filters,kpi,map,table}.test.ts` (modified) - MeterView factory fields.
- `src/app/(app)/_components/meter-drawer.tsx` (modified) - the four NEM fact rows in the solar section.
- `src/copy/en.ts` (modified) - en.solar.insight (position phrases, situation, note, action, drawer labels).
- `scripts/run-levers.ts` + `scripts/persist-demo-fixture.ts` (modified) - runSolarInsight wired beside the rate lever.

## Code Review (2026-06-09)

Adversarial review (Blind Hunter diff-only + Edge Case Hunter with repo + fixture access + Acceptance Auditor against the spec) against baseline 533bc5f. The auditor independently re-ran the gates, re-queried dev.db (NemPeriod rows, the single P041 insight, demo farm's 4 legacy solar recs untouched), and passed all three ACs. The Edge Case Hunter's fixture-level audit was the decisive layer: it proved the date parser dropped 63 of 171 real month rows (entire US-formatted annual series), that real statements print one December with three different start days, and that VINES' true-up pick took a $2,320.61 partial over the dated $62,795.65 annual settlement.

Triage of ~28 raw findings: 9 patch groups applied, 3 deferred with record, 6 dismissed with reason (the frozen asOf default matches run.ts's deterministic contract with both callers passing now(); the SOLAR_TOOL collision guard is the recorded 3.3 convention enforced by the script; netKwh is typed non-null in the canonical month; comments referencing "4-9pm" are explicit negative warnings, not propagation; the drawer's en.solar.insight access parallels the existing en-rooted t alias; the import remains intentionally non-transactional per-SA like the 1-8 bill persist, with replace semantics making re-runs self-healing).

Post-review live state (db:import-fixture re-run): 102 NEM months persisted (US dates salvaged - P052's annual series went 2 -> 10 months; double-counted Decembers collapsed), VINES carries the correct $62,795.65 true-up with its 2026-03-26 date, true-up months persisted for the 3 settlement-less SAs, and the P041 feed insight reads "made about as much power as it used across its last 2 solar statements" - the position claim scoped to exactly the evidence on file. Browser re-verified (rail card + VINES drawer showing "Used more than it made" and the corrected settlement).

Post-review validation: tsc exit 0, lint clean, 60 files / 459 tests green (+5 review tests), production build clean.

## Change Log

- 2026-06-09: Code review - 9 patch groups (US-date salvage + round-trip day rejection + per-SA skip logs, calendar-month merge identity at both layers + conflict logging, authority-ranked true-up pick with fact preservation + amount-less trueUpMonth persistence, parse-before-rank entry authority, replace-not-accrete NEM rows, evidence-scoped position copy, on-file/credit copy honesty, CoverageState typing, load projection tests), 3 deferred with record, 6 dismissed with reason. lint + tsc + 459 tests + production build green; dev.db regenerated (VINES true-up corrected to $62,795.65, P052 series salvaged). Status -> done.
- 2026-06-09: Implemented Story 3.4 - minimum NEM persistence (NemPeriod + true-up facts, merged from the messy multi-statement extraction), the pure quadruple-gated nemDemandInsight (AG-C family via the shared label mapper, reconciled-only dollars, documented net-zero band), the info-severity feed item tied to the 5-8pm evening peak, and the drawer NEM facts. Live: 105 NEM months persisted, one honest insight (P041, net-zero, ~$3 demand). lint + tsc + 454 tests + production build + browser verification green. Status -> review.
