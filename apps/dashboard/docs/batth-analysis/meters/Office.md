# Meter Dossier — Office (Big Ranch) — SA 4699664172

> Slice position: billed-meter index 13 of my (mod-23==13) slice. Manifest idx 55.
> Sources: `normalized/by-meter/4699664172.json`, `normalized/meters.json`, `normalized/manifest.json`.
> Dollar figures are read from the grower's own PG&E bill. Counterfactuals and findings are computed by **deterministic pure functions in `src/lib/energy`** (no AI). The only AI in this pipeline is bill-PDF vision extraction in `src/lib/extract`.

---

## (a) IDENTITY

| Field | Value |
|---|---|
| PG&E Service Agreement (SA) ID | **4699664172** |
| Meter serial number | **1010243610** |
| Grower pump ID | **"Office"** (this is the farm office service, not an irrigation pump) |
| SA descriptor (as PG&E prints it) | **OFFICE BIG RANCH-T2** |
| Legal billing entity | **BATTH, CHARANJIT S** |
| PG&E account number | **4699664587-8** (the ~46-SA master account that carries the bill) |
| Ranch | (none recorded in inventory; descriptor places it at the Big Ranch office) |
| Crop | none — this is a building/office service, not irrigation |
| GPM (flow) | **not recorded** (n/a — not a pump) |
| HP (horsepower) | **not recorded** (n/a — not a pump) |
| Status | not recorded (no flagged-BAD / inactive marker) |
| Latitude / Longitude | **36.532412, -119.903322** (has coordinates: yes) |
| Address (meters.json) | OFFICE BIG RANCH-T2, Office |

**What this meter is, in one sentence:** the electric service for the Big Ranch farm office — a small building load with a solar/NEM hookup, currently sitting idle (zero net consumption on the latest cycle).

---

## (b) RATE SCHEDULE — decoded in plain English

- **Stored rate schedule (inventory):** `B1`
- **Latest tariff (as the bill prints it):** **"B1 Bus Low Use"**

**What B1 is:** B1 is PG&E's **small commercial / business low-use** rate (Schedule B-1), NOT an agricultural rate. It is the rate a small non-irrigation building (office, shop, residence-style service) lands on. It is a flat, non-TOU, non-demand rate at this usage level: there are **no time-of-use windows that bill kWh by peak/partial/off-peak**, and there is **no demand ($/kW) charge** on this meter's bill. The only fixed component is a **customer charge billed per day** at **$0.32854/day**.

- **Customer charge:** $0.32854 per day (prorated across the cycle; see the bill below).
- **Demand $/kW:** **none** — B1 at this use level carries no demand charge. (`demandChargeUsd: null`, `demandCharges: []`.)
- **TOU windows:** **none billed.** No peak/partial/off-peak kWh lines appear; the meter netted to zero kWh this cycle.

**WHY it is on this rate:** because it is the **office building service, not a pump.** PG&E's agricultural schedules (AG-A/AG-B/AG-C, legacy AG-4/AG-5) are for irrigation/agricultural pumping load. An office/building load is correctly placed on a small commercial rate like B-1. This is the *expected* rate for this kind of service — it is not a mis-rating candidate. (Confirmed by the rate engine: B1 is a non-ag label and the rate-optimization lever deliberately excludes it; see section e.)

---

## (c) THE LATEST BILL — fully itemized

**Cycle:** 2026-02-11 → 2026-03-12 (30 days). **Cycle close on the meter-read calendar:** 2026-03-26. **Tariff:** B1 Bus Low Use. **Printed total: $9.85.**

This cycle straddles the **2026-03-01 PG&E rate change**, so the customer charge prints as two sub-period lines (pre-change days and post-change days), at the same $0.32854/day:

| # | Line item | Days | $/day | Amount |
|---|---|---|---|---|
| 1 | Customer Charge 02/11/2026 – 02/28/2026 | 18 | $0.32854 | **$5.91** |
| 2 | Customer Charge 03/01/2026 – 03/12/2026 | 12 | $0.32854 | **$3.94** |
| | Energy (kWh) charges | — | — | **$0.00** (0 kWh net) |
| | Demand charge | — | — | **$0.00** (none on B1) |
| | NBCs / Energy Commission Tax | — | — | **$0.00** |
| | NEM net charge | — | — | **$0.00** |
| | **PRINTED TOTAL** | | | **$9.85** |

**Reconciliation (arithmetic):** 18 × $0.32854 = $5.91; 12 × $0.32854 = $3.94; $5.91 + $3.94 = **$9.85** ✓ (matches the printed total exactly). Coverage state: **reconciled**.

**Total kWh this cycle:** 0. The meter is flagged `idleZeroKwh: true` — it billed only the fixed daily customer charge, no metered energy.

---

## (d) SOLAR / NEM status + true-up

This meter **is solar/NEM-enrolled.** It carries a NEM net-metering history even though the latest summary cycle netted near-zero.

| NEM field | Value |
|---|---|
| NEM enrolled | **yes** (`nemEnrolled: true`) |
| NEM type | **NEMS** (net energy metering, solar) |
| True-up month | **October** (month 10) |
| True-up amount (this period) | not yet printed (`trueUpAmountUsd: null`) |
| Solar nameplate (kW) | **unknown** (`solarKw: null` — not recorded in inventory) |
| Annual import kWh (printed) | **3,728** |
| Annual export kWh (printed) | **1,629.5** |
| Annual net kWh (printed) | **2,098.5** (= 3,728 − 1,629.5 ✓) |
| Benefiting meter SA IDs | none listed |
| NEM coverage state | **needs_review** |

**Monthly net history (import-positive / export-negative), from the bill's NEM page:**

| Cycle close | Net kWh | Amount |
|---|---|---|
| 11/10/2025 | −116 | −$42.31 (net export, a credit) |
| 12/11/2025 | +1,766 | +$728.37 |
| 01/12/2026 | +1,130 | +$467.08 |
| 02/11/2026 | +832 | +$327.65 |
| 03/13/2026 | −757 | −$278.27 (net export, a credit) |
| 02/11–02/28/2026 (sub) | −352.0228 | −$133.35 |
| 03/01–03/12/2026 (sub) | −404.4725 | −$144.92 |

**Plain reading:** through the dark months (Dec–Feb) the office pulled net energy FROM the grid (positive net kWh, dollars owed); as the sun returned (Mar onward) it swung to net EXPORT (negative net kWh, credits). The annual picture is **net import of 2,098.5 kWh** — the office consumes slightly more than its share of solar produces over the year. The **annual true-up settles in October**; the running NEM balance is what determines whether anything is owed or credited then. The latest billed cycle's $9.85 is JUST the daily customer charge — the energy itself is deferred to the October true-up, which is exactly why a monthly bill on a NEM meter looks deceptively tiny.

---

## (e) SAVINGS FINDINGS — every applicable finding, with arithmetic, engine, and data HAVE vs NEED

### 1. Rate optimization — **SILENT (correctly).** No finding.
- **Engine:** `rateLever()` in `src/lib/energy/rate-lever.ts`, run by `runRateLever()` in `src/lib/recommendations/run-rate-lever.ts`. **Deterministic pure function, not AI.**
- **Why silent:** the schedule label is **`B1`**, a **non-agricultural** rate. `mapScheduleLabel()` only maps the ag-family tokens (AGA1/AGA2/AGB/AGC/AG4/AG5). `B1` is not in `LABEL_TO_PLAN`, so the lever returns `{ kind: "none", reason: "unmapped_schedule" }`. **No rate-switch dollar is ever quoted on a non-ag meter** — by design. This is the right answer: an office on B-1 is not a candidate to move onto an ag pumping rate.
- **Also blocking, even if it were ag:** this meter is **solar** (`runRateLever` never prices a solar meter's partial charge pages, because NEM energy settles at true-up and a monthly-page counterfactual would mislead), AND it has **zero interval data** (`intervals: []`) and **0 kWh** this cycle (`no_usage_basis`). Per ground truth, rate optimization needs 15-min interval kWh to be trustworthy; this meter has none.
- **Data we HAVE:** rate label, one reconciled cycle, NEM monthly net history. **Data we NEED to ever quote a rate dollar:** it is non-ag, so none — this meter stays out of the rate lever permanently.

### 2. Bill audit — **SILENT.** No finding.
- **Engine:** `billAudit()` in `src/lib/energy/bill-audit.ts`. **Deterministic, not AI.**
- **Why silent:** bill-audit needs **≥3 comparable same-season cycles** (`minComparators: 3`) to form a stable median before it can flag an anomaly. This meter has **`cycleCount: 1`** — a single cycle. With one cycle there is no peer median, so the audit never runs. (It would take the no-peak path here, since B1 carries no peak kW, but that path also needs ≥3 peers.)
- **Data we HAVE:** 1 cycle ($9.85). **Data we NEED:** at least 2 more same-season B1 cycles (a full bill history) to enable an overcharge check.

### 3. Solar / NEM finding — **SILENT as currently wired, but the true-up signal exists in the data.**
- **Engine:** `solarNemChecks()` in `src/lib/energy/solar-nem.ts`. **Deterministic, not AI.**
- **track_trueup (info) sub-finding:** would fire when `nemType` AND `trueUpMonth` are present — this meter HAS both (`NEMS`, October). BUT `solarNemChecks()` returns `[]` immediately when **`solarKw === null`** (its first guard), and this meter's nameplate is unrecorded. So as the data stands today, **no track_trueup card is emitted** — purely because the array nameplate is missing.
- **F2 demand-gap (`review_solar_demand`, the one dollar-bearing solar finding):** would require the meter to be on the **AG-C family AND owe a demand charge.** This meter is on **B1 with no demand charge**, so the F2 finding does NOT apply — there is no demand charge for solar to fail to cover. **No solar dollar finding here.**
- **Data we HAVE:** NEM type (NEMS), true-up month (October), full annual import/export/net kWh. **Data we NEED:** the **solar array nameplate kW** for this NEM group (currently `null`), to (i) unlock the track_trueup tracking card and (ii) place this SA in the correct Generation Allocation group. Per ground truth, the farm's arrays total **1,932 kW (840 + 1,092)**, not the inventory's erroneous sum; this meter's share of that aggregation is unknown until the Generation Allocation Summary is loaded.

### Notable finding flag
- **No >$500/yr finding on this meter.** The largest deterministic dollar in scope here is the $9.85 customer-charge cycle and the NEM true-up running balance, which is a *deferred settlement*, not a recoverable savings. Nothing to flag.

---

## (f) One-line plain-operator-English summary

> Your Big Ranch office runs on a small business rate (B-1) and netted almost nothing last cycle — the $9.85 bill is just the daily service fee; the office's solar credits and charges are riding on a running tab that settles every October, and right now it's pulling a little more power than it makes over the year.
