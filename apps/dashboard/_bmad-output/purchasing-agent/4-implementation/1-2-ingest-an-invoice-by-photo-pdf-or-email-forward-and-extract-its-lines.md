---
baseline_commit: 0e136cdd1511f385d7c045db03c9aa0d48bc9857
---

# Story 1.2: Ingest an Invoice by photo, PDF, or email forward and extract its lines

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Batth-scale almond grower,
I want to submit last season's Invoices by photo, PDF upload, or email forward and have the agent read each one into structured lines,
so that my scattered paperwork becomes structured records without me typing anything or handing over a Dealer login.

## Acceptance Criteria

1. **Given** an authenticated grower with the Purchasing Agent turned on, **When** the grower submits one or more clear Invoices by photo, PDF, or email forward, **Then** the agent extracts a structured record for each line carrying SKU description, quantity, unit, unit price (cents), and total (cents), plus any Rebate or Prepay lines distinguished by a `lineType` (FR-1).

2. **Given** the ingestion path, **When** an Invoice is submitted, **Then** the system never prompts for or stores a Dealer or financial login credential at any point, and there is no Dealer-login field anywhere in the schema, the server action, the Zod shape, or the UI (FR-1, NFR-1, ADR-002).

3. **Given** a line the model cannot read with confidence above the configured threshold, or whose Zod validation fails, **When** it is processed, **Then** it is flagged `lineState = "needs_review"`, asserts no number, and is excluded from any Market Band comparison until confirmed; a guessed quantity, unit, or price is never written (FR-1, NFR-4, ADR-006).

4. **Given** development and CI, **When** ingestion runs, **Then** it runs with zero external calls against a committed fixture Invoice: the reader is a stub fed the fixture, and the live AI Gateway reader is constructed only when `hasGatewayKey()` is true (FR-1, NFR-2, ADR-002).

5. **Given** the same Invoice content submitted twice (a grower re-photographs the same paper), **When** it is re-ingested, **Then** the second ingest upserts and does not create a duplicate `Invoice` or duplicate `InvoiceLine` rows; ingestion is idempotent keyed on a content `sourceHash` (ADR-001 idempotency, architecture 8.2).

6. **Given** the grower-facing surface, **When** a line is in `needs_review`, **Then** the grower sees only the line state ("needs review"), never a queue, a wait time, or an SLA; the actual Review queue item creation is deferred to Story 2.1 and is out of scope here (FR-17 boundary; this story produces the `needs_review` state, Epic 2 consumes it).

7. **Given** the pure calculation boundary, **When** the ingest module is built, **Then** the canonical Invoice/InvoiceLine shape is defined once as a Zod schema (the single source of truth, every TS type `z.infer` of it), money amounts are integer cents, quantities and per-unit prices keep full precision, the raw extraction layer is never imported into `src/app`, and no `src/lib/procurement` code imports Prisma or touches the DB (NFR-6, ADR-002, architecture 5.1 / 6.2).

### AC interpretation notes (read before coding)

- **AC1 "Rebate or Prepay lines":** an Invoice mixes product lines with credit/fee lines. Model this with `InvoiceLine.lineType` as a `String` column (union `product | rebate_credit | prepay | fee | tax | other`) mirrored as a TS literal in `src/lib/procurement/types.ts`. Do NOT create separate tables for rebate/prepay lines at ingest time; they are Invoice lines with a `lineType`. The full `RebateProgram` / `RebateTier` audit is Epic 5, not here.
- **AC1 scope boundary:** this story EXTRACTS and PERSISTS structured lines and sets `lineState`. It does NOT normalize to Active Ingredient, resolve a SKU to the catalog, compute a band, or attribute to Ranch/Entity/Account. Active-ingredient resolution + unit normalization is Story 4.1; attribution is Story 1.3. Leave `skuId`, `activeIngredientId`, `normalizedUnit`, `normalizedUnitPrice`, and the attribution columns (`ranchId`, `blockId`, `entityId`, `dealerAccountId`) nullable and unset by this story.
- **AC3 "confidence threshold":** the model returns a per-line `confidence` (Float 0 to 1). A single configured constant (e.g. `INVOICE_CONFIDENCE_THRESHOLD` in the ingest module) separates `ok` from `needs_review`, the same single-knob discipline as the Tool 1 reader (architecture 8.1). Gate in the pure pipeline, NEVER in the UI. The exact value is an open calibration question (PRD section 8, #6); pick a defensible default (e.g. 0.7) and make it one constant.
- **AC5 idempotency:** `sourceHash` is a content hash (e.g. SHA-256) of the uploaded bytes, computed at the DB edge (not in the pure pipeline, which never sees `node:crypto`). Upsert on `@@unique([farmId, sourceHash])` first; the extracted `(dealerId, invoiceNumber, invoiceDate)` identity is a secondary reconcile that Story 1.3 leans on. This story only needs the `sourceHash` upsert to make re-ingest non-duplicating.
- **AC6 vs Epic 2:** Story 1.2 SETS `lineState = "needs_review"` on a line and writes the structured record. The `ReviewQueueItem` row, its internal-ops surface, and the resolve-and-feed-back path are Story 2.1 / 2.2. Do not build the Review queue here. The acceptance test only asserts the line carries the `needs_review` state and asserts no number; it does not assert a queue item exists.
- **`Dealer` / `DealerAccount`:** Story 1.1 stands up the `Dealer`, `DealerAccount`, `Invoice`, `InvoiceLine`, `Product` models on the schema. If 1.1 is already merged, this story REUSES those models and does not redefine them. If 1.1 has not landed the `Invoice` / `InvoiceLine` models yet, add ONLY the `Invoice` + `InvoiceLine` fields this story needs (additively, nullable/defaulted), flag the overlap in the Dev Agent Record, and keep them consistent with architecture section 4.2. Read the live `prisma/schema.prisma` before writing any model.

## Tasks / Subtasks

- [ ] **Task 1: Confirm the schema state and add only the ingest fields not already present** (AC: 1, 3, 5, 7)
  - [ ] Read the live `prisma/schema.prisma`. Confirm whether Story 1.1 already added `Invoice`, `InvoiceLine`, `Dealer`, `DealerAccount`, `Product`. The baseline at this story's `baseline_commit` has NONE of them (verified: `grep -i invoice prisma/schema.prisma` returns nothing).
  - [ ] If absent, add `model Invoice` and `model InvoiceLine` per the schema sketch below, scoped to `Farm` (cascade), with `@@unique([farmId, sourceHash])` on `Invoice` for idempotency and `@@index([farmId])`. Money fields are `Int` cents; `quantity`, `unitPrice`, per-unit prices are `Float`. `source`, `extractionStatus`, `lineType`, `lineState` are `String` columns (no Postgres enum), mirrored in TS.
  - [ ] Do NOT add the attribution columns' relations as required; `entityId`, `dealerAccountId`, `ranchId`, `blockId`, `skuId`, `activeIngredientId` are nullable (Story 1.3 / 4.1 fill them).
  - [ ] Run `npm run db:migrate -- --name procurement_invoice_ingest` then `npm run db:generate`. Keep the auto-seed green (the new models are additive and unseeded by the energy seed).
- [ ] **Task 2: Define the canonical Zod shape (single source of truth)** (AC: 1, 7)
  - [ ] Create `src/lib/procurement/ingest/schema.ts` with `InvoiceLineSchema` and `InvoiceSchema` (and `RawInvoiceSchema` for what the model returns). Every TS type is `z.infer`. Money is integer cents (reuse the `Cents` pattern from `src/lib/extract/schema.ts`); `quantity` and `unitPrice` are full-precision `number`; `rawDescription` preserved verbatim; each line carries `lineType` and a `confidence` (0 to 1).
  - [ ] Add a header comment mirroring `src/lib/extract/schema.ts`: this raw layer must never be imported into `src/app`.
- [ ] **Task 3: Build the injected InvoiceReader boundary (stub + live Gateway)** (AC: 2, 4)
  - [ ] Create `src/lib/procurement/ingest/reader.ts` with an `InvoiceReader` interface `{ read(bytes, source): Promise<unknown> }`, a `stubInvoiceReader` that throws if used un-injected, and `createGatewayInvoiceReader(modelId?)` that uses `generateObject` with a Claude file part over `createGatewayModel` (mirror `src/lib/extract/reader.ts` exactly).
  - [ ] Re-export `hasGatewayKey` from `@/lib/ai/gateway` so the caller chooses stub vs live by key presence. Default model `anthropic/claude-opus-4-8`.
  - [ ] Write an extraction prompt: integer-cents rule, preserve SKU description verbatim, distinguish product vs rebate-credit vs prepay vs fee/tax lines, per-line `confidence`, `null` for any value not on the page (never guess).
- [ ] **Task 4: Build the pure ingest pipeline** (AC: 1, 3, 7)
  - [ ] Create `src/lib/procurement/ingest/pipeline.ts` with `ingestInvoice(bytes, source, reader): Promise<IngestResult>`. It calls `reader.read`, `safeParse`s against `InvoiceLineSchema`, and for each line decides `ok` vs `needs_review` from the confidence threshold AND Zod success (mirror `src/lib/extract/pipeline.ts`).
  - [ ] A reader throw, a PDF that cannot be split, a Zod failure, or a sub-threshold confidence all yield a `needs_review` line, never a thrown error and never a fabricated number (NFR-4). Reuse `splitPdfPages` from `src/lib/extract/split.ts` for multi-page PDFs.
  - [ ] No Prisma, no `node:fs`, no `node:crypto`, no clock in this module. It returns plain data.
- [ ] **Task 5: Mirror the new unions in the procurement TS types** (AC: 7)
  - [ ] Create `src/lib/procurement/types.ts` exporting `InvoiceSource = "photo" | "pdf" | "email"`, `LineType = "product" | "rebate_credit" | "prepay" | "fee" | "tax" | "other"`, `LineState = "ok" | "needs_review" | "needs_confirmation"`, `ExtractionStatus = "extracted" | "needs_review" | "partial"`, each with a short doc comment. Same role `src/lib/recommendations/types.ts` plays. No `any`.
- [ ] **Task 6: Build the DB edge importer (idempotent persist)** (AC: 5)
  - [ ] Create `src/lib/procurement/ingest/import.ts` with `persistInvoice(prisma, farmId, ingestResult, bytes): Promise<...>`. It computes the `sourceHash` (SHA-256 over `bytes`, via `node:crypto`), upserts the `Invoice` on `@@unique([farmId, sourceHash])`, and replaces its `InvoiceLine` children (delete-and-recreate the invoice's own lines on re-ingest is safe; lines carry no historical claim, unlike Findings). It takes an explicit `PrismaClient` (the importer convention), never the singleton.
  - [ ] Set each line's `lineState` from the pipeline outcome and the `Invoice.extractionStatus` to `extracted` / `partial` / `needs_review` accordingly.
- [ ] **Task 7: Wire the server action and the committed fixture** (AC: 1, 2, 4, 6)
  - [ ] Add the committed fixture `fixtures/procurement/sample-invoice.json` (a Batth-shaped Wilbur-Ellis / Wilbur-style Invoice: a handful of product lines, one rebate-credit line, one prepay line, and one deliberately low-confidence line so the `needs_review` path is exercised offline). See the fixture plan below.
  - [ ] Add a server action under `src/app/dashboard/purchasing/...` (a thin `"use server"` wrapper) that reads the upload, chooses `createGatewayInvoiceReader()` when `hasGatewayKey()` else the fixture-fed stub, calls `ingestInvoice` then `persistInvoice(prisma, ...)`. No Dealer-login field anywhere (AC2).
  - [ ] Confirm `next.config.ts` `outputFileTracingIncludes` already ships `./fixtures/**/*` (it does, `/**` glob); the new fixture is covered, no config edit needed. Read fixtures via `process.cwd()`, never `import.meta.url`.
- [ ] **Task 8: Tests** (AC: 1, 3, 4, 5)
  - [ ] `src/lib/procurement/ingest/pipeline.test.ts` (pure): a clear fixture line extracts SKU/qty/unit/price/total; the low-confidence fixture line becomes `needs_review` and carries no number; a Zod-failing raw object becomes `needs_review`; a reader throw becomes `needs_review` (never throws). Inject a fake reader fed the committed fixture (zero external calls).
  - [ ] `src/lib/procurement/ingest/schema.test.ts` (pure): money fields reject non-integer cents; `lineType` rejects an unknown value; valid fixture parses.
  - [ ] `src/lib/procurement/ingest/import.db.test.ts` (`*.db.test.ts`, node env, `createTestDb()` from `@/test/pg-harness`): persisting the fixture writes one `Invoice` and N `InvoiceLine`s with cents money; re-persisting the SAME bytes upserts to the SAME `Invoice` id and does NOT duplicate lines (idempotency, AC5); the low-confidence line persists with `lineState = "needs_review"` and null normalized fields. Clean up via the harness.
  - [ ] Run `npm run lint` (exit 0), `npm test` (all green), `npx tsc --noEmit` (exit 0). No `any`.

## Dev Notes

### Critical Guardrails (prevent the disasters specific to this story)

1. **Never store or request a Dealer or financial credential.** This is a hard product law (NFR-1, ADR-002). There is no Dealer-login field anywhere: not in the schema, not in the Zod shape, not in the server action, not in the UI. Ingestion is vision-extraction-only over documents the grower already has. If you find yourself adding a username/password/API-key field for a Dealer, stop; that is the forbidden path the architecture explicitly rejects.
2. **Never guess a number. A line you cannot read is `needs_review`, not a fabricated value.** This is the honest-coverage guardrail (NFR-4, ADR-006), inherited verbatim from `src/lib/extract/pipeline.ts` where a Zod failure or reader error becomes `needs_review` rather than a number reaching the user. A sub-threshold `confidence`, a Zod `safeParse` failure, a reader throw, or an unsplittable PDF all route to `needs_review`. The line asserts no quantity, unit, or price and is excluded from any band comparison. A guessed quantity is worse than a blank one.
3. **Zero external calls in dev and CI.** The reader is INJECTED (`stubInvoiceReader` / a fake fed the fixture in tests, `createGatewayInvoiceReader` live). The live Gateway model is constructed ONLY when `hasGatewayKey()` is true; with no key the path falls back to the committed `fixtures/procurement/sample-invoice.json`. This is the exact discipline of `src/lib/extract/reader.ts` + `src/lib/onboarding/vision.ts`. Never call the network from a test.
4. **Read committed fixtures from `process.cwd()`, never `import.meta.url`.** `import.meta.url` points inside `.next` once bundled and breaks in `next start` / Vercel (the lesson baked into `vision.ts` and `source.ts`). Fixtures are shipped on Vercel by the existing `outputFileTracingIncludes: { "/**": ["./fixtures/**/*"] }` in `next.config.ts` (the `/**` glob already covers the new file; do NOT edit `next.config.ts`).
5. **The pure layer is Prisma-free, fs-free, crypto-free, clock-free.** `src/lib/procurement/ingest/{schema,pipeline}.ts` and `src/lib/procurement/types.ts` take plain data in and return plain data out, colocated with `*.test.ts`, exactly like `src/lib/energy/billing.ts`. The `sourceHash` (SHA-256) is computed at the DB edge (`import.ts`), the only place `node:crypto` appears. The DB importer takes an explicit `PrismaClient`, never the `@/lib/db` singleton (the importer convention from `src/lib/greenbutton/import.ts` and `src/lib/extract/import.ts`).
6. **Zod is the single source of truth; the raw layer never enters `src/app`.** Every extracted TS type is `z.infer` of its schema (the AR-4 discipline from `src/lib/extract/schema.ts`). The raw-extraction module carries the no-raw-source-in-ui header comment; `src/app` reads only persisted/canonical shapes, never the raw model output.
7. **Money is integer cents; per-unit prices keep full precision.** The Tool 1 money law (`amountCents` on `BillingLineItem`, `NemPeriod.amountCents`, the `Cents` Zod helper): every dollar field is `Int` cents in the schema and integer cents in the Zod shape; `quantity` and `unitPrice` (a price per gallon/pound) keep full `Float` precision and round to cents only at a displayed total. Do not store dollars as floats.
8. **Never reintroduce SQLite.** The repo migrated to PostgreSQL on 2026-06-14 (`prisma/schema.prisma` is `provider = "postgresql"` with `url` + `directUrl`). `*.db.test.ts` runs against a throwaway local Postgres via `createTestDb()` from `src/test/pg-harness.ts`, never `dev.db`, never SQLite.
9. **Union/enum-like fields stay `String`, mirrored in TS.** `source`, `lineType`, `lineState`, `extractionStatus` are `String` columns (the schema's documented convention: "Promote these to real enums on Postgres" is one future schema-wide promotion, not per-story). Mirror each as a TS literal union in `src/lib/procurement/types.ts`. Do not introduce a Prisma `enum` in this story.

### Existing state of the files you are creating against

This is the FIRST procurement ingestion story. At `baseline_commit` `0e136cd`:

- **`src/lib/procurement/` does not exist yet.** You are creating it. Mirror the sibling boundaries: `src/lib/extract` (the Tool 1 bill pipeline this is modeled on) and `src/lib/onboarding/vision.ts` (the stubbed vision boundary). Keep pure math UI/DB-free.
- **`prisma/schema.prisma`** has NO procurement models (verified: no `Invoice`, `Dealer`, `SKU`, `RebateProgram`). It is Postgres (`provider = "postgresql"`, `url = env("DATABASE_URL")` + `directUrl = env("DATABASE_URL_UNPOOLED")`), Prisma v6, integer-cents money, union-fields-as-`String`. Existing reused entities: `Farm` (scoping root, cuid ids, `createdAt`/`updatedAt`, `onDelete: Cascade` from children), `Entity` (`{ id, name, billingName?, actualOwner?, farmId, accounts[] }`, NO direct invoice relation yet), `Account` (PG&E account, `@@unique([farmId, number])`, `entityId?` SetNull), `Ranch` (`{ id, name, acreage?, farmId, cropId?, pumps[] }` - note: **`Ranch` has NO `entityId`**; Entity is reached through `Account`, architecture 4.5), `Crop` (`{ id, name @unique, cropCoefficient?, blocks, ranches, pumps }` - minimal, no program/growth-stage, the architecture-4.6 Crop-Plan gap), `Recommendation` (the grammar; `action`/`result` are `Json`).
- **`src/lib/extract/`** is the template to mirror beat for beat: `schema.ts` (Zod source of truth, the `Cents` helper, `z.infer` types, the no-raw-source-in-ui header), `reader.ts` (`PageReader` interface, `stubPageReader` that throws un-injected, `createGatewayReader` over `generateObject` + a Claude file part, `hasGatewayKey` re-export), `pipeline.ts` (split -> classify -> extract -> `safeParse` -> `needs_review` on any failure, never throws), `import.ts` (DB edge, explicit `PrismaClient`, idempotent upserts), `split.ts` (`splitPdfPages`, reusable for PDFs), and `import.db.test.ts` (uses `createTestDb()` from `@/test/pg-harness`).
- **`src/lib/ai/gateway.ts`** owns key resolution + model construction: `hasGatewayKey()` (reads `AI_GATEWAY_API_KEY` or `VERCEL_AI_SDK_API_KEY`, never logs it), `createGatewayModel(modelId = "anthropic/claude-opus-4-8")`. Use these; do not re-resolve the key yourself.
- **`src/lib/onboarding/vision.ts`** is the canonical stubbed-vision pattern: a typed result, `loadSample...()` reading `join(process.cwd(), "fixtures", ...)`, an `async read...` that returns the committed sample, a `TODO` marking the real wiring, signature stable. Mirror this shape for the offline reader fallback.
- **`fixtures/`** holds committed JSON read at runtime via `process.cwd()` and shipped by `outputFileTracingIncludes`. There is no `fixtures/procurement/` dir yet; you create it. Compare `fixtures/extract/sample-charge-detail.json` for the shape and money convention (integer cents, full-precision usage).
- **`src/lib/recommendations/types.ts`** is where shared unions live for the grammar; the procurement unions live in the NEW `src/lib/procurement/types.ts` (do not bloat the grammar file).

What this story changes vs preserves: it is additive. New `src/lib/procurement/` tree, new `fixtures/procurement/sample-invoice.json`, an additive Prisma migration adding `Invoice` + `InvoiceLine` (+ `Dealer`/`DealerAccount`/`Product` if Story 1.1 has not already), and a new server action under `src/app/dashboard/purchasing`. No existing energy file is renamed or its behavior changed; the energy auto-seed stays green.

### Concrete sketches (recommended shapes)

**Prisma (`prisma/schema.prisma`) - add if Story 1.1 has not already; keep consistent with architecture 4.2.**

```prisma
model Invoice {
  id               String   @id @default(cuid())
  farmId           String
  dealerId         String?  // resolved in Story 1.3; nullable at ingest
  dealerAccountId  String?  // resolved in Story 1.3
  entityId         String?  // resolved in Story 1.3 (Account-routed, architecture 4.5)
  invoiceNumber    String?
  invoiceDate      DateTime?
  source           String   // "photo" | "pdf" | "email" (mirrored as InvoiceSource)
  sourceHash       String?  // SHA-256 of the uploaded bytes; makes re-ingest idempotent. Nullable to match Story 1.1 (the seed omits hash-less Invoices); the importer always computes a hash, so real Invoices are never null in practice
  printedTotalCents Int?    // the Invoice's printed total, the reconciliation surface
  extractionStatus String   @default("extracted") // "extracted" | "needs_review" | "partial"
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  farm  Farm          @relation(fields: [farmId], references: [id], onDelete: Cascade)
  lines InvoiceLine[]

  @@unique([farmId, sourceHash]) // idempotent re-ingest (architecture 8.2)
  @@index([farmId])
}

model InvoiceLine {
  id                  String   @id @default(cuid())
  invoiceId           String
  // catalog + normalization (Story 4.1 fills these; null at ingest)
  skuId               String?
  activeIngredientId  String?
  // attribution (Story 1.3 fills these; null at ingest)
  entityId            String?
  dealerAccountId     String?
  ranchId             String?
  blockId             String?
  // extracted, this story:
  lineType            String   // "product" | "rebate_credit" | "prepay" | "fee" | "tax" | "other"
  rawDescription      String   // SKU description verbatim, never paraphrased
  quantity            Float?
  unit                String?
  unitPriceCents      Int?     // per-unit price as printed, integer cents
  amountCents         Int?     // line total, integer cents
  normalizedUnit      String?  // Story 4.1
  normalizedUnitPrice Float?   // Story 4.1, full precision per unit of active
  confidence          Float    // 0 to 1, the model's per-line read confidence
  lineState           String   @default("ok") // "ok" | "needs_review" | "needs_confirmation"
  createdAt           DateTime @default(now())

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
}
```

**Zod canonical shape (`src/lib/procurement/ingest/schema.ts`) - single source of truth.**

```ts
import { z } from "zod";

/** Integer US cents (e.g. 245657 = $2,456.57). The money law (AR-6). */
const Cents = z.number().int().describe("integer US cents, e.g. 245657 = $2,456.57");

export const LineTypeSchema = z.enum(["product", "rebate_credit", "prepay", "fee", "tax", "other"]);

/** One extracted Invoice line, exactly as the model returns it. Nothing here is normalized. */
export const RawInvoiceLineSchema = z.object({
  lineType: LineTypeSchema.describe("product line, a rebate credit, a prepay, a fee/tax, or other"),
  rawDescription: z.string().describe("the SKU/description text verbatim as printed"),
  quantity: z.number().nullable().describe("quantity as printed; full precision; null if absent"),
  unit: z.string().nullable().describe("unit as printed, e.g. gal, lb, oz, case; null if absent"),
  unitPriceCents: Cents.nullable().describe("per-unit price, integer cents; null if absent"),
  amountCents: Cents.nullable().describe("line total, integer cents; null if absent"),
  confidence: z.number().min(0).max(1).describe("the model's confidence in THIS line, 0 to 1"),
});
export type RawInvoiceLine = z.infer<typeof RawInvoiceLineSchema>;

export const RawInvoiceSchema = z.object({
  invoiceNumber: z.string().nullable(),
  invoiceDate: z.string().nullable().describe("ISO date as printed; null if absent"),
  dealerName: z.string().nullable().describe("Dealer/Co-op name as printed; resolved in Story 1.3"),
  accountNumber: z.string().nullable().describe("Dealer account number as printed; resolved in 1.3"),
  printedTotalCents: Cents.nullable(),
  lines: z.array(RawInvoiceLineSchema),
});
export type RawInvoice = z.infer<typeof RawInvoiceSchema>;
```

**Pure pipeline outcome (`src/lib/procurement/ingest/pipeline.ts`) - mirror `extract/pipeline.ts`.**

```ts
import type { LineState } from "@/lib/procurement/types";

export const INVOICE_CONFIDENCE_THRESHOLD = 0.7; // single knob (architecture 8.1); calibrate later

/** One line's ingest outcome: a clean read, or held out of the numbers. */
export type IngestedLine =
  | { ok: true; lineState: "ok"; line: RawInvoiceLine }
  | { ok: false; lineState: "needs_review"; rawDescription: string | null; reason: string };

export type IngestResult = {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dealerName: string | null;
  accountNumber: string | null;
  printedTotalCents: number | null;
  lines: IngestedLine[];
  /** extracted (all ok) | partial (some needs_review) | needs_review (nothing readable) */
  extractionStatus: "extracted" | "partial" | "needs_review";
};

export async function ingestInvoice(
  bytes: Uint8Array,
  source: InvoiceSource,
  reader: InvoiceReader,
): Promise<IngestResult> {
  let raw: unknown;
  try {
    raw = await reader.read(bytes, source);
  } catch (err) {
    // a reader throw is needs_review, never thrown to the caller and never a number (NFR-4)
    return { /* ...all-needs_review result... */ };
  }
  const parsed = RawInvoiceSchema.safeParse(raw);
  // a top-level Zod failure -> whole-invoice needs_review; otherwise per-line confidence gate
  // a line below INVOICE_CONFIDENCE_THRESHOLD or whose own fields fail -> needs_review (no number)
}
```

The threshold gate and the `needs_review` fallback are the load-bearing honesty mechanism (guardrail 2). The function never throws and never returns a fabricated number.

**Idempotent DB edge (`src/lib/procurement/ingest/import.ts`) - explicit client, `sourceHash` upsert.**

```ts
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export async function persistInvoice(
  prisma: PrismaClient,
  farmId: string,
  source: InvoiceSource,
  bytes: Uint8Array,
  result: IngestResult,
) {
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  // upsert by (farmId, sourceHash): re-ingesting the same bytes hits the same Invoice (AC5)
  const invoice = await prisma.invoice.upsert({
    where: { farmId_sourceHash: { farmId, sourceHash } },
    create: { farmId, source, sourceHash, /* invoiceNumber/date/printedTotalCents from result */ extractionStatus: result.extractionStatus },
    update: { extractionStatus: result.extractionStatus /* re-read may upgrade/downgrade status */ },
  });
  // the Invoice's own lines carry no historical claim (unlike Findings, ADR-005), so
  // replace them on re-ingest: deleteMany by invoiceId then createMany from result.lines.
  await prisma.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
  await prisma.invoiceLine.createMany({ data: result.lines.map(toLineRow) });
  return invoice;
}
```

Note the contrast with the Finding persistence rule (ADR-005): a `Finding`'s `lineageJson` is immutable and never delete-recreated, but an `InvoiceLine` carries no historical claim, so replacing an invoice's own lines on re-ingest is correct and keeps re-ingest idempotent.

**Offline reader fallback (mirror `vision.ts`).** When `hasGatewayKey()` is false (dev/CI), the server action injects a stub reader that returns the committed fixture, read via `join(process.cwd(), "fixtures", "procurement", "sample-invoice.json")`. The live `createGatewayInvoiceReader()` is constructed only when the key is present.

### Committed sample-invoice fixture plan (zero external calls)

Create `fixtures/procurement/sample-invoice.json` shaped like `RawInvoice` so the stub reader returns it directly and the whole flow is walkable offline (NFR-2). Batth-shaped (a real Dealer name, an almond-program mix), and deliberately exercises every branch this story handles:

- `dealerName: "Wilbur-Ellis"`, `accountNumber` a plausible Dealer account string, `invoiceNumber`, an ISO `invoiceDate`, a `printedTotalCents` that the line `amountCents` sum reconciles to.
- 3 to 4 `product` lines (e.g. a glyphosate herbicide, a fungicide, a foliar fertilizer) each with `quantity`, `unit` (gal / lb / case), `unitPriceCents`, `amountCents`, and `confidence` above the threshold (e.g. 0.95).
- 1 `rebate_credit` line (a negative `amountCents`, the early-fill credit) so the `lineType` branch is covered.
- 1 `prepay` line so the Prepay `lineType` is exercised (Epic 5 reads it later; this story just preserves it).
- 1 deliberately low-confidence `product` line (`confidence: 0.4`, a blurry quantity) so the `needs_review` path is exercised offline and a test asserts it carries no asserted number. This is the UJ-1 blurry-photo edge case made reproducible.
- Money in integer cents throughout (mirror `fixtures/extract/sample-charge-detail.json`).

This fixture is the offline input for the stub reader AND the test fixture. It must run with zero external calls; commit it so the app and CI run with no key (NFR-2).

### Project Structure Notes

- **New tree `src/lib/procurement/`.** Keeps procurement math UI/DB-free (NFR-6), so the eventual monorepo move is moving this directory + the procurement schema models, not untangling a service (ADR-001). Layout for this story: `src/lib/procurement/types.ts` (unions) and `src/lib/procurement/ingest/{schema,reader,pipeline,import}.ts` plus colocated `*.test.ts` / `*.db.test.ts`. The architecture's broader `src/lib/procurement/{normalize,band,overpayment,rebate-audit,prepay,forecast-bom}.ts` modules belong to Epics 4 and 5; do not create them here.
- **Server action under `src/app/dashboard/purchasing/`.** Mirror the Tool 1 onboarding `actions.ts` precedent (a thin `"use server"` wrapper that reads the form, calls the testable lib function with the `prisma` singleton, and revalidates). The framework edge stays logic-free so the integration test exercises `ingestInvoice` + `persistInvoice` without Next. The full ingest UI (the Animated List progress, the connect-a-source onboarding screen from ux-spec 2.1) is the UX layer; build the minimal action surface this story needs and leave the polished onboarding screen to follow the ux-spec when the UI epic lands. Confirm with the story owner if a fuller UI is expected in this slice.
- **Story 1.1 overlap.** Story 1.1 ("Stand up the Purchasing Agent on the shared data model") is the schema-foundation story and may already add `Invoice`/`InvoiceLine`/`Dealer`/`DealerAccount`/`Product`. Both are `ready-for-dev`. Read the live schema first: if 1.1 landed these models, reuse them and SKIP Task 1's additions (do not redefine). If you land first, add only `Invoice` + `InvoiceLine` here and note the overlap for 1.1. Either way the field shapes must match architecture 4.2 so the two stories converge.
- **Attribution and normalization are explicitly later.** `entityId`/`dealerAccountId`/`ranchId`/`blockId` (Story 1.3) and `skuId`/`activeIngredientId`/`normalizedUnit`/`normalizedUnitPrice` (Story 4.1) are nullable and unset here. Setting them now would pre-empt those stories and likely model them wrong (Entity is Account-routed, Ranch is orthogonal - architecture 4.5). Leave them null.
- **Review queue is Epic 2.** This story produces `lineState = "needs_review"`; it does NOT create a `ReviewQueueItem` or any internal-ops surface (Story 2.1). The grower-facing reflection ("needs review", no queue/SLA) is all that this slice owns.

### References

- [Source: _bmad-output/purchasing-agent/2-planning/epics.md#Story 1.2] - the user story and the five acceptance criteria verbatim; FR-1 coverage; Epic 1 framing.
- [Source: _bmad-output/purchasing-agent/2-planning/prd.md#FR-1] - ingest by photo/PDF/email forward; SKU/qty/unit/unit price/total + Rebate/Prepay lines; never store a Dealer credential; `needs review` excluded from band comparison; zero external calls against fixtures. [#4.1] feature description; [#4.9 / FR-17] the `needs_review` line state the grower sees (queue is internal-ops, Epic 2); [#9 Assumptions] zero-external-calls and fixture discipline.
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture.md#6 Invoice Ingestion Pipeline] (lines 535-629) - the split -> read (injected reader) -> validate (Zod) -> normalize/attribute -> persist (idempotent by sourceHash) shape; 6.2 Zod as source of truth + integer cents + no-raw-source-in-ui; 6.3 honest-coverage guardrail + confidence threshold; 6.5 the UJ-1 sequence diagram.
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture.md#4.2 New Prisma models] (lines 192-207) - `Invoice` and `InvoiceLine` fields, `sourceHash`, `extractionStatus`, `lineType`, `lineState`, `confidence`; [#8.1] one confidence threshold constant; [#8.2] idempotent re-ingest on `(farmId, sourceHash)`; [#5.1] the pure-layer contract.
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture-decisions.md#ADR-002] - vision-extraction-first, no Dealer-API/login, stub-fed-fixture reader + live Gateway only when keyed; [#ADR-006] the Review queue / honest-coverage guardrail; [#ADR-001] one shared schema, monorepo-ready boundaries.
- [Source: src/lib/extract/{schema,reader,pipeline,import,split}.ts] - the Tool 1 bill pipeline mirrored beat for beat (Zod source of truth, injected reader, `needs_review` fallback, idempotent DB edge).
- [Source: src/lib/onboarding/vision.ts] - the stubbed-vision pattern: typed result, `process.cwd()` fixture read, stable signature, `TODO` for real wiring.
- [Source: src/lib/ai/gateway.ts] - `hasGatewayKey()` + `createGatewayModel()`; the key gate that keeps dev/CI offline.
- [Source: src/lib/energy/billing.ts, src/lib/recommendations/types.ts] - the pure-function + colocated `*.test.ts` and the union-as-TS-literal patterns to mirror.
- [Source: prisma/schema.prisma] - Postgres provider, Prisma v6, integer-cents money law (`amountCents` on `BillingLineItem`/`NemPeriod`), union-fields-as-`String`, cuid ids, `onDelete: Cascade` from `Farm`; the reused `Entity`/`Account`/`Ranch`/`Crop` shapes; `Ranch` has no `entityId`, `Crop` is minimal.
- [Source: src/test/pg-harness.ts] - `createTestDb()` / `TestDb` for `*.db.test.ts` (throwaway Postgres, never `dev.db`).
- [Source: next.config.ts] - `outputFileTracingIncludes: { "/**": ["./fixtures/**/*"] }` already ships the new fixture; do not edit.
- [Source: _bmad-output/purchasing-agent/2-planning/ux-spec.md#2.1 Onboarding / connect a source] (lines 91-136) - the connect-a-source onboarding, the Animated List ingest progress, and the grower-facing `needs review` state (UI layer, follow when the UI epic lands).

### Technical Requirements (dev agent guardrails)

- **Stack (do not change):** Next.js (App Router) + Turbopack / React 19 / TS `strict` + `noUncheckedIndexedAccess` + no-`any` (ESLint flat config errors on `any`); **Prisma pinned v6** (`url` + `directUrl`, pooled Neon + unpooled for DDL); **PostgreSQL** (Neon prod, local Postgres for `*.db.test.ts` via `createTestDb`); AI via Vercel AI Gateway + AI SDK v6 `generateObject`; Zod for the extracted shape. Never reintroduce SQLite. [Source: architecture.md#3]
- **TS rules that bite:** no `any` is an ESLint error; `noUncheckedIndexedAccess` makes indexed access `T | undefined` (guard `findFirst`/array results, do not `!`-assert to silence). Read a raw object's fields defensively (the `readSaId` pattern in `extract/pipeline.ts`) rather than trusting its shape.
- **After editing `prisma/schema.prisma`, run `db:migrate` then `db:generate`** so the client matches; keep the energy auto-seed green (additive, unseeded models).
- **Testing tiers:** pure `*.test.ts` for `schema.ts` / `pipeline.ts` (inject a fake reader fed the fixture, zero external calls); `*.db.test.ts` (node env, explicit `PrismaClient` from `createTestDb`, self-cleaning) for `import.ts` idempotency. Run `npm test`, `npm run lint`, `npx tsc --noEmit`.
- **Layered boundaries:** Zod + pure pipeline + unions live under `src/lib/procurement` (no UI, no DB, no fs, no crypto); the DB edge (`import.ts`, `node:crypto`, explicit client) and the server action (`src/app/dashboard/purchasing`) are the only DB/IO touchpoints. No `src/lib/energy` or Tool 1 behavior changes.

### Git / recent-work context

Baseline commit `0e136cd` (HEAD at story creation). Recent history is the SQLite -> PostgreSQL migration (`8fdb247` e2e tests, `f13c4d2` the DB migration) and the Almond assistant epic; none touch procurement. This is the first procurement ingestion story. Follow the existing `src/lib/extract` conventions verbatim (injected reader boundary, Zod source of truth, `needs_review` honesty fallback, idempotent DB edge taking an explicit `PrismaClient`). Branch off `main`; do not commit or push unless asked.

### Latest tech notes

- AI SDK v6 `generateObject` validates the model output against the Zod schema and auto-retries with corrective prompting on a validation failure; a Claude native file part (`{ type: "file", data: bytes, mediaType }`) passes a PDF without rasterization (the `extract/reader.ts` pattern). For a photo, pass the image bytes with the image `mediaType`.
- Prisma v6 + Postgres: a composite `@@unique([farmId, sourceHash])` generates a `farmId_sourceHash` compound `where` key for `upsert` (used in the import sketch). `createMany` is fine for the invoice's lines; there is no per-line natural key needed at ingest (lines are replaced wholesale on re-ingest because they carry no historical claim).
- No web dependency for this story; everything is local schema + the committed fixture + the injected stub reader. The live Gateway path is exercised only with a key present, never in CI.

## Dev Agent Record

### Agent Model Used

_(to be filled by the dev agent)_

### Debug Log References

_(to be filled by the dev agent)_

### Completion Notes List

_(to be filled by the dev agent)_

### File List

_(to be filled by the dev agent)_

## Change Log

_(to be filled by the dev agent)_
