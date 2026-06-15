---
baseline_commit: b6bea974170a89b9ffe2ec334cda08135352562d
---

# Story 1.1: Evolve the Prisma data model for the farm inventory

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Terra engineer,
I want the Prisma schema evolved to represent the full farm inventory ontology,
so that all 183 of the grower's meters can be stored faithfully with their real attributes before any billing exists.

## Acceptance Criteria

1. **Given** the existing Prisma v6 / SQLite schema, **When** the migration is applied, **Then** it adds `Ranch` (rollup level), a solar `Array` model with an explicit Array -> benefiting-Meter (NEMA) relation and a per-array `trueUpMonth`, and a `Crop` entity, **And** evolves `Entity` to carry both `billingName` and `actualOwner`.

2. **Given** the Meter/Pump model, **When** the migration is applied, **Then** each Meter carries SA ID, meter #, Pump ID, rate schedule (stored as-read), legacy flag, lat/long, GPM, crop, solar flag, status, **And** `serialCode` and `rotatingOutageBlock` as two distinct fields.

3. **Given** union/enum-like fields, **When** defined, **Then** they are Prisma `String` columns mirrored by TS string-literal unions, not enums.

4. **Given** the migration, **When** `db:migrate` then `db:generate` run, **Then** both succeed and the generated client type-checks under strict + `noUncheckedIndexedAccess` + no-`any`.

5. **Given** Auth and billing tables, **When** this story is implemented, **Then** they are NOT created here (deferred to the stories/epic that need them) - only inventory entities are added.

### AC interpretation notes (read before coding)

- **AC1 "a `Crop` entity":** `Crop` already exists in the schema. Satisfy this by keeping `Crop` and adding the new back-relations it needs (`pumps`, `ranches`) - do not create a duplicate model.
- **AC1 "solar `Array` model":** name the Prisma model **`SolarArray`**, never `Array` (see Critical Guardrails - a model named `Array` shadows the JS global and breaks under no-`any`/strict). The AC's intent is the model + the NEMA relation, not the literal table name.
- **AC2 "solar flag" and "crop":** the existing schema expresses solar via flat fields (`solarKw`/`nemType`/`trueUpMonth`) and crop via `Block -> Crop`. This story adds an explicit `isSolar` boolean and a meter-level `cropId` so a Meter "carries" both as FR-1 requires. Leave the existing flat solar fields in place (collapsing them onto `SolarArray` is later work, not this story).
- **AC2 "`serialCode` ... distinct field":** add `serialCode` as a NEW field (additive). Do **not** rename the existing `billingSerial` in this story - it is referenced in ~20 sites of the current onboarding/spreadsheet/greenbutton code that later stories rewrite. See Project Structure Notes for the deprecation plan.
- **AC5:** explicitly out of scope here - Auth tables (`User`/`Account`(auth)/`Session`/`VerificationToken`, Story 5.1) and billing tables (`BillingLineItem`, `cycleClose` on `BillingPeriod`, `coverageState`, Story 1.3). Add inventory entities only.

## Tasks / Subtasks

- [x] **Task 1: Add the `Ranch` rollup model** (AC: 1)
  - [x] Add `model Ranch { id, name, farmId, cropId?, acreage?, createdAt, updatedAt }` with `farm Farm @relation(onDelete: Cascade)`, `crop Crop?`, `pumps Pump[]`, and `@@index([farmId])`.
  - [x] Add the back-relation `ranches Ranch[]` to `Farm` and `ranches Ranch[]` to `Crop`.
  - [x] Do NOT delete or repurpose the existing `Block` model (the auto-seed depends on it; see Project Structure Notes).
- [x] **Task 2: Add the `SolarArray` model with the NEMA relation** (AC: 1)
  - [x] Add `model SolarArray { id, name?, nameplateKw Float, nemType String?, trueUpMonth Int?, saId String?, farmId, createdAt, updatedAt }` with `farm Farm @relation(onDelete: Cascade)`, `@@index([farmId])`.
  - [x] Model the NEMA allocation as an explicit named many-to-many: `benefitingMeters Pump[] @relation("NemAllocation")` on `SolarArray` and `benefitingArrays SolarArray[] @relation("NemAllocation")` on `Pump`.
  - [x] Add the back-relation `solarArrays SolarArray[]` to `Farm`.
  - [x] CRITICAL: the model is named `SolarArray`, not `Array`.
- [x] **Task 3: Evolve `Entity`** (AC: 1)
  - [x] Add `billingName String?` and `actualOwner String?` (both nullable - keeps the migration additive and the auto-seed's `{ name, farmId }` create valid). Keep `name`. Add inline doc comments stating Story 1.2 populates them (7 billing-name variants -> `billingName`; 6 true owners -> `actualOwner`).
- [x] **Task 4: Evolve `Pump` (the Meter) with the inventory attributes** (AC: 2, 3)
  - [x] Add `growerPumpId String?` (the grower's "P0xx" Pump ID descriptor; named `growerPumpId`, not `pumpId`, to avoid confusion with relation FKs).
  - [x] Add `isLegacy Boolean @default(false)` (the legacy AG-4/AG-5 flag; the 27 legacy meters).
  - [x] Add `status String?` // "GOOD" | "BAD" | "NEW WELL" | "OLD" (FR-17 pump health).
  - [x] Add `cropId String?` + `crop Crop? @relation(fields: [cropId], references: [id])` and the `pumps Pump[]` back-relation on `Crop`.
  - [x] Add `isSolar Boolean @default(false)` (explicit solar flag).
  - [x] Add `serialCode String?` (canonical billing-cycle letter going forward) and `rotatingOutageBlock String?` - kept as two distinct fields (the serial-vs-outage-block trap).
  - [x] Add `ranchId String?` + `ranch Ranch? @relation(...)` (Meter -> Ranch rollup membership).
  - [x] All new `Pump` columns are nullable or defaulted so the existing seed (which does not set them) keeps running.
- [x] **Task 5: Mirror the new union as a TS literal type** (AC: 3)
  - [x] In `src/lib/recommendations/types.ts`, add `export type PumpStatus = "GOOD" | "BAD" | "NEW WELL" | "OLD";` with a short doc comment. (coverageState is Story 1.3, not here.)
- [x] **Task 6: Run the migration toolchain and keep the auto-seed green** (AC: 4)
  - [x] Run `npm run db:migrate -- --name farm_inventory_ontology` (creates + applies + auto-seeds). Migration `20260609064639_farm_inventory_ontology` created and applied.
  - [x] Run `npm run db:generate` (ran as part of `migrate dev`; Prisma Client v6.19.3 regenerated).
  - [x] Auto-seed green with no edits required: `npm run db:seed` -> "Seeded Batth Farms: 183 meters, 6 entities, 57 accounts, 2196 bills, 13440 intervals." (`billingSerial` preserved by the additive migration).
  - [x] `npm run lint` (exit 0) and `npm test` (33 files / 198 tests pass) - both green; plus `npx tsc --noEmit` exit 0 for AC4's strict type-check.
- [x] **Task 7: Prove the new relations round-trip with a DB integration test** (AC: 1, 2, 4)
  - [x] Added `src/lib/farm/inventory-schema.db.test.ts` (a `*.db.test.ts`, node env) that takes an explicit `PrismaClient`, and within one test:
    - creates `Farm -> Entity(billingName, actualOwner) -> Account -> Ranch(cropId) -> Pump(ranchId, growerPumpId, isLegacy, status, cropId, isSolar, serialCode, rotatingOutageBlock)`,
    - creates a `SolarArray` (nameplateKw, trueUpMonth) and connects two `benefitingMeters`, then asserts the NEMA relation resolves both directions (`array.benefitingMeters` has 2; `pump.benefitingArrays` has 1),
    - asserts `ranch.pumps` and `pump.ranch` resolve, and `serialCode` is distinct from `rotatingOutageBlock`,
    - cleans up after itself (builds a throwaway tmpdir SQLite db via `prisma db push`, never touching `prisma/dev.db`, deletes the Farm to exercise cascade, and removes the tmpdir in `afterAll`).

### Review Findings

_Code review 2026-06-09 (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Auditor (full spec context): all 5 ACs PASS, zero High/Medium. No blocking defects. Both Hunter "High" flags dissolve into planned Story 1.2 deferrals._

- [x] [Review][Patch] Harden the db test to prove SetNull + independent m-n cleanup [src/lib/farm/inventory-schema.db.test.ts] — RESOLVED: added a second `it` ("honors SetNull relations and independent many-to-many deletes") that deletes one `SolarArray` (asserts the surviving Pump's `benefitingArrays` is empty), deletes a referenced Ranch (asserts `Pump.ranchId` becomes null and the Pump survives), deletes the meter-level Crop (asserts `Pump.cropId` null), and deletes the Entity (asserts `Account.entityId` null). Sources: edge(4)(5), blind(4).
- [x] [Review][Patch] Seed sets flat solar fields but not the new `isSolar` flag [prisma/batth-farm.ts:493] — RESOLVED: added `isSolar: solarKw != null` to the seed `pump.create`. Verified on the seeded db: `isSolar=true` count (2) now matches `solarKw`-set count (2). Source: edge(3).
- [x] [Review][Defer] billingSerial -> serialCode cutover [prisma/schema.prisma:106] — `serialCode` is born NULL and read/written by nothing; `billingSerial` stays the live field. By design: Story 1.2 owns populating `serialCode`, repointing `greenbutton/schedule.ts` + the importers, then dropping `billingSerial`. Sources: blind(High)(med2), edge(2).
- [x] [Review][Defer] Reconcile flat Pump solar fields onto SolarArray [prisma/schema.prisma:132-134] — `solarKw`/`nemType`/`trueUpMonth` remain on Pump alongside the new `SolarArray` (AR-2 "do not model solar as flat meter flags"); intentionally kept for now, collapse in Story 1.2/1.5. Source: blind(low3).
- [x] [Review][Defer] Mirror a NemType TS union [prisma/schema.prisma:291] — the new `SolarArray.nemType` (and pre-existing `Pump.nemType`) is union-like but unmirrored; add a `NemType` mirror once real NEM values settle in Story 1.5. Sources: auditor(low1), blind(low2).
- [x] [Review][Defer] Normalize `status` at the import boundary [prisma/schema.prisma:141] — the DB column is intentionally free-text `String?` (SQLite convention); Story 1.2's importer should coerce the spreadsheet's Status into the `PumpStatus` union. Sources: blind(low1), edge(7).
- [x] [Review][Defer] No CI test applies the committed migration.sql to a populated DB [project-wide] — every `*.db.test.ts` builds via `prisma db push` from schema, so the table-rebuild SQL is exercised only by the live `prisma migrate dev` run. Pre-existing convention, not caused by this change. Sources: edge(1)(6), blind(med3).

## Dev Notes

### Critical Guardrails (prevent the disasters specific to this story)

1. **Never name the solar model `Array`.** A Prisma `model Array` generates a `prisma.array` accessor and a generated TS type `Array` that shadows the JavaScript global `Array<T>`. Under `strict` + no-`any` this produces confusing type errors across the codebase. Use **`SolarArray`**. If you ever need the physical table to be named `Array`, use `@@map("Array")` - but you do not need that here.
2. **This migration must be purely additive and non-breaking.** `npm run db:migrate` auto-seeds (`prisma/batth-farm.ts` -> `seedBatthFarm`). Every new column is nullable or has a `@default`, so the seed's existing `create` calls stay valid. Do not add a required column without a default, and do not rename a column the seed writes (`name`, `serviceId`, `meterSerial`, `rateSchedule`, `billingSerial`, `location`, `horsepower`, `gpm`, `kind`, `latitude`, `longitude`, `solarKw`, `nemType`, `trueUpMonth`, `farmId`, `accountId`, `blocks`).
3. **Do NOT rename `billingSerial`.** It is read/written in ~20 sites that later stories rewrite: `src/lib/greenbutton/schedule.ts` (cycle lookup), `src/lib/spreadsheet/inventory.ts`, `src/lib/onboarding/{farm,vision,spreadsheet*}.ts`, `src/app/dashboard/pump-timing/onboarding/**`, and `prisma/{batth-farm,sample-farm}.ts`. Add `serialCode` as the new canonical field; `billingSerial` stays as a deprecated duplicate that Story 1.2 collapses. (See Project Structure Notes.)
4. **Union/enum-like fields stay `String`, mirrored in TS.** SQLite has no enums (project-context lock). The new `status` field is a `String` column; mirror its allowed values in `src/lib/recommendations/types.ts` as `PumpStatus`. Do not introduce a Prisma `enum`.
5. **Do not touch `next.config.ts` / `outputFileTracingIncludes`.** That is for new runtime-read fixtures (the tariff card and meter-read schedule in Epic 3). This story adds no runtime fixture.

### Existing schema - current state of the files you are modifying

`prisma/schema.prisma` already models the hierarchy partially. Read it fully before editing. Relevant current state:

- **`Farm`** has relations: `blocks`, `pumps`, `entities`, `accounts`, `people`, `connections`, `recommendations`. You will add `ranches` and `solarArrays`.
- **`Entity`** = `{ id, name, farmId, accounts[] }`. You add `billingName?`, `actualOwner?`.
- **`Account`** (PG&E account) = `{ id, number, farmId, entityId?, pumps[] }`. Unchanged this story (the Auth.js `Account` table is a separate, deferred model - Story 5.1; note the future name collision but do not act on it now).
- **`Block`** = farm-scoped, m-n with `Pump`, has `cropId?`. The seed comment calls these "Ranches (Blocks)". Leave it untouched - see Project Structure Notes.
- **`Pump`** (the Meter) already carries: `serviceId` (= SA ID), `meterSerial` (= meter #), `rateSchedule`, `billingSerial`, `location`, `horsepower`, `fuel`, `accountId`, `kind`, `powerSource`, `latitude`, `longitude`, `gpm`, `nemType`, `trueUpMonth`, `solarKw`, m-n `blocks`, `intervals`, `billingPeriods`. It has a `@@unique([farmId, serviceId])`. You ADD: `growerPumpId?`, `isLegacy`, `status?`, `cropId?`+`crop`, `isSolar`, `serialCode?`, `rotatingOutageBlock?`, `ranchId?`+`ranch`, plus the `benefitingArrays` side of the NEMA relation. **Pump has no existing `status` field** - confirmed no collision.
- **`Crop`** = `{ id, name @unique, cropCoefficient?, blocks[] }`. You ADD `pumps Pump[]` and `ranches Ranch[]`.
- **`BillingPeriod`** already exists with `start`, `close`. The distinct **actual** `cycleClose` date is Story 1.3 - do not add it here.

What this story changes vs. preserves: it is **additive only**. No existing column is renamed or dropped; no existing relation is altered. The migration SQL Prisma generates for SQLite uses table-rebuild blocks (`new_Pump` ... `INSERT INTO ... SELECT`) - that is normal for SQLite column adds; verify the generated `INSERT ... SELECT` carries every pre-existing column forward (Prisma handles this, but eyeball the generated `migration.sql` to confirm no column is dropped).

### Concrete schema sketch (recommended shapes)

```prisma
model Ranch {
  id        String   @id @default(cuid())
  name      String
  farmId    String
  cropId    String?
  acreage   Float?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  farm  Farm   @relation(fields: [farmId], references: [id], onDelete: Cascade)
  crop  Crop?  @relation(fields: [cropId], references: [id])
  pumps Pump[] // meters grouped under this ranch (the rollup level)

  @@index([farmId])
}

model SolarArray {
  id          String   @id @default(cuid())
  name        String?
  nameplateKw Float    // array nameplate, e.g. 840 or 1092
  nemType     String?  // "nem2" | "nem2_agg"
  trueUpMonth Int?     // per-array annual true-up month (1-12)
  saId        String?  // the generating meter's SA ID
  farmId      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  farm             Farm   @relation(fields: [farmId], references: [id], onDelete: Cascade)
  benefitingMeters Pump[] @relation("NemAllocation") // NEMA: meters this array's credits offset

  @@index([farmId])
}
```

On `Pump`, add (nullable / defaulted):

```prisma
  growerPumpId      String?  // grower's "P0xx" Pump ID descriptor (Story 1.6 joins on it)
  isLegacy          Boolean  @default(false) // legacy AG-4/AG-5 schedule flag
  status            String?  // "GOOD" | "BAD" | "NEW WELL" | "OLD" (mirrored as PumpStatus)
  cropId            String?
  isSolar           Boolean  @default(false)
  serialCode        String?  // canonical billing-cycle letter (supersedes billingSerial; see notes)
  rotatingOutageBlock String? // distinct from serialCode (the trap)
  ranchId           String?
  // relations
  crop              Crop?        @relation(fields: [cropId], references: [id])
  ranch             Ranch?       @relation(fields: [ranchId], references: [id])
  benefitingArrays  SolarArray[] @relation("NemAllocation")
```

On `Entity`, add: `billingName String?` and `actualOwner String?`.
On `Farm`, add: `ranches Ranch[]` and `solarArrays SolarArray[]`.
On `Crop`, add: `pumps Pump[]` and `ranches Ranch[]`.

### Project Structure Notes

- **`Ranch` vs `Block`.** The architecture's ontology is Entity -> Account -> Ranch -> Meter, but the current schema uses `Block` (farm-scoped, m-n with Pump) as the de-facto ranch grouping (the seed literally comments "Ranches (Blocks)"). This story adds the real `Ranch` rollup as a **farm-scoped grouping that meters point to via `ranchId`** and intentionally does **not** nest Ranch strictly under `Account` (a ranch can hold meters from more than one account; `Pump.accountId` already carries the billing link, and Story 2.6 filters by ranch independently). `Block` is left intact because the auto-seed and the m-n served-block concept depend on it. **Variance to flag for Story 1.2:** the real spreadsheet importer must decide whether `Block` is retired/merged into `Ranch` once real ranch data lands. Do not resolve that here.
- **`billingSerial` -> `serialCode` deprecation.** Adding `serialCode` while keeping `billingSerial` leaves two synonymous columns temporarily. This is deliberate for a non-breaking foundation migration. The reconciliation (point the spreadsheet importer at `serialCode`, repoint `greenbutton/schedule.ts`, and drop `billingSerial`) belongs to **Story 1.2**, which owns the new importer. Document this with an inline `// deprecated: collapsing into serialCode in Story 1.2` comment on `billingSerial`.
- **Future `Account` name collision (do not act now).** Auth.js v5's `@auth/prisma-adapter` wants a model named `Account`. The schema already has a PG&E `Account`. Story 5.1 resolves this (likely mapping the auth table). Out of scope here; noted so you do not pre-emptively rename anything.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1] - user story + the five acceptance criteria verbatim.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data model (Prisma v6 / SQLite, evolved)] (lines 279-291) - Ranch, Array->benefiting-meter (NEMA) + per-array trueUpMonth, serialCode/rotatingOutageBlock distinct, union-as-String lock; BillingLineItem/coverageState/Auth explicitly later.
- [Source: _bmad-output/planning-artifacts/epics.md#FR-1] - each Meter carries SA ID, Pump ID, rate schedule (never inferred), legacy flag, lat/long, GPM, crop, solar flag, status; Array links to its Benefiting Meters (NEMA).
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-06-08.md] (lines 230-233) - incremental table creation: inventory entities -> Story 1.1; billing tables -> Story 1.3; Auth tables -> Story 5.1.
- [Source: _bmad-output/project-context.md#Prisma / data model] - Prisma pinned v6; union fields are `String` mirrored in `src/lib/recommendations/types.ts`; DB edges take an explicit `PrismaClient`; synthetic Batth seed is disposable; `isDemo` + `dashboardFarm()` unchanged.
- [Source: prisma/schema.prisma] - the file being edited (current state documented above).
- [Source: prisma/batth-farm.ts] (`seedBatthFarm`, lines 328-507) - the auto-seed that must keep running; Pump.create at ~480-500 sets `billingSerial`.

### Technical Requirements (dev agent guardrails)

- **Stack (do not change):** Next.js 16.2.7 / React 19 / TS `strict` + `noUncheckedIndexedAccess` + no-`any`; **Prisma `^6.19.3` pinned to v6** (classic `url = env(...)`; do NOT move to v7); SQLite (`prisma/dev.db` via `DATABASE_URL`); tsx runs the seed (resolves `@/`). [Source: project-context.md#Technology Stack]
- **After editing `prisma/schema.prisma`, run `db:generate`** so the client matches (AC4). The migrate command auto-seeds.
- **TS rules that will bite:** no `any` is an ESLint **error**; `noUncheckedIndexedAccess` makes indexed access `T | undefined`. In the new db test, guard array/`findFirst` results before use; do not `!`-assert to silence it.
- **Testing tiers:** `*.db.test.ts` = Prisma integration (the tier this story uses), runs in the **node** env; takes an explicit `PrismaClient`; must clean up after itself. Run `npm test`. [Source: project-context.md#Testing Rules]
- **Layered boundaries:** schema/migration/seed live under `prisma/`; the TS union mirror lives in `src/lib/recommendations/types.ts`; the db test lives under `src/lib/farm/`. No UI or `/lib/energy` changes in this story.

### Git / recent-work context

Recent commits (`fec7fe3`, `d3eaf4e`, `1c636a0`, `518bcd0`, `0a61106`) are typography (Inter) and BMAD planning-doc work - none touch the schema. This is the first implementation story of the rebuild; there is no prior story to inherit code patterns from. Follow the existing schema's conventions (cuid ids, `createdAt`/`updatedAt`, `@@index([farmId])`, `onDelete: Cascade` to `Farm`, `SetNull` for soft links).

### Latest tech notes

- Prisma 6 + SQLite: column adds are emitted as table-rebuild migrations (`new_<Model>` + `INSERT ... SELECT`). Many-to-many relations create an implicit join table (`_NemAllocation`); the explicit `@relation("NemAllocation")` name on **both** sides is required for Prisma to pair them - omitting the name on one side is the usual mistake. Nullable columns and `@default` columns are safe to add to a populated SQLite table.
- No web dependency for this story; everything is local schema + generated client.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx prisma validate` / `prisma format` -> schema valid.
- `npm run db:migrate -- --name farm_inventory_ontology` -> created + applied `20260609064639_farm_inventory_ontology`; Prisma Client v6.19.3 regenerated.
- `npm run db:seed` -> "Seeded Batth Farms: 183 meters, 6 entities, 57 accounts, 2196 bills, 13440 intervals. Engine: 10 recommendations."
- `npx vitest run src/lib/farm/inventory-schema.db.test.ts` -> 1 file / 1 test pass.
- `npm run lint` -> exit 0. `npm test` -> 33 files / 198 tests pass. `npx tsc --noEmit` -> exit 0.

### Completion Notes List

- Implemented the inventory ontology as a purely additive Prisma migration: new `Ranch` and `SolarArray` models, two new `Entity` columns (`billingName`, `actualOwner`), and the meter-level inventory attributes on `Pump`.
- The generated `migration.sql` confirms additivity: `Entity` gets two `ADD COLUMN`s; `Ranch`/`SolarArray`/`_NemAllocation` are new tables; the SQLite `Pump` table-rebuild's `INSERT ... SELECT` carries forward all 21 pre-existing columns (including `billingSerial`) - no column dropped, no data loss.
- Solar model named **`SolarArray`** (never `Array`) to avoid shadowing the JS global `Array<T>`; NEMA is an explicit named many-to-many (`@relation("NemAllocation")`), generating the `_NemAllocation` join table.
- Followed the additive `serialCode` decision: `serialCode` + `rotatingOutageBlock` added as new distinct fields; `billingSerial` left in place with a `deprecated:` comment for Story 1.2 to collapse. No edits to the ~20 existing `billingSerial` sites, so no regression in current onboarding/spreadsheet/greenbutton code.
- New `status` field mirrored as `PumpStatus = "GOOD" | "BAD" | "NEW WELL" | "OLD"` in `src/lib/recommendations/types.ts` (String column + TS union, no Prisma enum - SQLite/project-context lock).
- AC5 honored: no Auth tables (User/Account(auth)/Session/VerificationToken) and no billing tables (BillingLineItem/cycleClose/coverageState) added - inventory entities only.
- The existing `Block` model is untouched (the auto-seed and m-n served-block concept still use it). Whether `Block` merges into `Ranch` is flagged for Story 1.2 (see Project Structure Notes).
- The auto-seed needed zero edits: it still writes `billingSerial`, which the additive migration preserves.

### File List

- `prisma/schema.prisma` (modified) - Farm back-relations; Entity `billingName`/`actualOwner`; Pump inventory attributes + `crop`/`ranch`/`benefitingArrays` relations + `serialCode`/`rotatingOutageBlock`; Crop `ranches`/`pumps` back-relations; new `Ranch` and `SolarArray` models.
- `prisma/migrations/20260609064639_farm_inventory_ontology/migration.sql` (new) - the generated additive migration.
- `src/lib/recommendations/types.ts` (modified) - added `PumpStatus` union.
- `src/lib/farm/inventory-schema.db.test.ts` (new) - round-trip integration test for the new relations.

## Change Log

- 2026-06-08: Implemented Story 1.1 - evolved the Prisma schema to the farm inventory ontology (Ranch, SolarArray/NEMA graph, Entity billingName/actualOwner, meter inventory attributes incl. serialCode/rotatingOutageBlock, PumpStatus union). Additive migration; auto-seed green; lint + 198 tests + tsc all pass. Status -> review.
- 2026-06-09: Code review (3 adversarial layers). All 5 ACs PASS, zero High/Medium. Applied 2 patches: hardened the db test with a SetNull + independent-m-n-delete case; added `isSolar: solarKw != null` to the seed for solar-flag consistency. 5 items deferred to Story 1.2/1.5 (see Review Findings + deferred-work.md). lint + 199 tests + tsc all green. Status -> done.
