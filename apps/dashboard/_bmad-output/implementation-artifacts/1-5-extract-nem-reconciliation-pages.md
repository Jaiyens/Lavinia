---
baseline_commit: 513938e
---

# Story 1.5: Extract NEM reconciliation pages

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grower with solar,
I want my NEM reconciliation tables read, including the months my panels over-produced,
so that my solar credits and annual true-up show up correctly against the right array.

## Acceptance Criteria

1. **Given** a per-SA NEM reconciliation page, **When** extracted, **Then** the bundled monthly rows are each captured as distinct periods and the annual True-up value and date are captured per Array.

2. **Given** generation exceeding consumption, **When** extracted, **Then** negative usage is captured, not dropped or floored at zero.

3. **Given** extracted NEM allocations, **When** normalized, **Then** they attach to the correct Benefiting Meters via SA ID and link to the generating Array.

### AC interpretation notes (read before coding)

This story has **two halves**, both pure and at **zero external calls**:

1. **NEM extraction richness (AC1, AC2)** — proven through the *existing* Story 1.4 pipeline (`extractBill`) with the injected `PageReader` boundary, exactly as 1.4 did for charge-detail pages. The pipeline already classifies + Zod-validates `nem_reconciliation` pages; 1.4 proved a single negative monthly row survives. Here you prove the **multi-row** case (a full year of distinct monthly periods, including over-production months) and a captured **annual true-up value + date**. The only schema change is one additive field (`trueUpDate`) so the printed true-up statement date is captured, not just the month (AC1 "value and date").

2. **NEM normalize (AC3)** — the substantive new code: a **pure** `normalizeNem` function in `src/lib/normalize/nem.ts` that maps a raw `NemReconciliation` (the RawExtraction layer) into a new canonical NEM shape in `src/lib/normalize/types.ts`, **links it to the generating `SolarArray` by SA ID**, and **surfaces the array's benefiting meters by SA ID**. It is pure: it takes the raw extraction plus an in-memory inventory projection and returns the canonical shape. No Prisma, no DB write, no `/app` — the DB persistence and the meter#/Pump-ID identity-checked join are Stories 1.6/1.8.

- **AC1 "monthly rows each captured as distinct periods":** `NemReconciliationSchema.monthlyRows` is already an array of `{ periodStart, periodEnd, kWh, amountCents }`. Prove that **N** rows (use a full 12-month statement fixture) survive the pipeline as **N distinct periods** and normalize to **N** canonical months in order — not collapsed, summed, or deduped.
- **AC1 "annual True-up value and date ... per Array":** the schema carries `trueUpMonth` (1-12) + `trueUpAmountCents`. Add `trueUpDate: z.string().nullable()` (ISO date of the printed true-up statement) so the actual printed date is captured, not only the settle month. "Per Array" is satisfied by the normalize step linking the page (keyed by the generating SA ID) to its `SolarArray` — the true-up belongs to the array, never to a benefiting meter.
- **AC2 "negative usage captured, not floored":** `NemMonthlyRow.kWh` is `z.number()` (not `.nonnegative()`); 1.4 proved extraction keeps the negative. Here prove the **normalize** step also preserves it: an over-production month's negative net kWh must arrive in the canonical shape **unchanged** (no `Math.max(0, …)`, no abs, no drop). This is a data-fidelity AC — a floored negative is a defect (FR-3 / NFR-4).
- **AC3 "attach to the correct Benefiting Meters via SA ID and link to the generating Array":** `normalizeNem(raw, inventory)` resolves `raw.saId` (the generating meter's SA ID) against the inventory's arrays. The `SolarArray` model already carries `saId` (the array's generating service) and a `benefitingMeters` Pump[] relation (built from the spreadsheet in Story 1.2). The normalize output names the matched `arrayId` and the benefiting meters' SA IDs. **Identity-honest:** if no array's `saId` matches the page's `saId`, do **not** fabricate a link — set `arrayId: null` and `coverageState: "needs_review"`. Never attach NEM credits to a guessed array (the NEM analogue of the 1.6 meter#/Pump-ID mismatch rule).
- **SA-ID normalization** (trim; preserve any `P0xx`/descriptor suffix as a separate field) is **Story 1.6's** contribution and is shared by both the charge-detail join and this NEM join. Here, match on the **trimmed exact** SA ID; leave the richer canonical-SA-ID normalization to 1.6 (note it, do not build it twice).

## Tasks / Subtasks

- [x] **Task 1: Additive NEM schema enrichment** (AC: 1)
  - [x] In `src/lib/extract/schema.ts`, add `trueUpDate: z.string().nullable().describe("ISO date of the printed annual true-up statement; null when the page is not a true-up month")` to `NemReconciliationSchema`, alongside the existing `trueUpMonth` / `trueUpAmountCents`. Additive: keep `trueUpMonth` (the recurring settle month, mirrored by `SolarArray.trueUpMonth`).
  - [x] This is a **required-nullable** key (Zod requires the key to be present even if `null`). Update the two existing fixtures that build a NEM object so they stay green: `src/lib/extract/schema.test.ts` (the NEM parse test) and `src/lib/extract/pipeline.test.ts` (`nemPage`) — add `trueUpDate: null` (or a real ISO date in one) to each. Do NOT make it `.optional()`/`.nullish()`; the page always has the field on a true-up statement, it is simply null off-cycle. (Mirrors how the other page schemas model "present but maybe null".)
  - [x] Do NOT touch `PerSaChargeDetailSchema` or any other page schema. Do NOT add `pdf-lib`/`ai` work — extraction execution is the existing pipeline.

- [x] **Task 2: The canonical NEM shape** (AC: 1, 2, 3)
  - [x] In `src/lib/normalize/types.ts`, ADD (do not modify existing types) the source-agnostic canonical NEM shape the dashboard/recs read after normalize. Suggested:
    - `CanonicalNemMonth { start: string; close: string; netKwh: number; amountCents: number | null }` — `netKwh` full precision and MAY be negative (over-production); `amountCents` integer cents or null.
    - `CanonicalNemReconciliation { generatingSaId: string; arrayId: string | null; arrayName: string | null; trueUpMonth: number | null; trueUpDate: string | null; trueUpAmountCents: number | null; months: CanonicalNemMonth[]; benefitingMeterSaIds: string[]; coverageState: CoverageState }`.
  - [x] Document at the top of the addition that this is the canonical (post-normalize) NEM shape; `/app` and `/lib/recommendations` read THIS, never the raw `NemReconciliation`. Billed amounts integer cents (AR-6); `netKwh` full precision, negatives preserved (FR-3).
  - [x] `coverageState` reuses the existing `CoverageState` union (`@/lib/recommendations/types`) — no new union. `reconciled` is not set here (that is Story 1.7); a successfully-linked allocation is left `no_bill` until reconciled, an unlinkable one is `needs_review`.

- [x] **Task 3: The pure NEM normalize** (AC: 2, 3)
  - [x] `src/lib/normalize/nem.ts`: `normalizeNem(raw: NemReconciliation, inventory: NemInventoryView): CanonicalNemReconciliation`, pure (no Prisma/DB/UI/network).
  - [x] Define `NemInventoryView` as a plain in-memory projection the caller builds from the DB (the DB read lives in the importer/Story 1.6/1.8, NOT here): e.g. `type NemArrayRow = { arrayId: string; arrayName: string | null; generatingSaId: string; benefitingMeterSaIds: string[] }` and `type NemInventoryView = { arrays: NemArrayRow[] }` (or a `Map<saId, NemArrayRow>`).
  - [x] Map `raw.monthlyRows` → `months` 1:1, **in order**, copying `kWh` to `netKwh` **unchanged** (AC2 — no floor/abs/clamp). Carry `trueUpMonth` / `trueUpDate` / `trueUpAmountCents` straight through.
  - [x] Match `raw.saId.trim()` against each array's `generatingSaId.trim()`. On a unique match: `arrayId`/`arrayName` set, `benefitingMeterSaIds` = that array's list, `coverageState: "no_bill"` (linked, awaiting reconcile). On no match (or an ambiguous multi-match): `arrayId: null`, `arrayName: null`, `benefitingMeterSaIds: []`, `coverageState: "needs_review"` (AC3 identity-honesty — never a guessed array).
  - [x] Keep `generatingSaId` = trimmed `raw.saId` regardless (so a `needs_review` still names its SA, like the pipeline's needs_review).

- [x] **Task 4: Boundary guard** (AC: 3)
  - [x] `normalize/nem.ts` imports the raw `NemReconciliation` type from `@/lib/extract/schema`, so it is a raw-consuming mapper like `normalize/bayou.ts` / `normalize/espi.ts`. Add `@/lib/normalize/nem` to `RAW_SOURCE_MODULES` in `src/lib/normalize/no-raw-source-in-ui.test.ts` so no `src/app` file can import it. `/app` reads the canonical NEM types via `@/lib/normalize` only. Keep the guard green (no `/app` importer exists yet).

- [x] **Task 5: Fixtures + tests** (AC: 1, 2, 3)
  - [x] Commit `fixtures/extract/sample-nem-page.json`: one realistic raw `NemReconciliation` — a full **12 distinct monthly rows** with a mix of positive consumption months and **negative over-production** months, a `trueUpMonth`, a `trueUpDate`, and a `trueUpAmountCents`. (Read only by tests, so it does NOT need `process.cwd()` or `outputFileTracingIncludes` — those are for runtime reads; note this so the Vercel trap is not over-applied.)
  - [x] `src/lib/extract/pipeline.test.ts` (extend): add a case feeding the 12-row fixture through `extractBill` via a fake reader, asserting **12 distinct periods** survive (`monthlyRows.length === 12`, distinct `periodStart`s), at least one `kWh < 0`, and `trueUpMonth`/`trueUpDate`/`trueUpAmountCents` captured. (This is the AC1/AC2 extraction proof beyond 1.4's single-row case.)
  - [x] `src/lib/normalize/nem.test.ts` (new, pure): with an inventory view containing the generating array (its `generatingSaId` matching the fixture's `saId`) and two benefiting meters,
    - assert the 12 months map 1:1 in order and the negative `netKwh` is preserved unchanged (AC2);
    - assert `arrayId`/`arrayName` resolve and `benefitingMeterSaIds` equals the two benefiting meters (AC3);
    - assert true-up value/date carry through (AC1);
    - assert a raw page whose `saId` matches **no** array → `arrayId: null`, `benefitingMeterSaIds: []`, `coverageState: "needs_review"`, never a fabricated link (AC3 identity-honesty).
  - [x] Use `if (...) throw` narrowing (not `if (ok) expect(...)`) so assertions never pass vacuously — the 1.4 review hardened the template this way.

- [x] **Task 6: Validate** (AC: all)
  - [x] `npm run lint`, `npx tsc --noEmit`, `npm test` all green. No DB change, no migration, no seed impact in this story — confirm `npm run db:seed` still reports the 183-meter Batth seed. Confirm `no-raw-source-in-ui.test.ts` stays green with `@/lib/normalize/nem` added.

## Dev Notes

### Scope boundary (what is NOT in this story)

- **No DB writes / no persistence / no migration.** `normalizeNem` is pure and returns an in-memory canonical shape. Persisting NEM periods/credits, wiring the array→meter DB relation from extraction, and reading the inventory from Prisma are Stories 1.6/1.8. Do NOT import Prisma in `nem.ts`.
- **No meter#/Pump-ID identity-checked join, no canonical SA-ID normalization helper.** Those are Story 1.6 and are shared across charge-detail + NEM joins. Here, match SA IDs by trimmed-exact equality; if 1.6 later introduces a `normalizeSaId()` helper, the NEM match repoints to it then (note it, do not pre-build).
- **No live AI Gateway call.** Extraction execution is the existing injected-`PageReader` pipeline (`extractBill`); the live `generateObject`/Gateway wiring + key is Story 1.8. Zero external calls here.
- **No general charge-detail normalize.** Mapping `PerSaChargeDetail` → `CanonicalBill` is Story 1.6. This story only does the NEM mapper.

### What exists to build on

- **`src/lib/extract/schema.ts`** — `NemReconciliationSchema` (Story 1.3): `saId`, `monthlyRows[]` (`periodStart`/`periodEnd`/`kWh`/`amountCents`), `trueUpMonth`, `trueUpAmountCents`. You add only `trueUpDate`.
- **`src/lib/extract/pipeline.ts`** — `extractBill(bytes, reader)` (Story 1.4) already classifies + validates NEM pages and returns `{ ok, page }` / `needs_review`. Reuse it; do not write a second pipeline.
- **`prisma/schema.prisma` `SolarArray`** — already has `saId` (generating service), `nameplateKw`, `trueUpMonth`, and `benefitingMeters Pump[] @relation("NemAllocation")` (the NEMA graph, built from the spreadsheet in Story 1.2). The benefiting meters' SA IDs come from `Pump.serviceId`. This is the source of truth for AC3's links — the normalize does not invent the graph, it reads it from the inventory projection.
- **`src/lib/normalize/types.ts`** — holds `CanonicalBill`/`CanonicalBillingPeriod`/`CanonicalLineItem` (Story 1.3) and the older float-USD `NormalizedMeter`. ADD the NEM shape alongside; do not modify the others.
- **`src/lib/normalize/bayou.ts` / `espi.ts`** — the existing raw→canonical mapper precedent (pure, raw-consuming, forbidden from `/app`). `nem.ts` follows the same shape and earns the same guard entry.

### Critical guardrails

1. **Negative net kWh survives normalize (FR-3 / AC2).** Copy `kWh → netKwh` verbatim. No `Math.max(0, …)`, no `Math.abs`, no filtering out negative or zero months. A floored negative is a data-fidelity defect, not a rounding nicety.
2. **Never fabricate an array link (AC3 / NFR-4).** No SA-ID match → `arrayId: null` + `coverageState: "needs_review"`. This is the NEM mirror of "never attach a figure to a possibly-wrong meter."
3. **Integer cents vs full-precision usage (AR-6).** `amountCents` / `trueUpAmountCents` are integer cents; `netKwh` is full precision. Never round usage to cents; never store a billed amount as a float.
4. **Pure logic stays pure.** `nem.ts` takes plain inputs (raw + inventory view) and returns a plain value — no Prisma, no React, no I/O. This is what makes it provably testable (project-context).
5. **TS strict + no-`any` + `noUncheckedIndexedAccess`.** `raw` is the Zod-`infer` type (exact); array access in tests is `T | undefined` (guard, don't `!`-assert away). Narrow, never cast with `as any`.
6. **Boundary stays out of `/app`.** Add `@/lib/normalize/nem` to the no-raw-source guard; `/app` reads canonical NEM types via `@/lib/normalize`.

### Concrete shapes (recommended)

```ts
// src/lib/normalize/types.ts  (ADD)
export type CanonicalNemMonth = {
  start: string;            // ISO period start
  close: string;            // ISO period end
  netKwh: number;           // full precision; NEGATIVE when generation > consumption (never floored)
  amountCents: number | null;
};
export type CanonicalNemReconciliation = {
  generatingSaId: string;   // trimmed SA ID of the generating array's service
  arrayId: string | null;   // matched SolarArray; null => needs_review (no fabricated link)
  arrayName: string | null;
  trueUpMonth: number | null;
  trueUpDate: string | null;
  trueUpAmountCents: number | null;
  months: CanonicalNemMonth[];
  benefitingMeterSaIds: string[]; // the array's benefiting meters, by SA ID (AC3)
  coverageState: CoverageState;   // "needs_review" when unlinkable; else "no_bill" (1.7 sets "reconciled")
};

// src/lib/normalize/nem.ts
import type { NemReconciliation } from "@/lib/extract/schema";
import type { CanonicalNemReconciliation } from "./types";

export type NemArrayRow = {
  arrayId: string;
  arrayName: string | null;
  generatingSaId: string;
  benefitingMeterSaIds: string[];
};
export type NemInventoryView = { arrays: NemArrayRow[] };

export function normalizeNem(
  raw: NemReconciliation,
  inventory: NemInventoryView,
): CanonicalNemReconciliation { /* map months verbatim; match saId; needs_review on no match */ }
```

### Previous story intelligence (1.4, done)

- The pipeline `extractBill(bytes, reader)` is the extraction execution; the AI call is the injected `PageReader` (stubbed; live wiring is 1.8). Reuse it — do not write a new pipeline for NEM.
- 1.4's review hardened the test template: use `if (!r.ok) throw …` to narrow the discriminated union AND fail loudly, so AC assertions never pass vacuously. Mirror that here.
- 1.4 added `pdf-lib` only and **deferred `ai` to Story 1.8** — do not re-add `ai` here.
- 1.3 deferred a `NemType` TS-union mirror to "Story 1.5 NEM extraction." Re-evaluate: the `SolarArray.nemType` values (`"nem2" | "nem2_agg"`) are not exercised by this story's extraction/normalize (the NEM page does not carry the program type; it is set from the spreadsheet). Do NOT mirror `NemType` here unless the normalize actually reads it — keep it deferred (note the decision in the review/deferred-work) rather than mirroring a value set this story does not touch.
- 1.3 deferred the `BillingLineItem.kind`/`unit` union mirror to "Story 1.4 when extraction settles the kinds." That is charge-detail, not NEM — leave it for 1.6/1.7.

### Project structure notes

- New: `src/lib/normalize/nem.ts` (+ `nem.test.ts`); `fixtures/extract/sample-nem-page.json`.
- Modified: `src/lib/extract/schema.ts` (add `trueUpDate`), `src/lib/extract/schema.test.ts` + `src/lib/extract/pipeline.test.ts` (add `trueUpDate`, add the 12-row NEM case), `src/lib/normalize/types.ts` (add the NEM canonical shape), `src/lib/normalize/no-raw-source-in-ui.test.ts` (guard `@/lib/normalize/nem`).
- Optionally re-export `normalizeNem` / the NEM canonical types from `src/lib/normalize/index.ts` if it barrels other normalize exports — check it first; keep `/app`-facing exports to canonical types only.
- Architecture maps the NEMA graph + per-array true-up to the `SolarArray` model and the normalize seam. [Source: architecture.md#Data Architecture lines 281-282; #Source isolation lines 274-277]

### Latest tech notes

- **Zod v4** (`zod` 4.4.3, already installed): `z.string().nullable()` is a *required* key that accepts `null` — that is why the two existing NEM fixtures must add `trueUpDate`. `.describe()` text also feeds `generateObject`'s prompt in Story 1.8, so write it as an instruction to the model.
- No new dependency. `pdf-lib` is already present (1.4); `ai` stays deferred to 1.8.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5] — user story + the three ACs verbatim.
- [Source: _bmad-output/planning-artifacts/epics.md#FR-3] — NEM negative usage captured, not floored; bundled monthly rows as distinct periods; per-array true-up.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture (lines 281-282)] — `SolarArray` with explicit Array→benefiting-Meter (NEMA) relation and per-array `trueUpMonth`; do not model solar as flat meter flags.
- [Source: _bmad-output/planning-artifacts/architecture.md#Source isolation (lines 274-277)] — the `/lib/normalize` canonical shape is the seam; nothing downstream reads the raw source.
- [Source: _bmad-output/planning-artifacts/architecture.md#Extraction -> Canonical -> Reconciliation contract (lines 386-398)] — three typed layers; SA-ID join is identity-checked, mismatch → needs_review.
- [Source: src/lib/extract/schema.ts] — `NemReconciliationSchema` to enrich.
- [Source: src/lib/extract/pipeline.ts] — `extractBill` to reuse for the extraction proof.
- [Source: prisma/schema.prisma#SolarArray] — `saId`, `benefitingMeters` NEMA relation, `trueUpMonth` — the source of the AC3 links.
- [Source: src/lib/normalize/types.ts] — the canonical shapes to extend.
- [Source: src/lib/normalize/no-raw-source-in-ui.test.ts] — the boundary guard to extend.
- [Source: _bmad-output/project-context.md] — zero external calls; pure logic + colocated tests; integer cents vs full-precision usage; no-`any`; unions mirrored in recommendations/types.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx tsc --noEmit` -> exit 0; `npm run lint` -> exit 0; `npm test` -> 40 files / 239 tests pass (+7 over 1.4's 232: 1 pipeline NEM case + 6 normalizeNem cases).
- `npx vitest run src/lib/extract src/lib/normalize` -> 8 files / 34 tests pass.
- `npm run db:seed` -> "Seeded Batth Farms: 183 meters, 6 entities, 57 accounts, 2196 bills, 13440 intervals." No DB change / no migration in this story; seed unaffected.

### Completion Notes List

- **Two halves, both pure, zero external calls.** (1) NEM extraction richness proven through the existing Story 1.4 pipeline (`extractBill` + injected `PageReader`); (2) a new pure `normalizeNem` mapper that links the generating array by SA ID and names its benefiting meters. No Prisma, no migration, no `/app` import.
- **AC1 distinct periods + true-up:** the 12-month fixture survives the pipeline as 12 distinct periods (asserted by distinct `periodStart` set) and normalizes 1:1 in source order; `trueUpMonth`/`trueUpDate`/`trueUpAmountCents` carried through. Added one additive field `trueUpDate` (ISO statement date) to `NemReconciliationSchema` so the printed date is captured, not only the settle month - updated the two pre-existing NEM fixtures (schema.test, pipeline.test) to carry the required-nullable key.
- **AC2 negatives survive normalize:** `normalizeNem` copies `kWh -> netKwh` verbatim; tests assert December's `-6840.0` arrives unchanged and at least one month is negative. No floor/abs/clamp anywhere.
- **AC3 identity-honest array link:** matches `raw.saId.trim()` against `SolarArray.generatingSaId` (trimmed). Unique match -> `arrayId`/`arrayName`/`benefitingMeterSaIds` set + `coverageState "no_bill"`. No match OR ambiguous multi-match -> `arrayId null`, `benefitingMeterSaIds []`, `coverageState "needs_review"` - never a fabricated link. The SA ID is still named on a needs_review.
- **Boundary:** `normalize/nem.ts` consumes the raw `NemReconciliation` type, so `@/lib/normalize/nem` is added to the no-raw-source-in-ui guard; `/app` reads the canonical NEM types via `@/lib/normalize` (they flow through `export * from "./types"`). `normalizeNem` is intentionally NOT re-exported from the index (ingestion-only deep import for the 1.6/1.8 importer), which is tighter than the bayou/espi precedent.
- **Out of scope (correctly deferred):** DB persistence + the inventory DB read (1.6/1.8); the meter#/Pump-ID identity-checked join and a shared `normalizeSaId()` helper (1.6); promoting a linked allocation to `reconciled` (1.7). The `NemType` union mirror (deferred from 1.3 to "1.5") is NOT mirrored here because this story's extraction/normalize never reads `nemType` (it is a spreadsheet field, absent from the NEM page) - kept deferred rather than mirroring an untouched value set.

### File List

- `src/lib/extract/schema.ts` (modified) - added `trueUpDate` (additive, required-nullable) to `NemReconciliationSchema`.
- `src/lib/extract/schema.test.ts` (modified) - added `trueUpDate` to the NEM parse fixture.
- `src/lib/extract/pipeline.test.ts` (modified) - added `trueUpDate` to `nemPage`; new 12-month NEM extraction case (distinct periods, negatives, true-up).
- `src/lib/normalize/types.ts` (modified) - added the canonical NEM shape (`CanonicalNemMonth`, `CanonicalNemReconciliation`).
- `src/lib/normalize/nem.ts` (new) - pure `normalizeNem(raw, inventory)` + `NemArrayRow` / `NemInventoryView`.
- `src/lib/normalize/nem.test.ts` (new) - 1:1 mapping + negative preservation + array link + trim + unmatched/ambiguous needs_review.
- `src/lib/normalize/no-raw-source-in-ui.test.ts` (modified) - guard now forbids `@/lib/normalize/nem` in `/app`.
- `fixtures/extract/sample-nem-page.json` (new) - realistic 12-month NEM statement (test-only read; not a runtime fixture, so no `outputFileTracingIncludes` entry).

## Change Log

- 2026-06-09: Implemented Story 1.5 - NEM reconciliation extraction richness (12 distinct monthly periods incl. over-production negatives + annual true-up value/date, proven through the existing 1.4 pipeline) and a new pure `normalizeNem` that links the generating SolarArray by SA ID, names its benefiting meters, and marks an unlinkable page `needs_review` (never a fabricated link). Added the canonical NEM shape and the additive `trueUpDate` field. lint + tsc + 239 tests + db:seed all green. Status -> review.
- 2026-06-09: Code review (adversarial: Blind Hunter + Edge Case Hunter + Acceptance Auditor, high effort). Acceptance Auditor: all three ACs PASS, scope discipline correct. Fixed 1 data-fidelity bug (blank SA ID could fabricate an array link) flagged independently by two layers; deferred 4 robustness/test-depth/downstream items to deferred-work.md. lint + tsc + 240 tests green. Status -> done.

## Code Review (2026-06-09)

Adversarial review (high effort) of the Story 1.5 diff across three parallel layers: Blind Hunter (diff only), Edge Case Hunter (diff + project read), Acceptance Auditor (diff + spec + context). The Acceptance Auditor verdict: **all three ACs met, scope discipline correct** (no DB/Prisma in `nem.ts`; the 1.6 SA-ID-normalization helper and 1.7 `reconciled` state correctly deferred; the 1.3->1.5 `NemType` union mirror correctly kept deferred because no 1.5 code reads `nemType`). Verified non-vacuous: negative `netKwh` preserved exactly, `matches.length` 0/1/2+ branching correct, `matches[0]!` provably safe, ambiguous multi-match -> needs_review, test-only fixture (no `outputFileTracingIncludes` needed).

Triage: 1 patch, 4 defer, 0 dismissed.

### Fixed (patch applied this story)

- [Patch] **Blank SA ID could fabricate an array link** [src/lib/normalize/nem.ts] - raised independently by Blind Hunter AND Edge Case Hunter (the strongest signal). The match was `array.generatingSaId.trim() === raw.saId.trim()`; the page schema accepts an empty `saId` (`z.string()`, no `.min(1)`) and a Story-1.6 inventory projection could coerce a null `SolarArray.saId` to `""`. Two blank keys would then trim-match, fabricating an `arrayId` link + `coverageState "no_bill"` and attaching another array's benefiting meters - the exact AC3 "never fabricate a link" failure. Fixed: a blank trimmed `generatingSaId` never matches (-> `needs_review`). New test asserts a blank-`saId` page against a blank-keyed inventory array stays `arrayId: null` / `needs_review`.

### Deferred (robustness / test-depth / downstream, recorded in deferred-work.md)

- [Defer] Empty `monthlyRows` normalizes to a clean linked result with no signal - decide at Story 1.8 (real pages) whether zero rows should force `needs_review`. Not a wrong figure, so not fixed now.
- [Defer] True-up cross-field nullability (amount without month/date; date-month disagreement) is passed through verbatim - correct at the normalize layer; a Story 1.7 reconcile-time consistency check.
- [Defer] The no-raw-source guard cannot catch a future `@/lib/normalize` index re-export of `normalizeNem` (holds today since it is not re-exported) - guard-hardening pass; the gap pre-exists for the bayou/espi mappers too.
- [Defer] Downstream NEM inventory-projection (1.6) and persistence (1.8) contract: drop null-SA arrays from the projection, drop/dedupe null/duplicate benefiting-meter SA IDs, and dedupe/merge multiple NEM pages per generating SA so 1.8 neither clobbers nor double-counts months.
