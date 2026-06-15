---
baseline_commit: 0e136cdd1511f385d7c045db03c9aa0d48bc9857
---

# Story 1.1: Stand up the Purchasing Agent on the shared data model

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Terra engineer,
I want the procurement data model stood up on the existing shared Prisma schema, with pure-logic boundaries and a Batth-shaped procurement seed,
so that the Purchasing Agent (Tool 2) has the entities it needs to store Invoices, attributed lines, and findings before any ingestion or band math is built, with Tool 1 (the PG&E energy tool) untouched.

## Acceptance Criteria

1. **Given** the existing Postgres / Prisma v6 shared schema (Farm, Entity, Account, Ranch, Block, Crop, Recommendation), **When** the Epic 1 procurement migration is applied, **Then** it adds the ingestion-and-attribution entities (`Dealer`, `DealerAccount`, `Invoice`, `InvoiceLine`, `Product`, `ActiveIngredient`) plus the rest of the v1 procurement model target (`RebateProgram`, `RebateTier`, `PrepayTerm`, `MarketBand`, `Finding`, `SpendBudget`, `BillOfMaterials`, `BomLine`, `AdvisorAccess`, `AdvisorAccessEntity`, `AdvisorFindingMark`, `ReviewQueueItem`), every one reachable from `Farm` as the single scoping root (FR-1, FR-2; ADR-001).

2. **Given** the FR-2 attribution path the Spend Table needs, **When** the new entities are modeled, **Then** Entity is reached Account-routed through `DealerAccount.entityId` (the procurement mirror of `Account.entityId`) and denormalized onto `InvoiceLine.entityId` as the source of truth for the Entity filter, **And** `Ranch`/`Block` attribution is a separate orthogonal column on `InvoiceLine` that need not agree with the line's Entity, **And** `Ranch.entityId` is NOT added to the energy schema (architecture sections 4.5, 6.4).

3. **Given** the Crop Plan correction, **When** this story models the schema, **Then** it does NOT assume the energy `Crop` is a Crop Plan: the BoM forecast source (`BillOfMaterials`/`BomLine`) is modeled to be fed by either a net-new `CropProgram` (path (a)) or a repeat-buy projection from prior `InvoiceLine`s (path (b)), and the `CropProgram`/`GrowthStage` net-new models are EITHER added here as additive, unused-until-Epic-3 tables OR deliberately deferred to Epic 3 with the decision recorded, never silently assumed to already exist (architecture section 4.6; ADR-001 consequences; PRD section 8 #7).

4. **Given** money and union-like fields, **When** they are defined, **Then** every dollar field is `Int` cents (the Tool 1 money law), per-unit/active prices that need sub-cent precision are `Float`, and union-like fields are Prisma `String` columns mirrored by TS string-literal unions in a new `src/lib/procurement/types.ts`, never Prisma enums (architecture section 4.1, section 10).

5. **Given** clean boundaries (NFR-6), **When** the foundation lands, **Then** the pure-logic scaffold lives under a new `src/lib/procurement/` (with `types.ts` and the colocated `*.test.ts` discipline), the schema lives in `prisma/schema.prisma`, and no UI/DB coupling is introduced into the pure layer; no Dealer or financial credential field exists anywhere in the schema (NFR-1).

6. **Given** zero-external-calls discipline (NFR-2), **When** the seed runs, **Then** a Batth-shaped procurement seed and at least one committed fixture Invoice are added so `npm run db:seed` produces procurement rows and the app still runs offline, **And** the existing energy seed (`seedBatthFarm`) stays green with no edits forced on its existing `create` calls.

7. **Given** the migration toolchain, **When** `db:migrate` then `db:generate` run, **Then** both succeed and the generated client type-checks under strict + `noUncheckedIndexedAccess` + no-`any`, **And** `npm run lint` and `npm test` stay green (Tool 1 behavior unchanged: no energy column renamed or dropped).

8. **Given** v1's display-never-execute and read-only posture, **When** this story is implemented, **Then** NO ingestion pipeline, vision reader, band math, recommendation runner, server action, UI route, or `action.execute` path is built here (those are Stories 1.2, 1.3, Epic 2+, and the agent layer); this story is schema + types + seed only, and `tool = "purchasing"` is reserved but no procurement Recommendation is emitted yet (ADR-004, ADR-007).

### AC interpretation notes (read before coding)

- **AC1 "the rest of the v1 procurement model target":** the architecture (section 4.2) lists the full v1 model. Epic guidance is "add a table only when the first story that needs it is built," but Story 1.1 is explicitly the schema-foundation story for the whole tool, and the sprint plan sequences 1.1 first as "the data foundation the whole tool sits on." Land the full section-4.2 model in ONE additive migration here so later stories add behavior, not tables. The exception is the Crop Plan models, governed by AC3 below.
- **AC3 the Crop Plan decision (the load-bearing correction):** the energy `Crop` is `{ id, name, cropCoefficient, blocks, ranches, pumps }` and has NO program and NO growth-stage schedule (read `prisma/schema.prisma` lines 263-271 and confirm this yourself). The forecast formula "acres x crop x program x growth stage" has nothing to read. Do NOT model `BillOfMaterials`/`BomLine` as if they consume the energy `Crop`. The recommended path is **(b) repeat-buy projection from prior `InvoiceLine`s** for v1 (it needs no new program schema and unblocks Epic 3 on real data), so for THIS story: add `BillOfMaterials` and `BomLine` (they are additive and harmless, fed later by `forecast-bom.ts`), and DEFER the net-new `CropProgram`/`GrowthStage` models to Epic 3 with an inline schema comment recording the section-4.6 decision. If you instead choose path (a), add `CropProgram` + `GrowthStage`/`ProgramApplication` here as additive unused-until-Epic-3 tables. Either way, never leave the false assumption that a Crop Plan already exists.
- **AC2 `DealerAccount` not `Account`:** do NOT overload the energy `Account` (it is PG&E-specific and Auth.js-adjacent). Add a parallel `DealerAccount` with its own `entityId?` mirroring `Account.entityId`. This is architecture decision 14.2 / 14.5 #1 (confirmed low-risk; a later merge would be a rename, not a redesign).
- **AC2 `InvoiceLine.entityId` is denormalized on purpose:** it is the Spend Table's single filter source (FR-13), set from `DealerAccount.entityId` at attribution time (Story 1.3), grower-correctable. Add the column and the `@@index([farmId, entityId])` now; Story 1.3 populates it. Ranch/Block are separate columns and are allowed to disagree with the line's Entity.
- **AC4 `Finding` vs `Recommendation`:** reuse the shared `Recommendation` grammar verbatim with `tool = "purchasing"` (ADR-004). The new `Finding` model carries `confidence`, `state`, `impactCents`, and the immutable `lineageJson` (ADR-005); it links to a `Recommendation` via `Finding.recommendationId?`. Do NOT add confidence/lineage columns to the shared `Recommendation` model.
- **AC8 scope guard:** this is a schema-and-types story. No `src/lib/procurement/ingest`, no `normalize.ts`/`band.ts`/`overpayment.ts` logic bodies, no `run-procurement.ts`, no `src/app/dashboard/purchasing` routes, no `actions.ts`, no copy strings beyond what the seed needs. Adding the `types.ts` union mirrors is in scope; adding stubbed pure modules is NOT required and should be left for the stories that own them.

## Tasks / Subtasks

- [ ] **Task 1: Add the identity-and-source models** (AC: 1, 2, 5)
  - [ ] Add `model Dealer { id, farmId, name, kind String, normalizedKey String?, createdAt, updatedAt }` with `farm Farm @relation(onDelete: Cascade)`, back-relations `dealerAccounts DealerAccount[]`, `invoices Invoice[]`, `rebatePrograms RebateProgram[]`, `prepayTerms PrepayTerm[]`, and `@@index([farmId])`. `kind` is `String` // "dealer" | "co_op" | "distributor" (Co-op modeled as a Dealer, per the Glossary).
  - [ ] Add `model DealerAccount { id, farmId, dealerId, entityId String?, number, normalizedNumber String?, createdAt, updatedAt }` with `farm`/`dealer`/`entity? @relation(onDelete: SetNull)` relations, `invoices Invoice[]`, `invoiceLines InvoiceLine[]`, `@@index([farmId])`, `@@index([entityId])`, `@@index([dealerId])`. `entityId` is the Account-routed Entity mirror of `Account.entityId`.
  - [ ] CRITICAL: do NOT add any `login`, `password`, `credential`, `apiKey`, or `token` field to `Dealer`/`DealerAccount`/`Invoice` (NFR-1; ADR-002). There is no Dealer-login field anywhere in this schema.
- [ ] **Task 2: Add the ingestion models** (AC: 1, 2, 4)
  - [ ] Add `model Invoice { id, farmId, dealerId String?, dealerAccountId String?, entityId String?, invoiceNumber String?, invoiceDate DateTime?, source String, sourceHash String?, printedTotalCents Int?, extractionStatus String @default("extracted"), createdAt, updatedAt }`, relations to `farm`/`dealer?`/`dealerAccount?`/`entity?`, `lines InvoiceLine[]`, `@@index([farmId])`. `source` // "photo" | "pdf" | "email"; `extractionStatus` // "extracted" | "needs_review" | "partial".
  - [ ] Add a `@@unique([farmId, sourceHash])` on `Invoice` so re-ingest is idempotent (architecture section 8.2). (`sourceHash` nullable so the seed can omit it; the unique on a nullable column still lets multiple NULLs coexist in Postgres.)
  - [ ] Add `model InvoiceLine { id, invoiceId, farmId, skuId String?, activeIngredientId String?, rebateProgramId String?, ranchId String?, blockId String?, entityId String?, dealerAccountId String?, lineType String, rawDescription String, quantity Float?, unit String?, unitPriceCents Int?, amountCents Int?, normalizedUnit String?, normalizedUnitPrice Float?, confidence Float?, lineState String @default("ok"), createdAt }` with relations to `invoice` (onDelete Cascade), `product?` (skuId), `activeIngredient?`, `rebateProgram?`, `ranch?`, `block?`, `entity?`, `dealerAccount?`, plus `findings Finding[]` and `reviewItems ReviewQueueItem[]`.
  - [ ] `lineType` // "product" | "rebate_credit" | "prepay" | "fee" | "tax" | "other"; `lineState` // "ok" | "needs_review" | "needs_confirmation". Add `@@index([invoiceId])`, `@@index([farmId])`, and CRITICALLY `@@index([farmId, entityId])` (the Spend Table aggregation index, architecture section 4.5).
  - [ ] Money law: `unitPriceCents`/`amountCents` are `Int` cents; `normalizedUnitPrice` is `Float` (sub-cent per unit of active). Never a float dollar amount.
- [ ] **Task 3: Add the shared catalog models** (AC: 1, 4)
  - [ ] Add `model ActiveIngredient { id, name, casNumber String?, standardUnit String, createdAt, updatedAt }` with `products Product[]`, `invoiceLines InvoiceLine[]`, `marketBands MarketBand[]`, `rebateTiers RebateTier[]`. NOT farm-scoped (shared catalog, carries no grower data); add `@@unique([casNumber])` is unsafe because casNumber is nullable, so instead `@@index([name])`.
  - [ ] Add `model Product { id, name, brand String?, formulation String?, packSize Float?, packUnit String?, activeIngredientId String?, isGeneric Boolean @default(false), manufacturer String?, createdAt, updatedAt }` with `activeIngredient? @relation`, `invoiceLines InvoiceLine[]`, `@@index([activeIngredientId])`. NOT farm-scoped. (This is the SKU; FR-5/FR-7 resolve chemistry through it.)
  - [ ] Inline doc comment: the catalog is shared, never farm-scoped, never carries grower-identifying data (preserves the single-grower-band discipline, ADR-003; catalog bootstrap is open question 14.5 #6, not this story).
- [ ] **Task 4: Add the audit-program models** (AC: 1, 4)
  - [ ] Add `model RebateProgram { id, farmId, dealerId String?, name, manufacturer String?, season String?, termsSource String, machineReadable Boolean @default(true), notes String?, createdAt, updatedAt }` with `farm`/`dealer?` relations, `tiers RebateTier[]`, `invoiceLines InvoiceLine[]`, `findings Finding[]`, `reviewItems ReviewQueueItem[]`, `@@index([farmId])`. `termsSource` // "grower_entered" | "extracted_from_document".
  - [ ] Add `model RebateTier { id, rebateProgramId, tierType String, thresholdQuantity Float?, thresholdUnit String?, thresholdDate DateTime?, rebateValueCents Int?, rebatePercent Float?, appliesToActiveIngredientId String?, createdAt }` with `rebateProgram @relation(onDelete: Cascade)`, `appliesToActiveIngredient? @relation`, `@@index([rebateProgramId])`. `tierType` // "volume_threshold" | "dollar_threshold" | "early_fill_milestone". Note `rebateValueCents` is `Int` cents, `rebatePercent` is `Float`.
  - [ ] Add `model PrepayTerm { id, farmId, dealerId String?, activeIngredientId String?, skuId String?, discountPercent Float?, discountCents Int?, closeDate DateTime, notes String?, createdAt, updatedAt }` with `farm`/`dealer?` relations and `@@index([farmId])`.
- [ ] **Task 5: Add the calculation-output models** (AC: 1, 4)
  - [ ] Add `model MarketBand { id, farmId, activeIngredientId, standardUnit String, lowPrice Float, medianPrice Float, highPrice Float, sampleCount Int, reliability String @default("no_reliable_band_yet"), computedAt DateTime, createdAt }` with `farm`/`activeIngredient` relations, `@@index([farmId])`, `@@index([farmId, activeIngredientId])`. Prices are `Float` (full precision per-unit). `reliability` // "reliable" | "no_reliable_band_yet".
  - [ ] Add `model Finding { id, farmId, recommendationId String?, findingType String, invoiceLineId String?, activeIngredientId String?, rebateProgramId String?, impactCents Int?, confidence Float?, state String @default("review"), lineageJson Json, createdAt }` with `farm` relation, `recommendation? @relation(onDelete: SetNull)` (the one-to-optional-one surface), `invoiceLine?`, `activeIngredient?`, `rebateProgram?`, `marks AdvisorFindingMark[]`, `@@index([farmId])`, `@@index([recommendationId])`. `findingType` // "overpayment" | "under_credited_rebate" | "generic_equivalent" | "prepay_timing" | "over_budget"; `state` // "asserted" | "needs_confirmation" | "review". `impactCents` is `Int` cents. `lineageJson` is `Json` (the immutable evidence blob, ADR-005).
  - [ ] Inline doc comment on `Finding`: never delete-recreated on re-run; upserted by lineage natural key; `lineageJson` never overwritten (ADR-005 / architecture section 8.5). This story only models it; `run-procurement.ts` (Epic 5) enforces the rule.
- [ ] **Task 6: Add the spend-control and forecast models** (AC: 1, 3, 4)
  - [ ] Add `model SpendBudget { id, farmId, entityId, season String, category String @default("all"), budgetCents Int?, createdAt, updatedAt }` with `farm`/`entity` relations, `@@unique([farmId, entityId, season, category])`, `@@index([farmId])`. `budgetCents` NULL is the explicit "not set" state (FR-14, never a fabricated target). `category` // "all" | "fertilizer" | "crop_protection" | "seed".
  - [ ] Add `model BillOfMaterials { id, farmId, entityId String?, season String, computedAt DateTime, createdAt }` with `farm`/`entity?` relations, `lines BomLine[]`, `@@index([farmId])`.
  - [ ] Add `model BomLine { id, bomId, blockId String?, ranchId String?, activeIngredientId String?, skuId String?, forecastQuantity Float, unit String, buyWindowStart DateTime?, buyWindowEnd DateTime?, prepayCloseDate DateTime?, commitmentState String @default("forecast"), commitmentEvent String?, createdAt }` with `bom @relation(onDelete: Cascade)`, `block?`, `ranch?`, `activeIngredient?`, `product?` relations, `@@index([bomId])`. `commitmentState` // "forecast" | "committed"; `commitmentEvent` // "order_sheet_signed" | "prepay_accepted" | "invoice_posted".
  - [ ] CRITICAL (AC3): add an inline schema comment block above `BillOfMaterials` recording the section-4.6 decision: the energy `Crop` is NOT a Crop Plan (no program, no growth stage); v1 feeds `BomLine` via a repeat-buy projection from prior `InvoiceLine`s (path b), and the net-new `CropProgram`/`GrowthStage` agronomic model is deferred to Epic 3 (path a). Do NOT relate `BillOfMaterials`/`BomLine` to the energy `Crop` as if it carried a program.
- [ ] **Task 7: Add the advisor and review-queue models** (AC: 1, 5)
  - [ ] Add `model AdvisorAccess { id, farmId, advisorUserId, grantedByUserId, status String @default("active"), grantedAt DateTime @default(now()), revokedAt DateTime? }` with `farm` relation, `advisor User @relation("AdvisorGrants")`, `grantedBy User @relation("AdvisorGrantsMade")`, `scopedEntities AdvisorAccessEntity[]`, `@@index([farmId])`, `@@index([advisorUserId])`. `status` // "active" | "revoked".
  - [ ] Add the relational scope join `model AdvisorAccessEntity { id, advisorAccessId, entityId }` with `advisorAccess @relation(onDelete: Cascade)`, `entity @relation`, `@@unique([advisorAccessId, entityId])` (the `scopedEntityIds` from the architecture, as a join table; FR-15).
  - [ ] Add the User back-relations `advisorGrants AdvisorAccess[] @relation("AdvisorGrants")` and `advisorGrantsMade AdvisorAccess[] @relation("AdvisorGrantsMade")` to `model User`. (Two named relations because both FKs point at `User`; omitting the relation name on either side is the usual mistake.)
  - [ ] Add `model AdvisorFindingMark { id, findingId, advisorUserId, mark String, note String?, createdAt }` with `finding @relation(onDelete: Cascade)`, `advisor User @relation("AdvisorMarks")`, `@@index([findingId])`. `mark` // "confirmed" | "disputed". Add `advisorMarks AdvisorFindingMark[] @relation("AdvisorMarks")` to `User`.
  - [ ] Add `model ReviewQueueItem { id, farmId, itemType String, invoiceLineId String?, rebateProgramId String?, status String @default("pending"), resolvedValueJson Json?, resolvedByUserId String?, createdAt, resolvedAt DateTime? }` with `farm` relation, `invoiceLine?`, `rebateProgram?`, `resolvedBy User? @relation("ReviewResolutions")`, `@@index([farmId])`, `@@index([status])`. `itemType` // "unreadable_line" | "un_normalizable_unit" | "ambiguous_rebate_term"; `status` // "pending" | "resolved". Add `reviewResolutions ReviewQueueItem[] @relation("ReviewResolutions")` to `User`.
- [ ] **Task 8: Wire the new relations onto the existing entities** (AC: 1, 2)
  - [ ] On `model Farm` add back-relations: `dealers Dealer[]`, `dealerAccounts DealerAccount[]`, `invoices Invoice[]`, `invoiceLines InvoiceLine[]`, `rebatePrograms RebateProgram[]`, `prepayTerms PrepayTerm[]`, `marketBands MarketBand[]`, `findings Finding[]`, `spendBudgets SpendBudget[]`, `billsOfMaterials BillOfMaterials[]`, `advisorAccesses AdvisorAccess[]`, `reviewQueueItems ReviewQueueItem[]`.
  - [ ] On `model Entity` add: `dealerAccounts DealerAccount[]`, `invoices Invoice[]`, `invoiceLines InvoiceLine[]`, `spendBudgets SpendBudget[]`, `billsOfMaterials BillOfMaterials[]`, `advisorScopes AdvisorAccessEntity[]`. Do NOT add any new scalar column to `Entity` (no `Ranch.entityId`-style change; Entity is reused as-is).
  - [ ] On `model Ranch` add `invoiceLines InvoiceLine[]` and `bomLines BomLine[]`. CRITICAL: do NOT add `entityId` to `Ranch` (AC2; architecture section 4.5 decision). Add the same two back-relations to `model Block`.
  - [ ] On `model Crop`: add NOTHING. The forecast reads acreage and prior invoices, not the `Crop` model's program (it has none). Leave `Crop` exactly as it is.
  - [ ] On `model Recommendation`: add NOTHING new to the model body. The `Finding.recommendationId` FK lives on `Finding`; the shared grammar stays unchanged (ADR-004).
- [ ] **Task 9: Mirror the new unions as TS literal types** (AC: 4, 5)
  - [ ] Create `src/lib/procurement/types.ts` exporting the union mirrors for every new String column: `DealerKind`, `InvoiceSource`, `ExtractionStatus`, `LineType`, `LineState`, `RebateTermsSource`, `RebateTierType`, `BandReliability`, `FindingType`, `FindingState`, `SpendCategory`, `CommitmentState`, `CommitmentEvent`, `AdvisorAccessStatus`, `AdvisorMark`, `ReviewItemType`, `ReviewStatus`. Each a `export type X = "..." | "...";` with a one-line doc comment, mirroring `src/lib/recommendations/types.ts`. No `any`, no Prisma enum.
  - [ ] Add a `LineageJson` / `FindingLineage` shape (a `JsonObject`-compatible type for `Finding.lineageJson`: source invoice line ids, activeIngredientId, band inputs with sampleCount + computedAt OR program/tier/threshold set, confidence, asOf), reusing the `JsonValue`/`JsonObject` types from `src/lib/recommendations/types.ts` so it assigns cleanly to a Prisma `Json` input without `any`.
  - [ ] Add the `PURCHASING_TOOL = "purchasing"` constant (the `tool` value, ADR-004) and a short doc comment that no procurement Recommendation is emitted until Epic 5.
- [ ] **Task 10: Add the Batth-shaped procurement seed and a fixture Invoice** (AC: 6)
  - [ ] Add `fixtures/procurement/sample-invoice.json` (one committed Invoice with a few lines: a branded crop-protection SKU, its generic equivalent, a fertilizer line, a rebate-credit line) so the ingestion stories (1.2) have a fixture and the seed has shape. Add `fixtures/procurement/batth-procurement.json` if you prefer a data-file-driven seed (optional; inline data is acceptable).
  - [ ] Add `prisma/batth-procurement.ts` exporting `seedBatthProcurement(prisma, farmId)` that creates a handful of `Dealer`/`DealerAccount` rows (attached to the existing seeded Entities), a couple of `ActiveIngredient`+`Product` catalog rows (branded + generic), one `Invoice` with `InvoiceLine`s, and at least one `RebateProgram`+`RebateTier`. Money in integer cents. Takes an explicit `PrismaClient` and a `farmId` (the importer pattern; project-context DB-edge rule). Do NOT emit any `Finding` or `Recommendation` (AC8).
  - [ ] Wire it into `prisma/seed.ts` AFTER `seedBatthFarm` (it needs the farm id and existing Entities). Keep the existing energy seed call and its console line unchanged; add a procurement console line. Re-run `npm run db:seed` and confirm the energy line still prints "183 meters, 6 entities, 57 accounts ..." unchanged.
  - [ ] Keep the seed idempotent or reset-safe: `npm run db:reset` must reseed both energy and procurement cleanly.
- [ ] **Task 11: Run the migration toolchain and keep everything green** (AC: 6, 7)
  - [ ] `npx prisma validate` and `npx prisma format` (schema valid + formatted).
  - [ ] `npm run db:migrate -- --name purchasing_agent_foundation` (creates + applies + auto-seeds against the unpooled `directUrl`). Confirm Postgres `CREATE TABLE` statements for the new models and ZERO `ALTER TABLE ... DROP` / `RENAME` on any energy table (additive only).
  - [ ] `npm run db:generate` (regenerate the Prisma client).
  - [ ] `npm run lint` (exit 0; no-`any` is an error), `npm test` (all existing + new tests green), and `npx tsc --noEmit` (exit 0 under strict + `noUncheckedIndexedAccess`).
- [ ] **Task 12: Prove the new relations round-trip with a DB integration test** (AC: 1, 2, 5, 6)
  - [ ] Add `src/lib/procurement/foundation-schema.db.test.ts` (a `*.db.test.ts`, node env, against local Postgres, taking an explicit `PrismaClient`) that within one test:
    - creates `Farm -> Entity -> Dealer -> DealerAccount(entityId)` and an `Invoice` with two `InvoiceLine`s,
    - sets one line's `entityId` from `DealerAccount.entityId` and a DIFFERENT line's `ranchId` to a Ranch whose link does not match that Entity, then asserts BOTH persist (proving Entity is Account-routed and Ranch is orthogonal and allowed to disagree, AC2),
    - creates `ActiveIngredient -> Product(branded)` and `Product(generic, isGeneric:true)` sharing the Active Ingredient, and asserts the one-AI-to-many-SKU relation resolves,
    - creates a `Finding` with a non-empty `lineageJson` linked to a `Recommendation(tool:"purchasing")` and asserts `finding.recommendation` resolves and `Finding.lineageJson` round-trips,
    - creates an `AdvisorAccess` with two `AdvisorAccessEntity` scope rows and a `ReviewQueueItem`, and asserts they resolve,
    - cleans up after itself (delete the Farm to exercise cascade; assert farm-scoped procurement rows are gone and the shared catalog `Product`/`ActiveIngredient` survive, since they are NOT farm-scoped).
  - [ ] Add a guard assertion in the same test (or a sibling pure test) that no procurement model exposes a credential-shaped field (NFR-1): assert the generated `Prisma.DealerScalarFieldEnum` / `Prisma.InvoiceScalarFieldEnum` contain no key matching `/login|password|credential|secret|apikey|token/i`.

### Review notes (for the eventual code review)

- Auditor should confirm: additive-only (no energy column renamed/dropped), `Ranch.entityId` NOT added, `InvoiceLine.entityId` + `@@index([farmId, entityId])` present, money is integer cents, unions are `String` + TS mirror (no Prisma enums), no credential field anywhere, `action.execute`/Recommendation grammar untouched, and the Crop Plan correction is recorded in a schema comment (not silently assumed).
- Known deferrals: catalog bootstrap (real almond/tree-nut chemistries) is open question 14.5 #6, not this story; the `CropProgram` agronomic model is Epic 3 path (a); the extraction confidence threshold and band minimum-point count are Epic 2/4 config.

## Dev Notes

### Critical Guardrails (prevent the disasters specific to this story)

1. **Never reintroduce SQLite.** The repo migrated SQLite -> PostgreSQL on 2026-06-14 (commits `f13c4d2`, `8fdb247`). The datasource is `provider = "postgresql"` with `url = env("DATABASE_URL")` (pooled Neon) and `directUrl = env("DATABASE_URL_UNPOOLED")` (unpooled, for DDL/migrations). Prisma stays pinned to v6 (classic `env(...)` flow). Do not add `prisma.config.ts`, do not move to v7, do not touch the datasource block.
2. **This migration must be purely additive and non-breaking.** `npm run db:migrate` auto-seeds (`prisma/seed.ts` -> `seedBatthFarm` -> `runEngines`). Every new column is nullable or has a `@default`. Do NOT add a required column without a default and do NOT rename or drop any existing energy column. Postgres column adds are real `ALTER TABLE ADD COLUMN` (no SQLite table-rebuild here); new models are `CREATE TABLE`. Eyeball the generated `migration.sql` to confirm zero `DROP`/`RENAME` on energy tables.
3. **Do NOT overload the energy `Account`.** The schema already has TWO `Account`-ish concerns: the PG&E billing `Account` (model `Account`) and the Auth.js OAuth link (model `AuthAccount`, mapped by `lib/auth.ts`). The procurement dealer-account is a THIRD, distinct concept: add `model DealerAccount`. Do not reuse `Account`, do not rename `AuthAccount`. (architecture section 4.2; section 4.6 ADR-001 consequences.)
4. **Do NOT add `Ranch.entityId`.** The energy rollup is `Entity -> Account -> Ranch -> Pump`; `Ranch` deliberately has no `entityId` (read the comment on `model Ranch`, schema lines 273-293: "a ranch can hold meters from more than one account"). Procurement Entity attribution is Account-routed via `DealerAccount.entityId` -> denormalized `InvoiceLine.entityId`. Ranch/Block on a line is an orthogonal physical dimension that need not agree with the line's Entity. Adding `Ranch.entityId` would assert a single-Entity-per-Ranch fact the energy model refuses to make. (architecture sections 4.5, 6.4; ADR-001 consequence #2.)
5. **The energy `Crop` is NOT a Crop Plan.** `model Crop` is `{ id, name, cropCoefficient, blocks, ranches, pumps }` (schema lines 263-271) with no program and no growth-stage schedule. The PRD/epics phrase "Crop Plan already modeled by Terra" is FALSE against the real schema. Do not relate `BillOfMaterials`/`BomLine` to `Crop` as if it carried a program. Record the section-4.6 decision in a schema comment: v1 forecast is a repeat-buy projection from prior `InvoiceLine`s (path b); the net-new `CropProgram` agronomic model is Epic 3 (path a). (architecture section 4.6, section 14.5 #7; ADR-001.)
6. **Money is integer cents, never a float dollar.** This is the Tool 1 money law (`BillingLineItem.amountCents`, `NemPeriod.amountCents`, `BillingPeriod.printedTotalCents` are all `Int`). Every dollar field on the new models is `Int` cents (`unitPriceCents`, `amountCents`, `printedTotalCents`, `rebateValueCents`, `discountCents`, `budgetCents`, `impactCents`). Per-unit prices that need sub-cent precision (price per ounce of active) are `Float` (`normalizedUnitPrice`, `MarketBand.lowPrice/medianPrice/highPrice`), exactly as `BillingLineItem.rate` is `Float`.
7. **Union/enum-like fields stay `String`, mirrored in TS.** The schema header comment still says "promote these to real enums on Postgres," but the architecture (section 4.1, section 10) explicitly keeps unions as `String` mirrored in `src/lib/procurement/types.ts`, "consistent with the existing schema note," deferring any enum promotion to one schema-wide change. Follow the architecture: `String` columns, TS unions, NO Prisma `enum` in this story.
8. **No credential field, anywhere.** NFR-1 / ADR-002: the agent never requires or stores a Dealer/financial credential. There is no Dealer-login field in the schema, actions, or UI. Do not add `login`, `password`, `apiKey`, `token`, `secret`, or `credential` to any procurement model. (Task 12 adds a guard test.)
9. **Do not build behavior.** AC8: this is schema + `types.ts` + seed. No ingest pipeline, no pure calc bodies, no `run-procurement.ts`, no `src/app/dashboard/purchasing` routes, no server actions, no copy beyond the seed. `action.execute` stays `null` everywhere by reusing the unchanged grammar (you emit no Recommendation here at all).
10. **Do not touch `next.config.ts`/`outputFileTracingIncludes`.** It already includes `./fixtures/**/*` for every route (`"/**": ["./fixtures/**/*"]`), so the new `fixtures/procurement/*` is shipped automatically. This story adds a fixture under that path; it changes no config. (next.config.ts lines 17-19.)

### Existing state - current state of the files you are modifying

`prisma/schema.prisma` (Postgres, Prisma v6). Read it fully before editing. Relevant current state:

- **datasource** is `postgresql` with `url` (pooled) + `directUrl` (unpooled). Generator is `prisma-client-js`. (lines 6-16.)
- **`Farm`** (lines 18-46) is the scoping root with relations `blocks`, `ranches`, `pumps`, `entities`, `accounts`, `solarArrays`, `people`, `connections`, `recommendations`, and `user?`. You add the procurement back-relations (Task 8). Has `isDemo` (seed/demo farms) and `userId?`.
- **`Entity`** (lines 52-69) = `{ id, name, billingName?, actualOwner?, farmId, accounts[] }`. You add `dealerAccounts`, `invoices`, `invoiceLines`, `spendBudgets`, `billsOfMaterials`, `advisorScopes`. Add NO scalar column.
- **`Account`** (lines 74-93) = the PG&E billing account: `{ id, number, farmId, entityId?, coverageState, pumps[] }`, `@@unique([farmId, number])`. `Account.entityId` is the modeling precedent for `DealerAccount.entityId`. Do NOT overload this model.
- **`Ranch`** (lines 279-293) = `{ id, name, acreage?, farmId, cropId?, crop?, pumps[] }`, farm-scoped, `@@index([farmId])`. NO `entityId`. You add `invoiceLines`/`bomLines` back-relations only.
- **`Block`** (lines 95-109) = farm-scoped, m-n with `Pump`, `cropId?`. You add `invoiceLines`/`bomLines` back-relations only.
- **`Crop`** (lines 263-271) = `{ id, name @unique, cropCoefficient?, blocks[], ranches[], pumps[] }`. NO program, NO growth stage. Leave untouched.
- **`Recommendation`** (lines 373-391) = the shared grammar `{ id, farmId, tool, situation, action Json, impactUsd?, impactNote?, severity, status, createdAt, resolvedAt?, result? }`, `@@index([farmId, status])`, `@@index([farmId, tool])`. Reuse verbatim with `tool = "purchasing"`. `Finding.recommendationId` points at it; add NO field to this model.
- **`User`** (lines 401-413) = Auth.js user with `accounts AuthAccount[]`, `sessions Session[]`, `farms Farm[]`. You add `advisorGrants`, `advisorGrantsMade`, `advisorMarks`, `reviewResolutions` back-relations for the advisor/review models (all named relations, since they all FK back to `User`).
- The header comment (lines 1-4) still references SQLite/enums historically; ignore the SQLite framing (the repo is Postgres now) but keep the "union fields are String mirrored in TS" rule.

`src/lib/recommendations/types.ts` (read it): the union-mirror pattern to copy. It exports `Severity`, `RecStatus`, `PumpStatus`, `CoverageState`, `BillingLineItemKind`, etc. as `export type X = "..." | "...";`, plus `JsonValue`/`JsonObject` (reuse these for `lineageJson`), `RecommendationAction` (with `execute?: ExecutableCommand | null`), and `DraftRecommendation`. Your new `src/lib/procurement/types.ts` mirrors this discipline.

`src/lib/onboarding/vision.ts` (read it): the stubbed-boundary + `process.cwd()` fixture-read pattern the ingestion stories (1.2) will mirror. NOT built in this story, but note: it reads `join(process.cwd(), "fixtures", "onboarding", "sample-bill.json")` (never `import.meta.url`), and the live path is gated by `hasGatewayKey()` (`src/lib/ai/gateway.ts`). Your fixture Invoice belongs under `fixtures/procurement/` to be read the same way later.

`src/lib/energy/billing.ts` and `src/lib/energy/classify.ts` (read `billing.ts`): the pure-function + colocated `*.test.ts` pattern for `src/lib/procurement`. Pure: no Prisma import, no `Date.now()`, no fs at the calc layer; the caller passes `asOf`/`ref`. This story only adds `types.ts` (and the db test); the pure calc modules are later stories, but they live here.

`src/lib/db.ts` (read it): the Prisma singleton (`export const prisma`). The seed and importer take an explicit `PrismaClient` (do not import the singleton into the seed module body); only top-level entry points (`prisma/seed.ts`) construct one.

`prisma/seed.ts` (read it): the only file with side effects. It constructs a `PrismaClient`, calls `seedBatthFarm(prisma)` then `runEngines(prisma, farm.id)`, and logs. You add a `seedBatthProcurement(prisma, farm.id)` call after `seedBatthFarm`, with its own console line; leave the energy lines unchanged.

What this story changes vs. preserves: **additive only.** No existing column renamed or dropped; no existing relation altered (only back-relations appended). Energy seed and all energy tests stay green.

### Concrete schema sketch (recommended shapes)

```prisma
// Identity and source ----------------------------------------------------------

model Dealer {
  id            String   @id @default(cuid())
  farmId        String
  name          String
  kind          String   @default("dealer") // "dealer" | "co_op" | "distributor"
  normalizedKey String?  // de-dup across Invoice spelling variants (Story 1.3 join)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  farm           Farm            @relation(fields: [farmId], references: [id], onDelete: Cascade)
  dealerAccounts DealerAccount[]
  invoices       Invoice[]
  rebatePrograms RebateProgram[]
  prepayTerms    PrepayTerm[]

  @@index([farmId])
}

model DealerAccount {
  id               String   @id @default(cuid())
  farmId           String
  dealerId         String
  entityId         String?  // Account-routed Entity (mirror of Account.entityId)
  number           String
  normalizedNumber String?  // canonical join key (Story 1.3 dealer-account.ts)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  farm         Farm          @relation(fields: [farmId], references: [id], onDelete: Cascade)
  dealer       Dealer        @relation(fields: [dealerId], references: [id], onDelete: Cascade)
  entity       Entity?       @relation(fields: [entityId], references: [id], onDelete: SetNull)
  invoices     Invoice[]
  invoiceLines InvoiceLine[]

  @@index([farmId])
  @@index([entityId])
  @@index([dealerId])
}

// Ingestion --------------------------------------------------------------------

model Invoice {
  id                String    @id @default(cuid())
  farmId            String
  dealerId          String?
  dealerAccountId   String?
  entityId          String?
  invoiceNumber     String?
  invoiceDate       DateTime?
  source            String    // "photo" | "pdf" | "email"
  sourceHash        String?   // content hash; makes re-ingest idempotent (section 8.2)
  printedTotalCents Int?      // reconciliation surface (integer cents)
  extractionStatus  String    @default("extracted") // "extracted" | "needs_review" | "partial"
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  farm          Farm           @relation(fields: [farmId], references: [id], onDelete: Cascade)
  dealer        Dealer?        @relation(fields: [dealerId], references: [id], onDelete: SetNull)
  dealerAccount DealerAccount? @relation(fields: [dealerAccountId], references: [id], onDelete: SetNull)
  entity        Entity?        @relation(fields: [entityId], references: [id], onDelete: SetNull)
  lines         InvoiceLine[]

  @@unique([farmId, sourceHash]) // idempotent re-ingest (multiple NULLs coexist in PG)
  @@index([farmId])
}

model InvoiceLine {
  id                  String   @id @default(cuid())
  invoiceId           String
  farmId              String
  skuId               String?
  activeIngredientId  String?
  rebateProgramId     String?
  ranchId             String?  // orthogonal physical attribution (may disagree w/ entity)
  blockId             String?
  entityId            String?  // SOURCE OF TRUTH for the Spend Table Entity filter (FR-13)
  dealerAccountId     String?
  lineType            String   // "product" | "rebate_credit" | "prepay" | "fee" | "tax" | "other"
  rawDescription      String
  quantity            Float?
  unit                String?
  unitPriceCents      Int?     // integer cents
  amountCents         Int?     // integer cents
  normalizedUnit      String?
  normalizedUnitPrice Float?   // full precision per unit of active
  confidence          Float?
  lineState           String   @default("ok") // "ok" | "needs_review" | "needs_confirmation"
  createdAt           DateTime @default(now())

  invoice          Invoice           @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  product          Product?          @relation(fields: [skuId], references: [id])
  activeIngredient ActiveIngredient? @relation(fields: [activeIngredientId], references: [id])
  rebateProgram    RebateProgram?    @relation(fields: [rebateProgramId], references: [id])
  ranch            Ranch?            @relation(fields: [ranchId], references: [id], onDelete: SetNull)
  block            Block?            @relation(fields: [blockId], references: [id], onDelete: SetNull)
  entity           Entity?           @relation(fields: [entityId], references: [id], onDelete: SetNull)
  dealerAccount    DealerAccount?    @relation(fields: [dealerAccountId], references: [id], onDelete: SetNull)
  findings         Finding[]
  reviewItems      ReviewQueueItem[]

  @@index([invoiceId])
  @@index([farmId])
  @@index([farmId, entityId]) // the Spend Table aggregation index (section 4.5)
}

// Catalog (SHARED, never farm-scoped, no grower data) --------------------------

model ActiveIngredient {
  id           String   @id @default(cuid())
  name         String
  casNumber    String?  // CAS registry number, the stable identity
  standardUnit String   // canonical per-unit basis, e.g. "lb_active" | "gal_active"
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  products     Product[]
  invoiceLines InvoiceLine[]
  marketBands  MarketBand[]
  rebateTiers  RebateTier[]

  @@index([name])
}

model Product {
  id                 String   @id @default(cuid())
  name               String
  brand              String?
  formulation        String?
  packSize           Float?
  packUnit           String?
  activeIngredientId String?
  isGeneric          Boolean  @default(false)
  manufacturer       String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  activeIngredient ActiveIngredient? @relation(fields: [activeIngredientId], references: [id])
  invoiceLines     InvoiceLine[]

  @@index([activeIngredientId])
}
```

The remaining models (`RebateProgram`, `RebateTier`, `PrepayTerm`, `MarketBand`, `Finding`, `SpendBudget`, `BillOfMaterials`, `BomLine`, `AdvisorAccess`, `AdvisorAccessEntity`, `AdvisorFindingMark`, `ReviewQueueItem`) follow the same conventions (cuid id, `createdAt`, farm-scoped where they carry grower data, `onDelete: Cascade` to `Farm`, `SetNull` for soft links, integer-cents money, `String` unions). The `Finding` and BoM sketches that carry the load-bearing corrections:

```prisma
model Finding {
  id               String   @id @default(cuid())
  farmId           String
  recommendationId String?  // the grower-facing surface (ADR-004); one-to-optional-one
  findingType      String   // "overpayment" | "under_credited_rebate" | "generic_equivalent" | "prepay_timing" | "over_budget"
  invoiceLineId    String?
  activeIngredientId String?
  rebateProgramId  String?
  impactCents      Int?     // integer cents
  confidence       Float?
  state            String   @default("review") // "asserted" | "needs_confirmation" | "review"
  // Immutable evidence backing the dollar figure (ADR-005). NEVER deleted on re-run,
  // NEVER overwritten; run-procurement.ts (Epic 5) upserts by lineage natural key.
  lineageJson      Json
  createdAt        DateTime @default(now())

  farm             Farm              @relation(fields: [farmId], references: [id], onDelete: Cascade)
  recommendation   Recommendation?   @relation(fields: [recommendationId], references: [id], onDelete: SetNull)
  invoiceLine      InvoiceLine?      @relation(fields: [invoiceLineId], references: [id], onDelete: SetNull)
  activeIngredient ActiveIngredient? @relation(fields: [activeIngredientId], references: [id])
  rebateProgram    RebateProgram?    @relation(fields: [rebateProgramId], references: [id])
  marks            AdvisorFindingMark[]

  @@index([farmId])
  @@index([recommendationId])
}

// The energy Crop is NOT a Crop Plan (no program, no growth stage; schema lines 263-271).
// v1 feeds BomLine via a repeat-buy projection from prior InvoiceLines (architecture 4.6
// path b). The net-new CropProgram/GrowthStage agronomic model is Epic 3 (path a). Do NOT
// relate BillOfMaterials/BomLine to Crop as if it carried a program.
model BillOfMaterials {
  id         String   @id @default(cuid())
  farmId     String
  entityId   String?
  season     String
  computedAt DateTime
  createdAt  DateTime @default(now())

  farm   Farm      @relation(fields: [farmId], references: [id], onDelete: Cascade)
  entity Entity?   @relation(fields: [entityId], references: [id], onDelete: SetNull)
  lines  BomLine[]

  @@index([farmId])
}
```

On `Recommendation`, add a back-relation so the FK resolves both ways (Prisma requires it):

```prisma
  findings Finding[] // procurement Finding(s) surfaced through this Recommendation
```

### Project Structure Notes

- **`DealerAccount` vs `Account` vs `AuthAccount`.** Three distinct account concepts now live in the schema: PG&E billing `Account`, Auth.js OAuth `AuthAccount` (mapped by `lib/auth.ts`), and the new procurement `DealerAccount`. Keep them separate. Architecture 14.5 #1 confirms the parallel `DealerAccount` is low-risk; a later merge would be a rename, not a redesign. Do not act on a merge here.
- **`Ranch` vs `Block` (carried from Story 1.1 of the energy epic).** The energy schema kept both `Ranch` (rollup) and `Block` (m-n served unit). Procurement attribution lands `InvoiceLine.ranchId` and `InvoiceLine.blockId` as orthogonal columns; whether `Block` eventually merges into `Ranch` is still an energy-side open item, not resolved here.
- **The Crop Plan is the one real schema gap (AC3).** Record the section-4.6 decision in a schema comment above `BillOfMaterials` (path b for v1, path a deferred to Epic 3). The sprint plan BLOCKS Epic 3 until that decision is taken; this story makes the decision visible in the schema so Epic 3 cannot re-introduce the false "Crop already models a program" assumption. Flag for Epic 3: if path (a) is chosen, the net-new `CropProgram`/`GrowthStage` models + a grower-supplied ingestion path are net-new work, NOT a reuse of `Crop`.
- **Catalog bootstrap is out of scope.** `ActiveIngredient`/`Product` are modeled here but the real almond/tree-nut chemistry catalog (and its generic equivalents) is open question 14.5 #6. The seed adds a couple of rows for shape only.

### References

- [Source: _bmad-output/purchasing-agent/2-planning/epics.md#Story 1.1] - the user story + acceptance criteria (Epic 1, FR-1, FR-2; "the data foundation the whole tool sits on").
- [Source: _bmad-output/purchasing-agent/2-planning/epics.md#FR Coverage Map] - FR-1/FR-2 -> Epic 1; the full FR inventory the foundation must eventually serve.
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture.md#4. Extended Data Model] (sections 4.1-4.6) - the full procurement model, the money/union laws, the FR-2 Account-routed-Entity vs orthogonal-Ranch join (4.5), and the Crop-Plan-is-net-new correction (4.6).
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture.md#10. Implementation Patterns] and [#11. Project Structure] - naming, money, purity, scoping rules; `src/lib/procurement/` layout.
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture-decisions.md#ADR-001] - extend the shared schema in-repo; the two corrected reuse assumptions (Crop Plan, Ranch.entityId).
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture-decisions.md#ADR-002] - no Dealer-login field anywhere (NFR-1).
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture-decisions.md#ADR-004] - reuse the Recommendation grammar; `Finding` beside it.
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture-decisions.md#ADR-005] - immutable per-Finding `lineageJson`; never delete-recreated.
- [Source: _bmad-output/purchasing-agent/3-solutioning/architecture.md#14.5 Open technical questions] (#1 DealerAccount, #6 catalog bootstrap, #7 Crop Plan blocker).
- [Source: _bmad-output/purchasing-agent/2-planning/prd.md#3. Glossary] - every domain noun used verbatim (Dealer, Co-op, Invoice, SKU, Active Ingredient, Market Band, Rebate, Prepay, Spend Budget, Review queue).
- [Source: _bmad-output/purchasing-agent/2-planning/ux-spec.md#1.1] - the OS shell the tool lands in (the schema must support the Spend Table filter and Findings rail it describes).
- [Source: prisma/schema.prisma] - the file being extended (Postgres, Prisma v6; current state documented above).
- [Source: src/lib/recommendations/types.ts] - the union-mirror + `JsonValue`/`JsonObject` + grammar pattern `src/lib/procurement/types.ts` copies.
- [Source: src/lib/onboarding/vision.ts] - the stubbed-boundary + `process.cwd()` fixture-read + `hasGatewayKey` gate the ingestion stories mirror (not built here).
- [Source: src/lib/energy/billing.ts] - the pure-function + colocated `*.test.ts` pattern for `src/lib/procurement`.
- [Source: src/lib/recommendations/run-rate-lever.ts] - the DB-edge run pattern + the delete-pending-and-recreate idempotency that `Finding` must NOT follow (ADR-005); referenced for context, not built here.
- [Source: prisma/seed.ts and prisma/batth-farm.ts] - the auto-seed that must stay green; the seed entry you extend with `seedBatthProcurement`.

### Technical Requirements (dev agent guardrails)

- **Stack (do not change):** Next.js (App Router) + React 19 + TS `strict` + `noUncheckedIndexedAccess` + no-`any` (ESLint flat config, no-`any` is an error); **Prisma v6 pinned** (classic `url`/`directUrl` env flow, NOT v7); **PostgreSQL** (Neon prod, local Postgres for `*.db.test.ts`). Migrations/DDL run against `DATABASE_URL_UNPOOLED` (`directUrl`); runtime uses the pooled `DATABASE_URL`. [Source: architecture.md section 3; schema datasource block]
- **After editing `prisma/schema.prisma`, run `db:generate`** so the client matches (AC7). `db:migrate` auto-seeds.
- **TS rules that will bite:** no `any` is an ESLint error; `noUncheckedIndexedAccess` makes indexed access `T | undefined`. In the db test, guard `findFirst`/array results before use; do not `!`-assert to silence it. For Prisma `Json` inputs, type `lineageJson` as the `FindingLineage` (JsonObject-compatible) shape and cast `as unknown as Prisma.InputJsonValue` at the DB edge (the pattern `run-rate-lever.ts` uses for `action`).
- **Testing tiers:** `*.db.test.ts` = Prisma integration (the tier this story uses), runs in the **node** env, takes an explicit `PrismaClient`, must clean up after itself (against local Postgres; the post-migration repo no longer uses a throwaway SQLite file - build the test farm and delete it, scoped by the ids it created). Run `npm test`. Pure tests are colocated `*.test.ts`. [Source: architecture.md section 13]
- **Layered boundaries:** schema/migration/seed under `prisma/`; the TS union mirror at `src/lib/procurement/types.ts`; the db test at `src/lib/procurement/foundation-schema.db.test.ts`. No UI, no `/lib/energy`, no `/lib/procurement` calc-body changes in this story.
- **Copy:** none needed beyond the seed (no grower-facing strings are added). When later stories add copy it goes in `src/copy/en.ts` (no exclamation marks, no em dashes, plain operator English).

### Git / recent-work context

Baseline commit `0e136cdd1511f385d7c045db03c9aa0d48bc9857`. Recent commits are all BMAD planning-doc work for the Purchasing Agent (`0e136cd` design system, `b4980b9` epics, `42d9632` research, `84a2e1f` PRFAQ) plus the Postgres migration (`f13c4d2`, `8fdb247`) and the UtilityAPI provider switch (`adb3e38`). None touch the procurement schema. This is the FIRST implementation story of Tool 2; there is no prior procurement code to inherit. Follow the energy schema's conventions (cuid ids, `createdAt`/`updatedAt`, `@@index([farmId])`, `onDelete: Cascade` to `Farm`, `SetNull` for soft links) and the Tool 1 `src/lib` boundaries verbatim.

### Latest tech notes

- **Prisma 6 + Postgres:** new models emit `CREATE TABLE`; new columns on existing tables emit `ALTER TABLE ... ADD COLUMN`. There is NO SQLite table-rebuild here, so the "verify INSERT ... SELECT carries every column" concern from the energy Story 1.1 does not apply; instead verify the generated `migration.sql` contains zero `DROP COLUMN`/`RENAME` on energy tables. Many-to-many is not needed in this story (the advisor scope is an explicit join model `AdvisorAccessEntity`, not an implicit m-n) - prefer the explicit join table so the scope rows are addressable (FR-15 revoke).
- **Two named relations to `User`:** `AdvisorAccess.advisorUserId` and `AdvisorAccess.grantedByUserId` both FK to `User`, so each needs a distinct `@relation("name")` on both sides; same for `AdvisorFindingMark.advisorUserId` and `ReviewQueueItem.resolvedByUserId`. Omitting the relation name on one side is the usual Prisma error.
- **Nullable unique:** `@@unique([farmId, sourceHash])` with a nullable `sourceHash` is fine on Postgres (NULLs are distinct), so seed Invoices without a hash do not collide.
- No web dependency for this story; everything is local schema + generated client + seed.

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
