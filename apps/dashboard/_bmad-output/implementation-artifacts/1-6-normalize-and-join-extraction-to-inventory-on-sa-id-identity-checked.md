---
baseline_commit: 513938e
---

# Story 1.6: Normalize and join extraction to inventory on SA ID, identity-checked

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a grower,
I want each bill's charges attached to the right meter,
so that what I see on a meter is genuinely that meter's money, never another meter's by mistake.

## Acceptance Criteria

1. **Given** RawExtraction objects, **When** normalized, **Then** they become the canonical billing shape and nothing downstream reads the raw source format.

2. **Given** the SA ID, **When** joining to inventory, **Then** it is normalized to a canonical form (trim; the `P0xx`/descriptor suffix preserved as a separate field).

3. **Given** a joined figure, **When** the extracted meter # and Pump ID do not match the inventory row joined on SA ID, **Then** the figure is flagged `needs_review` rather than attached to a possibly-wrong meter.

4. **Given** a future Bayou adapter targeting the same canonical shape, **When** swapped in, **Then** no code downstream of the canonical shape changes.

### AC interpretation notes (read before coding)

This is the **charge-detail normalize + identity-checked SA-ID join**: the per-meter analogue of Story 1.5's NEM normalize. It is **pure** (no Prisma, no DB write, no `/app`): `normalizeBill(raw, inventory)` maps a `PerSaChargeDetail` (RawExtraction) into the integer-cents `CanonicalBill` shape (defined in Story 1.3), joining to inventory on a canonical SA ID and refusing to attach a figure to a meter whose identity does not check out. The DB read that builds the inventory view and the persistence of the canonical bill are **Story 1.8**; the cent-reconciliation gate that promotes a bill to `reconciled` is **Story 1.7**.

- **AC1 "RawExtraction → canonical shape, nothing downstream reads raw":** map `PerSaChargeDetail` → `CanonicalBill` / `CanonicalBillingPeriod` / `CanonicalLineItem` / `CanonicalTouBucket` (already defined in `src/lib/normalize/types.ts`, Story 1.3). The mapper lives in `src/lib/normalize/billing.ts` and is a raw-consuming module like `bayou.ts`/`espi.ts`/`nem.ts` — add it to the `no-raw-source-in-ui` guard so `/app` cannot import it. `/app` reads only the canonical shape via `@/lib/normalize`.
- **Critical gap to close — the canonical period needs dates the raw page does not yet carry.** `CanonicalBillingPeriod.start` and `.close` are **non-null** strings, but `PerSaChargeDetailSchema` (Story 1.3) carries **no service-period dates**. The normalizer must never fabricate a date (NFR-4). So **additively extend** `PerSaChargeDetailSchema` to capture the printed service period: `serviceStart` + `serviceEnd` (required ISO strings — a charge-detail page always prints "Service From … To …") and `cycleClose` (nullable ISO — the posted statement close, AR-14). A page that does not yield these fails `safeParse` → the existing 1.4 pipeline already routes that to `needs_review`. Update the three existing charge-detail fixtures (schema.test, pipeline.test ×2 via the `twoTierSa` spread) to include the new fields.
- **AC2 "SA ID normalized; P0xx/descriptor suffix preserved as a separate field":** add a pure `normalizeSaId(raw: string): { saId: string; descriptor: string | null }` in `src/lib/normalize/sa-id.ts`. Trim, then split off a trailing descriptor — the canonical `saId` is the leading token (the numeric SA ID), the `descriptor` is the remainder (the grower's `P0xx`/label suffix) or `null`. Preserve the descriptor on the canonical bill as a **new field** `CanonicalBill.saIdDescriptor` (additive to the 1.3 shape — `CanonicalBill` currently has no consumers, so this is safe). The join matches inventory on the **core** `saId`, never the raw string with its suffix.
- **AC3 "meter # / Pump ID mismatch → needs_review, not attached to a possibly-wrong meter":** after joining inventory on the core SA ID, run the identity check. The inventory row carries `meterSerial` (the physical meter #) and `growerPumpId` (the `P0xx` Pump ID). Rule: a **present** extracted identifier that **disagrees** with the inventory row is a mismatch (`raw.meterNumber` non-null and `!== row.meterSerial`, OR `raw.growerPumpId` non-null and `!== row.growerPumpId`) → `coverageState: "needs_review"`. A **null/absent** extracted identifier is **not** a mismatch (absence cannot contradict — do not fail on it). If the core SA ID matches **no** inventory row → also `needs_review` (cannot attach a figure to a meter we do not have). Otherwise the join is clean → `coverageState: "no_bill"` (attached, awaiting the Story 1.7 reconcile — identical to how Story 1.5's NEM normalize leaves a linked allocation `no_bill`).
- **AC4 "Bayou adapter swap → nothing downstream changes":** this is an **architectural property**, satisfied by construction, not a feature: `normalizeBill` returns the `CanonicalBill` shape (no extraction-specific fields leak), and the `no-raw-source-in-ui` guard forbids `/app` from importing the raw mapper. Prove it lightly: a test asserting the returned object is assignable to `CanonicalBill` (type-level) and contains only canonical fields, plus the guard entry. Do NOT build a Bayou→canonical adapter here (that is the dormant Bayou path, deferred per project-context); just keep the seam clean so swapping the source is mechanical.

## Tasks / Subtasks

- [x] **Task 1: Additive service-period fields on the charge-detail schema** (AC: 1)
  - [x] In `src/lib/extract/schema.ts`, add to `PerSaChargeDetailSchema`: `serviceStart: z.string().describe("ISO service period start as printed")`, `serviceEnd: z.string().describe("ISO service period end as printed")`, and `cycleClose: z.string().nullable().describe("ISO posted statement close; null if not separately printed")`. Required (non-null) for `serviceStart`/`serviceEnd` so a page missing them is routed to `needs_review` by the existing pipeline (do not make them optional).
  - [x] Update the three existing charge-detail fixtures so they stay green: the `valid` object in `src/lib/extract/schema.test.ts`, and `twoTierSa` in `src/lib/extract/pipeline.test.ts` (`threeTierSa` and `badSa` derive from it via spread, so one edit covers them). Add realistic `serviceStart`/`serviceEnd`/`cycleClose`.
  - [x] Do NOT touch the NEM, account-summary, or other page schemas.

- [x] **Task 2: `normalizeSaId` — the canonical SA-ID helper** (AC: 2)
  - [x] `src/lib/normalize/sa-id.ts`: `normalizeSaId(raw: string): { saId: string; descriptor: string | null }`. Trim. Split on the first run of whitespace OR an opening parenthesis: the **core** `saId` is the leading token; the **descriptor** is the trimmed remainder (strip a wrapping `()`), or `null` when there is no suffix. Do NOT split on `-` (hyphens occur inside IDs). Pure string utility — no raw-type import, so it is safe for any layer (it need not be on the no-raw-source guard).
  - [x] `src/lib/normalize/sa-id.test.ts`: `"1007066742"` → `{ saId:"1007066742", descriptor:null }`; `"  1007066742  "` → trimmed core, null descriptor; `"1007066742 P001"` → `{ saId:"1007066742", descriptor:"P001" }`; `"1007066742 (P001 - WEST WELL)"` → `{ saId:"1007066742", descriptor:"P001 - WEST WELL" }`; `""` / whitespace → `{ saId:"", descriptor:null }`.
  - [x] Note for the future (do NOT do now): Story 1.5's `normalizeNem` matches on trimmed-exact SA ID; it can later route through `normalizeSaId` for consistency. Leave 1.5 code untouched; record the unification as a follow-up.

- [x] **Task 3: Add `saIdDescriptor` to the canonical bill** (AC: 2)
  - [x] In `src/lib/normalize/types.ts`, add `saIdDescriptor: string | null` to `CanonicalBill` (the preserved suffix from AC2). Document it. `CanonicalBill` has no consumers yet, so this is additive and safe.

- [x] **Task 4: `normalizeBill` — the charge-detail normalize + identity-checked join** (AC: 1, 3)
  - [x] `src/lib/normalize/billing.ts`: pure `normalizeBill(raw: PerSaChargeDetail, inventory: BillInventoryView): CanonicalBill` — no Prisma/DB/UI/network.
  - [x] `BillInventoryRow = { saId: string; meterSerial: string | null; growerPumpId: string | null }`; `BillInventoryView = { meters: BillInventoryRow[] }` (the caller builds it from the DB in 1.8; this module never reads Prisma). `saId` on the row is the inventory's canonical SA ID (`Pump.serviceId`).
  - [x] Compute the core SA ID via `normalizeSaId(raw.saId)`. Build line items from the raw, integer cents (AR-6):
    - one `{ kind:"tou_energy", label:period, amountCents, quantity:kWh, unit:"kWh", rate }` per `touEnergy` bucket;
    - one `{ kind:"demand", label:null, amountCents:demandAmountCents, quantity:demandKw, unit:"kW", rate:null }` **only when** `demandAmountCents` is non-null;
    - one `{ kind:"nbc", label, amountCents, quantity:null, unit:null, rate:null }` per `nbcLineItems`;
    - one `{ kind:"other", label, amountCents, quantity:null, unit:null, rate:null }` per `otherLineItems`.
    (These line items are what Story 1.7 sums against `printedTotalCents` — every charge that composes the printed total must appear, or reconciliation will fail.)
  - [x] Build `touSplit: CanonicalTouBucket[]` from `touEnergy` (`{ period, kWh, amountCents }`); `isLegacyTou = raw.touEnergy.length === 3` (Part-Peak present).
  - [x] Identity-checked join: find the inventory row whose `saId` equals the core SA ID.
    - no row → `coverageState = "needs_review"`;
    - row found, and (`raw.meterNumber` non-null and `!== row.meterSerial`) OR (`raw.growerPumpId` non-null and `!== row.growerPumpId`) → `coverageState = "needs_review"` (a present identifier disagrees);
    - otherwise → `coverageState = "no_bill"` (clean attach, awaiting 1.7 reconcile).
    A blank core SA ID (`""`) matches no row → `needs_review` (mirror the 1.5 blank-SA guard; never link on an empty key).
  - [x] Assemble the `CanonicalBillingPeriod` (`saId` = core, `start` = serviceStart, `close` = serviceEnd, `cycleClose`, `tariff` = rateName, `isLegacyTou`, `touSplit`, `demandKw`, `demandAmountCents`, `lineItems`, `printedTotalCents`, `coverageState`) and the `CanonicalBill` (`saId` = core, `saIdDescriptor` = descriptor, `meterNumber` = raw.meterNumber, `growerPumpId` = raw.growerPumpId, `periods: [period]`).

- [x] **Task 5: Boundary guard + AC4 seam** (AC: 1, 4)
  - [x] Add `@/lib/normalize/billing` to `RAW_SOURCE_MODULES` in `src/lib/normalize/no-raw-source-in-ui.test.ts` (it imports the raw `PerSaChargeDetail`). Keep the guard green (no `/app` importer yet). Do NOT add `@/lib/normalize/sa-id` (pure string helper, no raw import).
  - [x] Do NOT re-export `normalizeBill` from `src/lib/normalize/index.ts` (ingestion-only deep import for the 1.8 importer; matches the `normalizeNem` decision). The canonical types flow to `/app` via the index's `export * from "./types"`.

- [x] **Task 6: Tests** (AC: 1, 2, 3, 4)
  - [x] Commit `fixtures/extract/sample-charge-detail.json`: a realistic `per_sa_charge_detail` raw object (three-tier legacy TOU, a demand charge, an NBC, an "other" line item, the new service-period fields, a known `saId`/`meterNumber`/`growerPumpId`). Test-only read (no `outputFileTracingIncludes`).
  - [x] `src/lib/normalize/billing.test.ts` (pure): with an inventory view whose row matches the fixture's core SA ID + meter# + Pump ID,
    - **AC1:** assert the output is a `CanonicalBill` (typed) with the period dates carried from the service period, integer-cents line items, the TOU split, `isLegacyTou === true`, and that `sum(lineItems.amountCents)` equals (or is recorded toward) `printedTotalCents` so 1.7 has a coherent target;
    - **AC2:** a raw `saId` of `"1007066742 P001"` yields core `saId "1007066742"` joined correctly and `saIdDescriptor "P001"`;
    - **AC3:** a mismatched `meterNumber` → `needs_review`; a mismatched `growerPumpId` → `needs_review`; an SA ID matching no inventory row → `needs_review`; a **null** extracted `meterNumber`/`growerPumpId` with the SA ID matching → clean (`no_bill`, not a false mismatch);
    - **AC4:** a small assertion/comment that the returned shape contains only canonical fields (no `pageType`, no raw-only field) — the source-swap seam.
  - [x] `src/lib/normalize/sa-id.test.ts` (Task 2). Use `if (...) throw` narrowing so assertions never pass vacuously (the 1.4/1.5 template).

- [x] **Task 7: Validate** (AC: all)
  - [x] `npm run lint`, `npx tsc --noEmit`, `npm test` all green. No DB change, no migration in this story — confirm `npm run db:seed` still reports the 183-meter Batth seed. Confirm `no-raw-source-in-ui.test.ts` stays green with `@/lib/normalize/billing` added. Confirm the three updated charge-detail fixtures still parse.

## Dev Notes

### Scope boundary (what is NOT in this story)

- **No reconciliation / no cent-gate.** `abs(sumLineItemCents − printedTotalCents) <= 1` and the promotion to `coverageState "reconciled"` are **Story 1.7** (`src/lib/energy/reconcile.ts`, which already exists — 1.7 owns it). Here a clean join rests at `no_bill`; 1.7 promotes it. Do NOT write the reconcile here.
- **No DB read / no persistence / no migration.** `normalizeBill` is pure over an in-memory `BillInventoryView`. Building that view from Prisma and persisting the `CanonicalBill` to `BillingPeriod`/`BillingLineItem` is **Story 1.8**. Do NOT import Prisma in `billing.ts`.
- **No Bayou→canonical adapter.** AC4 is a seam property, not a feature; the dormant Bayou path is deferred (project-context). Just keep the canonical shape source-agnostic and the guard green.
- **No `/app` wiring.** This is library logic; screens are Epic 2.

### What exists to build on

- **`src/lib/extract/schema.ts`** — `PerSaChargeDetailSchema` (Story 1.3): `saId`, `meterNumber`, `growerPumpId`, `rateName`, `touEnergy[]` (`period`/`kWh`/`rate`/`amountCents`), `demandKw`, `demandAmountCents`, `nbcLineItems[]`, `otherLineItems[]`, `printedTotalCents`. You add the three service-period fields. The `touEnergy` array already handles two- and three-tier TOU.
- **`src/lib/normalize/types.ts`** — `CanonicalBill` / `CanonicalBillingPeriod` / `CanonicalLineItem` / `CanonicalTouBucket` (Story 1.3) are the target. You add `CanonicalBill.saIdDescriptor`. The `CanonicalLineItem.kind` is a documented-string (`"tou_energy"|"demand"|"nbc"|"other"`); the union mirror was deferred in 1.3 to "when extraction settles the kinds" — settling them is a candidate now (see below).
- **`src/lib/normalize/nem.ts`** (Story 1.5) — the exact pure-mapper pattern to follow: takes raw + an in-memory inventory projection, joins by SA ID, returns the canonical shape, marks `needs_review` on a failed/ambiguous/blank-key join (never a fabricated link). `normalizeBill` is its per-meter sibling.
- **`src/lib/spreadsheet/inventory.ts`** — `InventoryRow` carries `serviceId` (SA ID), `meterSerial`, `growerPumpId`. This is the shape the 1.8 importer projects into `BillInventoryView`. The identity fields you check against are `meterSerial` and `growerPumpId`.
- **`prisma/schema.prisma` `Pump`** — `serviceId` (SA ID), `meterSerial`, `growerPumpId`, `coverageState` (default `no_bill`). The inventory projection reads these.

### Critical guardrails

1. **Never attach a figure to a possibly-wrong meter (AC3 / NFR-4).** A present extracted meter# or Pump ID that disagrees with the joined inventory row → `needs_review`. SA-ID-only confidence (both identifiers null) on a matched row is acceptable as a clean join, but a *disagreement* is never tolerated.
2. **Never fabricate a number or a date.** Period dates come from the (newly captured) printed service period; a page without them fails `safeParse` → `needs_review` via the existing pipeline. Do not default missing dates to `now()` or a guess.
3. **Integer cents vs full-precision usage (AR-6).** Line-item `amountCents`, `demandAmountCents`, `printedTotalCents` are integer cents; `quantity` (kWh/kW) and `rate` keep full precision. Every charge composing the printed total must become a line item (1.7 sums them).
4. **Pure logic stays pure.** `billing.ts` and `sa-id.ts` take plain inputs and return plain values — no Prisma, no I/O. Colocated `*.test.ts`.
5. **Canonical SA ID is the join key, descriptor is preserved not matched (AC2).** Match inventory on the descriptor-stripped core; carry the descriptor on `CanonicalBill.saIdDescriptor`.
6. **TS strict + no-`any` + `noUncheckedIndexedAccess`.** `raw` is the Zod `z.infer` type. Narrow array access; do not `as`-cast.
7. **Boundary stays out of `/app`.** Add `@/lib/normalize/billing` to the guard.

### Concrete shapes (recommended)

```ts
// src/lib/normalize/sa-id.ts
export function normalizeSaId(raw: string): { saId: string; descriptor: string | null } { /* trim; split leading token vs suffix */ }

// src/lib/normalize/billing.ts
import type { PerSaChargeDetail } from "@/lib/extract/schema";
import type { CanonicalBill } from "./types";
export type BillInventoryRow = { saId: string; meterSerial: string | null; growerPumpId: string | null };
export type BillInventoryView = { meters: BillInventoryRow[] };
export function normalizeBill(raw: PerSaChargeDetail, inventory: BillInventoryView): CanonicalBill {
  // normalizeSaId -> core; build integer-cents lineItems (tou/demand/nbc/other) + touSplit;
  // join inventory on core saId; identity-check meterNumber/growerPumpId; set coverageState.
}
```

### Decision to settle this story (record in the review): line-item `kind` union mirror

Story 1.3 deferred mirroring `CanonicalLineItem.kind` (`"tou_energy"|"demand"|"nbc"|"other"`) and `unit` (`"kWh"|"kW"`) as TS unions "to Story 1.4/1.6 when extraction settles the kinds." This story emits exactly those kinds. Mirroring them now in `src/lib/recommendations/types.ts` (a `BillingLineItemKind` / `BillingLineItemUnit` union, used by `CanonicalLineItem` and the `normalizeBill` writes) would close that deferral and let the compiler catch a typo'd `kind`. **Do this if low-risk; otherwise re-defer with a note.** (It is a small, well-scoped union add consistent with `CoverageState`/`PumpStatus` — favor doing it.)

### Previous story intelligence (1.5, done)

- `normalizeNem` (1.5) is the template: pure mapper, in-memory inventory projection, SA-ID join, `needs_review` on no/ambiguous/blank-key match, never a fabricated link. The 1.5 review added a **blank-SA-ID guard** (an empty trimmed SA ID never matches) — replicate that reasoning in `normalizeBill` (blank core SA → `needs_review`).
- 1.5 kept `normalizeNem` out of the `@/lib/normalize` index barrel (ingestion-only deep import) and added it to the no-raw-source guard — do the same for `normalizeBill`.
- 1.5 added an additive schema field (`trueUpDate`) and updated the pre-existing fixtures that omitted it — you do the same for the charge-detail service-period fields.
- Test template: `if (!ok) throw …` narrowing so AC assertions never pass vacuously.

### Latest tech notes

- **Zod v4** (already installed): required fields (`z.string()`) force the existing fixtures to be updated; `z.string().nullable()` is a required-but-nullable key. `.describe()` text feeds `generateObject` in Story 1.8.
- No new dependency. `pdf-lib` present (1.4); `ai` deferred to 1.8.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.6] — user story + the four ACs verbatim.
- [Source: _bmad-output/planning-artifacts/epics.md#FR-4, #FR-5] — source-agnostic canonical shape; identity-checked SA-ID join.
- [Source: _bmad-output/planning-artifacts/architecture.md#Extraction -> Canonical -> Reconciliation contract (lines 386-398)] — three typed layers; Zod owns the boundary; the SA-ID join is identity-checked (trim, preserve the `P0xx`/descriptor suffix as a separate field); mismatch → needs_review.
- [Source: _bmad-output/planning-artifacts/architecture.md#Source isolation (lines 274-277)] — the canonical shape is the seam; the Bayou/ESPI adapter targets it; nothing downstream changes on a source swap (AC4).
- [Source: _bmad-output/planning-artifacts/architecture.md#Money & Numbers (lines 372-384)] — integer cents for billed amounts; full-precision usage/rates; never invent a number.
- [Source: src/lib/extract/schema.ts] — `PerSaChargeDetailSchema` to extend.
- [Source: src/lib/normalize/types.ts] — `CanonicalBill` and the period/line-item/TOU shapes to target.
- [Source: src/lib/normalize/nem.ts] — the pure-mapper + SA-ID-join + needs_review template (Story 1.5).
- [Source: src/lib/spreadsheet/inventory.ts] — `InventoryRow` identity fields (`serviceId`/`meterSerial`/`growerPumpId`).
- [Source: src/lib/normalize/no-raw-source-in-ui.test.ts] — the boundary guard to extend.
- [Source: _bmad-output/project-context.md] — zero external calls; pure logic + colocated tests; integer cents; no-`any`; unions mirrored in recommendations/types; DB edges take an explicit client (1.8, not here).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx tsc --noEmit` -> exit 0; `npm run lint` -> exit 0; `npm test` -> 42 files / 257 tests pass (+17 over 1.5's 240: 6 normalizeSaId + 11 normalizeBill).
- `npx vitest run src/lib/normalize src/lib/extract` -> 10 files / 52 tests pass.
- `npm run db:seed` -> "Seeded Batth Farms: 183 meters, 6 entities, 57 accounts, 2196 bills, 13440 intervals." No DB change / no migration in this story; seed unaffected.

### Completion Notes List

- **Pure charge-detail normalize + identity-checked SA-ID join.** `normalizeBill(raw, inventory)` maps `PerSaChargeDetail` -> `CanonicalBill` (integer cents), joins to an in-memory inventory projection on the canonical SA ID, and refuses to attach a figure to a meter whose identity does not check out. No Prisma, no migration, no `/app` import. Mirror of Story 1.5's `normalizeNem`.
- **AC1 RawExtraction -> canonical:** every charge composing the printed total becomes a `CanonicalLineItem` (3 TOU buckets + demand-when-billed + each NBC + each other line); test asserts the line items sum to `printedTotalCents` (245657) so Story 1.7 has a coherent reconcile target. The canonical period needs real dates the raw page lacked, so I additively added `serviceStart`/`serviceEnd` (required) + `cycleClose` (nullable) to `PerSaChargeDetailSchema` and updated the three pre-existing charge-detail fixtures. Dates are carried from the printed service period, never fabricated; a page missing them fails safeParse -> the 1.4 pipeline routes it to needs_review.
- **AC2 SA-ID normalization:** new pure `normalizeSaId` (src/lib/normalize/sa-id.ts) trims and splits a trailing `P0xx`/descriptor suffix off the canonical id (handles `"id P001"` and `"id (P001 - WEST)"`, never splits on hyphens). The join matches inventory on the core id; the suffix is preserved on the new `CanonicalBill.saIdDescriptor` field.
- **AC3 identity-checked join:** a PRESENT extracted meter # or Pump ID that disagrees with the joined inventory row -> `needs_review`; an absent (null) identifier never fails (cannot contradict); an SA ID matching no row, or a blank SA ID, -> `needs_review`; a clean join rests at `no_bill` (awaiting the 1.7 reconcile, like NEM). Tested all branches.
- **AC4 source-swap seam:** `normalizeBill` returns only canonical fields (test asserts no `pageType`/`nbcLineItems`/extraction-only key leaks); `@/lib/normalize/billing` added to the no-raw-source guard; not re-exported from the index (ingestion-only deep import, matching `normalizeNem`). A future Bayou->canonical adapter targets the same shape with no downstream change. The Bayou adapter itself is NOT built here (dormant path, deferred per project-context).
- **Closed the 1.3 deferral:** mirrored `CanonicalLineItem.kind`/`unit` as the TS unions `BillingLineItemKind` (`tou_energy|demand|nbc|other`) and `BillingLineItemUnit` (`kWh|kW`) in recommendations/types.ts and referenced them on `CanonicalLineItem`, so a typo'd kind/unit is now a compile error (same discipline as `CoverageState`/`PumpStatus`). Extraction settled the kinds in this story, which is exactly the condition 1.3 set for un-deferring.
- **Out of scope (correctly deferred):** the cent-reconciliation gate + `reconciled` promotion (Story 1.7, `src/lib/energy/reconcile.ts` which already exists); the DB inventory read + canonical-bill persistence (Story 1.8); routing `normalizeNem` through `normalizeSaId` for SA-ID consistency (left 1.5 code untouched; noted as a follow-up).

### File List

- `src/lib/extract/schema.ts` (modified) - added `serviceStart`/`serviceEnd` (required) + `cycleClose` (nullable) to `PerSaChargeDetailSchema`.
- `src/lib/extract/schema.test.ts` (modified) - service-period fields on the valid charge-detail fixture.
- `src/lib/extract/pipeline.test.ts` (modified) - service-period fields on `twoTierSa` (covers `threeTierSa`/`badSa` via spread).
- `src/lib/normalize/sa-id.ts` (new) - pure `normalizeSaId` (core id + preserved descriptor).
- `src/lib/normalize/sa-id.test.ts` (new) - bare/trim/suffix/paren/hyphen/blank cases.
- `src/lib/normalize/billing.ts` (new) - pure `normalizeBill` + `BillInventoryRow` / `BillInventoryView`.
- `src/lib/normalize/billing.test.ts` (new) - mapping + line-item sum + descriptor + identity join (match/meter-mismatch/pump-mismatch/SA-not-found/null-ids/blank) + source-swap seam.
- `src/lib/normalize/types.ts` (modified) - `CanonicalBill.saIdDescriptor`; `CanonicalLineItem.kind`/`unit` typed to the new unions.
- `src/lib/recommendations/types.ts` (modified) - added `BillingLineItemKind` / `BillingLineItemUnit` unions (closes the 1.3 deferral).
- `src/lib/normalize/no-raw-source-in-ui.test.ts` (modified) - guard now forbids `@/lib/normalize/billing` in `/app`.
- `fixtures/extract/sample-charge-detail.json` (new) - realistic charge-detail (three-tier TOU + demand + NBC + other), line items sum to the printed total (test-only read).

## Change Log

- 2026-06-09: Implemented Story 1.6 - the pure charge-detail normalize (`normalizeBill`: RawExtraction -> integer-cents `CanonicalBill`) plus the identity-checked SA-ID join (`normalizeSaId` core id + preserved descriptor; present meter#/Pump-ID disagreement, SA-not-found, or blank SA -> needs_review; clean join -> no_bill awaiting 1.7). Additively captured the printed service period on the charge-detail schema (never fabricate dates). Closed the 1.3 line-item kind/unit union deferral. lint + tsc + 257 tests + db:seed all green. Status -> review.
- 2026-06-09: Code review (adversarial: Blind Hunter + Edge Case Hunter + Acceptance Auditor, high effort). Acceptance Auditor: all four ACs PASS, scope discipline correct. Fixed 3 data-fidelity findings (the SA-ID join asymmetry was flagged by ALL THREE layers); deferred 5 robustness/OCR-quality/downstream items to deferred-work.md. lint + tsc + 262 tests green. Status -> done.

## Code Review (2026-06-09)

Adversarial review (high effort) across three parallel layers: Blind Hunter (diff only), Edge Case Hunter (diff + project read), Acceptance Auditor (diff + spec + context). Acceptance Auditor verdict: **all four ACs met, scope discipline correct** (no reconcile/`reconciled` here - that is 1.7's `src/lib/energy/reconcile.ts`; no Prisma; no Bayou adapter built; the 1.3 kind/unit union deferral closed correctly). The SA-ID join asymmetry was raised independently by **all three layers** - the strongest possible signal.

Triage: 3 patches, 5 defer, 0 dismissed.

### Fixed (patches applied this story)

- [Patch] **SA-ID join asymmetry could false-reject a legitimate meter** [src/lib/normalize/billing.ts] - raised by Blind + Edge + Auditor. The bill side ran `normalizeSaId` but the inventory side only `.trim()`d, so an inventory `serviceId` carrying a `P0xx`/descriptor (real grower sheets do; `spreadsheet/inventory.ts` `cleanText` only trims) would fail a legitimate join -> a false `needs_review` (AC3 false-positive). Fixed: normalize BOTH sides to the canonical core. Also made the join treat duplicate/ambiguous SA matches as `needs_review` (filter + `length === 1`, mirroring Story 1.5's NEM) instead of `.find` silently picking the first. New tests: descriptor-bearing inventory row matches; duplicate SA -> needs_review.
- [Patch] **`normalizeSaId` dropped a lone trailing `)`** [src/lib/normalize/sa-id.ts] - Blind + Edge. The unconditional trailing-`)` strip corrupted a preserved descriptor that merely ended in `)` (`"P001)"` -> `"P001"`), violating AC2's "suffix preserved". Fixed: unwrap only a true wrapping `()` pair; a lone trailing `)` is kept verbatim. New test asserts `"1007066742 P001)"` -> descriptor `"P001)"`.
- [Patch] **Identity check false-rejected on whitespace / null-inventory-field** [src/lib/normalize/billing.ts] - Edge + Auditor. Strict untrimmed comparison flagged `"M-8841 "` vs `"M-8841"` as a mismatch, and a null inventory `meterSerial` against a present bill meter# was treated as a disagreement. Fixed: a mismatch now requires BOTH sides present and differing (trimmed); a null on either side is missing data, not a contradiction. New tests: whitespace-noise meter#/Pump-ID -> clean; null inventory serial -> clean.

### Deferred (OCR-quality / downstream / cosmetic, recorded in deferred-work.md)

- [Defer] Space-inside-SA-ID OCR mis-split could attach to a wrong shorter SA - identity check is the backstop; a hard SA-ID format guard is a real-data decision for Story 1.8.
- [Defer] Pathological nested-paren descriptor (`"(P001) (X)"`) still mangles on the single-pair unwrap - descriptor-only, the join core is correct; extremely unlikely on a real bill.
- [Defer] `demandKw` present with `demandAmountCents` null emits no demand line item - correct by design (no dollars -> no reconcile line); revisit if a non-billed demand-kW page needs a zero-dollar line.
- [Defer] Line items are not asserted to sum to `printedTotalCents` at normalize - correct by scope; the cent gate is Story 1.7. The resting `no_bill` must not render as a trusted figure until 1.7.
- [Defer] Story 1.8 inventory-projection contract: drop null/empty-serviceId rows, dedupe meters, feed canonical SA IDs; unify `normalizeNem` (1.5) to route through `normalizeSaId`.
