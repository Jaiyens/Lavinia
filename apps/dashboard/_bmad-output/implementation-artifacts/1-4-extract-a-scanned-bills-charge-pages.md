---
baseline_commit: 7deab3e7ecf08aa85e91e9a755b30dccd7e2d16e
---

# Story 1.4: Extract a scanned bill's charge pages

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grower,
I want my scanned, image-only PG&E bill read into structured per-meter charges,
so that my real costs, rates, and demand show up against each meter without anyone re-typing a 101-page bill.

## Acceptance Criteria

1. **Given** a 101-page image-only PDF, **When** the pipeline runs, **Then** pdf-lib splits it per page and each page is classified (payment-confirmation / account summary / per-SA summary list / per-SA charge detail / NEM reconciliation) before any extraction schema is applied.

2. **Given** a per-SA charge-detail page, **When** extracted via `generateObject` + the page Zod schema, **Then** it yields the printed rate name, meter #, Pump ID, the TOU energy split with charges, the demand charge, NBCs, and every other line item composing the SA's printed total.

3. **Given** both two-tier and three-tier (legacy, e.g. AG5B Part-Peak) TOU, **When** extracted, **Then** both are handled correctly.

4. **Given** a single account PDF carrying dozens of meters, **When** extracted, **Then** it fans out to many Service Agreements.

5. **Given** a Zod validation failure, **When** `generateObject` retries are exhausted, **Then** the SA is marked `needs_review` rather than throwing a wrong number to the user.

### AC interpretation notes (read before coding)

This is the **extraction pipeline**: split -> classify -> extract -> validate -> needs_review. It produces in-memory `RawPage` results (the Story 1.3 schemas). It does **NOT** persist to the DB, normalize to the canonical shape, join to inventory, or reconcile — those are Stories 1.6/1.7/1.8. It runs with **zero external calls**: the Claude/AI Gateway call sits behind an injected `PageReader` boundary that is **stubbed + fixture-backed in dev/tests** (the existing `vision.ts`/`source.ts` stub pattern). The **live** Gateway wiring (the API key, the `anthropic/claude-*` model config, the sonnet->opus cost-lever escalation, bounded-concurrency fan-out, and the `api/import` admin action) is **Story 1.8** — do not wire the live key or build the route here.

- **AC1 "pdf-lib splits per page ... classified before extraction":** real, testable. `pdf-lib` splits a PDF buffer into per-page single-page PDF buffers (no network, no rasterization). Classification is a `PageReader.classify(page) -> PageType` boundary call; the pipeline must classify a page BEFORE choosing its extraction schema. Test pdf-lib with a **synthetic multi-page PDF generated in the test** (`PDFDocument.create()` + `addPage()` xN) — you do NOT need a real bill (that is Story 1.8).
- **AC2 "extracted via generateObject + the page Zod schema":** the `PageReader.extract(page, type)` boundary returns a raw object; the pipeline validates it with the matching Story 1.3 page schema (`PerSaChargeDetailSchema` etc.). In the LIVE reader (deferred to 1.8) `extract` is `generateObject({ model, schema })`; in dev/tests it is an injected fake. The schema already models rate name, meter #, Pump ID, TOU split, demand, NBCs, other line items, printed total — reuse it, do not redefine.
- **AC3 two-tier and three-tier TOU:** already expressible — `PerSaChargeDetailSchema.touEnergy` is an array (2 or 3 buckets). Prove both parse through the pipeline with fixtures; no schema change needed.
- **AC4 "fans out to many SAs":** one account PDF -> many per-SA charge-detail pages -> the pipeline returns one extracted result per SA. Map over the split pages; collect per-SA results. (Bounded-concurrency execution is Story 1.8's concern — a simple sequential or small-cap map is fine here; note it.)
- **AC5 "validation failure -> needs_review, not a wrong number":** when `extract` returns data that fails the page schema's `safeParse` (or the reader throws after its own retries), the pipeline yields a `needs_review` result for that page/SA (carrying the page index, SA ID if known, and a reason), never a fabricated figure (NFR-4). The live reader's `generateObject` auto-retries; the pipeline treats a final failure as `needs_review`.

## Tasks / Subtasks

- [x] **Task 1: Install pipeline deps** (AC: 1, 2)
  - [x] `npm install pdf-lib ai`. `pdf-lib` (pure JS, splits the PDF). `ai` (AI SDK v6) is used by the LIVE reader's `generateObject`; it is imported only in the boundary module and is NOT exercised in tests (no key). Do NOT add a provider key or `@ai-sdk/*` provider package — the Vercel AI Gateway uses `"anthropic/claude-*"` provider strings (AR-3), wired with the key in Story 1.8.

- [x] **Task 2: PDF split** (AC: 1)
  - [x] `src/lib/extract/split.ts`: `splitPdfPages(bytes: Uint8Array): Promise<Uint8Array[]>` — load with `PDFDocument.load`, and for each page index build a new single-page `PDFDocument` (`copyPages`) and `save()` to a `Uint8Array`. Pure (no network).
  - [x] `src/lib/extract/split.test.ts`: generate a synthetic N-page PDF in-test (`PDFDocument.create()`, `addPage()` xN, `save()`), assert `splitPdfPages` returns N single-page buffers, each a valid loadable PDF with exactly 1 page.

- [x] **Task 3: The `PageReader` boundary + the stubbed/live readers** (AC: 1, 2, 5)
  - [x] `src/lib/extract/reader.ts`: define `interface PageReader { classify(page: Uint8Array, index: number): Promise<PageType>; extract(page: Uint8Array, type: PageType): Promise<unknown>; }` (extract returns `unknown` — the pipeline validates with Zod).
  - [x] Provide a `stubPageReader` that throws a clear "not wired - inject a reader (live wiring is Story 1.8)" error, with a `// TODO(1.8): wire Vercel AI Gateway generateObject` marker (mirrors `vision.ts`/`source.ts` stubs; keeps zero external calls).
  - [x] Sketch the LIVE reader shape in a comment or a guarded `createGatewayReader()` that uses `ai`'s `generateObject({ model: "anthropic/claude-opus-4-8", schema, ... })` per page type — but do NOT call it without a key; Story 1.8 supplies the key, the sonnet->opus escalation, and bounded concurrency. Keep it un-exercised by tests.

- [x] **Task 4: The pipeline** (AC: 1, 2, 3, 4, 5)
  - [x] `src/lib/extract/pipeline.ts`: `extractBill(bytes: Uint8Array, reader: PageReader): Promise<ExtractedPage[]>` where `ExtractedPage` is a discriminated result: `{ pageIndex, pageType, ok: true, page: RawPage }` or `{ pageIndex, pageType?, saId: string | null, ok: false, status: "needs_review", reason: string }`.
  - [x] Flow: `splitPdfPages` -> for each page: `reader.classify` (AC1: classify first) -> pick the page schema by type -> `reader.extract` -> `Schema.safeParse(raw)` -> on success `{ ok: true, page }`; on failure (or a thrown reader error) `{ ok: false, status: "needs_review", reason }`. Capture `saId` from the raw object when present so a needs_review still names its SA.
  - [x] Fan-out: each `per_sa_charge_detail` (and `nem_reconciliation`) page yields one per-SA result; the function returns the full array across the account's pages (AC4). Keep the map simple (sequential or a small concurrency cap); add a comment that bounded-concurrency execution is Story 1.8.
  - [x] Never throw a wrong number: any extraction/validation failure becomes a `needs_review` result (AC5).

- [x] **Task 5: Fixtures + a fake reader for tests** (AC: 2, 3, 4, 5)
  - [x] `src/lib/extract/pipeline.test.ts` (pure): build a synthetic multi-page PDF; inject a fake `PageReader` whose `classify`/`extract` return canned data keyed by page index covering: a two-tier `per_sa_charge_detail`, a three-tier (legacy Part-Peak) one, a second SA (prove fan-out -> 2 ok results), a `nem_reconciliation` page, and one page whose `extract` returns a schema-invalid object (e.g. a float `printedTotalCents`) -> assert that page is `needs_review` with its `saId` captured, and that the valid SAs still extract.
  - [x] Assert classification happens before extraction (e.g. the fake records call order, or extract is only called with the type classify returned).
  - [x] Optionally commit a small canned `fixtures/extract/sample-pages.json` of raw page objects the fake reads, so 1.5/1.6 can reuse it. (The reconciled `fixtures/extract/batth-account-*.json` is Story 1.8.)

- [x] **Task 6: Validate** (AC: all)
  - [x] `npm run lint`, `npm test`, `npx tsc --noEmit` green. No DB changes, no migration, no seed impact in this story. Confirm `no-raw-source-in-ui.test.ts` stays green (the new extract modules must not be imported by `/app`).

## Dev Notes

### Scope boundary (what is NOT in this story)

- **No DB writes / no persistence.** `extractBill` returns in-memory `RawPage`/`needs_review` results. Persisting to `BillingPeriod`/`BillingLineItem`, normalizing to the canonical shape, the identity-checked SA-ID join, reconciliation, and `coverageState` are Stories 1.6/1.7. Do not import Prisma here.
- **No live AI Gateway call, no key, no `api/import` route.** The live `generateObject` wiring (model strings, sonnet->opus cost-lever escalation, bounded-concurrency fan-out, the admin import action, streaming results into the DB) is **Story 1.8**, where `AI_GATEWAY_API_KEY` is provisioned. Here the AI call is an injected boundary, stubbed for dev/tests (zero external calls — project-context rule).
- **No schema redefinition.** Reuse the Story 1.3 Zod schemas in `src/lib/extract/schema.ts` (`PerSaChargeDetailSchema`, `NemReconciliationSchema`, `PageTypeSchema`, `RawPageSchema`). The `touEnergy` array already handles two- and three-tier TOU.

### What exists to build on

- **`src/lib/extract/schema.ts`** (Story 1.3): the page Zod schemas + `z.infer` types + `RawPageSchema` discriminated union + `PageTypeSchema`. The pipeline picks a schema by `PageType` and `safeParse`s the reader's raw output against it.
- **Stub pattern** to mirror: `src/lib/onboarding/source.ts` and `vision.ts` are external boundaries stubbed with a marked TODO so the app runs with zero external calls. The `PageReader` follows the same shape; tests inject a fake.
- **Importer pattern (for later, not here):** `src/lib/greenbutton/import.ts` shows the DB-edge style for Story 1.6/1.8. Not used in 1.4.

### Critical guardrails

1. **Zero external calls in dev/CI (project-context).** The AI call is injected; `stubPageReader` throws if used un-injected, and `ai`/`generateObject` is never invoked in tests. No network in `split.ts` or `pipeline.ts`.
2. **Never throw a wrong number (NFR-4 / AC5).** Any extraction or Zod-validation failure becomes a `needs_review` result, never a fabricated or partial figure passed off as real.
3. **Classify before extract (AC1).** Page type is determined first; the extraction schema is chosen from it. Do not run a charge-detail schema against a payment-confirmation page.
4. **Negative NEM usage survives (FR-3).** `NemReconciliationSchema` allows negative `kWh`; do not add a non-negative guard in the pipeline.
5. **TS strict + no-`any`.** `reader.extract` returns `unknown`; narrow via `safeParse`, never cast with `as`/`any`. `pdf-lib` and `ai` are typed.
6. **Boundary stays out of `/app` (AC / no-raw-source guard).** `src/lib/extract/*` is the raw layer; nothing in `src/app` imports it (the guard added in 1.3 covers `@/lib/extract`).

### Concrete shapes (recommended)

```ts
// src/lib/extract/reader.ts
import type { PageType } from "./schema";
export interface PageReader {
  classify(page: Uint8Array, index: number): Promise<PageType>;
  extract(page: Uint8Array, type: PageType): Promise<unknown>; // pipeline validates with Zod
}

// src/lib/extract/pipeline.ts
export type ExtractedPage =
  | { pageIndex: number; pageType: PageType; ok: true; page: RawPage }
  | { pageIndex: number; pageType: PageType | null; saId: string | null; ok: false; status: "needs_review"; reason: string };

export async function extractBill(bytes: Uint8Array, reader: PageReader): Promise<ExtractedPage[]> { /* split -> classify -> extract -> safeParse -> needs_review */ }
```

### Previous story intelligence (1.3, done)

- The page schemas + `RawPageSchema` are ready and tested; reuse them, do not re-create. `printedTotalCents`/`amountCents` are `z.number().int()` (integer cents) — a float from a bad extraction will fail `safeParse`, which is exactly the AC5 `needs_review` trigger you test.
- 1.3 left `BillingLineItem.kind`/`unit` and `CanonicalLineItem.kind` as un-mirrored unions (deferred). Not relevant to 1.4 (no canonical/DB work here).
- Patterns: pure logic in `/lib` with colocated `*.test.ts` (node env); external boundary stubbed with a TODO; `@/` alias imports.

### Latest tech notes

- **`pdf-lib`** (pure JS, no native deps): `PDFDocument.load(bytes)`, `PDFDocument.create()`, `copyPages(src, [i])`, `doc.save()` -> `Uint8Array`. Splitting per page is `for each index: new doc + copyPages + save`. Works in the Node test env with zero external calls.
- **AI SDK v6 (`ai`)**: `generateObject({ model, schema, prompt|messages })` returns `{ object }` validated against a Zod schema, auto-retrying with corrective prompting on validation failure (AR-3). Through the Vercel AI Gateway the model is a `"anthropic/claude-*"` string; PDFs/images are passed as message file/image parts (Claude native PDF/vision, no rasterization). All of that is Story 1.8 — here it lives un-exercised behind the boundary.
- Do not pull in a provider SDK (`@ai-sdk/anthropic`); the Gateway provider-string approach is the architecture decision (AR-3).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4] - user story + the five ACs verbatim.
- [Source: _bmad-output/planning-artifacts/epics.md#FR-2] - the five page types; per-SA charge detail contents; two/three-tier TOU; one PDF fans out to many SAs.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] (lines 249-268) - AI Gateway + AI SDK v6, `generateObject` + Zod, pdf-lib split, classify-before-extract, bounded-concurrency fan-out (1.8), cost-lever escalation (1.8).
- [Source: _bmad-output/planning-artifacts/architecture.md#Extraction -> Canonical -> Reconciliation contract] (lines 386-398) - RawExtraction is the per-page layer; on validation failure mark `needs_review`, never throw a wrong number.
- [Source: src/lib/extract/schema.ts] - the Story 1.3 page schemas to reuse.
- [Source: src/lib/onboarding/source.ts, vision.ts] - the stubbed-boundary + marked-TODO pattern to mirror for `PageReader`.
- [Source: _bmad-output/project-context.md] - zero external calls in dev/CI (stub the boundary); pure logic + colocated tests; no-`any`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npm install pdf-lib ai` then `npm uninstall ai` - see note below; net dep added is `pdf-lib` 1.17.1.
- `npx vitest run src/lib/extract` -> 3 files / 10 tests pass (schema from 1.3 + split + pipeline).
- `npx tsc --noEmit` -> exit 0; `npm run lint` -> exit 0; `npm test` -> 39 files / 230 tests pass. No DB change, no migration, no seed impact.

### Completion Notes List

- **Pure extraction pipeline, zero external calls.** `extractBill(bytes, reader)` does split (pdf-lib) -> classify -> extract -> Zod-validate -> `needs_review`, producing in-memory `ExtractedPage[]`. No Prisma, no normalize, no reconcile (those are 1.6/1.7/1.8).
- **AC1:** `splitPdfPages` (pdf-lib, no rasterization) splits per page; the pipeline calls `reader.classify` before choosing a schema. Tested with a synthetic in-test PDF (no real bill needed).
- **AC2/AC3:** validation reuses the Story 1.3 `RawPageSchema` (discriminated union) and asserts the extracted `pageType` matches the classified type; the `touEnergy` array handles two- and three-tier (legacy Part-Peak) splits - both proven in the pipeline test.
- **AC4:** each per-SA charge-detail / NEM page yields one result; the test proves two distinct SAs fan out from one PDF.
- **AC5:** a float `printedTotalCents` fails Zod -> `needs_review` carrying the SA id; a reader that throws (retries exhausted) -> `needs_review` with the reason. Never a fabricated number (NFR-4).
- **Boundary:** the AI call is the injected `PageReader`; `stubPageReader` throws if used un-injected with a `TODO(1.8)` marker (mirrors `source.ts`/`vision.ts`). The `no-raw-source-in-ui` guard already forbids `@/lib/extract` in `/app`.
- **Dependency refinement:** the story said install `pdf-lib` + `ai`. On implementation the AI call is fully behind the injected boundary and the live `generateObject`/Gateway wiring is Story 1.8, so `ai` would be an unused dependency here - I installed `pdf-lib` only and deferred `ai` to 1.8 (where the key, model strings, and cost-lever escalation are wired). Recorded so 1.8 re-adds it.

### File List

- `src/lib/extract/split.ts` (new) - `splitPdfPages` (pdf-lib per-page split).
- `src/lib/extract/split.test.ts` (new) - synthetic-PDF split test.
- `src/lib/extract/reader.ts` (new) - `PageReader` boundary interface + `stubPageReader` (TODO 1.8).
- `src/lib/extract/pipeline.ts` (new) - `extractBill` + `ExtractedPage` (split -> classify -> validate -> needs_review).
- `src/lib/extract/pipeline.test.ts` (new) - fan-out, three-tier TOU, negative NEM, needs_review (bad data + thrown), classify-before-extract ordering.
- `src/lib/extract/index.ts` (modified) - export split/reader/pipeline.
- `package.json` / `package-lock.json` (modified) - added `pdf-lib` (`ai` deferred to 1.8).

## Code Review (2026-06-09)

Adversarial review (extra-high effort, recall mode) of the Story 1.4 pipeline. Found one real correctness bug, fixed; hardened the test template (this story is the pattern 1.5-1.7 copy); deferred the remaining test-depth items.

### Fixed (patches applied this story)

- [Patch] **Unreadable PDF threw uncaught** [src/lib/extract/pipeline.ts] — `splitPdfPages` (pdf-lib `PDFDocument.load`) throws on a corrupt/non-PDF input, and that call was outside the per-page try/catch, so `extractBill` rejected to the caller instead of surfacing `needs_review` (violating NFR-4/AC5 "OCR/read errors surface as needs review, never a wrong number"). Now wrapped: an unreadable PDF returns a single whole-bill `needs_review` result. New test (`new Uint8Array([1,2,3,4,5])` -> `needs_review`).
- [Patch] **Silent empty-page emit** [src/lib/extract/split.ts] — the `noUncheckedIndexedAccess` guard pushed a 0-page PDF when `copyPages` returned nothing; now throws (caught by the pipeline -> whole-bill `needs_review`) rather than emitting a blank page downstream.
- [Patch] **Vacuous + missing test assertions** [src/lib/extract/pipeline.test.ts] — replaced the `if (r.ok && ...)` guards (which would silently assert nothing if a result regressed to `needs_review`) with `if (!r.ok) throw` narrowing so the AC3/AC4 checks always fire; added a test for the classify/extract pageType-mismatch `needs_review` branch (previously untested).

### Deferred (test-depth, recorded in deferred-work.md)

- [Defer] Richer fan-out test: prove a single account PDF with many consecutive per-SA pages (plus an account_summary among them) fans out to N distinct SAs, not just 2.
- [Defer] Assert classify-before-extract across the whole loop (classify count == extract count, each extract preceded by its classify), not only for page 0.
- [Defer] split-level edge tests (0-page document, malformed bytes) at the `splitPdfPages` unit, in addition to the pipeline-level malformed test added here.

## Change Log

- 2026-06-09: Implemented Story 1.4 - the scanned-bill extraction pipeline (pdf-lib per-page split -> classify -> Zod-validated extract -> needs_review), with the AI call behind an injected PageReader boundary (stubbed; live Vercel AI Gateway wiring deferred to Story 1.8). Reuses the Story 1.3 page schemas; handles two/three-tier TOU and SA fan-out; negative NEM survives. Added pdf-lib (ai deferred to 1.8). lint + tsc + 230 tests green. Status -> review.
- 2026-06-09: Code review (adversarial, extra-high effort). Fixed 1 correctness bug (unreadable-PDF threw instead of needs_review) + 1 robustness fix (split silent empty-page) + hardened the test template (non-vacuous assertions, added the mismatch-branch test). Deferred 3 test-depth items to deferred-work.md. lint + tsc + 232 tests green. Status -> done.
