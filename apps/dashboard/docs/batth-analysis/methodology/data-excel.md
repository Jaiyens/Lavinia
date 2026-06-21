# Batth Farms 2025 Master Meter List — Data Dictionary & Quality Notes

Source file: `Batth Farms 2025 Master Meter List  (1).xlsx`
Parsed part: `xl/worksheets/sheet1.xml` (single sheet, Excel table `A1:V184`).
Normalized output: `apps/dashboard/docs/batth-analysis/normalized/inventory.json`
Prior file cross-checked: `apps/dashboard/docs/batth-analysis/batth-real-inventory.json`

## 1. Provenance

- Workbook created **2025-10-02** by `Smith, Jennifer`; last modified by `AwMan242007@outlook.com`; last printed 2026-05-14.
- It is a hand-maintained master list, not a system export. It carries two **external workbook links** (cells reference, not embedded data):
  - `Z:\Jorge\PGE\2025 Annual Usage Report-Batth Farms .xlsx` — Jorge's PG&E annual-usage export (the billing-side source).
  - `Z:\PGE\2026 water info internal only.xlsx` — an internal water/GPM workbook.
- Implication: GPM, RANCH, crop, irrigation district, solar grouping, and status are **operator-entered field knowledge**, not PG&E-authoritative. Account / SA ID / meter # / rate schedule are PG&E-authoritative and reconcile to the bill extract.

## 2. Shape

- **1 header row + 183 data rows**, 22 physical columns **A–V**.
- Physical column order A–V matches the prompt's stated column order exactly. (The Excel table's internal `tableColumn` ids are out of sequence, but the on-sheet layout is A=Billing Name … V=Status.)
- Parsing method: raw `zipfile` + `xml.etree`. Cells with `t="s"` are indices into `xl/sharedStrings.xml` (377 shared strings); numeric cells carry their value inline. No formulas resolve to inventory fields.
- The normalized JSON adds `rowNumber` (1-based data row; **Excel row = `rowNumber` + 1**) and three derived booleans (`hasCoordinates`, `solarFlag`) / parsed field (`solarKw`) described below. **Blank cells become `null`** in every field.

## 3. Column-by-column dictionary

Each entry: physical column · Excel header · normalized JSON key · type · meaning · fill rate (non-null / 183).

| Col | Excel header | JSON key | Type | Meaning |
|-----|--------------|----------|------|---------|
| A | Billing Name | `billingName` | string\|null | Legal name PG&E bills. The **billing entity** (see §4). 182/183 filled. |
| B | Actual owner | `actualOwner` | string\|null | True beneficial owner where it differs from the billed name. **Only 1 row filled** (`KG BATTH FLP`, row 10). |
| C | Full Acct # | `account` | string | PG&E 10-digit account with check digit, e.g. `4699664587-8`. 183/183 filled, **57 distinct**. |
| D | SA ID | `serviceId` | string | PG&E Service Agreement ID — the true per-meter primary key. 183/183 filled, **183 distinct (unique, no dupes)**. |
| E | Meter # | `meterSerial` | string\|null | Physical meter serial. 182/183 filled, all distinct. 1 blank. |
| F | Pump ID | `growerPumpId` | string\|null | Grower's internal pump label, e.g. `P004`. 124/183 filled (the office/lighting/non-pump SAs are blank). |
| G | Active Rate Schedule | `rateSchedule` | string\|null | PG&E tariff code (see §5). 182/183 filled, **16 distinct**. 1 blank. |
| H | Legacy | `legacy` | bool\|null | Flag = legacy/grandfathered service. Source has only the literal `Yes`; normalized to `true` (27 rows) / `null` otherwise. |
| I | Existing descriptor | `descriptor` | string\|null | Free-text label, often `PUMP # NN` or a load description (e.g. `VINES IRR 75HP …`, `OFFICE BIG RANCH-T2`). 78/183 filled. |
| J | Prem lat | `latitude` | number\|null | Premise latitude (decimal degrees, ~36.2–36.6). 178/183 filled. |
| K | Prem long | `longitude` | number\|null | Premise longitude (~-119.8 to -120.1). 178/183 filled. |
| L | Solar | `solarGroupLabel` / `solarKw` / `solarFlag` | mixed | See §6 — heterogeneous column: array group IDs, the word `Solar`, or a kW nameplate. |
| M | NEMA | `nemType` | string\|null | Net-metering enrollment type (see §5). 40/183 filled. |
| N | True-up | `trueUpMonth` | string\|null | Month name of the NEM annual true-up. 14/183 filled. |
| O | Contiguous | `contiguous` | bool\|null | Parcel-contiguity flag. Source has only `Yes`; normalized to `true` (67 rows) / `null`. |
| P | Solar notes | `solarNotes` | string\|null | Operator note: `not using`, `new well`, `old`, `using`, `minimal use`, `need to drill`, `research`. 33/183 filled. |
| Q | GPM | `gpm` | number\|null | Pump flow rate, gallons/minute. 120/183 filled, integers 100–3000. |
| R | Crop | `crop` | string\|null | Crop on the served acreage (see §5). 54/183 filled. |
| S | Installed on | `installedOn` | number(year)\|null | Year the pump/well was installed. 20/183 filled (2013–2024). |
| T | Irrigation | `irrigation` | string\|null | Surface-water / irrigation district. 50/183 filled (see §5). |
| U | RANCH | `ranch` | string\|null | Operator ranch/block name. 120/183 filled, **36 distinct**. |
| V | Status | `status` | string\|null | Operational status: `GOOD` / `NEW WELL` / `BAD` / `OLD`. 120/183 filled. |

## 4. Distinct values + counts: ENTITY (Billing Name, col A)

Six billed names (one row blank):

| Billing name | Meters | # distinct accounts | Note |
|--------------|-------:|--------------------:|------|
| BATTH,CHARANJIT S | 59 | 12 | Includes the big bill account `4699664587-8`. |
| KANWARJIT BATTH & GAGANDIP BATTH | 48 | 13 | |
| K S BATTH & G S BATTH PARTNERSHIP | 47 | 6 | |
| BATTH FARMS INC | 22 | 19 | |
| **BATHH FARMS INC** | 4 | 4 | **Typo of "BATTH FARMS INC"** — rows 78, 140, 145, 172. Should be merged with BATTH FARMS INC for any per-entity rollup. |
| BATTH,SURINDER K | 2 | 2 | |
| (blank) | 1 | 1 | Row 39, account `57448094630` — see §8. |

So the inventory spans **~6 billing entities** (5 if the BATHH typo is folded in; +1 blank). `actualOwner` = `KG BATTH FLP` appears on exactly one row, hinting the true ownership umbrella is a family limited partnership the billing names do not reflect. **No single account spans more than one billing entity** (clean account→entity mapping).

## 5. Distinct values + counts: other categorical columns

### Active Rate Schedule (col G) — 16 distinct + 1 blank
| Code | Count | Code | Count |
|------|------:|------|------:|
| HAGC | 83 | A1X | 3 |
| HAGA2 | 19 | AG4C | 2 |
| AG5B | 16 | B1 | 2 |
| HAGA1 | 15 | AGB | 2 |
| AGC | 13 | HAGFB | 2 |
| AG5C | 9 | E19P | 1 |
| HAGB | 8 | OL1 | 1 |
| HB1 | 5 | HB6 | 1 |
| (blank) | 1 | | |

`H`-prefixed codes (HAGA1/HAGA2/HAGB/HAGC/HAGFB, HB1/HB6) are the current PG&E TOU-period ag/commercial tariffs; un-prefixed AG4x/AG5x/AGB/AGC/A1X/B1/E19P/OL1 are older schedules. `OL1` = outdoor lighting (a non-pump SA). `B1`/`A1X` = small commercial. The mixed AG-A/B/C tiers reflect different demand-tier enrollments across the pump fleet.

### NEMA / NEM type (col M) — 6 distinct, 40 filled, 143 blank
| Code | Count | Meaning |
|------|------:|---------|
| NEM2AA | 26 | NEM 2.0, aggregated agricultural |
| NEMEXPM | 6 | NEM expansion, metered |
| NEM2AG | 3 | NEM 2.0 agricultural |
| NEMEXP | 3 | NEM expansion |
| NEM2M | 1 | NEM 2.0 metered |
| NEMS | 1 | NEM single (office) |

Only 40 SAs carry an explicit NEM enrollment code; the other 143 have no on-sheet NEM tag. (Solar presence is broader than the NEMA tag — see §6.)

### Status (col V) — 4 distinct, 120 filled, 63 blank
| Status | Count |
|--------|------:|
| GOOD | 87 |
| NEW WELL | 26 |
| BAD | 6 |
| OLD | 1 |

`NEW WELL` correlates strongly with the `new well` solar-note and the 840 kW array cohort (§6). `BAD`/`OLD` = 7 meters flagged as not in serviceable condition.

### Crop (col R) — 6 distinct, 54 filled, 129 blank
ALMONDS 30 · RAISINS 7 · WINE GRAPES 7 · PISTACHIO 7 · WALNUT 2 · ZANTE 1. (129 SAs have no crop logged — many are non-irrigation loads or simply not annotated.)

### RANCH (col U) — 36 distinct, 120 filled, 63 blank
Largest: BIG BLOCK 22 · SWANSON 12 · ELKHORN SHOP 8 · AIRPORT 7 · HOME RANCH 6 · KAMM CORNELIA 6 · NEW RANCH 5 · KAMM RANCH 5 · CHATEAU FRESNO 4 · EAST RANCH S 4. The PINOT GRIS series (PINOT GRIS, 640, 641, 642, 643) are 5 sub-blocks of the same wine-grape ranch.

### Irrigation district (col T) — 6 distinct, 50 filled, 133 blank
CONSOLIDATED 20 · RCWD 14 · LIBERTY 6 · MURPHY SLOUGH 5 · WESTLANDS 4 · LAGUNA 1.

### True-up month (col N) — 14 filled
December 6 · May 3 · January 2 · August 1 · July 1 · October 1.

### Installed-on year (col S) — 20 filled
2013 ×7 · 2023 ×3 · 2019 ×2 · 2022 ×2 · 2021 ×2 · 2018 ×2 · 2020 ×1 · 2024 ×1.

### Solar notes (col P) — 33 filled
not using 10 · new well 9 · old 7 · using 3 · minimal use 2 · need to drill 1 · research 1.

## 6. The "Solar" column (col L) — heterogeneous, parsed three ways

This single column mixes three semantically different things. The normalizer splits them:

- **`solarFlag`** (bool): `true` whenever the cell is non-empty (56 rows). It only means "this SA is associated with solar," nothing more.
- **`solarGroupLabel`** (string\|null): the raw cell text, preserved verbatim.
- **`solarKw`** (int\|null): set **only** when the cell matches `^(\d+)\s*kw$` (case-insensitive).

Distinct cell values (56 non-blank, 127 blank):

| Cell value | Count | Interpretation | solarKw |
|------------|------:|----------------|--------:|
| 4433 | 11 | array/grouping ID (shared inverter group) | null |
| 5219 | 10 | array/grouping ID | null |
| Solar | 9 | generic "has solar" flag (these are the NEM-true-up SAs) | null |
| 4444 | 8 | array/grouping ID | null |
| **840kw** | 8 | **nameplate of the 840 kW shared array** | **840** |
| **1092kw** | 5 | **nameplate of the 1,092 kW shared array** | **1092** |
| 4939 | 4 | array/grouping ID | null |
| 4624 | 1 | array/grouping ID | null |

### CRITICAL: solar capacity does not sum per-row
`840kw` and `1092kw` are **shared-array nameplate labels stamped on every meter the array serves**, not a per-meter capacity. The two physical arrays are **840 kW + 1,092 kW = 1,932 kW total** (GROUND TRUTH). Summing the column row-by-row (8×840 + 5×1092 = 12,180) is the well-known **12,180 kW artifact and is WRONG**. `solarKw` is provided per row purely so a consumer can identify array membership; any capacity rollup must **dedupe by distinct array label** → 1,932 kW.

- **1,092 kW array** serves SAs on accounts `6539944461-4` (P006, P013, P024, P099) and the orphan account `57448094630` (row 39) = 5 meters.
- **840 kW array** serves 8 single-meter "new well" accounts: P106, P118, P119, P120, P121, P122, P142, P154.
- The numeric group IDs (4433/4444/4624/4939/5219) are legacy inverter/array group codes carried over from the older NEM2AA fleet (those rows also carry `NEM2AA`). The literal `Solar` rows are the 9 SAs that carry an explicit NEM true-up month (cols M/N populated).

## 7. Geocoding coverage

- **178 / 183 meters have both latitude and longitude** (`hasCoordinates = true`).
- **5 meters have no coordinates** (both blank): rows **32** (acct 3922545703-3, SA 3929761887), **39** (the orphan acct 57448094630), **92** (acct 1909940814-8, SA 1904328353), **121** (acct 1909940814-8, SA 1901103772), **183** (acct 5047939094-5, SA 5042685096).
- Coordinates cluster in Fresno County (lat ~36.25–36.56, long ~-119.85 to -120.13) consistent with the Huron/Kerman/Mendota footprint. A handful of lat OR long values repeat across 2–3 rows (co-located pumps / shared premise), so 178 coordinate pairs map to 172 distinct lats / 173 distinct longs — expected for clustered well sites.

## 8. Data-quality issues

1. **Entity typo:** `BATHH FARMS INC` (4 rows) is a misspelling of `BATTH FARMS INC`. Fold together for per-entity rollups (true count = 5 named entities, not 6).
2. **Orphan / malformed account (row 39):** account `57448094630` is **11 digits with no check-digit dash** (every other account is `NNNNNNNNNN-N`). The row is almost entirely blank — no billing name, no rate schedule, no pump ID, no coordinates, no status — only account, SA ID `6116351334`, meter `1011699460`, and `solar = 1092kw`. It is the 5th member of the 1,092 kW array; treat the account number as suspect/incomplete.
3. **Single blank Meter # (row 135):** account `0731904574-1`, SA `736862474`, rate `OL1` (outdoor lighting) — a lighting SA with no metered serial. Plausible (unmetered/flat lighting), not an error per se.
4. **Single blank Rate Schedule:** also row 39 (the orphan account). Every other SA has a tariff.
5. **Sparse operator fields:** RANCH (63 blank), Status (63 blank), GPM (63 blank), Crop (129 blank), Irrigation (133 blank), Installed-on (163 blank), True-up (169 blank), NEMA (143 blank). These are field-knowledge columns, not authoritative; absence ≠ "none," it means "not logged."
6. **Leading-zero accounts/SAs are strings, not numbers.** Accounts like `0096005793-3`, `0305152088-4`, `0730240888-0` and SAs like `303286619`, `736862474`, `730240746` must stay strings; coercing to int drops the leading zero and corrupts the key. The normalizer keeps all account / SA / meter IDs as strings.
7. **Three billed meters absent from the inventory** (see §9).

## 9. Cross-check vs prior `batth-real-inventory.json` and the billing extract

### Versus the prior inventory file
- **Row count identical (183) and all key identity fields match exactly** across all 183 rows: account, SA ID, meter serial, and rate schedule had **0 mismatches** in a row-by-row diff.
- The prior file parsed `840kw`/`1092kw` the same way (`solarKw` = 840/1092, kept the raw label) and reached the same coverage counts (178 with coords, 13 kW rows, 56 solar-flagged). Its `solarGroup` field is renamed **`solarGroupLabel`** here per spec; semantics unchanged.
- **New fields added in this normalization:** `rowNumber`, `hasCoordinates`, `solarFlag`. The prior file used `solarGroup` (now `solarGroupLabel`), did not carry `rowNumber`/`hasCoordinates`/`solarFlag`, and folded `legacy`/`contiguous` as raw `"Yes"` strings; here they are booleans (`true`/`null`). No value-level discrepancies were found — the prior file is faithful; this one is a superset.

### Versus the billing extract (`batth-real-billing.json`, account 4699664587-8)
- The bill rollup reports **46 metered SAs** on account `4699664587-8` (`meterCount: 46`).
- The inventory has **45 rows** on that account.
- **43 billed SAs appear in the inventory.** **3 billed SAs are MISSING from the inventory:**
  | SA ID | Meter # | Descriptor | Rate | Latest bill |
  |-------|---------|-----------|------|-------------|
  | 4691715828 | 1010073676 | PUMP 73 | AGC | $44.21 (5.48 kWh, near-idle) |
  | 4697631144 | 1009488067 | BATH FARMS- IRR 100HP K-87 | AGC | $43.00 (0 kWh, idle) |
  | 4698006011 | 1010427314 | (none) | AGB | $27.47 (0 kWh, idle) |
  These three are all low-dollar / idle meters; they are billed by PG&E but were never entered in the operator's master list — a **completeness gap in the inventory**, not in the bill. Full account census = inventory (45) ∪ these 3 = the 46 billed SAs, with 2 inventory rows reconciling 1:1.
- Conversely, **2 inventory rows on this account are not in the billing extract** (SAs `4695663573`, `4697793352`). The billing extract is a 12-month annual snapshot; these two were likely inactive in the billed window. Net: inventory and bill overlap on 43 of ~46/45.

### P031 / VINES 75 HP true-up anomaly (consistency check)
- Inventory **row 53**: SA `4699664088`, pump **P031**, descriptor `VINES IRR 75HP NEW 75HP (PUMP # 31)`, rate **AGB**, NEMA **NEMEXP**, true-up **December**, on account `4699664587-8`.
- The billing extract shows this same SA with a **$62,795.65 true-up** and **0 monthly kWh** (NEM-netted) — a real zero-credit anomaly, with sibling **P038** (row 55, SA `4699664743`, NEMEXPM, December) as the proof case.
- **Do not overstate:** recovery is **$0–$57k CONTINGENT** on the Generation Allocation Summary — the shared arrays may be oversubscribed (zero-sum), so this is an anomaly to investigate, **not banked savings**.

## 10. Reconciliation summary (counts, for the audit trail)

- **183 meters**, **57 accounts**, **~6 billing entities** (5 after folding the BATHH typo; the billing entity is *not* the true owner — `KG BATTH FLP` is).
- **1,932 kW** of solar across **2 shared arrays** (840 + 1,092), never 12,180.
- **178** geocoded, **5** missing coordinates.
- The big bill account `4699664587-8` = **46 billed SAs**, of which **3 are absent from this inventory** and **43** reconcile.
- Savings dollars elsewhere in this analysis come from **deterministic pure functions in `src/lib/energy`** (no AI); the only AI is bill-PDF vision extraction in `src/lib/extract`. Rate-optimization conclusions require **15-minute interval kWh** to be trustworthy; bill summaries carry no kWh, so any AG-C→AG-B "savings" emitted without intervals are **sign-ambiguous artifacts**, not findings.
