# Category Deep-Dive: Solar / NEM True-Ups

**Account:** 4699664587-8 (CHARANJIT S BATTH FARMS), statement 2026-03-26.
**Scope of this category:** every NEM-enrolled / solar-flagged service agreement that produced (or could produce) a true-up dollar, enumerated per-meter with explicit arithmetic and the exact PG&E rate inputs used.

**Computation provenance (read this first).** Every dollar in this file is produced by *deterministic pure arithmetic*, not AI. The only place AI touches this pipeline is the bill-PDF vision extraction in `src/lib/extract` that turned the 114-page PDF into `normalized/billing.json`. From that point on, the numbers are priced by pure, unit-tested functions in `src/lib/energy` — specifically `auditAllocation` / `classifyProgramType` (`src/lib/energy/solar-allocation.ts`) and `solarBillFloor` / `summarizeNemMonths` (`src/lib/energy/solar-nem.ts`). The hand arithmetic shown below is the same math those functions implement, written out so a grower can check it line by line in Excel.

**Ground truth that bounds everything here.** Solar arrays total **1,932 kW (840 kW + 1,092 kW)**, not 12,180 kW. The 840 kW and 1,092 kW named arrays in the inventory feed meters that live on **other PG&E accounts**, not the bill account read here. The P031 / VINES 75HP **$62,795.65** true-up is a real **zero-credit anomaly**, but its recovery is **$0 to ~$57.5k and CONTINGENT** on the PG&E Generation Allocation Summary (the arrangement may be oversubscribed = zero-sum). Nothing here is "banked."

---

## How a NEM true-up dollar is priced (the equation)

A NEM2 / NEM2A meter nets monthly and settles once a year. The true-up dollar owed at the anniversary month is:

```
trueUpUsd = Σ_months ( import_kWh × retail_TOU_rate  −  allocated_export_credit_kWh × retail_energy_rate )
            + NBC_rate × full_metered_import_kWh           # non-bypassable, never offset
            + fixed/min/demand charges                      # never offset by solar
```

Two diagnostics decide whether a true-up is *recoverable* or *correctly billed*:

1. **Effective $/kWh on net import** = `trueUpUsd / annualNetKwh`.
   - ≈ **$0.023/kWh** (the NBC floor) → the meter *was* credited; only non-bypassable charges survived. **Not recoverable.**
   - ≈ **full-retail ag TOU ($0.16–$0.33/kWh)** → the meter received **little or no generation credit**. **Anomaly; recoverable IF the credit exists and can be re-pointed.**

2. **Sibling proof** — a meter on the *same account, same rate, same solar group, same true-up month* that fully zeroed a comparable six-figure import proves the allocation machinery works, isolating the anomaly to enrollment/linkage rather than to a dead array.

NBC floor used below: **$0.023/kWh** (PG&E NEM2 non-bypassable composite, per `brief-nem-nema.md` §1).
AG-C winter energy used as the full-retail anchor: **Off-Peak $0.15981/kWh, Peak $0.18550/kWh** (per `brief-pge-ag-rates.md` §1 table; these are the exact rates the bill itself charged P038/P054 in the Feb–Mar cycle).

---

## FINDING 1 — P031 / VINES IRR 75HP: the $62,795.65 zero-credit anomaly (the big one)

**Meter:** SA `4699664088`, descriptor "VINES IRR 75HP NEW 75HP (PUMP # 31)", account 4699664587-8, rate **AGC**, inventory `nemType=NEMEXP`, solar group `Solar`, December true-up.

**Bill data (from the printed annual NEM table):**
- annual import = **230,223 kWh**
- annual export = **39,718 kWh**
- annual net import = **190,505 kWh**
- December true-up = **$62,795.65** (printed true-up cycle 2025-12-11, `isTrueUpCycle=true`, printedTotal $62,856.01)

**Arithmetic:**

```
effective $/kWh on net import = 62,795.65 / 190,505 = $0.3296/kWh
```

$0.33/kWh is **full-retail ag TOU pricing** — ~14× the $0.023/kWh NBC floor. A correctly-aggregated benefiting meter cannot land here; this SA received **essentially zero allocated generation credit**. The "NEMEXP, Exports = 0 in most months / 39,718 kWh export vs 230,223 import" status is the tell of a metering/enrollment linkage break (the SA exists with an export profile but is not wired into the allocation).

**Recovery bounds (the honest range):**

```
NBC-floor bill (if energy fully credited) = 0.023 × 230,223 kWh = $5,295.13
recovery CEILING = 62,795.65 − 5,295.13      = $57,500.52
recovery FLOOR   = $0   (zero-sum risk: arrangement may be oversubscribed)
```

**Why the floor is $0 (zero-sum risk, do not overstate).** The recoverable dollars are only real if the Generation Allocation Summary shows there was *spare* allocated generation that should have flowed to this SA. If the arrangement's total aggregated load already exceeds total generation (the 1,932 kW of arrays are oversubscribed across the whole fleet), then re-pointing credit to P031 simply moves the deficit onto another meter — the farm's *aggregate* true-up does not fall. Net recovery in that case = **$0**. We cannot tell which world we are in from the bill alone.

**needsData = pge-allocation-summary.** Pull the **Generation Allocation Summary / Supplemental Report** + active **Form 79-1202** roster for the arrangement. Confirm SA `4699664088` is absent or at 0% allocated percent, AND confirm spare generation exists. Only then is the ceiling collectible.

**Defensible dollars carried to the total: $0** (the anomaly is documented and worth chasing, but no dollar is collectible until the allocation summary confirms spare credit; carrying any positive number would overstate a contingent recovery as banked).

---

## FINDING 2 — P038: the sibling zero-sum proof ($0 lever, evidence only)

**Meter:** SA `4699664743`, "PUMP # 38", account 4699664587-8, rate **AGC**, inventory `nemType=NEMEXPM`, solar group `Solar`, December true-up. The closest possible sibling to P031: same account, same AGC rate, same `Solar` group, same December anniversary.

**Bill data + arithmetic:**
- annual import = **124,117 kWh**, export = 0, net = **124,117 kWh**
- December true-up = **$0.26**

```
effective $/kWh on net import = 0.26 / 124,117 = $0.0000021/kWh  (≈ zero)
```

P038 pulled **124,117 kWh** from the grid and owed **26 cents**. That is the allocation machinery working perfectly: virtually all of a six-figure import was absorbed by allocated generation credit. This is the proof that P031's $0.33/kWh is an **anomaly, not the tariff** — the same arrangement zeroed out a comparable load one SA over. It also bounds the diagnosis to enrollment/linkage (Finding 1 cause (a)), not a dead array.

**Defensible dollars: $0** (P038 is correctly billed; it is the control case, not a savings line).

---

## FINDING 3 — The 4433 / 4444 / 5219 partial-offset cohort (legacy NEM2AA): correctly-billed residuals, $0 recoverable

**Meters (9 NEM2AA legacy AG-4/AG-5 SAs on the bill, solar groups 4433 / 4444 / 5219):**

| SA | Pump | Rate | import kWh | export kWh | net kWh | true-up $ | eff $/kWh on net |
|---|---|---|---|---|---|---|---|
| 4690972110 | P018 | AG5B | 13,408 | 12,477 | 931 | 675.92 | $0.726 |
| 4692494679 | P003 | AG5B | 83,134 | 76,916 | 6,218 | 7,130.31 | $1.147 |
| 4693142227 | P028 | AG5C | 35,576 | 32,023 | 3,553 | 3,303.92 | $0.930 |
| 4695237170 | P062 | AG5C | 228 | 203 | 25 | 25.37 | $1.015 |
| 4695719808 | P052 | AG5C | 61,297 | 55,914 | 5,383 | 5,020.03 | $0.933 |
| 4697755484 | P027 | AG5C | 16,949 | 39,855 | −22,906 | 2,461.49 | n/a (net exporter) |
| 4699141870 | P017 | AG4C | 23,909 | 22,246 | 1,663 | 1,911.35 | $1.149 |
| 4698660251 | P004 | AG5B | 91,267 | 107,327 | −16,060 | (none) | n/a (net exporter) |
| 4691688023 | P002 | AG5B | 7,437 | 5,862 | 1,575 | (none) | n/a |

**Why these are NOT a lever (the arithmetic that disqualifies them).** The effective $/kWh looks huge ($0.73–$1.15) only because the *denominator is the tiny net*, not the gross import. On P003: 83,134 kWh imported, 76,916 kWh exported — the solar already absorbed ~92% of the load. The $7,130 is charged on the **6,218 kWh genuine net deficit** plus the fixed/NBC components that solar can never offset. These are **single-array, single-meter NEM2AA legacy true-ups behaving exactly as the tariff dictates** (TOU-timing dollar deficit on a meter that nets slightly positive). There is no orphaned credit to recover; the credit was already applied. P027 and P004 are net *exporters* (negative net) whose true-up is pure NBC/fixed residue.

**Sign-ambiguity caveat.** Two of these (P002, P004) carry no printed true-up dollar and net-export; any "AG-5 → AG-C savings" the rate engine emits for them without 15-min interval kWh is a sign-ambiguous artifact (per ground truth), so no rate-switch dollar is claimed here.

**Defensible dollars: $0** (already-billed, correctly-allocated residuals — recording them as recovery would double-count a tariff-correct charge).

Cohort sum of positive true-ups already billed (for context, **not** recoverable): **$20,528.39**.

---

## FINDING 4 — Off-account solar orphans: 42 solar meters we cannot price (needsData = other-account-bills)

The two **named arrays — 840 kW and 1,092 kW (= 1,932 kW)** — feed meters that are **entirely off the bill account read here**:

- `1092kw` group: 5 meters on account **6539944461-4** and **57448094630** (P006, P013, P024, P099, + one unlabeled SA).
- `840kw` group: 8 meters on accounts **5401297941-2, 1202269697-0, 0305152088-4, 8693286367-2, 9568475552-3, 4391127618-6, 9493367026-0, 3375127040-7** (P106, P118, P119, P120, P121, P122, P142, P154).

In total **42 solar-flagged SAs across 23 accounts** carry `solarFlag=true` but have **no record in `billing.json`** (the bill we extracted covers only 4699664587-8). The `Solar`-group siblings of P031/P038 that sit off-account — **P033 (6539944461-4), P083 (9597876494-2), P034 (8922820273-8), P074 (5089901685-6), P026 (3372050929-9)** — are exactly the meters whose true-up status would tell us whether the `Solar` arrangement is oversubscribed (the zero-sum question for Finding 1).

**Capacity sanity (deterministic).** 1,932 kW × 1,500–1,900 kWh/kW·yr ≈ **2.9M–3.7M kWh/yr** of generation. P031's whole 190,505 kWh load is ~5.8% of mid-estimate fleet production — so generation *exists* in abundance fleet-wide; the question is purely whether it is *allocated* to P031, which only the off-account bills + allocation summary can answer.

**Defensible dollars: $0** until those bills are pulled. **needsData = other-account-bills.**

---

## Category total (defensible dollars only)

| # | Finding | annual $ | confidence | needsData |
|---|---|---|---|---|
| 1 | P031 VINES 75HP zero-credit anomaly | **$0** (ceiling $57,500.52, contingent) | medium | pge-allocation-summary |
| 2 | P038 sibling zero-sum proof | $0 (evidence) | high | none |
| 3 | 4433/4444/5219 partial-offset cohort | $0 (correctly billed) | high | none |
| 4 | Off-account solar orphans (42 SAs / 23 accts) | $0 (unpriceable here) | low | other-account-bills |

**Total defensible annual recovery from this category: $0.**

This is deliberate and honest. The single largest dollar in the whole Batth bill — the $62,795.65 P031 true-up — is a *real, documented anomaly worth chasing*, but PG&E NEMA allocation is a **zero-sum pool**: re-pointing credit to P031 only recovers money if the Generation Allocation Summary proves spare generation exists in the arrangement. Until that document lands, the defensible, non-overstated recovery is **$0**, with a clearly-flagged contingent upside of **up to ~$57.5k** for the one meter. The remaining solar/NEM true-ups on this account are the tariff working as designed.
