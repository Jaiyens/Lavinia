# Batth Farms — Normalized Dataset Data Dictionary

The complete reference for the normalized Batth dataset: the per-meter shape, the
counts by every dimension, how the two source datasets (the 183-meter Excel
inventory and the 46-SA PG&E bill) reconcile, the known gaps, and an index into
the 183 per-meter dossiers.

This file **merges and supersedes** the two methodology docs as the single entry
point:
- `methodology/data-excel.md` — the Excel master-list (inventory) dictionary.
- `methodology/data-bill.md` — the PG&E bill (account 4699664587-8) dictionary.

Both remain on disk for their full provenance and reconciliation narratives; this
document is the consolidated reference and adds the normalized-shape and dossier
index that neither methodology file carries.

---

## 0. Ground truth (do not contradict)

These constraints bound every number below. They are verified and load-bearing.

1. **Solar = 1,932 kW**, across **two shared physical arrays (840 kW + 1,092 kW)**.
   NOT 12,180 kW. The `840kw` / `1092kw` cell text is a **shared-array nameplate
   stamped on every meter the array serves**, not per-meter capacity. Any capacity
   rollup MUST dedupe by distinct array label. Summing the column row-by-row
   (8×840 + 5×1092 = 12,180) is the well-known **12,180 kW artifact and is WRONG**.
2. **Two datasets, different scopes.** The PG&E **bill** covers account
   `4699664587-8` = **~46 metered SAs**. The Excel **inventory** is broader:
   **183 meters across 57 accounts / ~6 billing entities**. They are joined on SA
   ID (the PG&E Service Agreement ID).
3. **Savings dollars are deterministic.** All dollar figures are computed by
   **pure functions in `src/lib/energy`** — no AI. The **only** AI in the pipeline
   is the **bill-PDF vision extraction in `src/lib/extract`**.
4. **Rate optimization needs intervals.** Trustworthy rate optimization requires
   **15-minute interval kWh**. Bill summaries carry **no kWh** at interval
   resolution, so any **AG-C→AG-B "savings"** the engine emits without intervals
   are **sign-ambiguous artifacts**, not validated findings. (`intervals` is empty
   on all 183 normalized meters — see §2.)
5. **The P031 / VINES 75HP $62,795.65 true-up is a real zero-credit anomaly**
   (sibling P038 proves the behavior is real). But recovery is **$0–$57k and
   CONTINGENT** on the Generation Allocation Summary — the shared arrays may be
   oversubscribed (zero-sum). **Never state it as banked money.**

---

## 1. Source datasets

| Dataset | File | Rows | Scope | Authority |
|---|---|---|---|---|
| **Inventory** (Excel master list) | `normalized/inventory.json` | 183 meters | 57 accounts, ~6 entities | Account / SA ID / meter # / rate = PG&E-authoritative; RANCH / crop / GPM / solar / status = operator field knowledge |
| **Bill** (vision-extracted PDF) | `normalized/billing.json` | 46 SAs / 52 cycles | account `4699664587-8` only | Cent-reconciled to the 114-page statement; the ONLY AI step (vision extract in `src/lib/extract`) |
| **Normalized meters** (the join) | `normalized/meters.json` | 183 meters | full inventory, bill-joined on the 43 overlapping SAs | merges inventory + bill onto one per-meter shape |
| **Manifest** (index) | `normalized/manifest.json` | 183 | identity-only index | drives the dossier index (§8) |
| **Per-meter JSON** | `normalized/by-meter/<serviceId>.json` | 183 files | one file per SA | machine-readable per-meter cut |
| **Per-meter dossiers** | `meters/<name>.md` | 183 files | one narrative per meter | human-readable; named by pump ID where present (§8) |

- Inventory provenance: `Batth Farms 2025 Master Meter List (1).xlsx`, sheet1,
  Excel table `A1:V184` — a hand-maintained master list, not a system export.
- Bill source of truth: `apps/dashboard/fixtures/extract/batth-account-4699664587.json`
  (cent-reconciled vision extraction of `apps/dashboard/BatthFarmAccountPdf.pdf`).
- Builders (re-runnable): inventory normalizer; `normalized/_build_billing.py`;
  `build-utilityapi-pretty.py`.

---

## 2. The normalized meter shape (`meters.json`)

`meters.json` is an array of **183 objects**, one per inventory SA, joined to the
bill on the **43 SAs that appear in both** (the bill account `4699664587-8`).

### 2.1 Top-level fields

| Field | Type | Meaning |
|---|---|---|
| `serviceId` | string | PG&E Service Agreement ID — the join key / per-meter primary key. 183 distinct, no dupes. Kept as a **string** (leading-zero SAs like `730240746` must not be coerced to int). |
| `meterSerial` | string\|null | Physical meter serial. 182/183 filled (1 blank: the OL1 lighting SA). |
| `accountNumber` | string | PG&E 10-digit account with check digit (e.g. `4699664587-8`). 57 distinct. Strings (leading zeros preserved). |
| `fuel` | string | Always `electric` in this dataset. |
| `tariff` | string\|null | Convenience copy of `meta.rateSchedule` (the active PG&E tariff). |
| `address` | string\|null | Composed label `RANCH, descriptor, pumpId` for display. |
| `intervals` | array | **Empty on all 183 meters.** No 15-minute interval kWh was available. This is why rate-optimization output is interval-blind (see §0.4). |
| `summaries` | array | Per-cycle billing summary; populated only for **billed** meters (the 43 bill-joined SAs). Each has exactly 1 element here (the latest cycle). |
| `meta` | object | All inventory field knowledge + bill-derived flags (see §2.3). |

### 2.2 The `summaries[]` element

Present only on the 43 bill-joined meters; `[]` on the other 140.

| Field | Type | Meaning |
|---|---|---|
| `start` / `close` | string (date) | Billing period start / close. |
| `tariff` | string | Rate schedule for the cycle. |
| `demandCharges` | array | `{ note, usd }` per printed demand line (canonical "Maximum Demand"). |
| `demandChargeUsd` | number\|null | Canonical per-cycle demand charge (null = no demand charge on this schedule, e.g. AG-A). |
| `totalBillUsd` | number | Printed cycle total. |

> For the full bill grammar (every charge type, the structured-vs-text demand
> distinction, TOU taxonomy, NEM block, the $86,942.12 running-balance
> reconciliation), see `methodology/data-bill.md` §1–§8. It is **not** restated
> here; `meters.json.summaries[]` is a per-meter convenience slice of it.

### 2.3 The `meta` object — every field

Inventory field knowledge (from the Excel master list) plus bill-derived rollups.
Fill rates are out of **183** unless noted. Blank source cells become `null`.

| `meta` key | Type | Excel col | Meaning | Fill |
|---|---|---|---|---|
| `growerPumpId` | string\|null | F | Grower pump label (`P004`); also `Office`, `Huron Well 4`, etc. | 124 |
| `saIdDescriptor` | string\|null | — | SA descriptor as joined (pump id or printed free text). | — |
| `rateSchedule` | string\|null | G | Active PG&E tariff code (16 distinct, §4). | 182 |
| `legacy` | bool\|null | H | Legacy/grandfathered service. Source `"Yes"` → `true`; else `null`. | 27 true |
| `latitude` | number\|null | J | Premise latitude (~36.25–36.56). | 178 |
| `longitude` | number\|null | K | Premise longitude (~-119.85 to -120.13). | 178 |
| `hasCoordinates` | bool | derived | `true` iff both lat & long present. | 178 true / 5 false |
| `ranch` | string\|null | U | Operator ranch/block name (36 distinct). | 120 |
| `entity` | string\|null | A | Billing name = billing entity (§3). | 182 |
| `actualOwner` | string\|null | B | True beneficial owner where it differs. **Only 1 filled** (`KG BATTH FLP`). | 1 |
| `status` | string\|null | V | `GOOD` / `NEW WELL` / `BAD` / `OLD`. | 120 |
| `gpm` | number\|null | Q | Pump flow rate (gal/min, 100–3000). | 120 |
| `crop` | string\|null | R | Crop on served acreage (6 distinct). | 54 |
| `irrigation` | string\|null | T | Surface-water / irrigation district (6 distinct). | 50 |
| `installedOn` | number\|null | S | Install year (2013–2024). | 20 |
| `contiguous` | bool\|null | O | Parcel-contiguity flag. `"Yes"` → `true`; else `null`. | 67 true |
| `nemType` | string\|null | M | NEM enrollment code (6 distinct, §5). | 40 |
| `trueUpMonth` | string\|null | N | NEM annual true-up month name. | 14 |
| `solarFlag` | bool | derived (L) | `true` iff the Solar cell is non-empty. | 56 true |
| `solarGroupLabel` | string\|null | L | Raw Solar-cell text, verbatim (array group ID, `Solar`, or kW label). | 56 |
| `solarKw` | number\|null | derived (L) | Set only when the cell matches `^(\d+)\s*kw$`: **840 (×8) or 1092 (×5)**. Shared-array nameplate, NOT per-meter capacity (§6). | 13 |
| `solarNotes` | string\|null | P | Operator note (`not using`, `new well`, `old`, …). | 33 |
| `peakKw` | number\|null | bill | Billed max demand (kW), latest cycle. | 22 |
| `annualCostUsd` | number\|null | bill | Annual cost rollup. | 43 (= billed) |
| `billed` | bool | derived | `true` iff this SA appears in the bill account `4699664587-8`. | **43 true** |
| `flags` | object\|null | bill | Idle/NEM flags; present only on the 43 billed meters (§2.4). | 43 |
| `nem` | object\|null | bill | NEM/solar block; present only on the **14** NEM-enrolled billed meters (§2.5). | 14 |
| `rowNumber` | number | derived | 1-based Excel data row (**Excel row = `rowNumber` + 1**). | 183 |
| `idx` | number | derived | 0-based position; matches `manifest.json` `idx`. | 183 |

### 2.4 `meta.flags` (billed meters only)

| Flag | Meaning | Count (of 43 billed) |
|---|---|---|
| `idleZeroKwh` | Latest cycle shows 0 metered kWh. | 26 true |
| `nemEnrolledZeroSolarBenefit` | NEM-enrolled but zero solar benefit appearing on the meter. | 12 true |
| `trulyIdleNonNem` | Zero kWh AND no NEM = genuinely dormant SA still paying fixed charges. | 12 true |

> Account-wide (full bill, all 46 SAs, from `methodology/data-bill.md` §6): **28**
> idle on latest cycle = **14** NEM-netted (not dormant) + **14** truly idle. The
> per-meter `flags` above count only the 43 inventory-joined SAs, so they are a
> subset of the bill's 46.

### 2.5 `meta.nem` (NEM-enrolled billed meters only — 14)

| Field | Meaning |
|---|---|
| `nemEnrolled` | Always `true` when the block is present. |
| `trueUpAmountUsd` | Settled annual NEM true-up $ for this meter (null where YTD-only). |
| `trueUpMonth` | True-up settle month (numeric). |
| `annualNetKwh` | Annual net kWh (sign: **+ = net import / charge, − = net export / credit**). |

> The full NEM grammar (settled true-up vs YTD running charge, monthly net rows,
> NBC/PCIA embedding, the VINES 75HP two-record handling) is in
> `methodology/data-bill.md` §5. The account NEM true-up total is **$83,338.49**
> across **11 settled** true-ups.

---

## 3. Counts by entity, account, ranch

### 3.1 Billing entity (`meta.entity`, Excel col A) — ~6 names

| Billing entity | Meters | Distinct accounts | Note |
|---|---:|---:|---|
| BATTH,CHARANJIT S | 59 | 12 | Includes the big bill account `4699664587-8`. |
| KANWARJIT BATTH & GAGANDIP BATTH | 48 | 13 | |
| K S BATTH & G S BATTH PARTNERSHIP | 47 | 6 | |
| BATTH FARMS INC | 22 | 19 | |
| **BATHH FARMS INC** | 4 | 4 | **Typo of "BATTH FARMS INC"** (rows 78, 140, 145, 172). Fold into BATTH FARMS INC for per-entity rollups. |
| BATTH,SURINDER K | 2 | 2 | |
| (null) | 1 | 1 | Row 39, orphan account `57448094630` (§7). |

- **~6 billing entities** named (5 after folding the BATHH typo; +1 null row).
- **`actualOwner` = `KG BATTH FLP`** appears on exactly **1** row — the true
  ownership umbrella is a family limited partnership the billing names do not
  reflect.
- **No account spans more than one entity** (verified: clean account→entity map).

### 3.2 Account (`accountNumber`, Excel col C)

- **57 distinct accounts** across 183 meters.
- The big bill account **`4699664587-8`** carries the most meters and is the only
  account with extracted bill detail.
- One malformed/orphan account: **`57448094630`** (11 digits, no check-digit dash;
  row 39) — see §7.

### 3.3 Ranch (`meta.ranch`, Excel col U) — 36 distinct, 120 filled, 63 null

Largest blocks: BIG BLOCK 22 · SWANSON 12 · ELKHORN SHOP 8 · AIRPORT 7 · HOME
RANCH 6 · KAMM CORNELIA 6 · NEW RANCH 5 · KAMM RANCH 5 · CHATEAU FRESNO 4 · EAST
RANCH S 4. The PINOT GRIS series (PINOT GRIS, 640, 641, 642, 643) are 5 sub-blocks
of one wine-grape ranch.

---

## 4. Counts by rate schedule (`meta.rateSchedule`, Excel col G)

16 distinct + 1 null. Counts from `meters.json`:

| Code | Count | | Code | Count |
|---|---:|---|---|---:|
| HAGC | 83 | | A1X | 3 |
| HAGA2 | 19 | | AG4C | 2 |
| AG5B | 16 | | B1 | 2 |
| HAGA1 | 15 | | AGB | 2 |
| AGC | 13 | | HAGFB | 2 |
| AG5C | 9 | | E19P | 1 |
| HAGB | 8 | | OL1 | 1 |
| HB1 | 5 | | HB6 | 1 |
| | | | (null) | 1 |

- `H`-prefixed (HAGA1/HAGA2/HAGB/HAGC/HAGFB, HB1/HB6) = current PG&E TOU ag /
  commercial tariffs. Un-prefixed (AG4C/AG5B/AG5C/AGB/AGC/A1X/B1/E19P/OL1) = older
  schedules. `OL1` = outdoor lighting (non-pump). `B1`/`A1X` = small commercial.
- **AG-A** (`AGA1`/`AGA2`/`HAGA1`/`HAGA2`, <35 kW) carry **no demand charge**;
  **AG-B / AG-C** (≥35 kW) carry a **per-kW demand charge** on monthly peak. This
  AG-A→AG-B→AG-C tier difference drives the rate-arbitrage analysis — subject to
  the interval-data caveat (§0.4).

> The bill-side latest-cycle tariff distribution (decoded names, AGC Ag35+, etc.)
> across the 46 billed SAs is in `methodology/data-bill.md` §4. It differs in
> presentation (decoded labels, 46 SAs) from this inventory-wide raw-code table
> (183 meters).

---

## 5. Counts by NEM type, status, crop, and other categoricals

### 5.1 NEM type (`meta.nemType`, Excel col M) — 6 distinct, 40 filled, 143 null

| Code | Count | Meaning |
|---|---:|---|
| NEM2AA | 26 | NEM 2.0, aggregated agricultural |
| NEMEXPM | 6 | NEM expansion, metered |
| NEM2AG | 3 | NEM 2.0 agricultural |
| NEMEXP | 3 | NEM expansion |
| NEM2M | 1 | NEM 2.0 metered |
| NEMS | 1 | NEM single (office) |

Only **40** SAs carry an explicit on-sheet NEM tag; solar association
(`solarFlag`, 56) is broader. The **bill** independently identifies **14**
NEM-enrolled SAs on account `4699664587-8` (those are the 14 meters carrying a
`meta.nem` block, §2.5).

### 5.2 Status (`meta.status`, Excel col V) — 4 distinct, 120 filled, 63 null

| Status | Count |
|---|---:|
| GOOD | 87 |
| NEW WELL | 26 |
| BAD | 6 |
| OLD | 1 |

`NEW WELL` correlates with the `new well` solar-note and the 840 kW array cohort
(§6). `BAD` (6) + `OLD` (1) = **7 meters** flagged not serviceable.

### 5.3 Crop (`meta.crop`, Excel col R) — 6 distinct, 54 filled, 129 null

ALMONDS 30 · RAISINS 7 · WINE GRAPES 7 · PISTACHIO 7 · WALNUT 2 · ZANTE 1.

### 5.4 Other operator categoricals (from the Excel master list)

- **Irrigation district** (col T, 50 filled): CONSOLIDATED 20 · RCWD 14 · LIBERTY 6 · MURPHY SLOUGH 5 · WESTLANDS 4 · LAGUNA 1.
- **True-up month** (col N, 14 filled): December 6 · May 3 · January 2 · August 1 · July 1 · October 1.
- **Installed-on year** (col S, 20 filled): 2013 ×7 · 2023 ×3 · 2019/2022/2021/2018 ×2 each · 2020/2024 ×1.
- **Solar notes** (col P, 33 filled): not using 10 · new well 9 · old 7 · using 3 · minimal use 2 · need to drill 1 · research 1.
- **Legacy** (col H): 27 true. **Contiguous** (col O): 67 true. **GPM** (col Q): 120 filled (integers 100–3000).

> Absence ≠ "none" on these operator fields — it means **not logged**. They are
> field knowledge, not PG&E-authoritative.

---

## 6. Solar / NEM — the 1,932 kW reconciliation

The Excel `Solar` column (col L) mixes three semantically different things, split
by the normalizer into `solarFlag` / `solarGroupLabel` / `solarKw`.

| Cell value | Count | Interpretation | `solarKw` |
|---|---:|---|---:|
| 4433 | 11 | array/grouping ID (legacy inverter group) | null |
| 5219 | 10 | array/grouping ID | null |
| Solar | 9 | generic flag (the NEM true-up SAs) | null |
| 4444 | 8 | array/grouping ID | null |
| **840kw** | 8 | **nameplate of the 840 kW shared array** | **840** |
| **1092kw** | 5 | **nameplate of the 1,092 kW shared array** | **1092** |
| 4939 | 4 | array/grouping ID | null |
| 4624 | 1 | array/grouping ID | null |

- **Total solar = 840 + 1,092 = 1,932 kW** across **2 physical arrays** — dedupe
  by distinct array label. **NEVER** `8×840 + 5×1092 = 12,180` (the artifact).
- **1,092 kW array** serves 5 meters: account `6539944461-4` (P006, P013, P024,
  P099) + orphan account `57448094630` (row 39).
- **840 kW array** serves 8 single-meter "new well" accounts: P106, P118, P119,
  P120, P121, P122, P142, P154.
- `meters.json` carries `solarKw` per row only so a consumer can identify array
  membership; any capacity rollup must dedupe.

---

## 7. Inventory ↔ bill reconciliation, and the gaps

### 7.1 How 183 inventory meters map to the 46 billed SAs

The bill (`account 4699664587-8`) reports **46 metered SAs**. The inventory has
**45 rows** on that account. The join (`meta.billed = true`) lands on **43** SAs.

```
                    Bill account 4699664587-8  ──────────────  Excel inventory (183 meters)
                            46 billed SAs                        45 rows on this account
                                  │                                        │
                                  ├── 43 SAs in BOTH  ◄── meta.billed=true on these 43 inventory rows
                                  │                       (summaries[], flags, annualCostUsd populated)
                                  │
                                  ├── 3 billed SAs NOT in inventory  ──►  inventory completeness gap (§7.2)
                                  │
                            (45 inventory rows) ── 43 joined ── 2 inventory rows NOT in the billed window (§7.3)
```

- **43** SAs appear in **both** → these are the 43 `meta.billed = true` rows in
  `meters.json` (the only rows with `summaries[]`, `flags`, `annualCostUsd`, and
  — for 14 of them — a `nem` block).
- **Full account census** = inventory (45) ∪ the 3 missing billed SAs = the 46
  billed SAs.

### 7.2 The 3 billed-not-in-inventory SAs (inventory completeness gap)

Billed by PG&E but never entered in the operator's master list. All low-dollar /
idle. They are **absent from `meters.json`** (confirmed):

| SA ID | Meter # | Descriptor | Rate | Latest bill |
|---|---|---|---|---|
| 4691715828 | 1010073676 | PUMP 73 | AGC | $44.21 (5.48 kWh, near-idle) |
| 4697631144 | 1009488067 | BATH FARMS- IRR 100HP K-87 | AGC | $43.00 (0 kWh, idle) |
| 4698006011 | 1010427314 | (none) | AGB | $27.47 (0 kWh, idle) |

This is a gap in the **inventory**, not the bill.

### 7.3 The 2 inventory-not-in-billed-window SAs

Two inventory rows on account `4699664587-8` are **not** in the bill extract
(`meta.billed = false`): SAs **`4695663573`** (P073) and **`4697793352`** (P025).
The bill is a 12-month annual snapshot; these were likely inactive in the billed
window. (This is why 45 inventory rows minus 2 = the 43 joined.)

### 7.4 The 5 missing-coordinate meters (`hasCoordinates = false`)

Both lat and long blank:

| Excel row | Account | SA ID | Pump |
|---:|---|---|---|
| 32 | 3922545703-3 | 3929761887 | P076 |
| 39 | 57448094630 | 6116351334 | (orphan, none) |
| 92 | 1909940814-8 | 1904328353 | P091 |
| 121 | 1909940814-8 | 1901103772 | P138 |
| 183 | 5047939094-5 | 5042685096 | (none) |

178/183 meters are geocoded; these 5 are not mappable.

### 7.5 The orphan / malformed account (row 39)

Account `57448094630` is **11 digits with no check-digit dash** (all others are
`NNNNNNNNNN-N`). The row is nearly blank — no billing name, rate, pump ID,
coordinates, or status — only account, SA `6116351334`, meter `1011699460`, and
`solar = 1092kw`. It is the **5th member of the 1,092 kW array**. Treat the
account number as suspect/incomplete.

### 7.6 The P031 / VINES 75HP true-up anomaly

- Inventory **row 53**: SA `4699664088`, pump **P031**, descriptor
  `VINES IRR 75HP NEW 75HP (PUMP # 31)`, rate **AGB**, NEMA **NEMEXP**, true-up
  **December**, account `4699664587-8`.
- The bill shows this SA with a **settled $62,795.65** annual true-up and 0
  monthly kWh (NEM-netted; ~190,505 net kWh imported, ~$0 export credit) — a real
  **zero-credit anomaly**, with sibling **P038** (row 55, SA `4699664743`,
  NEMEXPM, December) as the proof case (124k kWh import, $0 export, ~$0.26
  true-up).
- The bill also carries a **separate YTD running charge of $2,320.61** for P031,
  preserved in the bill's `ytdRunningChargeUsd` and **never** double-counted into
  the $62,795.65 or the account NEM true-up total.
- **Do not overstate:** recovery is **$0–$57k and CONTINGENT** on the Generation
  Allocation Summary (arrays may be oversubscribed = zero-sum). An anomaly to
  investigate, **not banked savings**.

---

## 8. Reconciliation summary (audit trail)

| Quantity | Value |
|---|---|
| Inventory meters | **183** |
| Distinct accounts | **57** |
| Billing entities | **~6** (5 after folding the `BATHH` typo; +1 null row) |
| True owner | `KG BATTH FLP` (FLP umbrella; on 1 row's `actualOwner`) |
| Solar | **1,932 kW** across **2 shared arrays** (840 + 1,092) — never 12,180 |
| Geocoded | **178** ( / 5 missing coords) |
| Bill account `4699664587-8` billed SAs | **46** |
| — joined into `meters.json` (`billed=true`) | **43** |
| — billed but absent from inventory | **3** (all idle/near-idle) |
| Inventory rows on the account, outside billed window | **2** |
| NEM-enrolled (bill) | **14** ( = meters with a `meta.nem` block) |
| NEM settled true-ups | **11**, totaling **$83,338.49** |
| Account total amount due (running balance) | **$86,942.12** (RECONCILED) |
| Interval kWh available | **0** on all 183 meters (`intervals: []`) |

---

## 9. Per-meter dossier index

Every meter has a human-readable dossier under
`meters/<name>.md` and a machine-readable cut under
`normalized/by-meter/<serviceId>.json`.

### 9.1 Naming convention

- **124 meters with a grower pump ID** → dossier named by that ID:
  `meters/<growerPumpId>.md`, e.g. `meters/P004.md`, `meters/P031.md`. A handful
  use descriptive pump IDs verbatim: **`Office.md`**, **`Huron Well 4.md`**,
  **`Huron big reservoir.md`**.
- **59 meters with no pump ID** → dossier named by **SA ID**:
  `meters/<serviceId>.md`, e.g. `meters/1666375919.md`, `meters/736862474.md`.
- All **183** manifest entries resolve to exactly one dossier (verified: 124 by
  pump ID, 59 by SA ID, 0 unmatched).
- The `by-meter/` JSON files are **always** named by SA ID:
  `normalized/by-meter/<serviceId>.json`.

To locate a meter's dossier from the manifest: use
`pumpId ? pumpId + ".md" : serviceId + ".md"`, joined under `meters/`. Use
`serviceId` for the JSON and for any cross-dataset join (it is the stable key).

### 9.2 Index (by SA ID → pump → account → entity → ranch → billed → dossier)

The authoritative index is `normalized/manifest.json` (183 entries, each with
`idx`, `serviceId`, `pumpId`, `account`, `entity`, `ranch`, `billed`). The
`billed` flag marks the 43 SAs joined to the bill account `4699664587-8`.

The 43 **billed** meters (`meta.billed = true`), by pump ID, with dossier path:

| Pump | SA ID | Ranch | Dossier |
|---|---|---|---|
| P002 | 4691688023 | MENDOTA | `meters/P002.md` |
| P003 | 4692494679 | ELKHORN SHOP | `meters/P003.md` |
| P004 | 4698660251 | HURON | `meters/P004.md` |
| P008 | 4692424863 | BIG BLOCK | `meters/P008.md` |
| P017 | 4699141870 | BIG BLOCK | `meters/P017.md` |
| P018 | 4690972110 | BIG BLOCK | `meters/P018.md` |
| P027 | 4697755484 | CHATEAU FRESNO | `meters/P027.md` |
| P028 | 4693142227 | CHATEAU FRESNO | `meters/P028.md` |
| **P031** | **4699664088** | (null) | `meters/P031.md` (VINES 75HP true-up anomaly, §7.6) |
| P038 | 4699664743 | BIG BLOCK | `meters/P038.md` (P031 proof sibling) |
| P041 | 4699664441 | AIRPORT | `meters/P041.md` |
| P043 | 4699664965 | BIG BLOCK | `meters/P043.md` |
| P045 | 4699664955 | CEDAR RANCH | `meters/P045.md` |
| P048 | 4699664321 | SWANSON | `meters/P048.md` |
| P052 | 4695719808 | SWANSON | `meters/P052.md` |
| P054 | 4696826125 | SWANSON | `meters/P054.md` |
| P055 | 4699664820 | SWANSON | `meters/P055.md` |
| P056 | 4699664538 | SWANSON | `meters/P056.md` |
| P057 | 4699664561 | SWANSON | `meters/P057.md` |
| P058 | 4698074516 | SWANSON | `meters/P058.md` |
| P060 | 4699664335 | ELKHORN SHOP | `meters/P060.md` |
| P062 | 4695237170 | ELKHORN SHOP | `meters/P062.md` |
| P063 | 4699664286 | ELKHORN SHOP | `meters/P063.md` |
| P066 | 4696771732 | PINOT GRIS | `meters/P066.md` |
| P067 | 4694038660 | HOME RANCH | `meters/P067.md` |
| P069 | 4699664012 | KAMM CORNELIA | `meters/P069.md` |
| P072 | 4699664198 | HOME RANCH | `meters/P072.md` |
| P075 | 4692166716 | OFFICE | `meters/P075.md` |
| P077 | 4699664728 | KAMM CORNELIA | `meters/P077.md` |
| P078 | 4699664416 | DEHYDRATER | `meters/P078.md` |
| Office | 4699664172 | (null) | `meters/Office.md` |
| (no pump) | 4699142630 | (null) | `meters/4699142630.md` |
| (no pump) | 4699664016 | (null) | `meters/4699664016.md` |
| (no pump) | 4699664194 | (null) | `meters/4699664194.md` |
| (no pump) | 4699664272 | (null) | `meters/4699664272.md` |
| (no pump) | 4699664294 | (null) | `meters/4699664294.md` |
| (no pump) | 4699664429 | (null) | `meters/4699664429.md` |
| (no pump) | 4699664540 | (null) | `meters/4699664540.md` |
| (no pump) | 4699664553 | (null) | `meters/4699664553.md` |
| (no pump) | 4699664599 | (null) | `meters/4699664599.md` |
| (no pump) | 4699664794 | (null) | `meters/4699664794.md` |
| (no pump) | 4699664985 | (null) | `meters/4699664985.md` |
| (no pump) | 4699664991 | (null) | `meters/4699664991.md` |

The remaining **140 meters** (`meta.billed = false`) span the other 56 accounts
and are indexed identically in `manifest.json`; their dossiers follow the same
`pumpId || serviceId` rule (e.g. `meters/P035.md`, `meters/Huron Well 4.md`,
`meters/736862474.md`).

---

## 10. Caveats carried forward

1. **Solar = 1,932 kW** (840 + 1,092), never 12,180.
2. **Two scopes:** bill = 46 SAs on one account; inventory = 183 meters / 57
   accounts / ~6 entities. Join on SA ID.
3. **Savings math is deterministic** (`src/lib/energy`); the only AI is the
   bill-PDF vision extraction (`src/lib/extract`).
4. **Rate optimization needs 15-min intervals**, which are absent here
   (`intervals: []` on all 183). AG-C→AG-B "savings" without intervals are
   **sign-ambiguous artifacts**, not findings.
5. **The VINES 75HP $62,795.65 true-up** is a real zero-credit anomaly; recovery
   is **$0–$57k and CONTINGENT** on the Generation Allocation Summary. **Not
   banked money.**

---

## 11. Related files

- `methodology/data-excel.md` — full inventory (Excel) dictionary + provenance + data-quality narrative.
- `methodology/data-bill.md` — full bill (account 4699664587-8) charge-type grammar + reconciliation.
- `normalized/meters.json` — the joined per-meter shape documented in §2.
- `normalized/manifest.json` — the 183-entry identity index behind §9.
- `normalized/billing.json` / `_build_billing.py` — re-derived per-meter bill + builder.
- `normalized/inventory.json` — normalized Excel master list.
- `normalized/by-meter/<serviceId>.json` — machine-readable per-meter cut.
- `meters/<name>.md` — the 183 human-readable dossiers (§9 naming).
