---
baseline_commit: 513938e
---

# Story 1.7: Reconciliation guardrail and honest coverage state

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grower,
I want a number shown only when it has been proven against my printed bill total, and an honest label everywhere it has not,
so that I can trust every figure on the screen and never see a wrong one.

## Acceptance Criteria

1. **Given** an SA's extracted line items, **When** they sum to within $0.01 of the SA's printed total (compared in integer cents), **Then** the figure renders; outside $0.01 it is withheld and shown as `needs_review`, never as a number.

2. **Given** the account level, **When** line items are checked, **Then** reconciliation also runs against the account printed total, not a partial subtotal.

3. **Given** an OCR/extraction error, **When** it breaks the sum, **Then** it surfaces as `needs_review`, not a wrong dollar figure.

4. **Given** every Meter and Account, **When** billing is partial, **Then** each shows exactly one coverage state (`no_bill` / `needs_review` / `reconciled`), the full 183-meter inventory renders regardless, **And** the reconcile logic lives in a pure tested `/lib/energy` function.

### AC interpretation notes (read before coding)

This is the **trust gate**: a pure, tested set of functions that decide a single honest `coverageState` per period, meter, and account from the integer-cents line items vs the printed total. It is **pure** (`/lib/energy`, no Prisma, no UI, no I/O) and consumes the canonical shapes Story 1.6 produces. Persisting the derived `coverageState` to the DB and wiring it into the dashboard are **Story 1.8** / Epic 2; this story only derives it.

- **Location — add to the EXISTING `src/lib/energy/reconcile.ts`.** That file already holds an unrelated `reconcile()` (the pump-timing "close-the-loop" lever: predicted-vs-actual demand holds). Do NOT touch or rename it, and do NOT touch its tests. ADD the bill cent-gate + coverage-derivation functions as a new, clearly-sectioned block with distinct names (`reconcilesToCents`, `reconcilePeriod`, `deriveMeterCoverage`, `deriveAccountCoverage`, etc.). Both are genuinely "reconciliation"; co-locating is intentional. Add new `describe` blocks to the existing `reconcile.test.ts`.
- **AC1 the cent gate (the core):** `reconcilesToCents(sumCents, printedTotalCents) = Math.abs(sumCents - printedTotalCents) <= 1`. Integer cents only (no float dollars). Within 1 cent → reconciled (the figure may render); outside → `needs_review` (the figure is withheld, never shown as a number, NFR-4 / SM-C1). Per period, sum `CanonicalBillingPeriod.lineItems[].amountCents` and compare to `printedTotalCents`.
- **AC2 account-level, not a partial subtotal:** the account also reconciles — sum the account's SA printed totals and compare (within 1 cent) to the **account printed total** (the `account_summary` page's figure, captured by the 1.3 `AccountSummarySchema.printedTotalCents`). "Not a partial subtotal" means the account is `reconciled` **only when every member meter is reconciled AND their printed totals sum to the account printed total within a cent** — a missing/unreconciled SA can never let the account claim reconciled.
- **AC3 OCR/extraction error → needs_review, never a wrong number:** a broken sum (line items that do not add to the printed total) yields `needs_review`. This is the same gate as AC1 — there is no separate code path; the test proves a deliberately-broken sum lands `needs_review`.
- **AC4 exactly one state per meter/account; inventory renders regardless; logic is a pure /lib/energy function:**
  - `coverageState: "no_bill" | "needs_review" | "reconciled"` (the existing `CoverageState` union — do not add a state).
  - **Preserve an upstream `needs_review`.** Story 1.6 sets a period's `coverageState` to `needs_review` when the identity-checked SA-ID join failed. A failed identity join is **never** promoted to `reconciled`, even if the cents happen to sum — a figure attached to a possibly-wrong meter is not trustworthy. `reconcilePeriod` must short-circuit to `needs_review` when its input period is already `needs_review`.
  - **Meter rollup:** a meter with no `CanonicalBill` (or zero periods) → `no_bill` (this is how the full 183-meter inventory still renders — every meter has a state). All periods reconciled → `reconciled`; any period unreconciled → `needs_review`.
  - **Account rollup:** no member bills → `no_bill`; all members reconciled AND the SA-total sum reconciles to the account total → `reconciled`; otherwise `needs_review`.
  - The "renders regardless" and the actual table/map rendering are Epic 2; here the deliverable is that the pure derivation always returns exactly one state for any input (including the empty/no-bill case).

## Tasks / Subtasks

- [x] **Task 1: The cent gate** (AC: 1, 3)
  - [x] In `src/lib/energy/reconcile.ts`, add a new section. `export function reconcilesToCents(sumCents: number, printedTotalCents: number): boolean` → `Math.abs(sumCents - printedTotalCents) <= 1`. Integer cents in/out; document that the $0.01 tolerance is exactly one cent (AR-6, the reconciliation surface).
  - [x] `export function sumLineItemCents(period: CanonicalBillingPeriod): number` → sum `period.lineItems[].amountCents` (all integers).

- [x] **Task 2: Period reconcile + coverage derivation** (AC: 1, 3, 4)
  - [x] `export function reconcilePeriod(period: CanonicalBillingPeriod): CoverageState`. If `period.coverageState === "needs_review"` (an upstream identity-join failure from Story 1.6) → return `"needs_review"` (never promote a possibly-wrong attachment). Otherwise → `reconcilesToCents(sumLineItemCents(period), period.printedTotalCents) ? "reconciled" : "needs_review"`.
  - [x] `export function reconcileBill(bill: CanonicalBill): CanonicalBill` → return a copy with each period's `coverageState` set to `reconcilePeriod(period)` (pure, returns a new object; do not mutate the input). This is what Story 1.8 persists.

- [x] **Task 3: Meter + account coverage rollups** (AC: 2, 4)
  - [x] `export function deriveMeterCoverage(bill: CanonicalBill | null): CoverageState`. `null` or zero periods → `"no_bill"` (the full inventory still renders — every meter has a state). Compute each period via `reconcilePeriod`; all `reconciled` → `"reconciled"`; any non-reconciled → `"needs_review"`.
  - [x] `export function deriveAccountCoverage(memberStates: CoverageState[], saPrintedTotalsCents: number[], accountPrintedTotalCents: number | null): CoverageState`. No members → `"no_bill"`. If any member is not `"reconciled"` → `"needs_review"` (a partial subtotal can never reconcile the account, AC2). If `accountPrintedTotalCents` is `null` → `"needs_review"` (cannot prove the account total). Else → `reconcilesToCents(sum(saPrintedTotalsCents), accountPrintedTotalCents) ? "reconciled" : "needs_review"`.
  - [x] Document that `memberStates` are the per-meter `deriveMeterCoverage` results and `saPrintedTotalsCents` are the members' period printed totals; the 1.8 importer assembles these from the DB. Keep this function pure over plain inputs.

- [x] **Task 4: Tests** (AC: 1, 2, 3, 4)
  - [x] Add new `describe` blocks to `src/lib/energy/reconcile.test.ts` (do NOT alter the existing close-the-loop `reconcile()` tests). Cover:
    - **AC1:** line items summing exactly to the printed total → `reconciled`; off by exactly 1 cent (boundary) → `reconciled`; off by 2 cents → `needs_review`.
    - **AC3:** a period whose line items are deliberately short of the printed total (a dropped/OCR-garbled line) → `needs_review`, never a number.
    - **AC4 preserve upstream:** a period whose input `coverageState` is `needs_review` (1.6 identity-join failure) stays `needs_review` even when the cents sum perfectly.
    - **AC4 meter rollup:** `deriveMeterCoverage(null)` → `no_bill`; a bill with all periods reconciled → `reconciled`; a bill with one reconciled + one broken period → `needs_review`.
    - **AC2 account rollup:** members all reconciled + SA totals sum to the account total → `reconciled`; one member `needs_review` (or missing) → `needs_review`; SA totals miss the account total by >1 cent → `needs_review`; null account total → `needs_review`; no members → `no_bill`.
  - [x] Use `if (...) throw` narrowing where it keeps assertions non-vacuous. Reuse `fixtures/extract/sample-charge-detail.json` via `normalizeBill` for a realistic reconciled period if helpful (its line items already sum to `printedTotalCents` = 245657).

- [x] **Task 5: Validate** (AC: all)
  - [x] `npm run lint`, `npx tsc --noEmit`, `npm test` all green. No DB change, no migration, no seed impact — confirm `npm run db:seed` still reports the 183-meter Batth seed. Confirm the existing `reconcile()` close-the-loop tests still pass untouched.

## Dev Notes

### Scope boundary (what is NOT in this story)

- **No DB writes / no persistence / no migration.** The derived `coverageState` is returned by pure functions; writing it to `Pump.coverageState` / `Account.coverageState` / `BillingPeriod` is **Story 1.8**. Do NOT import Prisma into `reconcile.ts`.
- **No dashboard / rendering.** "The full 183-meter inventory renders regardless" is realized in Epic 2 (the table/map). Here, AC4 is satisfied by the pure derivation always returning a state (including `no_bill` for a meter with no bill).
- **Do NOT modify the existing `reconcile()` close-the-loop function or its tests.** Add alongside.
- **No new union.** Reuse `CoverageState` (`@/lib/recommendations/types`).

### What exists to build on

- **`src/lib/energy/reconcile.ts`** — currently the pump-timing close-the-loop `reconcile()` (imports `@/copy/en`, `@/lib/recommendations`, `./recommend`). Your additions are independent pure functions; they need only type-only imports of the canonical shapes and `CoverageState`. No new runtime dependency.
- **`src/lib/normalize/types.ts`** — `CanonicalBill` (`saId`, `saIdDescriptor`, `meterNumber`, `growerPumpId`, `periods`), `CanonicalBillingPeriod` (`lineItems`, `printedTotalCents`, `coverageState`, …), `CanonicalLineItem` (`amountCents` integer cents). Type-only import (no cycle: `normalize/types` imports `energy/types`, a different file; type imports erase at compile).
- **`src/lib/normalize/billing.ts`** (Story 1.6) — `normalizeBill` produces a period whose `coverageState` is `no_bill` (clean identity join, awaiting this gate) or `needs_review` (identity-join failure). This gate promotes the `no_bill` ones to `reconciled` or `needs_review`; it leaves the `needs_review` ones as-is.
- **`src/lib/extract/schema.ts`** — `AccountSummarySchema.printedTotalCents` is the account printed total for AC2 (the account-level reconcile target). The SA printed totals are `CanonicalBillingPeriod.printedTotalCents`.
- **`src/lib/recommendations/types.ts`** — `CoverageState = "no_bill" | "needs_review" | "reconciled"`.

### Critical guardrails

1. **Integer cents only (AR-6).** The gate compares integers; `<= 1` is exactly one cent. Never reconcile in float dollars; never round usage into the gate.
2. **Never show a wrong number (NFR-4 / SM-C1).** Outside the cent gate, or any upstream `needs_review`, the figure is withheld and the state is `needs_review` — never `0`, blank, or a guess.
3. **A failed identity join is final (interaction with Story 1.6).** `reconcilePeriod` must short-circuit a `needs_review` input to `needs_review` even when the cents sum perfectly. A figure attached to a possibly-wrong meter is never "reconciled."
4. **Account = no partial subtotals (AC2).** The account reconciles only when every member is reconciled AND the SA totals sum to the account printed total within a cent.
5. **Exactly one state, always (AC4).** Every input — including a meter with no bill (`null`) and an account with no members — returns exactly one `CoverageState`. This is what lets the full inventory render.
6. **Pure logic stays pure.** No Prisma, no I/O. Colocated tests. Do not mutate inputs (`reconcileBill` returns a new object).
7. **TS strict + no-`any` + `noUncheckedIndexedAccess`.** Guard array access in tests.

### Concrete shapes (recommended)

```ts
// src/lib/energy/reconcile.ts  (ADD a new section; keep the existing reconcile() intact)
import type { CanonicalBill, CanonicalBillingPeriod } from "@/lib/normalize/types";
import type { CoverageState } from "@/lib/recommendations/types";

/** The cent-reconciliation gate (AR-6): line items reconcile iff within one cent of the total. */
export function reconcilesToCents(sumCents: number, printedTotalCents: number): boolean {
  return Math.abs(sumCents - printedTotalCents) <= 1;
}
export function sumLineItemCents(period: CanonicalBillingPeriod): number {
  return period.lineItems.reduce((acc, li) => acc + li.amountCents, 0);
}
export function reconcilePeriod(period: CanonicalBillingPeriod): CoverageState {
  if (period.coverageState === "needs_review") return "needs_review"; // identity-join failure is final
  return reconcilesToCents(sumLineItemCents(period), period.printedTotalCents) ? "reconciled" : "needs_review";
}
export function reconcileBill(bill: CanonicalBill): CanonicalBill {
  return { ...bill, periods: bill.periods.map((p) => ({ ...p, coverageState: reconcilePeriod(p) })) };
}
export function deriveMeterCoverage(bill: CanonicalBill | null): CoverageState {
  if (!bill || bill.periods.length === 0) return "no_bill";
  const states = bill.periods.map(reconcilePeriod);
  return states.every((s) => s === "reconciled") ? "reconciled" : "needs_review";
}
export function deriveAccountCoverage(
  memberStates: CoverageState[],
  saPrintedTotalsCents: number[],
  accountPrintedTotalCents: number | null,
): CoverageState {
  if (memberStates.length === 0) return "no_bill";
  if (memberStates.some((s) => s !== "reconciled")) return "needs_review";
  if (accountPrintedTotalCents === null) return "needs_review";
  const sum = saPrintedTotalsCents.reduce((a, b) => a + b, 0);
  return reconcilesToCents(sum, accountPrintedTotalCents) ? "reconciled" : "needs_review";
}
```

### Previous story intelligence (1.6, done)

- `normalizeBill` sets a clean period to `coverageState: "no_bill"` (awaiting this gate) and an identity-join failure to `needs_review`. This gate consumes exactly that. The `fixtures/extract/sample-charge-detail.json` line items already sum to `printedTotalCents` (245657), so `normalizeBill(rawBill, matchingInventory)` yields a period that should reconcile — handy for a realistic test.
- 1.6 closed the `BillingLineItemKind`/`Unit` union deferral; `CanonicalLineItem.amountCents` is integer cents, so the sum is integer-clean.
- The 1.5/1.6 review template: `if (!x) throw` narrowing; never a vacuous assertion. Mirror it.
- The existing `src/lib/energy/reconcile.ts` is a DIFFERENT reconcile (close-the-loop); add alongside, do not disturb.

### Latest tech notes

- No new dependency. Pure TS + Vitest. The gate is integer arithmetic — no `Number`/float pitfalls because all inputs are integer cents.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7] — user story + the four ACs verbatim.
- [Source: _bmad-output/planning-artifacts/epics.md#FR-5, #FR-6] — the cent-reconciliation guardrail; honest per-meter/account coverage state; the full inventory renders regardless.
- [Source: _bmad-output/planning-artifacts/architecture.md#Money & Numbers (lines 372-384)] — billed amounts integer cents; reconciliation passes iff `abs(sumLineItemCents − printedTotalCents) <= 1`; never invent a number.
- [Source: _bmad-output/planning-artifacts/architecture.md#State unions (lines 400-407)] — `coverageState` one union, one render treatment everywhere.
- [Source: _bmad-output/planning-artifacts/architecture.md#Extraction -> Canonical -> Reconciliation contract (lines 386-398)] — reconciliation sits after the canonical shape; needs_review on failure, never a thrown wrong number.
- [Source: src/lib/energy/reconcile.ts] — the existing close-the-loop reconcile to leave intact; add the bill gate alongside.
- [Source: src/lib/normalize/types.ts] — `CanonicalBill`/`CanonicalBillingPeriod`/`CanonicalLineItem` to consume.
- [Source: src/lib/normalize/billing.ts] — how 1.6 sets the incoming period `coverageState` (no_bill clean / needs_review on identity fail).
- [Source: src/lib/extract/schema.ts] — `AccountSummarySchema.printedTotalCents` (the account-level reconcile target).
- [Source: _bmad-output/project-context.md] — integer cents; pure `/lib/energy` math with colocated tests; never hardcode a figure; no-`any`; unions in recommendations/types.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx tsc --noEmit` -> exit 0; `npm run lint` -> exit 0; `npm test` -> 42 files / 277 tests pass (+15 over 1.6's 262, all in reconcile.test.ts: gate boundary, period/OCR/upstream, meter rollup, account rollup, 1.6->1.7 handoff).
- `npx vitest run src/lib/energy/reconcile.test.ts` -> 20 tests pass (5 pre-existing close-the-loop + 15 new bill-gate).
- `npm run db:seed` -> "Seeded Batth Farms: 183 meters, 6 entities, 57 accounts...". No DB change / no migration; seed unaffected.

### Completion Notes List

- **Pure bill cent-reconciliation gate + honest coverage derivation**, added as a clearly-sectioned block to the EXISTING `src/lib/energy/reconcile.ts` (the unrelated pump-timing close-the-loop `reconcile()` and its 5 tests were left untouched - both are genuinely "reconciliation", co-located deliberately, with distinct names to avoid collision). No Prisma, no migration, no `/app`.
- **AC1 the gate:** `reconcilesToCents(sum, total) = Math.abs(sum - total) <= 1` on integer cents; `reconcilePeriod` sums `lineItems.amountCents` and compares to `printedTotalCents`. Tested at exact, +/-1 (boundary, passes), +/-2 (fails).
- **AC3 OCR/broken sum:** a dropped/garbled line item that breaks the sum -> `needs_review`, never a number (same gate, proven by a short-sum test).
- **AC4 one state + preserve upstream:** `reconcilePeriod` short-circuits an upstream `needs_review` (a Story 1.6 identity-join failure) to `needs_review` even when the cents sum perfectly (a possibly-wrong-meter figure is never "reconciled"). `deriveMeterCoverage(null|no periods)` -> `no_bill` so the full 183-meter inventory still renders; all periods reconciled -> `reconciled`; any unreconciled -> `needs_review`. `reconcileBill` returns a new bill with each period's state set (pure, input not mutated - tested).
- **AC2 account, not a partial subtotal:** `deriveAccountCoverage` is `reconciled` only when every member is `reconciled` AND the members' SA printed totals sum to the account printed total within one cent; a missing member/account-total or any unreconciled member -> `needs_review`; no members -> `no_bill`. Tested all branches.
- **Integration (1.6 -> 1.7 handoff):** `normalizeBill(sample-charge-detail, matching inventory)` yields a `no_bill` period (1.6 pending); `reconcileBill` promotes it to `reconciled` and `deriveMeterCoverage` agrees; the input is not mutated.
- **Out of scope (correctly deferred):** persisting the derived `coverageState` to `Pump`/`Account`/`BillingPeriod` and the dashboard "renders regardless" rendering are Story 1.8 / Epic 2. The `reconcile()` close-the-loop lever (Epic 4 territory) was not touched.

### File List

- `src/lib/energy/reconcile.ts` (modified) - added `reconcilesToCents`, `sumLineItemCents`, `reconcilePeriod`, `reconcileBill`, `deriveMeterCoverage`, `deriveAccountCoverage` (type-only imports of `CanonicalBill`/`CanonicalBillingPeriod` + `CoverageState`); existing `reconcile()` untouched.
- `src/lib/energy/reconcile.test.ts` (modified) - added 15 bill-gate tests (gate boundary, period reconcile + OCR + upstream-needs_review, meter rollup, account rollup, 1.6->1.7 handoff); existing close-the-loop tests untouched.

## Change Log

- 2026-06-09: Implemented Story 1.7 - the bill cent-reconciliation gate (`reconcilesToCents`: `abs(sum - printedTotal) <= 1` on integer cents) and honest coverage-state derivation (`reconcilePeriod`/`reconcileBill`/`deriveMeterCoverage`/`deriveAccountCoverage`), as a pure tested section added to `src/lib/energy/reconcile.ts` alongside the untouched close-the-loop `reconcile()`. Preserves an upstream identity-join `needs_review` (never promoted); account reconciles to the account total, not a partial subtotal; a no-bill meter is `no_bill` so the full inventory renders. lint + tsc + 277 tests + db:seed all green. Status -> review.
- 2026-06-09: Code review (adversarial: Blind Hunter + Edge Case Hunter + Acceptance Auditor, high effort). Acceptance Auditor: all four ACs PASS, scope discipline correct, the trust-spine guarantee (upstream needs_review never promoted) verified in code and test. Fixed 2 data-fidelity findings (the vacuous-reconcile of an empty-line-item period was the top finding, flagged by Blind + Edge); deferred 1 tolerance-design item to deferred-work.md. lint + tsc + 280 tests green. Status -> done.

## Code Review (2026-06-09)

Adversarial review (high effort) across three parallel layers. Acceptance Auditor verdict: **all four ACs met, scope honored, conformant** - the existing close-the-loop `reconcile()` and its 5 tests are byte-for-byte intact; the gate is exact integer-cent arithmetic; the Story-1.6 handoff (upstream `needs_review` never promoted, even on a perfect sum) is verified in code and a dedicated test. Two layers independently flagged the same top finding (vacuous reconcile of an empty bill).

Triage: 2 patches, 1 defer, 0 dismissed.

### Fixed (patches applied this story)

- [Patch] **Vacuous reconcile of a period with no captured line items** [src/lib/energy/reconcile.ts] - top finding, raised by Blind + Edge. A period with empty `lineItems` (sum 0) and `printedTotalCents` in {-1, 0, 1} passed the gate -> falsely `reconciled`, even though extraction captured nothing. Reachable from `normalizeBill` (the charge-detail schema permits all line-item arrays empty + null demand). This defeats the trust guarantee (an extraction that captured nothing must never read as a trusted number, NFR-4 / SM-C1). Fixed: `reconcilePeriod` returns `needs_review` for an empty-`lineItems` period (you cannot prove a total with no parts). New tests: empty line items at totals 0, 1, and 245657 all -> needs_review.
- [Patch] **`deriveAccountCoverage` could certify an account against a partial subtotal** [src/lib/energy/reconcile.ts] - Blind, noted by Auditor. `memberStates` and `saPrintedTotalsCents` are independent arrays with no length correspondence, so a dropped member total could let the account reconcile against a subtotal - contradicting the function's own "never a partial subtotal (AC2)" contract. Fixed: a `memberStates.length !== saPrintedTotalsCents.length` mismatch -> `needs_review` (self-defending, does not rely on the Story 1.8 caller assembling aligned arrays). New test: 3 reconciled members but only 2 SA totals -> needs_review. Also added a net-credit (negative-total) reconcile test the reviewers flagged as unverified.

### Deferred (tolerance design, recorded in deferred-work.md)

- [Defer] The account-level one-cent tolerance does not scale with member count - a real PG&E account total can legitimately differ from the sum of dozens of per-SA totals by more than a cent. Whether to scale the account tolerance (or reconcile the account against its own printed line items) is a product/threshold decision; settle it against the real demo account in Story 1.8.
