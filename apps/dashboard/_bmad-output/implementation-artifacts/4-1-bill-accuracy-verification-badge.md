---
baseline_commit: 7ea29f1fcfc949bc88fc32426802522f576b8e0f
---

# Story 4.1: Bill-accuracy verification badge

Status: done

## Story

As a grower,
I want Terra to independently recompute a posted bill and show it matched mine,
so that I trust the tool has been right, not just a one-time snapshot.

## Acceptance Criteria

1. **Given** a posted bill, **When** the system recomputes its charges from the tariff fixture + the meter's own TOU usage and billed demand, **Then** it compares to the actual posted total.

2. **Given** a match within tolerance, **When** rendered, **Then** it shows a verification badge worded as an independent calculation matching the bill (e.g. "Terra independently calculated this bill from the rates and your usage and matched it to the cent").

3. **Given** the copy, **When** rendered, **Then** it never claims prediction or forecast.

4. **Given** the recompute, **When** implemented, **Then** it is a pure tested `/lib/energy` (bill-audit) function and licenses the alternative-schedule numbers in FR-14.

### AC interpretation notes (read before coding)

- **The recompute already exists; do NOT fork it.** Story 3.3 built the exact machinery FR-19 describes: `cycleFromPeriod` (canonical period -> recompute input), `priceCycleCents` (tariff fixture pricing in integer cents, AR-6), and `backTestMeter` (recompute vs printed total, signed per-cycle deviation) in `src/lib/energy/rate-lever.ts` + `rates.ts`. Story 4.1 is a thin pure verification wrapper over THAT machinery plus the badge surface. If the badge and the rate lever ever computed from different code paths they could disagree, which would un-license FR-14's numbers, the opposite of this story's purpose. Reuse, never duplicate.
- **Naming variance (AC4):** the epic and architecture say "/lib/energy (bill-audit)", but the existing `src/lib/energy/bill-audit.ts` is the PRE-REBUILD anomaly module (compares a cycle to the meter's own same-season median; emits "act" recommendations; demoted but kept). It is a DIFFERENT concept from FR-19's tariff recompute. Build the new pure module as `src/lib/energy/bill-verify.ts` and document the variance in its header (the planning docs predate the 3.3 rebuild that placed the recompute in rate-lever.ts). Do not modify bill-audit.ts.
- **Honest tolerance and honest words (AC2 vs reality).** The epic's example copy ("matched it to the cent") is an EXAMPLE, and it is only literally true of the Epic-1 reconciliation guardrail (line items sum to the printed total within $0.01, which is what `coverageState === "reconciled"` already certifies). The fixture recompute does NOT hit the cent: riders outside the card (Energy Commission Tax), the 2026-03-01 mid-cycle rate change, and day-prorated demand make a calibrated drift band necessary (see `BACK_TEST_BAND_PCT = 5`, calibrated 2026-06-09 against the real account's 34 testable SAs; 27 land within 2%). So the badge makes the two-layer claim, each layer worded as exactly what it is:
  - Layer 1 (always true for any reconciled meter): the bill's line items add up to PG&E's printed total to the cent. This is the existing reconciliation fact; it costs nothing to state and it IS cent-exact.
  - Layer 2 (the FR-19 recompute): Terra independently recalculated this bill from the published rates and the meter's own usage, and the result matched PG&E's total (within the calibrated band). Word it as "matched" / "checks out"; NEVER claim cent precision for layer 2, and NEVER use predict/forecast/projection language (AC3, NFR-5). Pin the copy law with a test that can actually fail (the 3.7 lesson: phrase-level assertions, not single characters).
- **Where the badge lives:** the meter drawer's latest-bill section (the surface that shows the printed total it verifies against). Badge = a small, calm `primary`-green mark + caption near the period total; info treatment, NOT a severity chip, NOT a findings-rail entry, never a home hero element. Architecture maps FR-19 to "drawer + KPI"; the KPI strip carries no verification element in v1 (no aggregate claim is defensible until most meters pass; note the deliberate deferral in the Dev Agent Record).
- **When the badge does NOT render (fail closed, silently):** unreconciled meter (no figures at all, the AR-15 gate); solar/NEM meters (their monthly charge pages omit energy that settles at true-up; run-rate-lever.ts already documents why pricing them would mislead - same exclusion here); unmapped schedule labels (non-ag B1 etc, `mapScheduleLabel` returns null); excluded cycles (credit/zero-total/invalid spans per `cycleFromPeriod`); off-band recomputes (the 3 genuine card/model gaps of the 34 SHOULD fail closed). Absence is silent: no anti-badge, no warning, no implication PG&E mis-billed. The drawer simply shows the bill as it does today.
- **Per-bill, not per-meter:** the AC says "a posted bill". Verify the drawer's LATEST displayed period (the bill on screen). Whole-meter aggregates are the lever's concern, not the badge's.

## Tasks / Subtasks

- [x] Task 1: Pure verification module (AC1, AC4)
  - [x] New `src/lib/energy/bill-verify.ts`: `verifyBill(input: { scheduleLabel: string | null; period: LeverPeriod }, card: RateCard, options?: { bandPct?: number }): BillVerification | null`. Internally: `mapScheduleLabel` -> `cycleFromPeriod` -> `priceCycleCents` (or `backTestMeter` over the single cycle), returning `{ printedTotalCents, recomputedTotalCents, deviationPct, verified: boolean }` with `verified = |deviationPct| <= bandPct` (default `BACK_TEST_BAND_PCT`). Return `null` (not a failed verdict) when the schedule is unmapped or the cycle is excluded - "could not check" is different from "checked and missed", and only the latter exists as `verified: false`.
  - [x] Module header: FR-19, the reuse-not-fork law, the naming variance vs the legacy bill-audit.ts, and the licensing relationship to FR-14 (same machinery, same band).
  - [x] Colocated `bill-verify.test.ts`: on-band pass, off-band fail, unmapped schedule -> null, credit/zero/invalid cycle -> null, band default = `BACK_TEST_BAND_PCT`, purity (no fs/DB/clock), and integer-cents comparison (AR-6).
- [x] Task 2: Server-side derivation + prop plumbing (AC1, AC2)
  - [x] `meter-drawer.tsx` is a CLIENT component ("use client") calling `toDrawerDetail(meter)` in-component, while `loadRateCard()` is fs/server-only (`process.cwd()`). So verification is computed server-side and flows down as data, mirroring how `findings` already reach the drawer as a prop. Recommended seam: a small pure deriver in `src/lib/dashboard/drawer.ts` (e.g. `verificationFor(meter: MeterView, card: RateCard): BillVerification | null` applying the solar + coverage exclusions, latest period only), called from `src/app/(app)/_components/energy-dashboard.tsx` (the async Server Component that already does `loadFindings` and renders `<MeterDrawer meters={meters} findings={findings} />` at line ~75), producing a `Record<meterId, BillVerification | null>` (or similar small map) passed into `MeterDrawer` as a serializable prop. Do NOT import `loadRateCard` into client code; do NOT ship the whole card to the client.
  - [x] Solar exclusion lives in the deriver (meter.isSolar || meter.solarKw !== null, matching run-rate-lever.ts), documented with the same reason.
  - [x] `drawer.test.ts` (or a new colocated test) cases: reconciled non-solar on-band -> verification present; solar -> null; unreconciled -> null; off-band -> verified:false carried (the component decides not to render a badge for it).
- [x] Task 3: The badge UI + copy (AC2, AC3)
  - [x] In the drawer's latest-bill section, next to/below the period total row: when `verification?.verified === true`, render the badge mark (lucide `check`-family icon in `--green`/primary token, never a literal hex) + the two-layer caption from `/copy`. When `verified` is false or verification is null, render NOTHING new.
  - [x] Copy in `src/copy/en.ts` under `shell.drawer`: a badge label and the caption. Layer 1 sentence (line items add to PG&E's printed total to the cent) + layer 2 sentence (Terra independently recalculated this bill from the published rates and your usage and it matched PG&E's total). Plain operator English; no em dashes; no exclamation marks; no "predict"/"forecast"/"projection"; no kW jargon.
  - [x] Accessibility: the badge is not color-only (icon + text caption carry the meaning); any aria nuance goes in `/copy` (the 3.6 lesson).
- [x] Task 4: Copy-law pin + verify + gates (AC2, AC3)
  - [x] A test pinning the verification copy: contains the independent-calculation phrasing, does NOT contain "predict", "forecast", or "projection" (case-insensitive), and the cent-exact claim appears only in the layer-1 (line items) sentence, never attached to the recompute sentence.
  - [x] Browser verification against the real dev.db: open a reconciled non-solar meter known to back-test on-band (the 3.3 calibration found 31 of 34 within 5%; the headline $11,727.33 pump sits at 4.59%) and confirm the badge renders with the caption; open a solar meter and an unreconciled meter and confirm no badge and no regression in the drawer.
  - [x] Gates: lint + tsc + full `npm test` + `npm run build`; honest Dev Agent Record (state how many of the live account's meters actually show the badge).

## Dev Notes

### Scope boundary

- One pure module + tests, one deriver + prop, one badge + caption, copy strings + the copy pin. NO schema change, NO new Recommendation/tool key, NO findings-rail entry, NO KPI element, NO changes to rate-lever.ts logic (read-only reuse of its exports), NO touching the legacy bill-audit.ts.
- FR-20 (predicted-vs-realized result) is story 4.2, not this story. Do not build result plumbing here.

### What exists to build on (read these files first)

- `src/lib/energy/rate-lever.ts` - `mapScheduleLabel`, `cycleFromPeriod` (+ `CycleExclusion` reasons), `backTestMeter`, `BACK_TEST_BAND_PCT` (5, calibrated 2026-06-09 with the full reasoning in its doc comment), `LeverPeriod`/`LeverLineItem` types. The single home of the recompute-vs-print comparison.
- `src/lib/energy/rates.ts` - `priceCycleCents` (integer cents, fails loudly on garbage), `CyclePriceInput`, `RateCard`. The pricing core.
- `src/lib/pge/rate-card.ts` - `loadRateCard()` (fs via `process.cwd()`; the fixture is already in `outputFileTracingIncludes`).
- `src/lib/dashboard/drawer.ts` - `toDrawerDetail` (the AR-15 coverage gate lives in the pure function), `DrawerDetail`/`DrawerLatest`. The latest-period selection logic to mirror.
- `src/lib/dashboard/load.ts` - `MeterView` (carries `coverageState`, `rateSchedule`, `isSolar`, `solarKw`, `periods` with `printedTotalCents` + `lineItems`).
- `src/app/(app)/_components/meter-drawer.tsx` - the latest-bill section (TOU rows, demand, other rows, total) where the badge lands; `FieldRow`'s "Not on file" convention; how `findings: FindingView[]` arrives as a prop (the plumbing pattern to mirror).
- `src/lib/recommendations/run-rate-lever.ts` - the solar exclusion and its documented reason; how the same machinery is invoked at the edge.
- `src/copy/en.ts` `shell.drawer` - where the new strings live; `satisfies Record<...>` typing pattern from 3.7.

### Critical guardrails

1. **Reuse the 3.3 machinery; the badge and the lever must be incapable of disagreeing** (AC4's "licenses FR-14" is exactly this).
2. **Integer cents everywhere a printed total is compared** (AR-6); the deviation is computed on cents, displayed never with cent precision.
3. **Fail closed, silently.** No badge is the default; `verified: false` and `null` both render nothing; no negative claim about PG&E.
4. **Copy law:** never predict/forecast/projection; cent-exact wording only for the line-item reconciliation fact; all strings in `/copy`; no em dashes; no exclamation marks; grower words. Pinned by a phrase-level test.
5. **No fs in pure code or client code:** bill-verify.ts is pure (card passed in); the card never crosses to the client; the drawer receives a small serializable result.
6. **TS strict, no `any`, `noUncheckedIndexedAccess`** - guard indexed access; tests colocated `*.test.ts`.

### Previous story intelligence (3.7 + the epic-3 run)

- The probe-first discipline paid off every story: verify what the data actually carries before building (here: the 3.3 calibration data already tells you 31 of 34 testable SAs land in-band, so the badge will be visibly present on the live account - state the real count in the Dev Agent Record).
- Copy-law pins must be phrase-level and the negative must cover realistic spellings (the 3.7 review hardened a pin that `toContain("4")` made vacuous). Here: assert the absence of "predict"/"forecast"/"projection" case-insensitively and that the recompute sentence does not contain "cent".
- The latest-period-only semantics (3.7's enrollment fix) applies here too: verify the bill on screen, not history.
- `satisfies Record<K, string>` over `as Record` for copy maps (compile-time drift detection).
- Gates at 3.7 close: lint, tsc, 64 files / 492 tests, production build, temp-data browser verification. Match or exceed.
- Review pattern: an adversarial reviewer WILL check whether the badge can render on a meter whose recompute was never run, whether solar leaks through, and whether the copy claims more than the math proves. Build those tests yourself first.

### Git intelligence

- Recent commits are one-story-per-commit, imperative style ("Add story 3.7: DR enrollment info; epic 3 complete"). Stories 3.2-3.5 established the fixture/loader/pure-math/drawer-surface pattern this story walks again.
- Baseline: `7ea29f1` (epic 3 complete; clean tree).

### Project Structure Notes

- New: `src/lib/energy/bill-verify.ts` + `bill-verify.test.ts`.
- Modified: `src/lib/dashboard/drawer.ts` (+ its test), the dashboard server component that loads meters (prop plumbing), `src/app/(app)/_components/meter-drawer.tsx`, `src/copy/en.ts`.
- Untouched: `prisma/schema.prisma`, `src/lib/energy/bill-audit.ts`, `src/lib/energy/rate-lever.ts`, the findings engine, KPI strip.
- Variance vs planning docs: the pure module is `bill-verify.ts`, not "bill-audit" (see AC interpretation notes; the name was taken by the legacy anomaly module before the rebuild).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1; #Epic 4] - the four ACs; accuracy-not-forecast; enhancement of the drawer, not file churn.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-19] - independent recompute; copy never claims prediction; licenses FR-14's alternative-schedule numbers.
- [Source: _bmad-output/planning-artifacts/architecture.md#Cluster D; line 589/644] - FR-19 -> `energy` recompute + `reconcile`, surfaced at the drawer (+ KPI, deferred here with reason).
- [Source: src/lib/energy/rate-lever.ts#BACK_TEST_BAND_PCT] - the calibrated band and its 2026-06-09 evidence; the per-cycle machinery to reuse.
- [Source: src/lib/recommendations/run-rate-lever.ts] - the solar exclusion rationale to mirror verbatim.
- [Source: _bmad-output/implementation-artifacts/3-7-dr-enrollment-info.md#Review Findings] - the copy-pin and latest-only lessons applied above.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow).

### Debug Log References

- `npx vitest run src/lib/energy/bill-verify.test.ts` - 9 pass (pure module).
- `npx vitest run src/lib/dashboard/drawer.test.ts` - 26 pass (7 new `verificationFor` cases).
- `npx vitest run src/copy/en.test.ts` - 4 pass (the copy-law pin).
- `npm run lint` - clean. `npx tsc --noEmit` - clean (exit 0).
- `npm test` - 512 pass / 66 files (3.7 closed at 492 / 64; +20 tests, +2 files).
- `npm run build` - production build succeeds.
- Real-data path (`tsx` over dev.db, the exact `loadDashboard` -> `verificationFor` -> `loadRateCard` chain the server component runs) + `next start` SSR HTML at `/energy?meter=<id>`.

### Completion Notes List

- **Reused the 3.3 machinery, never forked it.** `verifyBill` (new `src/lib/energy/bill-verify.ts`) is a thin pure wrapper over `mapScheduleLabel` -> `cycleFromPeriod` -> `backTestMeter` from rate-lever.ts. A dedicated test asserts the recomputed total equals a direct `priceCycleCents` call, so the badge and the rate lever are incapable of disagreeing about a meter's recompute (the FR-14 licensing relationship, AC4).
- **Naming variance honored (AC4).** Built as `bill-verify.ts`, not by touching the legacy `bill-audit.ts` (the pre-rebuild same-season-median anomaly module, a different concept). The variance is documented in the new module's header.
- **Two-layer honest copy (AC2/AC3, NFR-5).** Layer 1 states the cent-exact line-item reconciliation; layer 2 states the independent recompute "matched" PG&E's total, never to the cent, never predict/forecast/projection. Pinned by `src/copy/en.test.ts` at phrase level: the cent-exact claim is asserted to live only in the reconciliation sentence, never on the recompute sentence (the 3.7 vacuous-pin lesson).
- **Fails closed, silently.** `verificationFor` returns null for solar (isSolar || solarKw, the same exclusion + reason as run-rate-lever.ts), unreconciled (AR-15), and no-periods; `verifyBill` returns null for an unmapped schedule or excluded cycle. Both null and `verified:false` render nothing - no anti-badge, no implication PG&E mis-billed.
- **Per-bill, latest period only.** The deriver verifies `periods[last]`, mirroring `toDrawerDetail`'s `latest` selection; a test proves an off-band older cycle does not suppress the badge when the latest cycle is on-band.
- **Card never crosses to the client.** `loadRateCard()` runs in the Server Component (`energy-dashboard.tsx`); only a serializable `Record<meterId, BillVerification | null>` reaches the client `MeterDrawer`.
- **Live-account count (the honest number AC requires).** On the real Batth farm (dataKind: real, 46 meters, 39 reconciled): **26 meters render the badge** (recompute within the 5% band), 3 are off-band (no badge), and 17 could-not-check (14 solar excluded + the remainder unmapped/excluded). The headline pump P054 lands at -4.59% deviation, matching the 3.3 calibration's 4.59% for the $11,727.33 pump - direct evidence the shared recompute path is intact. Browser/SSR check confirmed: the badged meter's drawer renders "Bill checks out" + the two-layer caption; the solar and an unreconciled meter render no badge; page returns 200.
- **Deliberate deferral (architecture maps FR-19 to "drawer + KPI").** No KPI-strip verification element in v1: no aggregate "your farm is verified" claim is defensible while 17 of 46 meters cannot be checked. The badge is per-bill only, as the AC scopes it.

### File List

- `src/lib/energy/bill-verify.ts` (new) - the pure FR-19 verification wrapper.
- `src/lib/energy/bill-verify.test.ts` (new) - 9 pure-module tests.
- `src/lib/dashboard/drawer.ts` (modified) - added `verificationFor` deriver + imports.
- `src/lib/dashboard/drawer.test.ts` (modified) - added the `verificationFor` describe block.
- `src/app/(app)/_components/energy-dashboard.tsx` (modified) - server-side recompute map + prop plumbing.
- `src/app/(app)/_components/meter-drawer.tsx` (modified) - the badge UI + the `verifications` prop.
- `src/copy/en.ts` (modified) - the `shell.drawer` verification strings.
- `src/copy/en.test.ts` (new) - the copy-law pin.

### Change Log

- 2026-06-09: Implemented Story 4.1 (bill-accuracy verification badge, FR-19). New pure `bill-verify.ts` reusing the 3.3 recompute; `verificationFor` deriver with solar/coverage exclusions; the drawer badge + two-layer copy; copy-law pin. Gates green (lint, tsc, 512 tests, build). Status -> review.
- 2026-06-09: Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). No High-severity and no correctness defects; all four ACs confirmed satisfied. Two safe patches applied; the two Med findings dismissed as correct-as-designed (see Review Findings). Status -> done.

### Review Findings

Adversarial three-layer review (2026-06-09). All four ACs confirmed satisfied by the Acceptance Auditor; no High-severity findings from any layer.

Patches (applied):

- [x] [Review][Patch] Pin the band-boundary inclusivity (|deviation| == band -> verified) [src/lib/energy/bill-verify.test.ts] - the `<=` boundary was untested; added a test that an exactly-at-band deviation verifies and a hair tighter does not.
- [x] [Review][Patch] Harden the copy-law pin against `project*` conjugations [src/copy/en.test.ts] - replaced `/projection/` + `/project\b/` with `/project/i` so "projected"/"projecting" can never slip into the recompute copy.

Dismissed (correct-as-designed or noise):

- [x] [Review][Dismiss] Solar exclusion uses `isSolar || solarKw !== null` (Med, blind+edge) - this predicate is SPEC-MANDATED to match `run-rate-lever.ts:95` verbatim, which keeps the badge and the lever incapable of disagreeing (AC4). It targets GENERATING meters (flagged `isSolar`, positive `solarKw`); a consuming meter on NEM aggregation has a full monthly bill and is correctly verifiable. `solarKw === 0` does not occur (nameplate is null for non-solar) and would be fail-closed-safe anyway. Changing it would violate the spec and diverge badge from lever.
- [x] [Review][Dismiss] Latest-period selection coupling between `verificationFor` and `toDrawerDetail` (Med/Low, blind+edge) - both select `periods[length-1]` on the same array, and `loadMetersForFarm` enforces `orderBy: { start: "asc" }` (MeterView.periods documented "sorted by start ascending"), so the badge always describes the bill it sits beside. Ordering is guaranteed at the load edge, not assumed.
- [x] [Review][Dismiss] `bandPct` override not validated for Infinity (Low, edge) - the production call site always uses the default `BACK_TEST_BAND_PCT`; no real caller passes an unsafe band. NaN/negative already fail closed (no badge).
- [x] [Review][Dismiss] Minor test/copy nits (Low) - redundant double `verifyBill` call in a band test, `verifiedAria` phrasing, duplicate `billedDemandFromLineItems` computation: all harmless (pure, cheap) and not defects.
