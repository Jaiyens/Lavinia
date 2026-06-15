---
baseline_commit: 0e136cdd1511f385d7c045db03c9aa0d48bc9857
---

# Story 1.3: Attribute each extracted line to a Ranch, Entity, and Account

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Batth-scale almond grower with six Entities and four Dealers,
I want every extracted Invoice line attached to the right Ranch, Entity, and Account,
so that my fragmented spend resolves onto one shared model and I can later see it in one place.

This story realizes **FR-2** (attribute each Invoice line to exactly one Ranch, Entity, and
Account) and supplies the column that **FR-13** (the cross-entity Spend Table) aggregates on.
It depends on Story 1.1 (the procurement schema: `Dealer`, `DealerAccount`, `Invoice`,
`InvoiceLine`, including `Ranch.entityId` being deliberately ABSENT - see Critical Guardrails)
and Story 1.2 (extracted, persisted `InvoiceLine` rows). It owns the dealer-account identity
join, the Entity-is-Account-routed / Ranch-orthogonal attribution rule, the ambiguous-attribution
route to the Review queue, multi-entity scoping, and the grower correction that persists.

## Acceptance Criteria

1. **Given** extracted `InvoiceLine` rows from Story 1.2 and a grower who already uses Tool 1,
   **When** the agent attributes each line, **Then** every ingested line resolves to exactly
   one Entity and one Account (`DealerAccount`), with the resolved Entity denormalized onto
   `InvoiceLine.entityId` (the source of truth for the Entity filter and the Spend Table) and
   the resolved account onto `InvoiceLine.dealerAccountId`.

2. **Given** an Invoice whose printed Dealer name and account number vary in spelling from a
   known `DealerAccount`, **When** the dealer-account identity join runs, **Then** spelling
   variants of the same Dealer + account number resolve through a pure `normalizeDealerAccount`
   utility to exactly one `DealerAccount` (the SA-ID-style identity join), and Entity follows
   from `DealerAccount.entityId`.

3. **Given** a line whose Dealer/account cannot be resolved to exactly one `DealerAccount`
   (no match, or an ambiguous 2+ match, or a present-but-contradicting identifier), **When**
   attribution runs, **Then** the line is flagged for grower confirmation and routed to the
   internal Review queue, NEVER silently dropped and NEVER attached to a possibly-wrong Entity
   or Account, and it produces no asserted figure until resolved.

4. **Given** the Ranch/Block dimension, **When** a line is attributed, **Then** Ranch/Block is
   an INDEPENDENT, orthogonal attribution (derived where possible or grower-confirmed) that
   does NOT have to agree with the line's Account-routed Entity, and a line attributed to a
   Ranch whose meters bill under a different Entity is expected, not an error (the energy
   `Ranch` has no `entityId` to reconcile against).

5. **Given** attribution reuses Tool 1 records, **When** a dual-tool grower's lines are
   attributed, **Then** attribution reuses the existing `Entity`, `Account`/`DealerAccount`,
   `Ranch`, `Block`, and `Crop` records already present from Tool 1 (no fork, no duplicate
   Entity), every read is scoped by `farmId`, and a client-supplied `farmId` is never trusted.

6. **Given** the agent's attribution, **When** the grower corrects a line's Entity, Account,
   or Ranch/Block, **Then** the correction persists across sessions and overrides the agent's
   attribution on re-ingest (a grower-confirmed line is not silently re-guessed).

7. **Given** the pure-vs-DB boundary, **When** this story is implemented, **Then** the
   identity-join and attribution decision logic is a pure, unit-tested function in
   `src/lib/procurement` (no Prisma, no clock, no fs), and only a thin DB edge persists the
   verdict - mirroring `normalizeBill` feeding the importer.

### AC interpretation notes (read before coding)

- **AC1 "exactly one Entity and one Account":** Entity is NOT joined directly off the Invoice.
  It is Account-routed: resolve the `DealerAccount` first, then `Entity = DealerAccount.entityId`.
  `DealerAccount.entityId` is the procurement mirror of `Account.entityId` (nullable until
  reconciled). When `DealerAccount.entityId` is null (account known, Entity not yet assigned),
  the line's `dealerAccountId` is set but `entityId` stays null and the line is flagged for
  grower confirmation of the Entity (AC3 path), not asserted. Do not invent an Entity.
- **AC2 "SA-ID-style identity join":** this is the EXACT discipline of `normalizeSaId` +
  `normalizeBill`'s `joinCoverage` (src/lib/normalize/), ported to dealer-account. Normalize
  BOTH sides (the extracted Dealer name + account number AND the inventory `DealerAccount`)
  to a canonical key before comparing, so a descriptor or spelling drift on either side does
  not falsely reject a legitimate account. Exactly one match attaches; 0 or 2+ is "needs review".
- **AC3 "ambiguous attribution":** this is the FR-17 Review queue producer for the attribution
  stage. Epic 2 (Stories 2.1/2.2) builds the `ReviewQueueItem` mechanism. This story does NOT
  build the queue; it produces the un-attributable line state (`needs_review` /
  "flagged for grower confirmation") in a shape Epic 2 enqueues. If the `ReviewQueueItem` model
  from Story 1.1 is present, create the item; if not yet present, set the line state and leave
  a marked TODO to enqueue (do not block on Epic 2). Either way the line is held out of all
  numbers. See Project Structure Notes.
- **AC4 "Ranch orthogonal":** the single most important correctness rule in this story. A
  line's Entity (who was billed, via Account) and its Ranch (where it was applied) are reached
  by DIFFERENT paths and can legitimately disagree. Do NOT add `Ranch.entityId`. Do NOT force
  `InvoiceLine.ranchId`'s Entity to match `InvoiceLine.entityId`. Do NOT route the Entity
  filter through Ranch. (Architecture section 4.5.)
- **AC5 "reuse, no fork":** match an extracted Dealer/Entity name to an existing record via the
  normalize key; only create a `Dealer`/`DealerAccount` when none matches. Never create a
  second `Entity` for a name the farm already has (mirrors the Entity billing-name dedup).
- **AC6 "correction persists":** a grower edit sets the attribution columns AND a flag the
  re-ingest path honors (e.g. `attributionLockedByGrower` / a non-null grower-set value that
  the importer's upsert does not overwrite). Choose the mechanism Story 1.1's schema supports;
  if the column is absent, add a nullable boolean in this story's migration (additive). See
  Concrete sketches.

## Tasks / Subtasks

- [ ] **Task 1: Add the pure `normalizeDealerAccount` identity utility** (AC: 2, 7)
  - [ ] Create `src/lib/procurement/dealer-account.ts` with
    `normalizeDealerAccount(rawDealerName, rawAccountNumber): { normalizedKey: string; normalizedNumber: string }`.
    Pure string utility, no imports from raw layers, safe in any layer (mirror `normalizeSaId`'s
    header and purity).
  - [ ] `normalizedNumber`: trim, strip separators/whitespace, upper-case (account numbers
    drift on spacing and hyphens across Invoices). `normalizedKey`: a canonical Dealer name key
    (trim, collapse internal whitespace, lower-case, drop punctuation) so "Wilbur-Ellis",
    "Wilbur Ellis Co", and "WILBUR ELLIS" collapse to one Dealer.
  - [ ] Colocate `dealer-account.test.ts` covering: spacing/hyphen variants of one account
    number collapse; Dealer-name spelling variants collapse; distinct accounts stay distinct;
    blank input yields an empty key (never a false match). Mirror `sa-id.test.ts`'s case shape.
- [ ] **Task 2: Add the pure `attributeLine` join function** (AC: 1, 2, 3, 4, 7)
  - [ ] In `src/lib/procurement/dealer-account.ts` (or a sibling `attribute.ts`), add a pure
    `attributeInvoiceLine(extracted, inventory): AttributionVerdict`. It takes the extracted
    line's Dealer name, account number, and any printed Ranch/Block/Entity hints, plus an
    in-memory `ProcurementInventoryView` projection the caller builds from the DB (this module
    NEVER reads Prisma). It returns the resolved `dealerAccountId`, `entityId`, `ranchId`,
    `blockId`, and an `attributionState: "attributed" | "needs_review"` with a reason.
  - [ ] Entity is Account-routed: resolve `DealerAccount` via `normalizeDealerAccount`; exactly
    one match -> `entityId = dealerAccount.entityId` (may be null -> `needs_review` on Entity);
    0 or 2+ matches -> `needs_review` (never a guess). Mirror `joinCoverage`'s exactly-one rule.
  - [ ] Ranch/Block resolved on the ORTHOGONAL dimension: from a printed hint, the line's
    product's typical block, or a prior attributed line for the same SKU; unresolved Ranch does
    NOT fail the Entity attribution. Ranch and Entity are allowed to disagree (AC4).
  - [ ] A present extracted identifier (printed account number) that CONTRADICTS the matched
    `DealerAccount` -> `needs_review` (the identity-honest rule from `normalizeBill`). A null
    extracted identifier cannot contradict.
  - [ ] Colocate `*.test.ts`: a clean single-match attaches with Entity from `DealerAccount.entityId`;
    a null `DealerAccount.entityId` attaches the account but flags Entity for review; 0/2+
    matches -> needs_review; a Ranch whose Entity differs from the line's Entity attributes both
    WITHOUT error; a contradicting printed account number -> needs_review.
- [ ] **Task 3: Wire attribution into the ingest importer (DB edge)** (AC: 1, 3, 5, 6)
  - [ ] In `src/lib/procurement/ingest/import.ts` (the Story 1.2 importer; extend it, do not
    fork), after persisting `InvoiceLine` rows, build the `ProcurementInventoryView` from the
    DB scoped by `farmId`, call `attributeInvoiceLine` per line, and persist
    `dealerAccountId`, `entityId`, `ranchId`, `blockId` onto each line.
  - [ ] Reuse existing records: match `Dealer`/`Entity` via the normalize key; create a
    `Dealer`/`DealerAccount` only when none matches (never a duplicate `Entity`).
  - [ ] An `attributionState = "needs_review"` line: set `InvoiceLine.lineState = "needs_review"`
    (or `"needs_confirmation"`), create a `ReviewQueueItem` if that model exists (else a marked
    TODO), and EXCLUDE it from any downstream number. Never drop the row.
  - [ ] Honor a grower-locked attribution: if a line carries a grower-set attribution
    (Task 4 flag), the importer's re-ingest upsert does NOT overwrite it.
  - [ ] Add `import.db.test.ts` cases (Postgres, explicit `PrismaClient`): a line attributes to
    Entity-via-DealerAccount onto `InvoiceLine.entityId`; an unresolved line is held in
    `needs_review` and not dropped; re-ingest is idempotent and does not clobber a grower lock;
    a Ranch attributed to a different Entity than the line persists without error.
- [ ] **Task 4: Add the grower-correction server action + persistence** (AC: 6)
  - [ ] If Story 1.1's schema lacks a grower-lock signal, add a nullable
    `attributionLockedAt DateTime?` (or `attributionSource String?` // "agent" | "grower")
    column to `InvoiceLine` in an ADDITIVE migration. Mirror the existing additive-migration
    discipline (every new column nullable/defaulted; auto-seed stays green).
  - [ ] Add `correctAttribution` in `src/app/dashboard/purchasing/actions.ts` (`"use server"`):
    a thin wrapper that reads the form, calls a testable DB function (takes the `prisma`
    singleton), sets the corrected `entityId`/`dealerAccountId`/`ranchId`/`blockId` + the lock
    signal, scoped by `farmId`, and revalidates. Logic lives in lib, not the action edge.
  - [ ] If the grower's correction clears the `needs_review` state, resolve the line back into
    the pipeline (clear `lineState`) - the same write-back-and-re-enter shape Epic 2 uses.
- [ ] **Task 5: Mirror the new union(s) as TS literal types** (AC: 7)
  - [ ] In `src/lib/procurement/types.ts` (create if Story 1.1 has not), add
    `export type AttributionState = "attributed" | "needs_review";` and (if added in Task 4)
    `export type AttributionSource = "agent" | "grower";`, with short doc comments. String
    columns mirrored by TS unions, never Prisma enums (project lock).
- [ ] **Task 6: Run the toolchain and keep everything green** (AC: 1, 5, 7)
  - [ ] `npm run db:migrate -- --name procurement_attribution` (only if Task 4 adds a column),
    then `npm run db:generate`.
  - [ ] `npm run lint` (no `any`), `npm test` (pure + `*.db.test.ts`), `npx tsc --noEmit`
    (strict + `noUncheckedIndexedAccess`) - all green. Auto-seed still runs.

## Dev Notes

### Critical Guardrails (prevent the disasters specific to this story)

1. **Entity is Account-routed, never joined directly off the Invoice, and Ranch is orthogonal.**
   This is the rule earlier drafts got wrong. A line's Entity comes from
   `DealerAccount.entityId` (the mirror of the energy `Account.entityId`); its Ranch/Block is an
   independent dimension that does NOT have to agree. Do NOT add `Ranch.entityId`. Do NOT route
   the Entity filter or the Spend Table through Ranch. Do NOT force a line's `ranchId` Entity to
   equal its `entityId`. A ranch can hold meters from more than one account, so "where it was
   applied" and "who was billed" legitimately diverge. [Source: architecture.md section 4.5; ADR-001 consequences.]

2. **The dealer-account join is the identity-checked, exactly-one-match join, ported verbatim
   in spirit from `normalizeBill`.** Exactly one normalized match attaches; 0 (not found) or 2+
   (ambiguous) is `needs_review`, never a guess. A PRESENT extracted identifier that disagrees
   with the matched account is `needs_review`; a NULL identifier cannot contradict (missing data
   is not a contradiction). Read `src/lib/normalize/billing.ts` `joinCoverage` and
   `src/lib/normalize/sa-id.ts` before writing this - copy their identity-honesty exactly.
   [Source: src/lib/normalize/billing.ts:130-158; ADR-002.]

3. **Never silently drop an unresolved line; never attach a possibly-wrong line.** FR-2 and
   the honest-number law (NFR-4) both forbid the two easy failures: dropping a line the agent
   cannot place, or attaching it to a best-guess Entity. The only correct outcome for an
   un-attributable line is `needs_review` + (if available) a `ReviewQueueItem`, held out of
   every asserted figure. [Source: PRD FR-2, FR-17; architecture.md section 6.4.]

4. **Pure decision logic, thin DB edge.** The identity join and the attribution verdict are a
   pure function (no Prisma, no `Date.now()`, no env, no fs); the caller passes the in-memory
   inventory projection and persists the result. This is the `normalizeBill` (pure, takes
   `BillInventoryView`) -> importer (DB) split, not a Prisma-coupled blob. [Source: architecture.md sections 5.1, 10 "Purity".]

5. **Scope every read by `farmId`; never trust a client `farmId`.** Building the inventory
   projection and persisting attribution both filter on the resolved `farmId` (from the session
   / the Invoice's farm), never a client-supplied value. This is the Almond / energy scoping
   discipline. [Source: ADR-008; architecture.md section 8.4.]

6. **Reuse records, never fork an Entity.** Match an extracted Dealer/Entity name to an existing
   record by the normalize key; create new only on no match. A duplicate `Entity` for a
   spelling variant is the exact bug the Entity billing-name dedup exists to prevent. [Source: FR-2; schema.prisma Entity comment (billingName 7 variants -> 6 entities).]

7. **Money is integer cents; per-unit prices keep Float.** This story touches attribution, not
   pricing, but any total it reads/writes is `...Cents Int`, never a float dollar. [Source: architecture.md section 4.1 money law; schema.prisma BillingLineItem.amountCents.]

8. **Postgres + Prisma v6, never SQLite.** The repo migrated to PostgreSQL on 2026-06-14 (Neon
   prod, local Postgres for `*.db.test.ts`). Do NOT reintroduce SQLite. Any migration is
   additive (nullable/defaulted columns) so the auto-seed stays green. [Source: schema.prisma datasource; postgres-migration memory.]

### Existing state of the files you are creating / modifying

Read these before editing; do not invent shapes.

- **`prisma/schema.prisma`** - PostgreSQL + Prisma v6 (`url` pooled + `directUrl` unpooled).
  The energy ontology is fully present. **`Ranch` has NO `entityId`** (confirmed at
  schema.prisma:279-293): it links only to `Farm` and `Crop`; the energy rollup reaches Entity
  through `Account` (`Entity -> Account -> Ranch -> Pump`). The energy `Account` has
  `entityId String?` + `coverageState String @default("no_bill")` and `@@unique([farmId, number])`.
  Money is integer cents (`BillingLineItem.amountCents Int`). Union fields are `String` mirrored
  in TS. The procurement models (`Dealer`, `DealerAccount`, `Invoice`, `InvoiceLine`, `Product`,
  `ActiveIngredient`, `ReviewQueueItem`, etc.) are added by **Story 1.1** - they are NOT yet in
  the schema (verified: no `model Dealer`/`model Invoice` present at the baseline commit). This
  story assumes Story 1.1 has landed them per architecture section 4.2; if a needed column is
  missing, add it additively here and note it.
- **`src/lib/normalize/sa-id.ts`** - the canonical identity-normalization pattern to mirror
  (pure, header documents the rule, exactly-one-token canonical id + preserved descriptor).
- **`src/lib/normalize/billing.ts`** - `normalizeBill` + `joinCoverage`: the identity-checked,
  exactly-one-match, contradiction-aware join over an in-memory `BillInventoryView`. THIS is the
  template for `attributeInvoiceLine`. Note its header: "must never be imported by /app - the
  no-raw-source-in-ui guard." The procurement attribute module follows the same boundary.
- **`src/lib/recommendations/types.ts`** - where union mirrors live for the energy side
  (`CoverageState`, `PumpStatus`, `BillingLineItemKind`). The procurement equivalent is
  `src/lib/procurement/types.ts` (Story 1.1 / architecture section 5.2).
- **`src/lib/onboarding/vision.ts`** - the stubbed-boundary + `process.cwd()` fixture-read +
  zero-external-calls pattern the ingest reader follows (relevant to Story 1.2, context here).
- **`src/lib/onboarding/farm.ts`** + **`src/app/dashboard/pump-timing/onboarding/actions.ts`** -
  the "server action reads the form, calls a testable lib function with the `prisma` singleton,
  redirects/revalidates" pattern Task 4's `correctAttribution` mirrors.
- **`src/lib/db.ts`** - the `prisma` singleton (`import { prisma } from "@/lib/db"`); DB edges
  use it, pure functions never import it.
- **`next.config.ts`** - `outputFileTracingIncludes: { "/**": ["./fixtures/**/*"] }`. This
  story adds NO runtime fixture, so do not touch it.

### Concrete sketches (recommended shapes, consistent with the architecture)

The pure identity utility (mirror `normalizeSaId`'s purity and header):

```ts
// src/lib/procurement/dealer-account.ts
// Canonical dealer-account identity (FR-2). The stable join key between an extracted Invoice
// line and the inventory DealerAccount, the procurement analog of normalizeSaId for PG&E. A
// Dealer name and account number drift in spelling/spacing across Invoices, so both sides
// normalize to a canonical key before matching. Pure string utility - no raw-type import.

export function normalizeDealerAccount(
  rawDealerName: string,
  rawAccountNumber: string,
): { normalizedKey: string; normalizedNumber: string } {
  const normalizedNumber = rawAccountNumber.replace(/[\s-]/g, "").trim().toUpperCase();
  const normalizedKey = rawDealerName
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // drop punctuation (Co., Inc, hyphens)
    .replace(/\s+/g, " ");
  return { normalizedKey, normalizedNumber };
}
```

The pure attribution verdict (mirror `joinCoverage`'s exactly-one + contradiction rules):

```ts
// src/lib/procurement/attribute.ts  (or in dealer-account.ts)
import type { AttributionState } from "./types";

/** One inventory DealerAccount's identity fields, keyed by its normalized number + Dealer key. */
export type DealerAccountRow = {
  dealerAccountId: string;
  normalizedKey: string;     // normalizeDealerAccount(dealerName)
  normalizedNumber: string;  // normalizeDealerAccount(accountNumber)
  entityId: string | null;   // the mirror of Account.entityId; null until reconciled
};

/** The in-memory inventory the caller builds from the DB; this module never reads Prisma. */
export type ProcurementInventoryView = { dealerAccounts: DealerAccountRow[] };

export type ExtractedAttribution = {
  dealerName: string;
  accountNumber: string;
  ranchHint: string | null;  // printed/derived; orthogonal to Entity
  blockHint: string | null;
};

export type AttributionVerdict = {
  dealerAccountId: string | null;
  entityId: string | null;   // = matched DealerAccount.entityId (Account-routed); never guessed
  ranchId: string | null;    // orthogonal; may belong to a different Entity than entityId
  blockId: string | null;
  attributionState: AttributionState; // "attributed" | "needs_review"
  reason: string | null;     // why it needs review (no match / ambiguous / contradicts)
};

export function attributeInvoiceLine(
  extracted: ExtractedAttribution,
  inventory: ProcurementInventoryView,
  // ranch/block resolution helpers passed in by the caller (orthogonal dimension)
): AttributionVerdict {
  const { normalizedKey, normalizedNumber } = normalizeDealerAccount(
    extracted.dealerName,
    extracted.accountNumber,
  );
  if (normalizedNumber === "") {
    return { /* ...nulls */ attributionState: "needs_review", reason: "blank account number" };
  }
  const matches = inventory.dealerAccounts.filter(
    (a) => a.normalizedNumber === normalizedNumber && a.normalizedKey === normalizedKey,
  );
  if (matches.length !== 1) {
    // 0 = not found, 2+ = ambiguous; never a guess (joinCoverage rule)
    return { /* ...nulls */ attributionState: "needs_review", reason: "no single DealerAccount match" };
  }
  const account = matches[0]!;
  // Entity is Account-routed; null entityId means account known, Entity not yet assigned ->
  // attach the account, flag Entity for grower confirmation (AC3, not asserted).
  const entityId = account.entityId;
  // Ranch/Block resolved orthogonally (separate path); allowed to disagree with entityId.
  return {
    dealerAccountId: account.dealerAccountId,
    entityId,
    ranchId: /* resolveRanch(extracted.ranchHint) */ null,
    blockId: /* resolveBlock(extracted.blockHint) */ null,
    attributionState: entityId === null ? "needs_review" : "attributed",
    reason: entityId === null ? "DealerAccount has no Entity assigned yet" : null,
  };
}
```

The grower-lock column (Task 4, additive, only if Story 1.1 did not add it):

```prisma
// on InvoiceLine
attributionSource String? // "agent" | "grower" - a grower-set value the re-ingest upsert must not overwrite
```

The correction action (Task 4, thin over a testable lib fn):

```ts
// src/app/dashboard/purchasing/actions.ts
"use server";
import { prisma } from "@/lib/db";
import { applyAttributionCorrection } from "@/lib/procurement/ingest/import"; // testable, takes prisma
// reads form -> applyAttributionCorrection(prisma, { farmId, invoiceLineId, entityId?, dealerAccountId?, ranchId?, blockId? })
// sets attributionSource = "grower", clears needs_review when resolved, revalidates the Spend Table path.
```

### Project Structure Notes

- **Depends on Story 1.1 and 1.2.** Story 1.1 lands the procurement schema (`Dealer`,
  `DealerAccount`, `Invoice`, `InvoiceLine` with the attribution columns `entityId`,
  `dealerAccountId`, `ranchId`, `blockId`, `lineState`, plus the `@@index([farmId, entityId])`
  on `InvoiceLine` the Spend Table needs - architecture section 4.5) and `ReviewQueueItem`.
  Story 1.2 lands the ingest importer (`src/lib/procurement/ingest/import.ts`) that persists
  `InvoiceLine` rows. This story EXTENDS that importer with the attribution pass and adds the
  pure join module. If either predecessor has not landed a column this story needs, add it
  additively here and flag the variance; do not block.
- **Review queue coupling (Epic 2).** AC3 produces the un-attributable line state in the shape
  Epic 2 (`ReviewQueueItem`, Stories 2.1/2.2) consumes. If `ReviewQueueItem` exists at
  implementation time, create the item; otherwise set `lineState = needs_review` and leave a
  marked TODO to enqueue. The line is held out of all numbers either way. Do not build the
  queue mechanism here.
- **`DealerAccount` vs the energy `Account`.** The architecture chose a PARALLEL `DealerAccount`
  (not overloading the PG&E `Account`) to keep energy semantics untouched, using
  `Account.entityId` only as the precedent. `DealerAccount.entityId` is the procurement mirror.
  Do not overload the energy `Account` for Dealer accounts. [Source: architecture.md section 4.2, 14.2.]
- **`Ranch`/`Block` reuse.** Attribution attaches `InvoiceLine.ranchId` / `blockId` to the
  EXISTING energy `Ranch` and `Block` records (a dual-tool grower already has them). Do not
  create procurement-specific ranch models. The Crop Plan / `CropProgram` net-new modeling is
  Epic 3's blocker (architecture section 4.6) and is OUT of scope here.
- **No-raw-source-in-ui boundary.** The attribute module is ingestion-side; if it imports any
  Zod raw-extraction type it must not be imported by `src/app` (the existing guard pattern,
  mirrored from `normalizeBill`). The pure `normalizeDealerAccount` (no raw import) is safe
  anywhere.

### References

- [Source: _bmad-output/purchasing-agent/2-planning/epics.md#Story 1.3] - the user story + the
  five acceptance criteria verbatim (every ingested line resolves to exactly one Entity and one
  Account; unresolved flagged not dropped; reuses Tool 1 records; correction persists; mobile-first plain English).
- [Source: _bmad-output/purchasing-agent/2-planning/prd.md#FR-2] - "Attribute each Invoice line
  to exactly one Ranch, Entity, and Account ... a line that cannot be resolved is flagged for
  grower confirmation rather than silently dropped ... a grower can correct an attribution and
  the correction persists." Also FR-13 (the Spend Table that aggregates on `InvoiceLine.entityId`)
  and FR-17 (the Review queue).
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture.md#4.5 FR-2 attribution join]
  (Entity is Account-routed and authoritative via `DealerAccount.entityId`; `InvoiceLine.entityId`
  is the denormalized source of truth and the Spend Table aggregation key; Ranch/Block is the
  orthogonal, derivable-or-confirmed dimension that need not agree; no `Ranch.entityId` is added;
  the `@@index([farmId, entityId])` on `InvoiceLine`).
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture.md#8.3 Identity / SA-ID-style join on dealer-account]
  (a `normalizeDealerAccount` pure utility, sibling of `normalizeSaId`, producing a
  `normalizedNumber` + `normalizedKey`, the procurement analog of the energy identity check and
  the Entity billing-name dedup).
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture.md#6.4 Attribution (FR-2)]
  (two independent dimensions; Entity Account-routed and denormalized onto `InvoiceLine.entityId`;
  Ranch/Block orthogonal; an unresolved line flagged for grower confirmation, never dropped;
  grower corrections persist and override).
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture-decisions.md#ADR-008]
  (multi-entity scoping: `farmId` is the single root, never client-supplied; PCA reads
  double-scoped - the scoping discipline this story's reads follow).
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture-decisions.md#ADR-001 consequences]
  (the two reuse corrections: the energy `Ranch` has no `entityId`, so Entity is Account-routed
  and Ranch is orthogonal).
- [Source: src/lib/normalize/sa-id.ts] - the canonical identity-normalization pattern
  (`normalizeSaId`) `normalizeDealerAccount` mirrors.
- [Source: src/lib/normalize/billing.ts:44-158] - `normalizeBill` + `joinCoverage`: the
  identity-checked, exactly-one-match, contradiction-aware join over an in-memory
  `BillInventoryView` that `attributeInvoiceLine` mirrors, including the "null identifier cannot
  contradict" rule and the "must never be imported by /app" boundary.
- [Source: prisma/schema.prisma:74-93 (Account), :263-293 (Crop, Ranch)] - the energy `Account`
  with `entityId? + coverageState` and the `Ranch` that deliberately has NO `entityId`.
- [Source: src/lib/onboarding/farm.ts + src/app/dashboard/pump-timing/onboarding/actions.ts] -
  the server-action-over-testable-lib-fn pattern Task 4 mirrors.
- [Source: implementation-artifacts/1-1-evolve-the-prisma-data-model-for-the-farm-inventory.md] -
  the additive-migration + union-mirror + `*.db.test.ts` discipline this story follows.

### Technical Requirements (dev agent guardrails)

- **Stack (do not change):** Next.js (App Router) + Turbopack / React 19 / TS `strict` +
  `noUncheckedIndexedAccess` + no-`any` (ESLint error); **Prisma v6** (`url` pooled +
  `directUrl` unpooled); **PostgreSQL** (Neon prod, local Postgres for `*.db.test.ts`); tsx
  runs the seed (resolves `@/`). Never reintroduce SQLite. [Source: architecture.md section 3; postgres-migration memory.]
- **TS rules that will bite:** no `any` is an ESLint error; `noUncheckedIndexedAccess` makes
  `matches[0]` `T | undefined` - guard or `!`-assert ONLY after a length check (as
  `joinCoverage` does: `if (matches.length !== 1) return ...; const row = matches[0]!;`). Do not
  scatter `!`.
- **Purity:** `src/lib/procurement/{dealer-account,attribute}.ts` import no Prisma, call no
  `Date.now()`, read no env/fs. The caller passes the inventory projection. DB edges live in
  `src/lib/procurement/ingest/import.ts` and `src/app/dashboard/purchasing/actions.ts`. [Source: architecture.md section 10 "Purity".]
- **Testing tiers:** pure `*.test.ts` for the join/attribution decision logic (the provable
  core); `*.db.test.ts` (node env, explicit `PrismaClient`, cleans up after itself, local
  Postgres) for the importer attribution + idempotent re-ingest + grower-lock persistence. Run
  `npm test`. [Source: architecture.md section 13.]
- **Scoping:** every DB read/write in this story takes `farmId` explicitly and never trusts a
  client-supplied `farmId`. [Source: ADR-008.]
- **Layered boundaries:** pure join in `src/lib/procurement`; DB edge in `ingest/import.ts`; the
  correction UI action in `src/app/dashboard/purchasing/actions.ts`. No UI changes to the energy
  tool; no `src/lib/energy` changes.

### Git / recent-work context

Baseline commit `0e136cd` ("Add purchasing agent design system"). Recent commits are
purchasing-agent planning/design docs and the SQLite -> PostgreSQL migration (`f13c4d2`,
`8fdb247`) - the DB is Postgres now; do not reintroduce SQLite. This is the third story of
Epic 1 and inherits the schema from Story 1.1 and the ingest importer from Story 1.2; follow
their established procurement conventions (PascalCase models, camelCase columns, `...Cents`
money, union-as-`String` mirrored in `src/lib/procurement/types.ts`, `@@index([farmId, ...])`,
`onDelete: Cascade` to `Farm`, `SetNull` for soft links).

### Latest tech notes

- The dealer-account identity join is a direct port of the proven PG&E SA-ID join
  (`normalizeSaId` + `joinCoverage`). Reuse that exact shape; it already encodes the
  exactly-one-match and present-but-contradicting rules and is unit-tested - do not re-derive.
- `InvoiceLine.entityId` is denormalized (set from `DealerAccount.entityId` at attribution
  time) specifically so the cross-entity Spend Table (FR-13) aggregates with one indexed query
  (`@@index([farmId, entityId])`) instead of walking Ranch. Keep the denormalization; do not
  compute the Entity filter by joining through Ranch.
- No web dependency for this story; everything is local schema + pure functions + a DB edge.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
