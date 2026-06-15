---
baseline_commit: 54206ad6fd3801fe1316f22d3541f1e6eed4fe0e
---

# Story 1.2: Import the master spreadsheet into the inventory

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grower,
I want my master spreadsheet loaded so every meter I own appears, organized by my entities and ranches with my real pump names,
so that I see my whole operation in one correct place on day one, before any billing.

## Acceptance Criteria

1. **Given** a master spreadsheet with 7 billing-name variants, **When** imported, **Then** they dedupe to 6 Entities and typo'd duplicates collapse to the true Entity.

2. **Given** the 183 meter rows, **When** imported, **Then** all 183 load organized Entity -> Account -> Ranch -> Meter, each carrying real name (Existing descriptor), Pump ID, SA ID, rate schedule (as read), legacy flag, lat/long, GPM, crop, solar flag, status.

3. **Given** solar meters with NEMA codes, **When** imported, **Then** each Array links to its Benefiting Meters (not flat flags), with per-array true-up.

4. **Given** a meter's rate schedule, **When** imported, **Then** the value present in the sheet is stored verbatim and never inferred or computed.

5. **Given** the importer, **When** invoked, **Then** it takes an explicit `PrismaClient` argument and is covered by a `*.db.test.ts` that cleans up after itself.

### AC interpretation notes (read before coding)

This story does NOT start from a blank importer. A working pure parser (`src/lib/spreadsheet/inventory.ts`) and a working DB edge (`src/lib/onboarding/farm.ts` -> `importInventory` / `connectSpreadsheet`) already exist and are green. Story 1.2 **evolves them** to populate the full ontology that Story 1.1 added to the schema, and resolves four items 1.1 deferred to this story. Do not rewrite from scratch; do not duplicate the parser.

- **AC1 "dedupe to 6 Entities, typo'd duplicates collapse":** the current `resolveEntity` matches Entities by exact `name`. That cannot collapse a typo. Replace exact-name matching with a **deterministic canonical key** (a pure, tested helper) so two billing-name spellings of one owner resolve to one Entity. Do NOT fuzzy-guess (NFR-4 forbids fabrication); the collapse must be a documented, deterministic normalization. Populate the new `Entity.billingName` (first-seen as-printed variant) and `Entity.actualOwner` (the canonical owner). See Task 2 for the exact normalization rules.
- **AC2 "183 ... Entity -> Account -> Ranch -> Meter":** the current importer links meters to `Block` (via `blockName`), not the new `Ranch` rollup. This story creates `Ranch` rows from the sheet and sets `Pump.ranchId`. **Keep the existing Block linkage in place** (the auto-seed, the served-block m-n, and `saveConfirmation` still depend on `Block`) - add Ranch alongside it; do not delete Block. The literal "183" is satisfied by the importer landing every row of the representative 183-row fixture you build in Task 1; the *real* 183-meter Batth export is loaded later in Story 1.8.
- **AC2 "Pump ID", "legacy flag", "crop", "solar flag", "status":** these are the new Story-1.1 columns (`growerPumpId`, `isLegacy`, `cropId`, `isSolar`, `status`) that the current parser/importer does NOT yet read or write. Add them. "Pump ID" is the grower's `P0xx` descriptor (`growerPumpId`), distinct from the Pump **Name** the sheet already maps.
- **AC2 "status":** this is the **FR-17 pump-health** value (`"GOOD" | "BAD" | "NEW WELL" | "OLD"`, mirrored as `PumpStatus`), NOT the pump/non_pump `kind`. **The current parser conflates them** - `KIND_ALIASES` includes `"status"` and the sample fixture's `Status` column holds `pump`/`non_pump`. You MUST split these (Task 3). This is the single most error-prone part of the story.
- **AC3 "each Array links to its Benefiting Meters (not flat flags)":** create `SolarArray` rows and connect `benefitingMeters` via the NEMA relation Story 1.1 added. The current importer only writes the flat `solarKw`/`nemType`/`trueUpMonth` fields on the meter. Keep writing those (back-compat) AND build the `SolarArray` graph (the canonical home per AR-2).
- **AC4 "rate schedule ... stored verbatim, never inferred":** already honored by the current parser (`rateSchedule` is `cleanText`, no inference). Preserve that. Note: deriving `isLegacy` from the verbatim rate is a *classification of the stored value*, not inference of the rate itself, and is allowed (Task 4).
- **AC5:** `importInventory(prisma, ...)` already takes an explicit `PrismaClient` - keep that. Evolve the existing `src/lib/onboarding/spreadsheet.db.test.ts` to assert the new ontology (it already cleans up via a throwaway tmpdir SQLite db).

## Tasks / Subtasks

- [x] **Task 1: Build the representative 183-row Batth master-spreadsheet fixture** (AC: 1, 2, 3)
  - [x] Create `fixtures/spreadsheet/batth-master.csv` - a synthetic, disposable (per project-context: the Batth seed is placeholder) master list shaped to the real Batth footprint, sized to **183 meter rows**. It MUST exercise every AC:
    - **6 entities under 7 billing-name variants:** include exactly one owner that appears under two billing-name spellings that differ only by a typo/punctuation/case/legal-suffix variation (e.g. `Batth Farms LLC` and `Batth Farms, LLC.`), so the 7 -> 6 collapse is provable. The other 5 owners appear once each.
    - **~57 accounts**, each owned by one entity; ranches grouping meters (Entity -> Account -> Ranch -> Meter). A ranch may span more than one account (do not nest Ranch strictly under Account).
    - **2 solar arrays (840 kW and 1,092 kW)** with NEMA codes, each linked to its benefiting meters (multiple meters per array; at least one meter benefiting from an array different from the one on its own row, to prove the many-to-many).
    - **>=27 legacy meters** on AG-4/AG-5 family rates; the rest on current AG-A/B/C and a few non-ag (B-1, etc.).
    - All four **status** values (`GOOD`, `BAD`, `NEW WELL`, `OLD`) present, plus some rows with a blank status.
    - **crop** values, `growerPumpId` (`P001`...), and some rows with missing optional fields (no lat/long, no GPM) so partial rows are exercised.
  - [x] Header row uses grower-style spellings the alias sets must tolerate (e.g. `Legal Entity`, `Acct #`, `SA ID`, `Pump ID`, `Pump Name`, `Rate Schedule`, `Cycle Code`, `Crop`, `Legacy`, `Status`, `Kind`, `NEMA`, `Array kW`, `True-Up Month`, `Ranch`).
  - [x] This fixture is read only inside tests (Vitest), so it does NOT need `outputFileTracingIncludes` and does NOT need `process.cwd()` runtime handling. Read it in the test via the existing `repoRoot` + `readFileSync` pattern (see `inventory.test.ts`).

- [x] **Task 2: Entity dedupe by deterministic canonical key + populate billingName/actualOwner** (AC: 1)
  - [x] Add a pure helper in `src/lib/spreadsheet/` (e.g. `entity.ts` with a colocated `entity.test.ts`): `canonicalEntityKey(name: string): string`. Rules (apply in order): trim; collapse internal whitespace to one space; uppercase; replace `&` with `AND`; remove commas and periods; normalize trailing legal suffixes to a single token (`L.L.C.`/`LLC` -> `LLC`; `INC`/`INC.`/`INCORPORATED` -> `INC`; `CORP`/`CO` -> `CORP`; leave `PARTNERSHIP`/`LP`/`LLP` recognizable). Two billing-name variants of one owner MUST produce the same key.
  - [x] Add a companion `displayOwner(name: string): string` (or return both from one function) that yields a clean, human-readable canonical owner for `actualOwner` (Title-cased, single legal suffix), distinct from the raw key.
  - [x] In `importInventory`, change `resolveEntity` to key the in-transaction cache and the `entity.findFirst` lookup on the canonical key (store/lookup against `actualOwner`, not `name`). On first sight of a key: create the Entity with `name` = the as-printed billing name (keep `name` populated for back-compat with existing readers), `billingName` = the as-printed variant, `actualOwner` = `displayOwner(...)`. On a later variant with the same key: reuse the existing Entity (the collapse), do not overwrite `billingName`.
  - [x] Unit-test `canonicalEntityKey` directly in `entity.test.ts` (pure `*.test.ts`): the 7->6 collapse case, the legal-suffix and `&`/`AND` normalizations, and that two genuinely-different owners do NOT collapse.

- [x] **Task 3: Split the `Status` (pump health) field from `kind` (pump/non_pump)** (AC: 2)
  - [x] In `inventory.ts`: add `status: PumpStatus | null` to `InventoryRow` (import `PumpStatus` from `@/lib/recommendations/types`). Add an alias set for the health column (`status`, `pumpstatus`, `condition`, `health`, `wellstatus`) and a coercion `toPumpStatus(v)` that case-insensitively maps to the union (`"GOOD"`, `"BAD"`, `"NEW WELL"` (also accept `NEW`, `NEW_WELL`, `NEWWELL`), `"OLD"`); anything unrecognized -> `null` (never fabricate a status).
  - [x] **Remove `"status"` from `KIND_ALIASES`** so `Status` no longer feeds `kind`. Source pump/non_pump `kind` from a dedicated column (`kind`, `type`, `metertype`, `use`, `category`) and keep the existing `toKind` non-pump detection (office/shop/solar-only). Default `kind` to `"pump"` when no kind column exists.
  - [x] Update `fixtures/spreadsheet/sample-batth.csv`: its `Status` column currently holds `pump`/`non_pump`. Rename that column to `Kind` (so it feeds `kind`) and add a real `Status` column with health values, so the small fixture matches the new semantics.
  - [x] Update `src/lib/spreadsheet/inventory.test.ts`: the assertion `reads the status column into kind` must change - `Status` now feeds pump health; `Kind`/`Type` feeds the pump/non_pump split. Add a case asserting `status` coerces to the `PumpStatus` union and that an unknown status -> `null`.

- [x] **Task 4: Add the remaining new inventory fields to the parser** (AC: 2, 4)
  - [x] Add to `InventoryRow` and the alias map: `growerPumpId` (aliases `pumpid`, `pumpno`, `pump`, `pumpiddescriptor`, `p0xx`), `isLegacy` (`boolean`), `cropName` (`crop`, `croptype`, `commodity`), `isSolar` (`boolean`), `rotatingOutageBlock` (`rotatingoutageblock`, `outageblock`, `rotatingblock`). Rename the parser's `billingSerial` field to `serialCode` (aliases unchanged - keep `serialcode`, `billingserial`, `cyclecode`, `billingcycle`, `meterreadcode`, `serial`, `cycle`).
  - [x] `isLegacy`: read an explicit `Legacy` column if present (truthy: `yes`/`true`/`1`/`legacy`), **else derive** from the verbatim `rateSchedule` matching `/^\s*AG-?\s*[45]/i` (AG-4 / AG-5 family). This is a classification of the stored rate, not inference of the rate value (AC4 preserved). Put the derivation in a small pure helper with a test.
  - [x] `isSolar`: explicit `Solar` column if present, else `true` when any of `solarKw`, `nemType`, or a NEMA/array code is present (mirrors the Story-1.1 seed convention `isSolar: solarKw != null`).
  - [x] `cropName`: keep verbatim text; the importer creates `Crop` by unique name and links `Pump.cropId`.
  - [x] Do NOT infer or normalize `rateSchedule` itself - store it exactly as read (AC4).

- [x] **Task 5: Evolve `importInventory` to persist the full ontology** (AC: 2, 3, 5)
  - [x] Add a `resolveRanch(name)` resolver (mirrors `resolveBlock`: cache + `ranch.findFirst({ where: { farmId, name } })` + create) and set `Pump.ranchId`. Keep the existing `resolveBlock`/`blocks.connect` as-is (do not remove Block).
  - [x] Add a `resolveCrop(name)` resolver: `crop.upsert` by unique `name` (Crop.name is `@unique` globally - not farm-scoped; reuse an existing crop row), set `Pump.cropId`.
  - [x] Extend the shared `fields` object written on create/update with: `growerPumpId`, `isLegacy`, `status`, `isSolar`, `serialCode`, `rotatingOutageBlock`, `cropId`, `ranchId`. Keep the `?? undefined` convention so a sheet that omits a column does not clobber an existing value on re-import.
  - [x] **serialCode cutover (scoped):** the parser now produces `serialCode`. Write it to `Pump.serialCode`. **Also keep `Pump.billingSerial` in sync** (write the same value to both) so the ~20 untouched readers - `greenbutton/schedule.ts` callers, the dormant Bayou/onboarding paths, the seed - keep working with zero regression. Do NOT drop the `billingSerial` column and do NOT rewrite those dormant call sites in this story (that full cutover is deferred - see Dev Notes "Deferred / scope boundary"). Update `deferred-work.md` to reflect that 1.2 populated `serialCode` and kept `billingSerial` in sync, leaving the column-drop + dormant-site repoint for a later cleanup (Epic 5 rewrites onboarding anyway).
  - [x] Build the `SolarArray` graph: collect distinct arrays from the rows (keyed by the NEMA/array code, carrying `nameplateKw` from `Array kW`/`solarKw`, `nemType`, per-array `trueUpMonth`, and `saId` = the generating meter's SA ID where the sheet marks it). Create one `SolarArray` per distinct array, then connect each benefiting meter via the `benefitingMeters`/`benefitingArrays` NEMA relation (`{ benefitingArrays: { connect: { id } } }` on the Pump, or connect from the SolarArray side). A meter may benefit from more than one array. Keep writing the flat `Pump.solarKw`/`nemType`/`trueUpMonth` for back-compat.
  - [x] Extend `InventoryImportResult` with `ranches: number` and `arrays: number`; set them from the resolver caches.

- [x] **Task 6: Evolve the DB integration test** (AC: 1, 2, 3, 4, 5)
  - [x] Point `src/lib/onboarding/spreadsheet.db.test.ts` at the new `fixtures/spreadsheet/batth-master.csv` (keep a small case on `sample-batth.csv` if useful, but the ontology assertions run against the 183-row fixture).
  - [x] Assert: all 183 pumps load; exactly 6 entities exist from the 7 billing-name variants and the two variant spellings collapsed to one Entity (look up by `actualOwner`, assert one row, assert its `billingName` is the first-seen variant); accounts link to entities; pumps carry `ranchId`, `growerPumpId`, `isLegacy` (>=27 true), `status` in the `PumpStatus` union, `isSolar`, `serialCode` (and `billingSerial` mirrors it).
  - [x] Assert the NEMA graph round-trips both directions: a `SolarArray` resolves its `benefitingMeters`, and a benefiting `Pump.benefitingArrays` resolves its array(s); per-array `trueUpMonth` is set.
  - [x] Assert `rateSchedule` is stored verbatim (e.g. a legacy `AG-5B` row keeps `AG-5B`).
  - [x] Assert idempotency: re-importing the same fixture creates 0 new pumps/entities/ranches/arrays and updates in place (the current test already does this for pumps/entities - extend to ranches + arrays).
  - [x] The test already builds a throwaway tmpdir SQLite db via `prisma db push` and cleans up in `afterAll` - keep that harness (AC5).

- [x] **Task 7: Validate the toolchain stays green** (AC: 4, 5)
  - [x] `npm run lint` (exit 0; no-`any` is an error), `npm test` (all files green - watch for the changed `inventory.test.ts` and `spreadsheet.db.test.ts`), and `npx tsc --noEmit` (exit 0 under strict + `noUncheckedIndexedAccess`).
  - [x] Run `npm run db:seed` to confirm the auto-seed still runs (you did not touch the schema, but you changed `serialCode`/`billingSerial` write behavior in the importer, not the seed - verify the seed is unaffected).
  - [x] No schema change is expected in this story (Story 1.1 already added every column you write). If you find you need a new column, STOP - that is a sign of scope creep; re-read the schema (every field you need already exists).

## Dev Notes

### What you are changing vs preserving (read the files first)

You are touching live code paths, not greenfield. Read these before editing:

- **`src/lib/spreadsheet/inventory.ts`** (pure parser, CSV text -> `InventoryRow[]`). Current state: maps a forgiving alias set; produces `serviceId`, `meterSerial`, `name`, `accountNumber`, `entityName`, `rateSchedule`, `billingSerial`, `location`, lat/long, `gpm`, `horsepower`, `nemType`, `trueUpMonth`, `solarKw`, `kind`, `blockName`. Pure and unit-tested. You ADD the new fields and SPLIT status/kind here.
- **`src/lib/onboarding/farm.ts`** -> `importInventory` (lines ~199-310) and `connectSpreadsheet` (lines ~317-328). This is the DB edge (takes an explicit `PrismaClient`, runs in one `prisma.$transaction`). Current resolvers: `resolveEntity` (exact name), `resolveAccount` (upsert by `farmId_number`), `resolveBlock`. Matches an existing meter by SA ID then physical serial (so re-import merges, never dupes). You evolve the resolvers + the `fields` object here. **Keep it in `farm.ts`** - it is coupled to `createFarmFromConnection`/`summarize` and the existing db test; do not move it to a new file (avoid churn; a future move to `lib/spreadsheet/import.ts` is a separate cleanup).
- **`src/lib/onboarding/spreadsheet.db.test.ts`** - the existing integration test; evolve it (Task 6).
- **`src/lib/spreadsheet/inventory.test.ts`** - the existing pure test; update the status/kind assertions (Task 3).
- **`prisma/schema.prisma`** - READ ONLY this story. Every field you write (`growerPumpId`, `isLegacy`, `status`, `isSolar`, `serialCode`, `rotatingOutageBlock`, `cropId`, `ranchId`, `Entity.billingName`/`actualOwner`, `SolarArray` + `benefitingMeters`/`benefitingArrays`, `Ranch`) already exists from Story 1.1. Confirm the exact relation names: the NEMA relation is `@relation("NemAllocation")` (`SolarArray.benefitingMeters` <-> `Pump.benefitingArrays`); `Pump.ranch` is `Ranch?` (`onDelete: SetNull`); `Crop.name` is globally `@unique`.

**End-to-end working system requirement:** the existing onboarding flow, the auto-seed, and the dormant Bayou/Green Button paths must all still work after this change. That is why `billingSerial` stays written-in-sync and `Block` stays linked. A green `npm test` + `npm run db:seed` is the proof.

### Critical guardrails (the disasters specific to this story)

1. **The `Status` vs `kind` trap.** The current parser treats a `Status` column as pump/non_pump (`KIND_ALIASES` has `"status"`). FR-17 needs `Status` = pump **health** (`GOOD|BAD|NEW WELL|OLD`). If you do not split these, every real Batth row (whose Status is health) will be misread as a kind. Split them (Task 3), fix the sample fixture, and fix the test that asserts the old behavior.
2. **Entity collapse must be deterministic, never fuzzy.** AC1 says typo'd variants collapse, but NFR-4 forbids fabrication. Use a documented `canonicalEntityKey` normalization, not similarity scoring. If a real variant does not collapse under the rules, that is correct behavior (surface it), not a bug to paper over with fuzzy matching.
3. **Do not model solar as flat flags only (AR-2).** AC3 explicitly wants the `Array -> benefiting-Meter` graph. Build `SolarArray` + connect `benefitingMeters`. The flat `solarKw`/`nemType`/`trueUpMonth` stay for back-compat but are not sufficient on their own.
4. **`rateSchedule` is stored verbatim (AC4 / NFR-3 / project-context).** Never infer, normalize, or "correct" it. `isLegacy` derivation reads the stored rate but does not change it.
5. **No schema migration in this story.** Every column exists. If you reach for `db:migrate`, you have misread the schema.
6. **TS rules that will bite:** no-`any` is an ESLint *error*; `noUncheckedIndexedAccess` makes `grid[r]`, `findFirst`, and array access `T | undefined` - guard before use, do not `!`-assert. The parser already uses `grid[0]!` patterns inside a length guard; follow that style.
7. **`Crop.name` is globally unique, not farm-scoped.** Use `crop.upsert({ where: { name } })` so two farms (or the seed + an import) sharing a crop name reuse the row rather than colliding.

### Concrete shapes (recommended)

`InventoryRow` additions (in `inventory.ts`):

```ts
import type { PumpStatus } from "@/lib/recommendations/types";

export type InventoryRow = {
  // ...existing fields...
  serialCode: string | null;          // was billingSerial; same aliases
  rotatingOutageBlock: string | null; // kept distinct from serialCode (the trap)
  growerPumpId: string | null;        // the "P0xx" descriptor, distinct from name
  isLegacy: boolean;                   // explicit column, else derived from rate
  isSolar: boolean;                    // explicit column, else solar/NEM present
  status: PumpStatus | null;           // FR-17 pump health, coerced to the union
  cropName: string | null;             // -> Crop.upsert -> Pump.cropId
  nemaCode: string | null;             // array/aggregation key -> SolarArray
  arrayKw: number | null;              // per-array nameplate (Array kW), else solarKw
  // kind now comes ONLY from a kind/type/use column, never from Status
};
```

`importInventory` resolver additions (in `farm.ts`), alongside the existing entity/account/block resolvers:

```ts
const ranchIdByName = new Map<string, string>();
const cropIdByName = new Map<string, string>();
const arrayIdByKey = new Map<string, string>();
// resolveEntity now keys on canonicalEntityKey(...) and writes billingName/actualOwner
// resolveRanch mirrors resolveBlock; resolveCrop uses crop.upsert({ where: { name } })
// after the meter loop: create one SolarArray per arrayIdByKey, connect benefitingMeters
```

### Previous story intelligence (Story 1.1, done 2026-06-09)

Story 1.1 evolved the schema and explicitly handed four items to THIS story (see `deferred-work.md` and 1.1's Review Findings):

- **billingSerial -> serialCode cutover.** 1.1 added `serialCode` (currently NULL, read/written by nothing) and left `billingSerial` as the live field across ~20 sites. 1.1's note says 1.2 "owns: populate `serialCode`, repoint readers/writers off `billingSerial`, then drop `billingSerial`." **Scope decision for this story:** populate `serialCode` in the new importer and keep `billingSerial` in sync; do NOT drop the column or rewrite the dormant call sites now (see "Deferred / scope boundary"). This satisfies the spirit (serialCode is now populated and canonical for new imports) without a high-risk rewrite of dormant code that Epic 5 rewrites anyway.
- **Normalize `status` at the import boundary.** 1.1 says the importer "should coerce the spreadsheet's Status into the `PumpStatus` union rather than passing arbitrary strings through." That is Task 3's `toPumpStatus`.
- **Reconcile flat Pump solar fields onto `SolarArray`.** Build the SolarArray/NEMA graph (Task 5). 1.1 deliberately left `solarKw`/`nemType`/`trueUpMonth` on `Pump`; keep them (back-compat) and add the graph.
- **Block vs Ranch.** 1.1 explicitly deferred to 1.2 the decision of whether `Block` retires into `Ranch`. **Decision:** do NOT retire Block in this story. Add `Ranch` as the new rollup the dashboard reads (`Pump.ranchId`), keep `Block` for the seed / served-block m-n / `saveConfirmation`. Full retirement is a later cleanup.
- 1.1's `NemType` TS-union mirror is deferred to Story 1.5 (real NEM values) - do NOT add it here.

1.1's working patterns to reuse: additive-only changes; explicit `PrismaClient` into the edge; `*.db.test.ts` builds a throwaway tmpdir SQLite via `prisma db push --skip-generate --accept-data-loss` and cleans up in `afterAll`; the auto-seed must stay green (`npm run db:seed`). 1.1 used `claude-opus-4-8[1m]`.

### Git / recent-work context

Recent commits (`54206ad`, `c07a95d`, `431ae86`, `b6bea97`) are all Story 1.1 (the schema evolution + code-review patches); `0187dee` added the sprint plan. The schema is settled; this story writes data into it. The baseline for this story is `54206ad` (recorded in frontmatter). No prior *importer* rewrite exists to inherit from - the spreadsheet parser/edge predate the rebuild (committed `Jun 6`), so treat them as legacy code you are bringing up to the new ontology.

### Technical requirements (dev agent guardrails)

- **Stack (do not change):** Next.js 16.2.7 / React 19; TS `strict` + `noUncheckedIndexedAccess` + no-`any`; **Prisma `^6.19.3` pinned to v6**; SQLite; `tsx` runs the seed (resolves `@/`); Vitest node env. [Source: project-context.md#Technology Stack]
- **Layered boundaries (keep the monorepo move mechanical):** pure parsing + the new pure helpers (`canonicalEntityKey`, `toPumpStatus`, legacy derivation) live in `src/lib/spreadsheet/` with colocated `*.test.ts`. The DB edge stays in `src/lib/onboarding/farm.ts` and takes an explicit `PrismaClient`. No UI and no `/lib/energy` change in this story. [Source: project-context.md#Layered boundaries; architecture.md#Architectural Boundaries]
- **Imports use the `@/` alias** (`@/lib/spreadsheet`, `@/lib/recommendations/types`), not deep relative chains. [Source: project-context.md]
- **Two test tiers by filename:** `*.test.ts` = pure (no DB) - your parser/helper tests; `*.db.test.ts` = Prisma integration (node env, explicit client, self-cleaning) - the importer test. `include` is `src/**/*.test.ts`, so colocate. [Source: project-context.md#Testing Rules]
- **Money/units:** not applicable to this story (inventory only; no billed dollars). Do not add cost fields - billing arrives in Story 1.3+.
- **No fabricated values (NFR-4):** a missing column leaves the field `null`/default, never a guessed value. An unrecognized status -> `null`, not `"GOOD"`.

### Project structure notes

- New files: `fixtures/spreadsheet/batth-master.csv`, `src/lib/spreadsheet/entity.ts` (+ `entity.test.ts`), and any small pure helper for legacy/status coercion (can live in `inventory.ts` if trivial, or a colocated `classify.ts` + test).
- Modified: `src/lib/spreadsheet/inventory.ts`, `src/lib/spreadsheet/inventory.test.ts`, `src/lib/spreadsheet/index.ts` (export the new types/helpers), `src/lib/onboarding/farm.ts`, `src/lib/onboarding/spreadsheet.db.test.ts`, `fixtures/spreadsheet/sample-batth.csv`, `_bmad-output/implementation-artifacts/deferred-work.md`.
- The architecture maps FR-1 to `lib/spreadsheet/*` and "inventory import - keep" - you are extending, not replacing. [Source: architecture.md#Requirements -> Structure Mapping; #Complete Project Directory Structure line 559]

### Deferred / scope boundary (do not do these here)

- **Do NOT drop the `billingSerial` column or rewrite its ~20 read/write sites** (`greenbutton/schedule.ts` callers, `src/app/dashboard/pump-timing/onboarding/actions.ts`, the dormant Bayou/onboarding paths, `prisma/{batth-farm,sample-farm}.ts`). Keep it in sync from the importer; record the residual cutover in `deferred-work.md` for a later cleanup (Epic 5 rewrites onboarding).
- **Do NOT rewrite the Batth seed (`prisma/batth-farm.ts`) to flow through this importer.** The seed also creates billing periods/intervals/recommendations and is a separable, riskier change. (See Question 2 below - if Jaiyen wants the dashboard demo to carry full ontology data, that becomes its own story.)
- **Do NOT retire `Block`, add a `NemType` union mirror, or add billing/coverage fields** - those are Story 1.5 / later / Story 1.3.
- **Do NOT touch `next.config.ts` / `outputFileTracingIncludes`** - the new fixture is test-only, not a runtime read.

### Latest tech notes

- Prisma 6 + SQLite: an implicit/explicit m-n relation (`@relation("NemAllocation")`) is connected with `connect`/`disconnect` on either side; connecting from the `Pump` create/update via `benefitingArrays: { connect: { id } }` is fine, but the `SolarArray` rows must exist first - create arrays after you have meter ids, or create arrays then connect meters in a second pass within the same transaction.
- No web/network dependency in this story; everything is local CSV parsing + Prisma writes against a throwaway db. No `generateObject`/AI Gateway here (that starts in Story 1.4).
- `crop.upsert` on a globally-`@unique` `name` is the idempotent way to avoid `Unique constraint failed` when the same crop appears on many rows or already exists from the seed.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2] - user story + the five acceptance criteria verbatim.
- [Source: _bmad-output/planning-artifacts/epics.md#FR-1] - 7 billing-name variants -> 6 Entities; 183 Meters Entity->Account->Ranch->Meter; real name/Pump ID/SA ID/rate(as read)/legacy/lat-long/GPM/crop/solar/status; Array->Benefiting-Meter (NEMA); rate never inferred.
- [Source: _bmad-output/planning-artifacts/epics.md#FR-17] - Status (GOOD/BAD/NEW WELL/OLD) is pump health; flag BAD; no efficiency figure.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture lines 279-291] - Ranch rollup; Array->benefiting-Meter (NEMA) not flat flags + per-array trueUpMonth; serialCode/rotatingOutageBlock distinct; unions as String mirrored in TS.
- [Source: _bmad-output/planning-artifacts/architecture.md#Requirements -> Structure Mapping] - FR-1 lands in `lib/spreadsheet/*` + schema; "inventory import - keep".
- [Source: _bmad-output/implementation-artifacts/1-1-evolve-the-prisma-data-model-for-the-farm-inventory.md#Review Findings + Project Structure Notes] - the four items deferred to Story 1.2 (serialCode cutover, status coercion, SolarArray reconcile, Block-vs-Ranch).
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] - the same four deferrals with file/line anchors.
- [Source: prisma/schema.prisma] - the (already-evolved) target schema: `Entity.billingName`/`actualOwner`, `Pump.{growerPumpId,isLegacy,status,isSolar,serialCode,rotatingOutageBlock,cropId,ranchId}`, `Ranch`, `SolarArray` + `@relation("NemAllocation")`, `Crop.name @unique`.
- [Source: src/lib/spreadsheet/inventory.ts + parse.ts] - the pure parser you evolve.
- [Source: src/lib/onboarding/farm.ts lines 199-328] - `importInventory` / `connectSpreadsheet`, the DB edge you evolve.
- [Source: src/lib/onboarding/spreadsheet.db.test.ts] - the existing integration test to evolve.
- [Source: src/lib/recommendations/types.ts line 18] - `PumpStatus = "GOOD" | "BAD" | "NEW WELL" | "OLD"`.
- [Source: project-context.md#Prisma / data model, #Testing Rules, #Layered boundaries] - Prisma v6, unions-as-String, explicit-client edges, the two test tiers, pure-logic-in-/lib.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx vitest run src/lib/spreadsheet/` -> 3 files / 30 tests pass (parser + entity + helper units).
- `npx vitest run src/lib/onboarding/spreadsheet.db.test.ts` -> 1 file / 8 tests pass (full-ontology integration).
- `npx tsc --noEmit` -> exit 0 (strict + noUncheckedIndexedAccess + no-`any`).
- `npm run lint` -> exit 0.
- `npm test` -> 34 files / 215 tests pass (up from 33 / 199; +entity.test.ts, +16 tests).
- `npm run db:seed` -> "Seeded Batth Farms: 183 meters, 6 entities, 57 accounts..." (auto-seed unaffected).

### Completion Notes List

- **Brownfield evolution, not a rewrite.** Extended the existing pure parser (`spreadsheet/inventory.ts`) and the existing DB edge (`onboarding/farm.ts` `importInventory`/`connectSpreadsheet`); did not duplicate or relocate them.
- **AC1 (entity dedupe):** new pure `canonicalEntityKey`/`displayOwner` (`spreadsheet/entity.ts`) collapse billing-name variants deterministically (no fuzzy matching). `resolveEntity` now keys on the canonical owner; `Entity.billingName` keeps the first-seen variant, `Entity.actualOwner` is canonical. Proven: 7 variants -> 6 entities, and the two "Batth Farms" spellings collapse to one entity owning all 15 of its accounts.
- **AC2 (full ontology):** the importer now creates the `Ranch` rollup (`Pump.ranchId`) and links `Crop` (globally-unique upsert), and writes `growerPumpId`, `isLegacy`, `status` (PumpStatus), `isSolar`, `serialCode`, `rotatingOutageBlock` on each Pump. 183 meters land Entity -> Account -> Ranch -> Meter. `Block` linkage kept intact (seed/confirm depend on it).
- **AC2 (the Status/kind trap):** split the conflated field - the parser now reads `Status` as FR-17 pump health via `toPumpStatus` (unknown -> null, never fabricated), and pump/non_pump `kind` comes only from a dedicated Kind/Type column (removed `"status"` from the kind aliases). Updated `sample-batth.csv` (old `Status` column -> `Kind`, plus a real health `Status`) and the parser test accordingly.
- **AC3 (solar NEMA graph):** the importer builds one `SolarArray` per NEMA code that carries a nameplate and connects `benefitingMeters` (idempotent m-n). A meter on `AGG-A;AGG-B` proves the many-to-many. Flat `Pump.solarKw/nemType/trueUpMonth` still written for back-compat (collapse deferred).
- **AC4 (rate verbatim):** `rateSchedule` is stored exactly as read; `isLegacy` is derived from that stored rate (AG-4/AG-5) or an explicit Legacy column - a classification of the value, not inference of it.
- **AC5:** `importInventory` keeps its explicit `PrismaClient` arg; `spreadsheet.db.test.ts` builds a throwaway tmpdir SQLite db via `prisma db push` and cleans up in `afterAll`.
- **serialCode cutover (scoped per the story):** the importer writes `serialCode` and keeps `billingSerial` in sync from the same value, so the ~20 untouched readers and the auto-seed keep working. The column-drop + dormant-site repoint stays deferred (recorded in `deferred-work.md`; Epic 5 rewrites onboarding).
- **Fixture:** `fixtures/spreadsheet/batth-master.csv` is a synthetic, disposable 183-row Batth-shaped master list (7 billing-name variants -> 6 entities, 57 accounts, 19 ranches, 2 solar arrays on NEMA incl. one meter on both, 30 legacy meters, all four statuses, partial rows). Generated deterministically by a throwaway script that was removed; the CSV is the committed artifact. The real 183-meter export lands in Story 1.8.
- **Deferred-work updated:** marked the status-normalize item ADDRESSED and the billingSerial + flat-solar items PARTIALLY ADDRESSED with the precise residual cleanup. No schema migration was needed (Story 1.1 added every column written here).

### File List

- `src/lib/spreadsheet/entity.ts` (new) - deterministic `canonicalEntityKey` + `displayOwner` for entity dedupe.
- `src/lib/spreadsheet/entity.test.ts` (new) - pure unit tests for the dedupe key/owner.
- `src/lib/spreadsheet/inventory.ts` (modified) - new InventoryRow fields (serialCode, rotatingOutageBlock, growerPumpId, isLegacy, isSolar, status, cropName, nemaCode); `toPumpStatus`/`deriveIsLegacy`/`deriveIsSolar` helpers; split Status from kind.
- `src/lib/spreadsheet/inventory.test.ts` (modified) - updated for the new semantics + helper unit tests.
- `src/lib/spreadsheet/index.ts` (modified) - export the new helpers/types.
- `src/lib/onboarding/farm.ts` (modified) - `importInventory` evolved: canonical entity dedupe, Ranch + Crop resolvers, full inventory fields, serialCode/billingSerial sync, SolarArray/NEMA graph; `InventoryImportResult` gains `ranches`/`arrays`.
- `src/lib/onboarding/spreadsheet.db.test.ts` (modified) - full-ontology integration test against the 183-row fixture + a small-fixture regression case.
- `fixtures/spreadsheet/batth-master.csv` (new) - synthetic 183-row Batth master list exercising every AC.
- `fixtures/spreadsheet/sample-batth.csv` (modified) - Status column split into Kind (pump/non_pump) + Status (health); added Pump ID.
- `_bmad-output/implementation-artifacts/deferred-work.md` (modified) - updated the three items this story addressed or partially addressed.

## Code Review (2026-06-09)

Adversarial review (correctness / data-fidelity / cleanup, extra-high effort) of the Story 1.2 diff. 13 findings: the 4 correctness/fidelity items were fixed; the rest deferred to `deferred-work.md`.

### Fixed (patches applied this story)

- [Patch] **NEMA orphan-code silent drop** [src/lib/onboarding/farm.ts] — a NEMA code referenced by meters but with no generating row was silently skipped. It now surfaces as `InventoryImportResult.unlinkedNemaCodes` plus a `console.warn`; the meters still persist (only the array link is withheld), honoring "never silently drop" (NFR-4). New db test covers the orphan `GHOST` code.
- [Patch] **Multi-code generator nameplate loss** [src/lib/onboarding/farm.ts] — a generating row whose NEMA cell lists multiple `;`-separated codes recorded no nameplate. It now records the nameplate for every code it lists, so a multi-array generator's kW is never lost. New db test covers `TWIN-A;TWIN-B` at 1500 kW.
- [Patch] **Crop catalog fragmentation** [src/lib/onboarding/farm.ts] — `resolveCrop` upserted the verbatim name while the confirm-step path uses `normalizeCropName`; since `Crop.name` is globally unique, `"almonds"`/`"Almonds"` forked the catalog. `resolveCrop` now canonicalizes via `normalizeCropName` first. New db test asserts `"almonds" -> "Almonds"`.
- [Patch] **Single 5s-timeout transaction** [src/lib/onboarding/farm.ts] — the whole-farm import `$transaction` now sets `{ timeout: 120_000, maxWait: 15_000 }` so a large sheet or Postgres latency cannot roll the entire import back with P2028.

### Deferred (recorded in deferred-work.md)

- [Defer] Entity dedupe reconcile key changed from `name` to `actualOwner`: latent duplicate-entity risk only if entities pre-exist on the same farm from another path with `actualOwner` null (no current flow does; pre-1.2 / upgrade edge).
- [Defer] `toMonth` fabricates a month from ambiguous/garbage prefixes (`"ma" -> March`, `"junk" -> June`) — pre-existing parser bug, NFR-4.
- [Defer] Name-only rows (no SA ID and no meter serial) duplicate on re-import — pre-existing match logic.
- [Defer] Re-import accumulates stale `Block` membership (additive `connect`) while `ranchId` is overwritten — ranch and block can diverge.
- [Defer] A generating meter is linked as a `benefitingMeter` of its own array — defensible; revisit when NEM allocation math lands.
- [Defer] Cleanup: four near-identical resolvers -> one generic; `cellFor` linear scan -> reverse index. Efficiency: batch the per-row `findUnique` into one `findMany`.
- [Defer] Test hardening: field-level idempotency assertions (benefitingMeters count, billingName stability); exact legacy count instead of `>=27`.

Refuted (not actioned): the `"Block"` header collision (mapping to the served-block grouping is intended), `deriveIsLegacy` over-match (cited rates like `AG-50` are not real PG&E schedules; it matches exactly the AG-4/AG-5 family), and `toNumber` comma-as-decimal (out of the US-locale input domain).

## Change Log

- 2026-06-09: Implemented Story 1.2 - evolved the master-spreadsheet importer to the Story 1.1 ontology: deterministic entity dedupe (7 variants -> 6), Ranch rollup + Crop, Pump inventory attributes (growerPumpId/isLegacy/status/isSolar/serialCode/rotatingOutageBlock), the SolarArray/NEMA benefiting-meter graph, and serialCode written with billingSerial kept in sync. Split the conflated Status/kind fields. Added a synthetic 183-row Batth fixture and a full-ontology db test. lint + tsc + 215 tests + db:seed all green. Status -> review.
- 2026-06-09: Code review (adversarial, extra-high effort). 13 findings; applied 4 correctness/fidelity patches (NEMA orphan-code surfacing, multi-code generator nameplate, crop normalization, transaction timeout) with a new db test, deferred 9 to deferred-work.md. lint + tsc + 216 tests green. Status -> done.
