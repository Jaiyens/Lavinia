---
baseline_commit: 7deab3e7ecf08aa85e91e9a755b30dccd7e2d16e
---

# Story 1.3: Canonical billing shape, Zod extraction contract, and billing tables

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Terra engineer,
I want one canonical multi-period billing shape, the Zod schemas for raw extraction, and the tables that persist them,
so that the dashboard, energy math, and recommendations read a single source-agnostic shape no matter where billing came from.

## Acceptance Criteria

1. **Given** `/lib/normalize/types.ts`, **When** defined, **Then** it expresses one canonical, multi-period billing shape that downstream code reads instead of any raw source format.

2. **Given** each PG&E bill page type, **When** its Zod schema is written in `/lib/extract/schema.ts`, **Then** the TS type is `z.infer` of the schema (no parallel hand-written interface).

3. **Given** billed dollar amounts, **When** modeled, **Then** they are integer cents (never floats); rates/usage keep full precision with documented units.

4. **Given** persistence, **When** the migration is applied, **Then** `BillingPeriod` and `BillingLineItem` (line-item child of period) tables exist with an actual `cycleClose` date field.

5. **Given** the source boundary, **When** code is added, **Then** no `/lib/<source>` raw type is importable into `/app`, and `no-raw-source-in-ui.test.ts` stays green.

### AC interpretation notes (read before coding)

This is a **contract + schema** story: types, Zod schemas, a format helper, and an additive migration. **No AI calls, no `pdf-lib`, no `generateObject`** — those start in Story 1.4. The only new dependency is **`zod`**. You are defining the three-layer contract (`RawExtraction` → normalize → canonical shape → reconcile) so 1.4-1.7 have a stable target; you are NOT implementing extraction or reconciliation here.

- **AC1 "canonical multi-period billing shape":** ADD a new canonical billing shape to `src/lib/normalize/types.ts` alongside the existing `NormalizedMeter`/`NormalizedSummary` (the Bayou/ESPI float-USD path). Do NOT rewrite or delete the existing shape — it is consumed by `greenbutton/import.ts`, `energy/solar-nem.ts`, `energy/rate-compare.ts`, `dashboard/derive.ts`, `recommendations/run.ts`. The new shape is integer-cents and line-item-bearing (the extraction/dashboard target); the two converge in a later story (recorded as deferred work). The new shape is what the dashboard (Epic 2) and recs (Epic 3) will read.
- **AC2 "each PG&E bill page type":** the five page types (from FR-2): `payment_confirmation`, `account_summary`, `per_sa_summary_list`, `per_sa_charge_detail`, `nem_reconciliation`. Write one Zod schema per type in `src/lib/extract/schema.ts`, plus a `PageType` enum/classification schema. **Every exported TS type is `z.infer<typeof Schema>`** — no hand-written `interface`/`type` duplicating a schema (AR-4). These are the `RawExtraction` layer (what Claude returns in 1.4/1.5), so model what is printed on the page, not the canonical shape.
- **AC3 "integer cents ... rates/usage full precision":** every billed dollar amount (line-item amounts, the SA/account printed total, demand charge) is an integer-cents `number` (e.g. `1172733` = $11,727.33), validated by Zod as `z.number().int()`. Rates/usage stay full-precision `number` with documented units (kWh 6dp, $/kWh 5dp, kW as printed) — never rounded to cents (AR-6). This applies to BOTH the Zod schemas and the new canonical shape and the new DB columns.
- **AC4 "BillingPeriod and BillingLineItem ... cycleClose":** `BillingPeriod` already exists. ADD `cycleClose DateTime?` to it (the actual posted close, distinct from `start`/`close`; AR-14 "carry both scheduled + actual"), plus `printedTotalCents Int?` (the figure 1.7 reconciles line items against). ADD a new `BillingLineItem` model as a child of `BillingPeriod`, amounts in integer cents. ADD `coverageState String` to `Pump` and `Account` (AR-2/FR-6). Mirror the `CoverageState` union in TS (project-context: unions are `String` mirrored as TS literals).
- **AC5 "no /lib/<source> raw type in /app":** EXTEND `src/lib/normalize/no-raw-source-in-ui.test.ts` to also forbid `@/lib/extract/schema` (the new raw-extraction module) from `src/app`. Keep it green — no `/app` file imports it yet. The canonical shape (`@/lib/normalize`) remains the allowed import.
- **Reconciliation is NOT in this story.** The cent-gate (`abs(sumLineItemCents - printedTotalCents) <= 1`), the SA-ID identity-checked join, and `coverageState` derivation are Story 1.6/1.7. Here you only define the columns/shape they will use; do not write the reconcile function (it lives in `/lib/energy/reconcile.ts`, Story 1.7).

## Tasks / Subtasks

- [x] **Task 1: Add `zod` and confirm the toolchain** (AC: 2, 3)
  - [x] `npm install zod` (runtime dep; current stable v4.x). Do NOT add `pdf-lib`, `ai`, or `@ai-sdk/*` — those belong to Story 1.4.
  - [x] Confirm `zod` resolves under the `@/` alias usage pattern (import as `import { z } from "zod"`). No tsconfig change expected.

- [x] **Task 2: `formatUsd` in `/lib/format`** (AC: 3)
  - [x] Create `src/lib/format/money.ts` (+ `index.ts` barrel) with `formatUsd(cents: number): string` → tabular `"$X,XXX.XX"` (negative as `-$X.XX`). Pure, no `Intl` locale surprises (force `en-US`); document that the input is integer cents.
  - [x] Add `centsFromDollars(usd: number): number` (round to nearest cent) for tests/fixtures and the future normalize step; document it is for ingestion, not for re-deriving a stored cents value.
  - [x] Colocate `src/lib/format/money.test.ts`: `formatUsd(1172733)` -> `"$11,727.33"`, `formatUsd(0)` -> `"$0.00"`, `formatUsd(-500)` -> `"-$5.00"`, `formatUsd(5)` -> `"$0.05"`.

- [x] **Task 3: The Zod raw-extraction schemas in `/lib/extract/schema.ts`** (AC: 2, 3)
  - [x] Define `PageType` as a Zod enum: `payment_confirmation | account_summary | per_sa_summary_list | per_sa_charge_detail | nem_reconciliation`. Export `type PageType = z.infer<typeof PageTypeSchema>`.
  - [x] One schema per page type modeling what is PRINTED (the RawExtraction layer):
    - `PerSaChargeDetailSchema`: printed rate name, meter #, Pump ID, the TOU energy split (per period: `period` label, `kWh` full precision, `rate` $/kWh full precision, `amountCents` int), demand charge (`kW` printed precision, `amountCents` int), NBC line items, and a catch-all `otherLineItems` array, plus the SA printed total `printedTotalCents` int. Handle two-tier and three-tier (legacy AG-5 Part-Peak) TOU — model the TOU split as an array of periods, not fixed fields, so both fit.
    - `NemReconciliationSchema`: per-SA monthly rows (each a distinct period with `kWh` that MAY be negative — `z.number()` not `.nonnegative()`), and the annual true-up `{ trueUpMonth, amountCents }`, linked by SA ID.
    - `AccountSummarySchema` / `PerSaSummaryListSchema` / `PaymentConfirmationSchema`: the account printed total (cents), the per-SA total list, and the payment/confirmation page (mostly skipped during extraction; model minimally).
  - [x] All billed amounts are `z.number().int()` (cents). All rates/usage are `z.number()` (full precision) with a `.describe(...)` documenting the unit. Negative usage is allowed on NEM rows (do NOT use `.nonnegative()` there).
  - [x] Every exported TS type is `export type X = z.infer<typeof XSchema>` — grep your own file to ensure no parallel hand-written interface (AR-4).
  - [x] Export a discriminated union `RawPageSchema` keyed on a `pageType` field if helpful for 1.4's classify step.

- [x] **Task 4: The canonical multi-period billing shape in `/lib/normalize/types.ts`** (AC: 1, 3)
  - [x] ADD (do not replace) the canonical shape the dashboard/recs/reconcile read post-normalize. Suggested: `CanonicalLineItem { kind, label?, amountCents, quantity?, unit?, rate? }`, `CanonicalBillingPeriod { saId, start, close, cycleClose?, tariff, isLegacyTou, touSplit: CanonicalTouBucket[], demandKw?, demandAmountCents?, lineItems: CanonicalLineItem[], printedTotalCents, coverageState }`, and `CanonicalBill { saId, meterNumber?, growerPumpId?, periods: CanonicalBillingPeriod[] }`. Billed amounts integer cents; usage/rates full precision.
  - [x] Document at the top that this is the source-agnostic shape: the PDF extractor (Story 1.6 normalize) and the future Bayou adapter both target it; `/app` + `/lib/recommendations` read ONLY this, never a `RawExtraction` type.
  - [x] Leave `NormalizedMeter`/`NormalizedSummary` intact; add a short comment noting the float-USD Bayou/ESPI path converges onto the integer-cents canonical shape in a later story (and record it in deferred-work.md).

- [x] **Task 5: Mirror the `CoverageState` union in TS** (AC: 4)
  - [x] In `src/lib/recommendations/types.ts` (the established union-mirror home, alongside `PumpStatus`), add `export type CoverageState = "no_bill" | "needs_review" | "reconciled";` with a doc comment (AR-15: one union, one render treatment everywhere). Use it in the canonical shape's `coverageState` field.

- [x] **Task 6: Additive Prisma migration** (AC: 3, 4)
  - [x] `BillingPeriod`: add `cycleClose DateTime?` (actual posted close, distinct from scheduled) and `printedTotalCents Int?` (the SA printed total line items reconcile against in 1.7). Keep existing `start`/`close`/`totalBillUsd`/`demandChargeUsd` (Bayou/ESPI path) untouched.
  - [x] New model `BillingLineItem`: `{ id, billingPeriodId, kind String, label String?, amountCents Int, quantity Float?, unit String?, rate Float?, createdAt }` with `billingPeriod BillingPeriod @relation(onDelete: Cascade)` and `@@index([billingPeriodId])`. Amounts are integer cents (`Int`); quantity/rate full precision (`Float`).
  - [x] `Pump`: add `coverageState String @default("no_bill")`. `Account`: add `coverageState String @default("no_bill")`. (Defaulted so the additive migration + auto-seed stay valid.)
  - [x] Add the `billingLineItems BillingLineItem[]` back-relation to `BillingPeriod`.
  - [x] Run `npm run db:migrate -- --name billing_canonical_shape` then `npm run db:generate`. Confirm the auto-seed stays green (`npm run db:seed`) and the generated migration is additive (new table + nullable/defaulted columns; no column dropped — eyeball the SQLite table-rebuild `INSERT ... SELECT`).

- [x] **Task 7: Extend the source-boundary guard** (AC: 5)
  - [x] In `src/lib/normalize/no-raw-source-in-ui.test.ts`, add `@/lib/extract/schema` to `RAW_SOURCE_MODULES` so no `src/app` file may import the raw-extraction schema. Run it — it must stay green (nothing in `/app` imports extract yet).

- [x] **Task 8: Tests** (AC: 1, 2, 3, 4)
  - [x] `src/lib/extract/schema.test.ts` (pure): a valid `per_sa_charge_detail` object parses; an `amountCents` of `1172733.5` (non-int) is REJECTED; a negative NEM `kWh` is ACCEPTED; a TOU split with three buckets (legacy Part-Peak) parses. Assert `z.infer` type identity by assigning a typed literal.
  - [x] `src/lib/format/money.test.ts` (Task 2).
  - [x] `src/lib/onboarding/billing-schema.db.test.ts` (or `src/lib/farm/billing-schema.db.test.ts`, a `*.db.test.ts`): build a throwaway SQLite db via `prisma db push` (same harness as `inventory-schema.db.test.ts`), create a `Pump` -> `BillingPeriod(cycleClose, printedTotalCents)` -> two `BillingLineItem`s (amountCents int), assert they round-trip and cascade-delete with the period; assert `Pump.coverageState`/`Account.coverageState` default to `"no_bill"`. Clean up in `afterAll`.
  - [x] `npm run lint`, `npm test`, `npx tsc --noEmit` all green.

## Dev Notes

### What you are changing vs preserving

- **`src/lib/normalize/types.ts`** (READ it first): currently holds `NormalizedMeter`/`NormalizedSummary`/`NormalizedDemandCharge` (float-USD, consumed by the Bayou/ESPI importer and the energy levers). You ADD the integer-cents canonical billing shape alongside; do not touch the existing types or you will break `greenbutton/import.ts`, `energy/solar-nem.ts` (reads `demandChargeUsd`), `energy/rate-compare.ts`, `dashboard/derive.ts`, `recommendations/run.ts`.
- **`prisma/schema.prisma`** `BillingPeriod` (READ it): has `start`, `close`, `tariff`, `demandChargeUsd Float?`, `peakKw`, `totalBillUsd Float?`, `totalKwh`, `source`, `@@unique([pumpId, start])`. You ADD `cycleClose DateTime?`, `printedTotalCents Int?`, the `billingLineItems` relation. Keep the float-USD columns (the green-button path writes them).
- **`src/lib/recommendations/types.ts`**: the union-mirror file (has `Severity`, `PumpStatus`, etc.). ADD `CoverageState`. Do not reshuffle existing exports.
- **`no-raw-source-in-ui.test.ts`**: extend `RAW_SOURCE_MODULES`; do not weaken the existing Bayou assertions.

### Critical guardrails

1. **Integer cents vs float dollars — do not conflate (AR-6).** New billed amounts (`amountCents`, `printedTotalCents`, line-item amounts) are `Int`/`z.number().int()`. The OLD `BillingPeriod.totalBillUsd`/`demandChargeUsd` stay `Float` (green-button path). Never store a NEW billed amount as a float; never round a rate/usage to cents.
2. **Zod is the source of truth (AR-4).** Schema first, `type X = z.infer<typeof XSchema>` second. A hand-written interface that duplicates a schema is a defect, even if it currently matches.
3. **Additive, non-breaking migration.** Every new column is nullable or `@default`; the new `BillingLineItem` is a new table. The auto-seed (`prisma/batth-farm.ts` -> `seedBatthFarm`) must stay green with zero edits. `coverageState` defaults to `"no_bill"` so existing seed `pump.create`/`account.create` calls stay valid.
4. **Negative usage is real (FR-3).** NEM monthly `kWh` can be negative (over-production). Use `z.number()`, never `.nonnegative()`/`.positive()`, on NEM usage. Flooring at zero is a data-fidelity bug.
5. **No reconciliation, no extraction here.** Do not write the cent-gate, the SA-ID join, or `generateObject`. Define the shape/columns they consume. `coverageState` is a column with a default now; its derivation is Story 1.7.
6. **TS strict + `noUncheckedIndexedAccess` + no-`any`.** Zod `z.infer` types are exact; do not loosen with `any`. Array access in tests is `T | undefined` — guard.

### Concrete shapes (recommended)

```ts
// src/lib/extract/schema.ts
import { z } from "zod";

export const PageTypeSchema = z.enum([
  "payment_confirmation", "account_summary", "per_sa_summary_list",
  "per_sa_charge_detail", "nem_reconciliation",
]);
export type PageType = z.infer<typeof PageTypeSchema>;

const Cents = z.number().int().describe("integer US cents, e.g. 1172733 = $11,727.33");

export const TouEnergyLineSchema = z.object({
  period: z.string().describe("Peak | Part-Peak | Off-Peak as printed"),
  kWh: z.number().describe("kWh to full precision (6dp)"),
  rate: z.number().describe("$/kWh to full precision (5dp)"),
  amountCents: Cents,
});
export const PerSaChargeDetailSchema = z.object({
  pageType: z.literal("per_sa_charge_detail"),
  rateName: z.string(),
  meterNumber: z.string().nullable(),
  growerPumpId: z.string().nullable(),
  saId: z.string(),
  touEnergy: z.array(TouEnergyLineSchema),            // 2 or 3 buckets
  demandKw: z.number().nullable(),
  demandAmountCents: Cents.nullable(),
  otherLineItems: z.array(z.object({ label: z.string(), amountCents: Cents })),
  printedTotalCents: Cents,
});
export type PerSaChargeDetail = z.infer<typeof PerSaChargeDetailSchema>;
// ...NemReconciliationSchema (kWh may be negative), AccountSummarySchema, etc.
```

```prisma
// prisma/schema.prisma  (additive)
model BillingPeriod {
  // ...existing fields unchanged...
  cycleClose        DateTime?  // actual posted close (distinct from scheduled serial-code close)
  printedTotalCents Int?       // SA printed total; line items reconcile against it (Story 1.7)
  billingLineItems  BillingLineItem[]
}

model BillingLineItem {
  id              String   @id @default(cuid())
  billingPeriodId String
  kind            String   // "tou_energy" | "demand" | "nbc" | "other"
  label           String?
  amountCents     Int      // integer cents, never a float
  quantity        Float?   // kWh / kW, full precision
  unit            String?  // "kWh" | "kW"
  rate            Float?   // $/unit, full precision
  createdAt       DateTime @default(now())

  billingPeriod BillingPeriod @relation(fields: [billingPeriodId], references: [id], onDelete: Cascade)

  @@index([billingPeriodId])
}
// Pump:    add `coverageState String @default("no_bill")`
// Account: add `coverageState String @default("no_bill")`
```

### Previous story intelligence (Story 1.2, done)

- 1.2 evolved the spreadsheet importer; it added `growerPumpId`/`status`/`isLegacy`/etc. and a `SolarArray`/NEMA graph. The SA-ID join in Story 1.6 will use `growerPumpId` + `meterSerial` as the identity check — your `PerSaChargeDetailSchema` should carry `meterNumber` + `growerPumpId` so 1.6 can match them against the inventory row.
- Working patterns to reuse: additive Prisma migrations (1.1/1.2); `*.db.test.ts` builds a throwaway tmpdir SQLite via `prisma db push --skip-generate --accept-data-loss` and cleans up in `afterAll`; union mirrors live in `src/lib/recommendations/types.ts`; auto-seed must stay green (`npm run db:seed`).
- 1.2 deferred a `NemType` TS-union mirror to Story 1.5 — do NOT add it here.

### Project structure notes

- New files: `src/lib/extract/schema.ts` (+ `schema.test.ts`), `src/lib/extract/index.ts` (barrel); `src/lib/format/money.ts` (+ `money.test.ts`, `index.ts`); `src/lib/<farm|onboarding>/billing-schema.db.test.ts`; the migration dir.
- Modified: `src/lib/normalize/types.ts`, `src/lib/recommendations/types.ts`, `src/lib/normalize/no-raw-source-in-ui.test.ts`, `prisma/schema.prisma`, `package.json` (+ `zod`).
- Architecture maps FR cluster A to `lib/extract/*`, `lib/normalize/{types,pdf}`, `prisma/schema.prisma` — you are creating the `lib/extract` home and extending normalize + schema. [Source: architecture.md#Requirements -> Structure Mapping]

### Latest tech notes

- **Zod v4** is current. `z.infer<typeof Schema>` for types; `.int()` enforces integer cents; `.describe()` documents units and also feeds `generateObject`'s JSON-schema prompt in Story 1.4 (so good descriptions pay off later). Prefer `z.enum([...])` for `PageType`. No network here; Zod is pure runtime validation.
- Do NOT pull in `pdf-lib`/`ai` — adding them now is scope creep and pulls the AI Gateway dependency forward. They arrive with Story 1.4.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3] - user story + the five ACs verbatim.
- [Source: _bmad-output/planning-artifacts/architecture.md#Money & Numbers] (lines 372-384) - integer cents for billed amounts, full-precision rates/usage, `formatUsd(cents)` in `/lib/format`, never invent a number.
- [Source: _bmad-output/planning-artifacts/architecture.md#Extraction -> Canonical -> Reconciliation contract] (lines 386-398) - three typed layers, Zod owns the boundary, `z.infer` types, canonical shape in `/lib/normalize/types.ts`.
- [Source: _bmad-output/planning-artifacts/architecture.md#State unions] (lines 400-407) - `coverageState` one union, mirrored as Prisma String.
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Architecture] (lines 279-291) - BillingLineItem child of BillingPeriod + actual cycleClose; coverageState per Meter/Account.
- [Source: _bmad-output/planning-artifacts/epics.md#FR-2, #FR-3] - the five page types; NEM negative usage captured not floored.
- [Source: src/lib/normalize/types.ts] - the existing float-USD shape to preserve.
- [Source: src/lib/normalize/no-raw-source-in-ui.test.ts] - the boundary guard to extend.
- [Source: prisma/schema.prisma] - `BillingPeriod` current columns; the Pump/Account models to add `coverageState` to.
- [Source: _bmad-output/project-context.md] - Prisma v6 additive, unions-as-String mirrored in recommendations/types.ts, DB edges take explicit PrismaClient, two test tiers.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npm install zod` -> zod 4.4.3 (runtime dep; no pdf-lib/ai - those are Story 1.4).
- `npm run db:migrate -- --name billing_canonical_shape` -> applied `20260609082450_billing_canonical_shape`; client regenerated (v6.19.3).
- migration.sql confirmed additive: two `ADD COLUMN`s on BillingPeriod, new `BillingLineItem` table, Account/Pump table-rebuilds whose `INSERT ... SELECT` carry every prior column forward + add `coverageState` default `'no_bill'`.
- `npx vitest run src/lib/format src/lib/extract src/lib/farm/billing-schema.db.test.ts src/lib/normalize` -> 7 files / 25 tests pass.
- `npx tsc --noEmit` -> exit 0; `npm run lint` -> exit 0; `npm test` -> 37 files / 226 tests pass; `npm run db:seed` -> "Seeded Batth Farms: 183 meters, 6 entities, 57 accounts" (auto-seed unaffected).

### Completion Notes List

- **Contract + schema only** (no AI, no pdf-lib, no reconciliation). Added `zod` as the single new dependency.
- **AC1 canonical shape:** added `CanonicalBill` / `CanonicalBillingPeriod` / `CanonicalLineItem` / `CanonicalTouBucket` to `src/lib/normalize/types.ts`, integer-cents billed amounts, full-precision usage/rates, carrying `cycleClose` and `coverageState`. Left `NormalizedMeter`/`NormalizedSummary` (the float-USD Bayou/ESPI path) untouched - the two converge in a later story (recorded in deferred-work.md).
- **AC2 Zod RawExtraction:** `src/lib/extract/schema.ts` with one schema per PG&E page type (`payment_confirmation`/`account_summary`/`per_sa_summary_list`/`per_sa_charge_detail`/`nem_reconciliation`), a `PageType` enum, and a `RawPageSchema` discriminated union. Every exported TS type is `z.infer<typeof Schema>` - no hand-written interface. TOU split is an array so both two-tier and three-tier (legacy Part-Peak) fit.
- **AC3 integer cents:** billed amounts are `z.number().int()` (Zod) / `Int` (Prisma) / integer-cents `number` (canonical); rates/usage stay full-precision with documented units. NEM monthly `kWh` uses `z.number()` (not `.nonnegative()`) so over-production negatives are captured (FR-3). `formatUsd(cents)` lives in `src/lib/format/money.ts`.
- **AC4 tables:** additive migration adds `BillingPeriod.cycleClose` + `printedTotalCents`, the `BillingLineItem` cascade child (integer cents), and `coverageState` (default `no_bill`) on `Pump` and `Account`. `CoverageState` union mirrored in `recommendations/types.ts` alongside `PumpStatus`.
- **AC5 boundary:** extended `no-raw-source-in-ui.test.ts` so `@/lib/extract/schema` and `@/lib/extract` cannot be imported into `/app`; still green (no `/app` importer yet).
- **Out of scope, deferred:** reconciliation (the cent-gate, SA-ID identity join) and `coverageState` derivation are Story 1.6/1.7; the float-USD vs integer-cents convergence of the two normalize shapes is a later cleanup.

### File List

- `src/lib/format/money.ts` (new) - `formatUsd(cents)`, `centsFromDollars(usd)`.
- `src/lib/format/index.ts` (new) - barrel.
- `src/lib/format/money.test.ts` (new) - formatting + rounding tests.
- `src/lib/extract/schema.ts` (new) - Zod RawExtraction schemas per page type; `z.infer` types.
- `src/lib/extract/index.ts` (new) - barrel.
- `src/lib/extract/schema.test.ts` (new) - parse/reject + negative-NEM + discriminated-union tests.
- `src/lib/normalize/types.ts` (modified) - added the canonical billing shape (integer cents).
- `src/lib/recommendations/types.ts` (modified) - added `CoverageState` union.
- `src/lib/normalize/no-raw-source-in-ui.test.ts` (modified) - guard now forbids `@/lib/extract*` in `/app`.
- `prisma/schema.prisma` (modified) - `BillingPeriod.cycleClose`/`printedTotalCents`/`billingLineItems`; new `BillingLineItem`; `Pump.coverageState`; `Account.coverageState`.
- `prisma/migrations/20260609082450_billing_canonical_shape/migration.sql` (new) - additive migration.
- `src/lib/farm/billing-schema.db.test.ts` (new) - round-trip + cascade + coverage-default integration test.
- `package.json` / `package-lock.json` (modified) - added `zod`.

## Code Review (2026-06-09)

Adversarial review (extra-high effort, recall mode) of the Story 1.3 diff. Verified: the migration is strictly additive (no column dropped; `INSERT ... SELECT` carries all prior columns; defaults keep the auto-seed valid), the `RawPageSchema` discriminated union validates/rejects correctly, `formatUsd` is precision-safe, NEM `kWh` allows negatives (FR-3), integer cents are enforced in both Zod (`.int()`) and Prisma (`Int`), and the `/app` boundary guard is green. **Zero correctness bugs.**

### Deferred (cleanup/consistency, recorded in deferred-work.md)

- [Defer] `CanonicalLineItem.kind`/`unit` (and the Prisma `BillingLineItem.kind`/`unit`) are bare `String` with the allowed values only in a comment; mirror them as a TS union (e.g. `BillingLineItemKind`) per the project-context union rule, the same way `PumpStatus`/`CoverageState` are. Deferred to when extraction (Story 1.4) settles the exact kinds, consistent with how Story 1.1 deferred the `NemType` mirror.
- [Defer] `centsFromDollars` uses `Math.round` (rounds half toward +Infinity), asymmetric for negative half-cent inputs. Latent only - no negative caller exists yet (NEM credits would be the first); revisit when the normalize step (1.6) feeds credits through it.
- [Defer] Contract-ahead-of-consumer: the canonical `CanonicalBillingPeriod.printedTotalCents` is non-null while the DB `BillingPeriod.printedTotalCents` is nullable (`Int?`, null until extracted). By design for a contract story; Story 1.6/1.7 must reconcile nullable DB rows against the non-null canonical field when wiring the normalizer.

## Change Log

- 2026-06-09: Implemented Story 1.3 - the canonical multi-period billing shape (integer cents), the Zod RawExtraction schemas per PG&E page type (`z.infer` types), `formatUsd` in `/lib/format`, and an additive migration (BillingPeriod cycleClose + printedTotalCents, BillingLineItem child, coverageState on Pump/Account + CoverageState union). Extended the no-raw-source-in-ui boundary to `/lib/extract`. Added zod. lint + tsc + 226 tests + db:seed all green. Status -> review.
- 2026-06-09: Code review (adversarial, extra-high effort). Zero correctness bugs; verified additive migration, discriminated-union validation, integer-cents enforcement, NEM-negative handling, and the /app boundary. Deferred 4 cleanup/consistency items (line-item kind/unit union mirror, centsFromDollars negative rounding, canonical-vs-DB nullability) to deferred-work.md. Status -> done.
