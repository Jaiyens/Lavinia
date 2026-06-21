# Huron big reservoir — metadata-only meter dossier

> Source: `normalized/inventory.json` rowNumber 82, `normalized/manifest.json` (Excel inventory).
> **Billed = false.** This meter is NOT on the master billed account 4699664587-8, so there is **no bill PDF in hand** — this is a
> **metadata-only** dossier. No itemized charges, no reconciled cycle, no engine-quoted dollar is possible until a bill or interval pull lands (see section d).

---

## (a) Identity

| Field | Value |
|---|---|
| Grower pump id | **Huron big reservoir** |
| Descriptor | not recorded |
| PG&E Service Agreement (SA) ID | **92923550** |
| Meter serial # | **1009970834** |
| Legal entity (billing name) | **KANWARJIT BATTH & GAGANDIP BATTH** |
| PG&E account # | **0096005793-3** |
| Ranch | not recorded (`ranch: null`) |
| Crop served | not recorded (`crop: null`) |
| Irrigation source | not recorded |
| Pump capacity (GPM) | not recorded (`gpm: null`) |
| Horsepower | not recorded in the inventory (HP column blank) |
| Status | not recorded (`status: null`) |
| Latitude / Longitude | **36.269917, -120.140227** |
| Inventory rowNumber | 82 |
| Stored rate schedule | `AG5B` |

This is an irrigation reservoir/booster. Its coordinates (36.269917, -120.140227) sit well **south/west of the main Kerman-area ranches**, consistent with the Huron / Westlands holdings.

---

## (b) Rate schedule, decoded

**Stored schedule: `AG5B`** — family **AG-5** (LEGACY / closed).

- **What it is.** AG-5B is one of PG&E's **legacy / closed** agricultural time-of-use rate families (it predates the current AG-A / AG-B / AG-C lineup). The trailing "B" is the size class within the family (B = large >35 kW, C = small). It bills a daily/monthly customer charge, time-of-use energy that varies by peak / partial-peak / off-peak and by summer/winter, and a **summer peak-period demand charge** ($/kW), like the current AG-C. In the rate engine this maps via `planFromLabel` with `legacy:true`, which is exactly the population the rate-optimization lever exists to re-examine.
- **Demand component.** This schedule carries a summer peak-period **demand** charge ($/kW), like the current AG-C.
- **Size tier.** large (B size class, >35 kW connected load).
- **In the rate engine.** This is a **legacy grandfathered** assignment: a pump enrolled years ago on AG-5 and never migrated to a current AG-A/B/C card. Legacy meters are prime rate-review candidates — but per the ground-truth caveat, any AG-5->AG-B/AG-C "savings" the engine emits without 15-minute interval kWh is **sign-ambiguous and must not be quoted**.

---

## (c) Solar / NEM status + true-up

**No solar / NEM on this meter.** `solarFlag: false`, `nemType: null`, no solar group, no true-up month. This is a straight grid-served meter. Nothing to allocate and no true-up to chase.

---

## (d) What data would unlock dollar findings

**This meter has no bill in hand.** Every dollar figure in this product is produced by **deterministic pure functions in `src/lib/energy`** (the rate lever, bill audit, solar/NEM checks) — *no AI*. The only AI in the pipeline is the **bill-PDF vision extraction in `src/lib/extract`** that turns a bill image into the JSON those functions read. With metadata only, none of those engines can run for this SA. To unlock findings:

1. **The account bill PDF for 0096005793-3** (entity KANWARJIT BATTH & GAGANDIP BATTH). Vision extraction (`src/lib/extract`) reads the printed tariff name, the itemized charges, the customer/demand/TOU lines, and the cycle close. That alone lets `bill-verify.ts` reconcile a cycle and `bill-audit.ts` flag anomalies. **OR**
2. **A UtilityAPI pull for SA 92923550** (the durable Batth authorization can re-pull this SA). This is the only path to **15-minute interval kWh**, which the rate-optimization lever needs to be trustworthy — bill summaries carry no interval kWh, so any AG-5->AG-B/AG-C "savings" computed without intervals is a **sign-ambiguous artifact** and must not be quoted.

**Until one of the above lands, the honest output for this SA is silence (no dollar) — exactly the fail-closed behavior the engines are built for.**

---

## (e) Notable (>$500/yr) flag

**FLAG: yes — worth chasing once data lands.** legacy AG-5 rate on a real ag pump (rate-review candidate) — legacy meters across 183 SAs are the headline rate-optimization population.

> No engine dollar can be quoted yet (no bill / no intervals). The flag means this SA should be **first in line** for a bill PDF or UtilityAPI pull, not that a saving is proven.

---

## (f) One-line plain-operator-English summary

> Huron big reservoir is on the old AG-5 rate, but it sits on a **different PG&E account that we don't have a bill for** — so we can't show real numbers yet. Pull this meter's bill (or a 15-minute meter read) and we can check whether the old rate is costing you money.

**Data state:** metadata-only (Excel inventory). Billed = false. No reconciled cycle, no engine-quoted dollar.
