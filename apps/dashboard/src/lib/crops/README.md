# Almond Logic crop module (Gagan's production worksheet)

Tool 2 for Batth Farms. The `/almondlogic` module was built as a 1:1 mirror of the Almond Logic
grower portal; it has since been **reframed around Gagan's hand-built production worksheet** — the
worksheet is the front door, and the portal-mirror screens are a "Source data" drill-down.

Customer: **Batth Farms** (Gagan owner, Jorge ops). Structure comes from Gagan's master CSV
(`CARUTHERS Almond Production(25).csv`); live weights come from the scraped Almond Logic data.

## The one hard rule: the pound-gate

Deterministic **pure functions own every number.** The AI (ZDR, `src/lib/ai/zdr.ts`) only parses
document structure; it never emits a pound. Every pound carries provenance:

- `ALMOND_LOGIC` — the scrape (field weight, huller weight). An **estimate**.
- `BLUE_DIAMOND_STATEMENT` / `MANUAL_ENTRY` — customer-sourced **good meats (TGM)**. The payable
  figure. **Never scrape-derived** — enforced by a code guard (`assertCustomerSourced`) AND a DB
  CHECK constraint.

Absent data is shown as "insufficient data", never a fabricated zero. A figure the gate cannot
certify against a same-document control total is `needs_review`, never shown as settled.

## Data model (all farmId-scoped, RLS enforced)

| Table            | Grain                              | Source                           |
|------------------|------------------------------------|----------------------------------|
| `CropDelivery`   | per delivery load                  | scrape (`ALMOND_LOGIC`)          |
| `CropRun`        | per huller run (dedup by runId)    | scrape (`ALMOND_LOGIC`)          |
| `Block.entityId` | block → owning legal entity        | CSV seed                         |
| `BlockPlanting`  | block × variety × year → acres     | CSV seed                         |
| `Block.acreage`  | Σ of the block's plantings         | CSV seed (drives energy split)   |
| `CropFieldBlock` | Almond Logic field → block         | CSV seed (field == block number) |
| `TgmRecord`      | block × variety × year → good meats| statement / manual (supersede)   |
| `InventoryItem`  | append-only signed on-hand deltas  | manual (stage RAW/STOCKPILE/MEATS)|
| `CommitmentRecord`| a sale/commitment to a buyer      | manual + ingestion (lifecycle)   |

## Pure engines (`src/lib/crops`, all unit-tested)

- `variety.ts` — `normalizeVariety` bridges CSV codes (np/m/f/ald/i) to scrape names.
- `parse-batth-worksheet.ts` — parses the CSV by **column position** (headers are junk).
- `worksheet.ts` — `worksheetRows` / `groupByEntity` / `subtotal`: Entity→Block→Variety, field
  weight, turnout, YoY, good meats, loss, sellable; two-source cross-check flag; unmapped residual.
- `yoy.ts` — `yearOverYear`: pivot worksheet rows across seasons.
- `tgm-ingest.ts` — `manualTgmInput` / `tgmInputsFromStatement`: validate + gate good meats.
- `inventory.ts` — `inventoryPositions` / `toInventoryWrite`: roll up signed adjustments by stage.
- `sale.ts` — `salePositions` / `availableToSell` / `oversoldBy`: available = NGM − committed.
- `cost.ts` — `costPerPound`: reconciled PG&E energy ÷ mapped yield, per block.

Loaders (`*-load.ts`) gather facts inside `withFarmTenant` (RLS) and hand them to the pure engine.
Server actions (`*-actions.ts`) are manager-gated and re-check session + active-farm + writer role.

## UI (`src/app/(app)/(dashboard)/almondlogic`)

- `/almondlogic` — the **worksheet** (front door). Header links: Record a sale · Inventory · Year
  over year · Add good meats. Season switcher.
- `/almondlogic/{tgm,inventory,sales,yoy}` — the focused entry/comparison sub-pages.
- `/almondlogic/{home,grower,runs,reports,deliveries}` — the "Source data" portal-mirror screens.
- `/almondlogic/{cost,reconcile}` — cost-per-pound and the pound-gate + commitment ledger.

## Open data-onboarding items (not code — flagged for the founders)

These are why some numbers read empty today; the engines are correct and will fill in once the data
lands:

1. **Pump ↔ block links.** The farm carries ~221 real PG&E meters but none are yet mapped to the
   worksheet blocks, so per-block energy cost cannot be attributed (it sits in the unallocatable
   residual). Needs Batth's meter→block assignment.
2. **Crop-year billing coverage.** `energyCents` is 0 for the 2025 crop-year window — the reconciled
   PG&E billing is not in that window. Confirm which season holds reconciled billing so cost/lb has
   an energy numerator.
3. **Meat statements.** TGM for historical years is seeded from the CSV (`MANUAL_ENTRY`); ongoing
   good meats come from Blue Diamond statements via the ZDR path or the manual form.

Nuance: a block with mapped yield but zero attributed energy currently renders `$0.00/lb` rather than
a distinct "no energy" state; the farm-level "no reconciled bills" banner contextualizes it. A third
per-block state could be added if it proves confusing.

## Prod deploy

Prod DB writes are gated to Kamran. See `PROD_APPLY.md` for the migration + seed runbook. The app
build (typecheck + lint + build) is green; the `*.db.test.ts` RLS tests need local Postgres with the
`pgvector` extension and are not run in CI.
