---
baseline_commit: 7ea29f1fcfc949bc88fc32426802522f576b8e0f
---

# Story 4.2: Recommendation predicted-vs-realized result

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grower,
I want an accepted recommendation to show its predicted impact against what actually happened on the next bill,
so that I can see whether the tool's advice paid off.

## Acceptance Criteria

1. **Given** an accepted recommendation, **When** accepted, **Then** the predicted impact is recorded at acceptance.

2. **Given** the first bill that posts after acceptance, **When** it posts, **Then** `result` populates with the realized number via the recommendation grammar's `result`; until then `result` reads "pending".

3. **Given** the result, **When** rendered, **Then** v1 shows the diff (predicted vs realized) and does not explain the variance.

### AC interpretation notes (read before coding)

- **FR-20 is "pending" by design in v1 - do NOT fake a closed loop.** The PRD's own `[NOTE FOR PM]` is explicit: "at the v1 demo, FR-19 is the live trust signal (a completed match every cycle); FR-20 reads as 'pending result' until a bill posts after a rec is accepted. Do not script the demo as if a loop has already closed." The adversarial PRD review (H-2) says the same: FR-20 "cannot demonstrate a closed loop in [the runway] by design." The data is historical/static and acceptance happens at `asOf` = today, so on the live Batth account NO bill posts after acceptance, and every freshly accepted rec legitimately reads **pending**. This story's deliverable is therefore: (a) record the prediction at acceptance, (b) the honest pending state, (c) the pure realize-mechanism that closes the loop the moment a qualifying bill exists, and (d) the predicted-vs-realized surface that renders that diff when it exists and "pending" when it does not. The closed path is proven by **tests** (and may be demonstrated with a hand-built fixture), NEVER by seeding a backdated acceptance on the demo farm. Treat "it reads pending on the live account" as a PASS, not a gap (state this honestly in the Dev Agent Record).

- **The grammar and storage already exist - reuse, do not add.** `Recommendation.result` is already a `Json?` column (`prisma/schema.prisma:367`), `resolvedAt` is already `DateTime?` (`:366`), and the pure `RecommendationResult` shape is already defined: `{ followed?, predictedUsd?, actualUsd?, avoidedUsd?, note? }` (`src/lib/recommendations/types.ts:75-81`). `FindingView` already carries `resultNote` extracted from `result.note` (`src/lib/dashboard/findings.ts:45,82-85,117`) and the finding card already has a render slot for it (`finding-card.tsx:84-90`) plus the copy `en.shell.findings.resultLabel = "What happened"` (`src/copy/en.ts:169`). NO schema change, NO migration, NO new Recommendation/tool key, NO new grammar field.

- **Naming/concept variance vs the legacy `reconcile()`.** `src/lib/energy/reconcile.ts:56` already has a `reconcile()` that closes the loop - but it is the PRE-REBUILD pump-timing "holds" (demand-charge staggering) lever, demoted in the rebuild, tied to `pumpTimingDraft` and a per-cycle `holds[]` digest. It is a DIFFERENT concept from FR-20's per-recommendation predicted-vs-realized for the rebuilt feed (exactly as Story 4.1's legacy `bill-audit.ts` was a different concept from the new `bill-verify.ts`). Build the new logic as `src/lib/recommendations/result.ts`; document the variance in its header; do NOT modify or route through `reconcile.ts` (it stays for the demoted lever). The `reconcilesToCents` / coverage helpers lower in that file are unrelated Story 1.7 code and stay untouched.

- **Record the prediction at acceptance, frozen (AC1).** "Accepted" = the grower taps the `done` response (`resolveFinding(id, "done")` in `src/app/(app)/actions.ts:24`). Dismissed is NOT acceptance and records no predicted result (a dismissed finding the grower rejected has no impact to track). At acceptance, snapshot the predicted impact into `result.predictedUsd` (from the row's `impactUsd`) **atomically with the status+resolvedAt write**, so the figure is frozen even if the engine later re-runs and changes `impactUsd`. A rec with no numeric prediction (`impactUsd === null` - the info-only DR / qualitative findings) records `followed: true` with NO `predictedUsd` (nothing numeric to track; its loop is informational). Compute the snapshot via a PURE function, not inline SQL, so it is tested.

- **Realize the number only from a bill that posts AFTER acceptance (AC2).** A "posted bill" is a reconciled `BillingPeriod` carrying a `printedTotalCents` (`schema.prisma:211`); its post date is `cycleClose` when present, else `close` (the metered period end). The realized number comes from the FIRST such period for the rec's meter whose post date is **strictly after** the acceptance `resolvedAt`. Until one exists, `result` stays pending (no `actualUsd`). A rec with no meter linkage (`action.params.pumpId` absent - a fleet-level rec) can never realize against a meter bill and stays pending. Compute this in a PURE function `realizeResult(...)` over plain inputs (the recorded prediction + resolvedAt + the meter's periods + `asOf`); the read edge supplies the data.

- **"Realized number" is the next bill's own figure, stated as a fact, never as attributed savings (AC3, honesty law).** The predicted impact for the headline rate lever is an ANNUAL switch saving; a single next bill cannot "realize" an annual saving and the grower may not have switched. So v1 must NOT subtract them into a fake "you saved $N" claim. Show the two as labeled facts - the prediction we recorded and what the next bill actually was - and the plain difference, with copy that states the difference and explicitly does NOT explain or attribute it (FR-20: "v1 shows the diff, it does not explain the variance"). Never assert the grower saved the predicted amount, never claim causation, never use predict/forecast language on the realized side (that is FR-19's separate concern, but keep the voice clean). Integer cents everywhere a printed total is involved (AR-6); dollars displayed whole, never cent-precise for an estimate.

- **Where the result shows.** `loadFindings` only loads `status: "pending"` rows (`findings.ts:137`), so an accepted (`done`) rec LEAVES the findings rail - which is correct (it is answered). The predicted-vs-realized surface therefore lives in the **meter drawer** (the shared per-meter drill-in, where Story 4.1 also landed its badge): a small "What happened" / tracked-results section listing this meter's accepted recommendations with predicted vs realized (or "pending"). Mirror Story 4.1's plumbing pattern exactly: a pure projection derived server-side in `energy-dashboard.tsx` and passed to the client `MeterDrawer` as a serializable per-meter prop (like `verifications`). Do NOT load accepted recs into the findings rail. NO home-hero element, NO KPI element (no aggregate close-the-loop claim is defensible when every rec reads pending).

- **Per-recommendation, per-meter.** The result tracks each accepted recommendation against its own meter's next bill. No farm-wide aggregate, no cross-rec rollup in v1.

## Tasks / Subtasks

- [x] Task 1: Pure result module (AC1, AC2, AC3)
  - [x] New `src/lib/recommendations/result.ts`:
    - `acceptanceResult(input: { impactUsd: number | null }): RecommendationResult` - the frozen-at-acceptance snapshot: `{ followed: true, predictedUsd? }` (omit `predictedUsd` when `impactUsd` is null; round to cents-honest whole dollars via the shared money helpers, stored as the float-dollar the grammar uses elsewhere). No `actualUsd`, no `note` claiming a closed loop.
    - `realizeResult(input: { predictedUsd: number | null; resolvedAtIso: string; periods: ResultPeriod[]; asOf: string }): RecommendationResult` - finds the first reconciled period whose post date (`cycleClose ?? close`) is strictly after `resolvedAtIso`; returns the pending result (no `actualUsd`) when none exists, else fills `actualUsd` from that bill's `printedTotalCents` (cents -> dollars) plus a plain non-attributing `note`. Pure: no DB/fs/clock; `asOf`/dates are ISO strings in.
    - A small `ResultView` projection (`{ predictedUsd: number | null; actualUsd: number | null; isPending: boolean; ... }` ) the drawer renders, plus a pure `resultViewFor(rec, periods, asOf)` that composes the above. Decide the exact shape to keep the component dumb.
    - Module header: FR-20, the pending-by-design reality (PRD note), the concept variance vs the legacy `reconcile.ts`, the honesty law (facts not attributed savings).
  - [x] Colocated `result.test.ts`: predicted recorded at acceptance (with and without `impactUsd`); pending when no post-acceptance bill; pending when a bill exists but its post date is on/before acceptance (strictly-after boundary); realized when a later bill posts (the closed path); first-qualifying-bill selection when several post after acceptance; no-meter rec stays pending; integer-cents from `printedTotalCents`; purity.

- [x] Task 2: Record the prediction at acceptance (AC1)
  - [x] Extend `resolveFinding` in `src/app/(app)/actions.ts`: on `response === "done"`, write `result` from `acceptanceResult` in the SAME atomic `updateMany` that sets `status` + `resolvedAt` (read the row's `impactUsd` first within the action, or pass it; keep the farm-ownership + still-pending WHERE gate intact). On `dismissed`, leave `result` null (unchanged behavior). Serialize through the existing `Prisma.InputJsonValue` pattern used by the runners (no `any`).
  - [x] Guard: a re-accept of an already-resolved row is a no-op (the `status: "pending"` WHERE already enforces first-write-wins); do not overwrite an existing `result`.
  - [x] Test (`actions` are server code): cover the snapshot via the pure module's tests plus a DB-integration test if a thin edge is extracted; otherwise assert the pure `acceptanceResult` output and keep the action a thin caller.

- [x] Task 3: Realize + project for the drawer (AC2, AC3)
  - [x] Read edge: in `src/app/(app)/_components/energy-dashboard.tsx` (the async Server Component), load the farm's ACCEPTED recommendations that carry a `result` (status `done`), and build a `Record<meterId, ResultView[]>` via the pure `resultViewFor`, passed into `MeterDrawer` as a serializable prop (mirror the `verifications` plumbing from 4.1). Reuse `loadMetersForFarm`/the dashboard load for the meters' `periods` so `realizeResult` has the bill data; do not import fs into client code.
  - [x] The meter linkage uses `action.params.pumpId` (same narrowing as `findings.ts:readAction`); reuse or factor that narrowing rather than duplicating it.
  - [x] `result.test.ts` / a drawer-deriver test: a meter with an accepted rec and no later bill -> one pending ResultView; with a later bill -> a realized ResultView; a meter with no accepted recs -> empty.

- [x] Task 4: The drawer surface + copy (AC3)
  - [x] In `src/app/(app)/_components/meter-drawer.tsx`, add a "What happened" section (reuse `en.shell.findings.resultLabel` or a new `shell.drawer` key) listing the meter's accepted-rec ResultViews: predicted (when present) and realized, or the word "pending" when not yet realized. Calm, info treatment; no severity chip; render NOTHING when the list is empty.
  - [x] Copy in `src/copy/en.ts`: the section header, the "pending" line, and the predicted/realized labels + the plain diff line. Plain operator English; no em dashes; no exclamation marks; NEVER claim the grower saved the predicted amount or explain the variance (AC3); no kW jargon.
  - [x] Accessibility: the result is text (label + value), not color-only.

- [x] Task 5: Copy-law pin + verify + gates (AC3)
  - [x] A test pinning the result copy: contains "pending"; the realized/diff copy does NOT contain causal/attribution phrasing (e.g. "you saved", "because", "thanks to") and does NOT explain variance; phrase-level, not vacuous (the 3.7 / 4.1 lesson).
  - [x] Browser verification against the real dev.db: accept a rate-optimization finding (one with a dollar impact) on a meter, confirm the finding leaves the rail and the meter drawer's "What happened" section shows the recorded prediction reading "pending" (the by-design v1 state); confirm a non-accepted meter shows no section. State in the Dev Agent Record that the live account reads pending by design (no regression in the drawer or rail).
  - [x] Gates: lint + tsc + full `npm test` + `npm run build`; honest Dev Agent Record (how many accepted recs exist, all pending by design).

## Dev Notes

### Scope boundary

- One pure module + tests, one acceptance-snapshot extension, one read-edge projection + prop, one drawer section + copy, copy strings + the copy pin. NO schema change, NO migration, NO new Recommendation/tool key, NO findings-rail change (accepted recs correctly leave it), NO KPI/home element, NO touching the legacy `reconcile.ts` or the pump-timing `resolveRecommendation`.
- Do NOT seed a backdated/closed loop on the demo farm (the PRD `[NOTE FOR PM]` forbids scripting a closed loop). The closed path is proven by tests only.

### What exists to build on (read these files first)

- `src/lib/recommendations/types.ts:75-81` - the `RecommendationResult` shape (`followed/predictedUsd/actualUsd/avoidedUsd/note`); `:89-102` the `Recommendation` grammar; `:64-69` the `action` shape (`params.pumpId`).
- `src/app/(app)/actions.ts:24-51` - `resolveFinding`: the live accept path, its atomic `updateMany` with the farm-ownership + still-pending WHERE gate to preserve.
- `src/lib/dashboard/findings.ts` - `FindingView.resultNote` (`:45`), `readResultNote` (`:82-85`), `readAction`/`pumpId` narrowing (`:72-79`), and `loadFindings` querying `status: "pending"` only (`:137`).
- `src/app/(app)/_components/finding-card.tsx:84-90` - the existing `resultNote` render slot + `t.resultLabel`.
- `src/app/(app)/_components/meter-drawer.tsx` - the drawer; the 4.1 badge section shows the placement/treatment pattern; how `findings` (and now `verifications`) arrive as props.
- `src/app/(app)/_components/energy-dashboard.tsx` - the Server Component that loads `meters`, `findings`, and (4.1) `verifications`, and renders `<MeterDrawer ... />`: the exact plumbing pattern to mirror for the accepted-rec results.
- `src/lib/dashboard/load.ts` - `MeterView.periods` (`MeterPeriodView`: `start`, `close`, `printedTotalCents`); note `cycleClose` is NOT projected onto `MeterPeriodView` today - if `realizeResult` needs the printed cycle close, either add it to the projection (small, in load.ts) or fall back to `close` (document the choice).
- `prisma/schema.prisma:355-373` (Recommendation: `result` Json?, `resolvedAt`, `impactUsd`, `status`), `:200-225` (BillingPeriod: `cycleClose`, `printedTotalCents`, `close`).
- `src/lib/format/money.ts` - `formatUsdWhole`, `centsFromDollars`, `formatUsd`; `src/lib/energy/recommend.ts:38` - `roundUsd`.
- `src/lib/recommendations/run-rate-lever.ts:115-159` - how the rate lever sets `impactUsd` and `action.params` (the prediction being tracked); `Prisma.InputJsonValue` serialization pattern.
- `src/lib/energy/reconcile.ts:56-133` - the LEGACY holds reconcile, for concept contrast only (do NOT route through it).

### Critical guardrails

1. **Honest pending by design.** No scripted closed loop; the live account reads pending; tests prove the realized path. State the real (all-pending) count in the Dev Agent Record.
2. **Freeze the prediction at acceptance** (AC1): snapshot `predictedUsd` atomically with status+resolvedAt so a later engine re-run cannot rewrite history.
3. **Strictly-after boundary** (AC2): realize only from a bill whose post date is strictly after `resolvedAt`; a same-day or earlier bill does not count.
4. **Facts, not attributed savings** (AC3): show predicted and realized as labeled facts plus the plain diff; never claim the grower saved the predicted amount; never explain the variance; no causal language. Pinned by a phrase-level test.
5. **Integer cents** (AR-6) wherever a printed total is read; dollars displayed whole.
6. **Pure logic in `/lib`, no DB/fs/clock**; the action stays a thin caller; the card never reads fs; the drawer receives a small serializable projection. TS strict, no `any`, `noUncheckedIndexedAccess` (guard indexed access); colocated `*.test.ts`.

### Previous story intelligence (4.1 + the epic-4 run)

- 4.1 established the exact server-to-client plumbing this story reuses: load fs/DB-backed data in `energy-dashboard.tsx`, derive a pure per-meter `Record<meterId, ...>`, pass it to the client `MeterDrawer` as a serializable prop. Copy `loadRateCard()`/`verifications` -> here `loadFindings`-style accepted-rec load + `resultViewFor`.
- 4.1's copy-law pin was phrase-level and asserted the NEGATIVE (no predict/forecast). Do the same here: assert "pending" is present and attribution language is absent, case-insensitively, splitting the realized copy from any label so the pin cannot pass vacuously (the 3.7 vacuous-pin lesson).
- 4.1 left `bill-audit.ts` untouched and built `bill-verify.ts`; do the same here vs `reconcile.ts` -> `result.ts`.
- Gates at 4.1 close: lint, tsc, 513 tests / 67 files, production build, real-dev.db browser/SSR verification. Match or exceed.
- A reviewer WILL check: can a result render that was never recorded at acceptance? can a dismissed rec show a predicted result? does the realized number leak a same-day or earlier bill? does the copy claim attributed savings or explain the variance? Build those tests yourself first.

### Git intelligence

- Recent commits are one-story-per-commit, imperative ("Add story 4.1: bill-accuracy verification badge"). 4.1's diff shape (new pure `/lib` module + colocated test, a deriver, a server-component prop, a drawer section, copy + copy-pin) is the template this story walks again.
- Baseline at dev time: HEAD on `batth-update` (4.1's changes are in the working tree / committed by the time 4.2 starts; dev-story stamps `baseline_commit` from `git rev-parse HEAD`).

### Project Structure Notes

- New: `src/lib/recommendations/result.ts` + `result.test.ts`; a copy-pin test (extend `src/copy/en.test.ts` from 4.1, or colocate).
- Modified: `src/app/(app)/actions.ts` (acceptance snapshot), `src/app/(app)/_components/energy-dashboard.tsx` (projection + prop), `src/app/(app)/_components/meter-drawer.tsx` ("What happened" section), `src/copy/en.ts` (strings); possibly `src/lib/dashboard/load.ts` if `cycleClose` is added to `MeterPeriodView`.
- Untouched: `prisma/schema.prisma`, `src/lib/energy/reconcile.ts`, `src/app/dashboard/pump-timing/actions.ts` (legacy), the findings rail load, KPI strip.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2; #Epic 4] - the three ACs; v1 shows the diff, not why; realizes UJ-2.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-20; §4.4] - record predicted at acceptance; populate realized from the first post-acceptance bill; "pending" until then; `[NOTE FOR PM]` do not script a closed loop.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/review-adversarial.md#H-2] - FR-20 cannot close inside the runway by design; ships honest-pending.
- [Source: _bmad-output/planning-artifacts/architecture.md#Cluster D; line 644] - FR-20 -> `recommendations/run` result.
- [Source: src/lib/recommendations/types.ts#RecommendationResult] - the existing result grammar to fill.
- [Source: src/app/(app)/actions.ts#resolveFinding] - the accept path to extend.
- [Source: src/lib/dashboard/findings.ts] - resultNote/readAction/loadFindings (pending-only) precedent.
- [Source: _bmad-output/implementation-artifacts/4-1-bill-accuracy-verification-badge.md] - the plumbing + copy-pin + drawer-surface patterns this story reuses.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow).

### Debug Log References

- `npx vitest run src/lib/recommendations/result.test.ts` - 13 pass (pure module).
- `npx vitest run src/lib/dashboard/results.db.test.ts` - 4 pass (read-edge DB integration).
- `npx vitest run src/copy/en.test.ts` - results copy-law pins pass.
- `npm run lint` clean; `npx tsc --noEmit` exit 0.
- `npm test` - 533 pass / 68 files (4.1 closed at 513 / 67; +20 tests, +1 file net of the shared en.test.ts).
- `npm run build` - production build succeeds.
- Real dev.db browser/SSR check: temporarily accepted a rate-optimization finding (impactUsd 26.24) on a meter, confirmed via `next start` SSR HTML at `/energy?meter=<id>` that the drawer's "What happened" section rendered with "Predicted", "Next bill", and "Pending the next bill"; confirmed the accepted rec left the pending findings rail; then reverted the row to pending/null (dev.db restored, verified).

### Completion Notes List

- **Pending by design - honored, not faked (the PRD `[NOTE FOR PM]`).** On the live Batth account there are **0 accepted recommendations** in the seed (all findings are pending), and any rec accepted today reads "pending" because the data is historical and no bill posts after acceptance. This is the correct v1 state; no backdated/closed loop was seeded. The realized (closed) path is proven by tests (`result.test.ts` realizes a diff from a post-acceptance bill; `results.db.test.ts` realizes one meter and holds another pending).
- **No schema change.** Reused the existing `Recommendation.result` Json column, `resolvedAt`, and the `RecommendationResult` grammar. No migration, no new tool key, no grammar field.
- **AC1 - prediction frozen at acceptance.** `resolveFinding` now snapshots `result` via the pure `acceptanceResult` in the SAME atomic `updateMany` that sets status+resolvedAt, reading `impactUsd` off the still-pending row first. Dismissed records nothing. The still-pending WHERE gate preserves first-write-wins.
- **AC2 - realized only from a strictly-after bill.** `firstPostedBillAfter` selects the earliest reconciled period (printedTotalCents non-null) whose post date (printed cycle close, else metered end) is strictly after `resolvedAt`; a same-day or earlier bill, an unreconciled period, or a fleet-level rec all stay pending.
- **AC3 - diff as facts, never attributed savings.** The drawer's "What happened" section shows Predicted and Next bill as two labeled facts plus a neutral absolute Difference when both exist; copy never claims the grower saved the amount, never explains the variance, never uses the word "savings". Pinned by a phrase-level test in `en.test.ts` (asserts "pending" present; "you saved"/"saved you"/"savings"/"because"/"due to"/"thanks to" absent).
- **Concept variance honored.** Built `src/lib/recommendations/result.ts`, did NOT touch the legacy `src/lib/energy/reconcile.ts` (the demoted pump-timing holds lever) - the same split as 4.1's bill-verify.ts vs bill-audit.ts.
- **Plumbing reuses the 4.1 pattern.** The fs/DB-backed load happens in `energy-dashboard.tsx`; a serializable `Record<meterId, ResultView[]>` is passed to the client `MeterDrawer` (mirroring `verifications`). Accepted recs deliberately stay OUT of the findings rail (loadFindings is pending-only); the drawer is their surface.
- **Design choice (documented):** the prediction is persisted at acceptance; the realized number is derived at read time from the persisted prediction + resolvedAt + the meter's current periods (a static dataset has no "a bill just posted" write trigger). `MeterPeriodView` carries no printed cycle close, so the post date falls back to the metered period end (`close`) - a conservative, honest proxy; `prisma/schema.prisma` and `load.ts` were left unchanged.

### File List

- `src/lib/recommendations/result.ts` (new) - pure FR-20 result module (acceptanceResult, firstPostedBillAfter, resultViewFor).
- `src/lib/recommendations/result.test.ts` (new) - 13 pure-module tests.
- `src/lib/dashboard/results.ts` (new) - the tracked-results read edge (loadTrackedResults).
- `src/lib/dashboard/results.db.test.ts` (new) - 4 DB-integration tests.
- `src/app/(app)/actions.ts` (modified) - acceptance snapshots `result` via acceptanceResult.
- `src/app/(app)/_components/energy-dashboard.tsx` (modified) - loads tracked results, passes the prop.
- `src/app/(app)/_components/meter-drawer.tsx` (modified) - the "What happened" section + the `trackedResults` prop.
- `src/copy/en.ts` (modified) - the `shell.drawer` result strings.
- `src/copy/en.test.ts` (modified) - the FR-20 results copy-law pin.

### Change Log

- 2026-06-09: Implemented Story 4.2 (recommendation predicted-vs-realized result, FR-20). New pure `result.ts` (freeze-at-acceptance + realize-from-next-bill), the `loadTrackedResults` read edge, the acceptance snapshot in `resolveFinding`, the drawer "What happened" section + copy, and the honesty copy-pin. Pending by design in v1 (no closed loop seeded). Gates green (lint, tsc, 533 tests, build). Status -> review.
- 2026-06-09: Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). All three ACs confirmed satisfied. One consensus finding patched (the misleading "Difference" subtraction); the rest dismissed as correct-as-designed. Status -> done.

### Review Findings

Adversarial three-layer review (2026-06-09). All three ACs confirmed satisfied by the Acceptance Auditor; the guardrails (no schema change, integer cents, pure /lib, legacy `reconcile.ts` untouched, accepted recs kept out of the rail) all held.

Patch (applied):

- [x] [Review][Patch] Drop the misleading "Difference" row [src/app/(app)/_components/meter-drawer.tsx, src/copy/en.ts] - all three layers flagged that `predictedUsd` (an ANNUAL lever saving) and `actualUsd` (a single bill's gross total) are incommensurable, so `|actual - predicted|` rendered under "Difference" was a meaningless, potentially misleading number - and `result.ts`'s own header warns the two are "NOT the same quantity". Removed the subtraction and the `resultDiffLabel` copy; the surface now shows Predicted and Next bill as the two labeled facts side by side, which is exactly AC3's "the diff (predicted vs realized)" without manufacturing a bogus delta. Copy pin and tests updated; gates re-run green.

Dismissed (correct-as-designed or fails-closed-safe):

- [x] [Review][Dismiss] Read-then-write in `resolveFinding` is not atomic (Low, edge+auditor) - the snapshot reads `impactUsd` via `findFirst`, then `updateMany` re-checks `status: "pending"`. All three agreed the freeze guarantee HOLDS: the write only lands if still pending (first-write-wins), and the snapshot is the prediction at ~acceptance, which is exactly AC1's intent. Wrapping in a transaction would be gold-plating for a value that is correct either way.
- [x] [Review][Dismiss] Same next bill realized for multiple accepted recs on one meter (Low, edge) - with the Difference removed, each rec honestly shows "Next bill $X" (the meter's actual next bill); there is no summation to double-count.
- [x] [Review][Dismiss] Post-date tie order (Low, edge) - periods arrive sorted by start asc and JS sort is stable, so a postDate tie deterministically keeps the earlier-starting cycle first. Sensible and deterministic.
- [x] [Review][Dismiss] Malformed period date silently drops the bill (Low, edge) - `NaN > t` is false, so a garbage `close`/`cycleClose` reads pending (fails closed); a malformed date is an extraction error the reconcile gate already withholds. Safe direction.
- [x] [Review][Dismiss] `cycleClose` branch dead in production (Low, all) - documented in both module headers as the conservative fallback to the metered `close`; the spec explicitly allowed "fall back to `close` (document the choice)". The unit test pins the preference for when a future projection carries it.
- [x] [Review][Dismiss] No `realizeResult`/persisted `actualUsd` (Low/info, auditor) - the realized number is derived at read time in `resultViewFor` (a static dataset has no "a bill just posted" write trigger), a deliberate, documented choice; the grower-visible behavior satisfies all three ACs and the frozen prediction is persisted. `firstPostedBillAfter` + `resultViewFor` fulfill the realize role.
- [x] [Review][Dismiss] Float cents round-trip / `roundUsd(100.005)` brittleness (Low, blind) - the grammar's `predicted/actualUsd` are USD floats by design; values display whole-dollar; the rounding test asserts real, passing behavior.
