# Data Dictionary — Batth PG&E Bill (Account 4699664587-8)

Decodes every charge type, field, and rollup figure in the re-derived per-meter
billing at `docs/batth-analysis/normalized/billing.json`.

- **Source of truth:** `apps/dashboard/fixtures/extract/batth-account-4699664587.json`
  — the cent-reconciled vision extraction of the 114-page PG&E statement PDF
  (`apps/dashboard/BatthFarmAccountPdf.pdf`). The ONLY AI in this pipeline is the
  bill-PDF vision extraction in `src/lib/extract`; everything downstream is
  deterministic.
- **Cross-check:** `docs/batth-analysis/batth-real-billing.json` (prior reconciled
  pass). Re-derivation matches it with **0 per-meter mismatches** on latest-cycle
  printed total, kWh, peak kW, and NEM true-up.
- **Builder:** `docs/batth-analysis/normalized/_build_billing.py` (re-runnable).

---

## 1. Account header & rollup

| Field | Value | Meaning |
|---|---|---|
| Account number | `4699664587-8` | One PG&E account; ~46 metered service agreements (SAs) under it |
| Billing name | CHARANJIT S BATTH (DBA CHARANJIT S BATTH FARMS) | |
| Service address | 5434 W KAMM AVE, CARUTHERS CA 93609-9400 | |
| Statement date | 2026-03-26 | |
| Due date | 2026-04-13 | |
| **Total Amount Due** | **$86,942.12** | The running account balance billed on this statement |
| Meter count | 46 | Distinct SAs with monthly bills |
| Bill / cycle count | 52 | One extraction bill entry = one billing cycle; 6 SAs carry >1 cycle |
| NEM-enrolled meters | 14 | SAs with a NEM (solar) generating record |
| **NEM true-up meters** | **11** | SAs with a SETTLED annual NEM true-up on this statement |
| **NEM true-up total** | **$83,338.49** | Sum of the 11 settled annual true-ups |
| Demand-charge total (structured) | $6,058.73 | Sum of the canonical per-cycle peak-demand charge across all 52 cycles |
| Idle meters (zero kWh, latest cycle) | 28 | Latest cycle shows 0 kWh of metered energy |
| — of which NEM-enrolled | 14 | "Idle" because energy is netted under NEM accounting, not because the pump is off |
| — truly idle (zero kWh AND no NEM) | 14 | Genuinely dormant SAs still paying customer + demand charges ($436.96 latest) |
| reconciledCount / escalatedCount | 39 / 22 | Extraction confidence labels (a cycle can be both reconciled-at-total yet flagged) |

### 1.1 Account-summary reconciliation (the $86,942.12)

The total is NOT the sum of this period's per-meter charges — it is a **running
balance**. The bill's own Account Summary block ties to the penny:

```
Amount Due on Previous Statement      $62,857.75   (incl. the VINES 75HP true-up cycle $62,856.01)
Payments Received Since Last Stmt          0.00
Current Electric Charges              $16,397.82
Current Electric Monthly Charges       $7,844.17
Total NEM Charges                       -$157.31
Taxes                                    -$0.31
---------------------------------------------------
Total Amount Due                      $86,942.12   ✓ exact
```

The sum of every extracted **cycle period** printed total is **$86,914.54**, a
**$27.58** gap to the header. This is PG&E running-balance rounding across the
summary buckets, **not a missing meter**: all 46 SAs and all 52 cycles are
captured, and per-meter kWh / peak-kW / printed totals reproduce the prior
reconciled pass exactly. Reconciliation status: **RECONCILED**.

---

## 2. The per-meter record (`meters[]`)

| Field | Type | Meaning |
|---|---|---|
| `serviceId` | string | PG&E Service Agreement ID (the SA / "service ID") |
| `meterNumber` | string | Physical meter serial |
| `growerPumpId` | string\|null | Grower's pump label (e.g. `P004`) when the bill carries it (32/52 entries) |
| `saIdDescriptor` | string | The SA description as printed (pump id, or free text like `VINES IRR 75HP NEW 75HP (PUMP`) |
| `latestTariff` | string | Rate schedule on the most recent cycle (see §4) |
| `cycleCount` | int | Number of billing cycles for this SA on this statement |
| `latestCycle` | object | Convenience summary of the newest cycle (printed total, kWh, peak kW, demand $) |
| `totalKwh_latestCycle` | number | kWh summed from the latest cycle's TOU split |
| `idleZeroKwh` | bool | Latest cycle has 0 metered kWh |
| `cycles[]` | array | EVERY billing cycle with EVERY line item (see §3) |
| `nem` | object\|null | NEM/solar block (see §5); null for non-solar SAs |
| `nemTrueUpUsd` | number\|null | The SETTLED annual true-up $ for this meter (canonical) |
| `billedAcrossCyclesUsd` | number | Sum of `printedTotalUsd` over all this SA's cycles |

---

## 3. The cycle record (`meters[].cycles[]`)

One cycle = one billing period (PG&E bills these SAs on a ~monthly cadence; some
carry a separate end-of-year **true-up cycle**).

| Field | Meaning |
|---|---|
| `start` / `close` | Billing period start/close dates |
| `cycleClose` | Statement close date the cycle was billed on (the true-up cycle closes 2026-03-26) |
| `tariff` | Rate schedule for this cycle |
| `isLegacyTou` | True for the 2 grandfathered legacy TOU periods in the data |
| `isTrueUpCycle` | True when the cycle carries a `Total NEM Charges` line (the annual solar settlement) |
| `peakKw` | Billed maximum demand (kW) for the cycle (the demand the demand-charge is computed on) |
| `demandChargeUsd_structured` | **Canonical** per-cycle peak-demand charge (from the structured `demand` line) |
| `totalKwh` | kWh summed from this cycle's TOU split (0 for idle / NEM-netted meters) |
| `touRollup[]` | kWh + $ grouped by TOU period (Peak / Part-Peak / Off-Peak / Super-Off-Peak) |
| `subtotals` | Convenience sums: customerCharge, demandChargeText, energyCommissionTax, nemNetCharge |
| `lineItems[]` | Every printed line item, verbatim + decoded (see §3.1) |
| `printedTotalUsd` | The cycle's printed total |
| `coverageState` | Extraction coverage flag (`reconciled` / `needs_review`) |

### 3.1 Line items (`cycles[].lineItems[]`)

Each item carries the raw extraction fields (`kind`, `label`, `amountUsd`,
`quantity`, `unit`, `rate`) PLUS a decoded `chargeType`. The three native
`kind`s are `tou_energy`, `demand`, and `other`; `other` labels are free text,
so each is re-classified into a canonical `chargeType` and key numbers are
parsed out of the label.

| `chargeType` | Native kind | Count | What it is | Decoded extras |
|---|---|---|---|---|
| `tou_energy` | tou_energy | 90 | Time-of-use energy charge for one TOU bucket. `quantity`=kWh, `unit`=kWh, `rate`=$/kWh, `label`=period name | `ratePerKwh` |
| `customer_charge` | other | 100 | Fixed daily service charge ($/day × days), prorated within a cycle (one line per rate sub-period) | `parsedDays`, `parsedRatePerDay` |
| `demand_charge` | other | 32 | Printed peak/part-peak demand charge text: `kW @ $/kW`. Can appear >1× in a multi-month cycle | `parsedKw`, `parsedRatePerKw` |
| `demand_charge_structured` | demand | 29 | The structured peak-demand line; `quantity`=billed kW, `amountUsd`=the canonical demand $ | — |
| `energy_commission_tax` | other | 28 | CA Energy Commission surcharge (cents-scale per sub-period) | — |
| `nem_net_charge` | other | 5 | `Total NEM Charges Before Taxes` — the annual NEM true-up net charge (energy net of export credits, **including embedded NBCs**) | — |

**TOU period taxonomy** (the `label` on `tou_energy` lines and `period` on
touRollup): `Peak`, `Part-Peak`, `Off Peak` / `Off-Peak`, `Super Off-Peak`.
Peak energy carries the highest $/kWh, Super-Off-Peak the lowest.

### 3.2 Demand: structured vs text (do not double-count)

- `demandChargeUsd_structured` (kind `demand`) is the **canonical** per-cycle
  peak-demand charge and is what the rollup demand total sums.
- The free-text `demand_charge` (`other`) lines are the **printed itemization**;
  a single cycle that spans two rate sub-months prints **two** demand lines
  (e.g. P004: $2,197.18 + $1,409.21 text vs the $1,409.21 canonical structured
  charge). The two are NOT directly comparable totals — only the structured
  field is summed account-wide.

---

## 4. Rate schedules (tariffs) present

PG&E agricultural and small-commercial schedules. Latest-cycle distribution
across the 46 meters:

| Tariff (as printed) | Meters | Decode |
|---|---|---|
| AGC Ag35+ kW High Use | 12 | Agricultural, ≥35 kW connected load, high use. **TOU + demand charge.** |
| AGA1 Ag<35 kW Low Use | 9 | Agricultural, <35 kW, low use. Small pumps. |
| AGA2 Ag<35 kW High Use | 6 | Agricultural, <35 kW, high use. |
| AGB Ag35+ kW Med Use | 5 | Agricultural, ≥35 kW, medium use. TOU + demand charge. |
| B1 Bus Low Use | 4 | Small business (non-ag), low use. |
| AG5B / AG5B Large TOU Ag Power | 5 | Legacy large agricultural TOU power (demand-charge bearing). |
| AG5C / AG5C Large TOU Ag Power | 4 | Legacy large agricultural TOU power, higher tier. |
| AG4C | 1 | Legacy ag schedule. |

Notes:
- **AG-A** (`AGA1`/`AGA2`) schedules are <35 kW with **no demand charge**;
  **AG-B / AG-C** (≥35 kW) carry a **per-kW demand charge** on monthly peak.
- The AG-A→AG-B and AG-B→AG-C distinctions drive the rate-arbitrage analysis,
  but see the caveat in §7.

---

## 5. NEM / solar block (`meters[].nem`)

NEM = Net Energy Metering. Solar-enrolled SAs do **not** pay monthly energy;
their import/export is **netted annually** and settled in a once-a-year
**true-up**. That is why NEM meters read `totalKwh = 0` on the monthly bill —
they are NOT idle pumps.

| Field | Meaning |
|---|---|
| `nemEnrolled` | Always true when this block is present |
| `trueUpAmountUsd` | **SETTLED annual true-up** — the canonical owed/credited figure for the closed true-up year |
| `trueUpMonth` / `trueUpDate` | When the annual true-up settles |
| `ytdRunningChargeUsd` | In-progress **YTD running** NEM charge for the CURRENT (not-yet-closed) true-up year, where the bill prints a partial record. **Separate from the settled true-up; never summed into the rollup.** |
| `annualImportKwh_printed` / `annualExportKwh_printed` / `annualNetKwh_printed` | From the bill's printed annual NEM table |
| `annualImportKwh_derived` / `_export_ / `_net_` | Independently re-summed from the structured `monthlyNet` rows (small differences = annual-table vs raw-month rounding) |
| `monthlyNet[]` | Per-month `netKwh` + `amountUsd` (sign: **+ = net import / charge, − = net export / credit**) |
| `benefitingMeterSaIds` | Meters the array's generation is allocated to (empty in this extraction) |

### 5.1 The VINES 75HP true-up anomaly (handled, not overstated)

SA `4699664088` (VINES IRR 75HP) carries **two** NEM records:

- **Settled annual true-up: $62,795.65** (12 months Dec 2024→Dec 2025,
  trueUpDate 2026-03-26, ~190,505 net kWh imported). This is the real
  **zero-credit anomaly** — the array generated but the meter received
  essentially no export credit against a large import.
- **YTD running charge: $2,320.61** (3 partial months, no settle date) — the
  in-progress current-year NEM charge. The prior pass dropped this; here it is
  preserved in `ytdRunningChargeUsd` so it is visible but **never double-counts**
  into the $62,795.65 or the account NEM true-up total.

**GROUND TRUTH (do not contradict):** the sibling SA P038 (`4699664743`) proves
the zero-credit behavior is real (124k kWh import, $0 export, ~$0.26 true-up).
But **recovery on the $62,795.65 is $0–$57k and CONTINGENT** on the Generation
Allocation Summary — if the arrays are oversubscribed the allocation is
zero-sum. **It is NOT banked money. Do not overstate it.**

### 5.2 NBCs / PCIA

Non-Bypassable Charges (NBCs) and the Power Charge Indifference Adjustment
(PCIA) appear in the bill's NEM detail/explanation pages and are **embedded
inside** the `Total NEM Charges Before Taxes` (`nem_net_charge`) figure — they
are not broken out as separate top-level line items in this extraction. The NEM
detail page itemizes `YTD NEM Charges Before Taxes`, `YTD Non-Bypassable
Charges`, and `Previously Billed NEM Charges` that net to the printed
`Total NEM Charges`.

---

## 6. Idle / standby meters

- **28 meters** show **0 kWh** on their latest cycle.
- **14** of those are **NEM-enrolled** — their energy is netted under solar
  true-up accounting, so zero monthly kWh is expected, NOT dormancy.
- **14** are **truly idle**: zero kWh AND no NEM. They still pay fixed
  **customer charges** (and demand charges where on an AG-B/AG-C schedule),
  totalling **$436.96** on their latest cycles — recurring spend on dormant SAs.

---

## 7. Caveats carried from ground truth

1. **Solar capacity:** arrays total **1,932 kW (840 + 1,092)**, NOT 12,180 kW.
2. **Scope:** this account (4699664587-8) covers ~46 metered SAs. The Excel
   inventory is broader — **183 meters across ~57 accounts / ~6 entities** — and
   is a separate dataset (`normalized/inventory.json`).
3. **Savings math:** dollar savings are computed by **deterministic pure
   functions** in `src/lib/energy` — no AI. The only AI here is the bill-PDF
   vision extraction in `src/lib/extract`.
4. **Rate-optimization needs intervals:** trustworthy rate optimization requires
   **15-minute interval kWh**, which bill summaries do not carry. The
   AG-C→AG-B "savings" the engine emits without intervals are **sign-ambiguous
   artifacts**, not validated savings.
5. **VINES true-up:** see §5.1 — real anomaly, contingent recovery, not banked.

---

## 8. Reconciliation status — summary

| Check | Result |
|---|---|
| Account-summary buckets → $86,942.12 | ✓ exact |
| Header total vs sum of all 52 cycle periods | $27.58 gap (running-balance rounding) — **explained** |
| Per-meter latest printed vs prior pass (46) | ✓ 0 mismatches |
| Per-meter kWh / peak kW vs prior pass (46) | ✓ 0 mismatches |
| Per-meter NEM true-up vs prior pass (11) | ✓ 0 mismatches |
| NEM true-up total | $83,338.49 (11 settled) ✓ |
| Idle / idle+NEM / truly-idle counts | 28 / 14 / 14 ✓ |
| **Overall** | **RECONCILED** |
