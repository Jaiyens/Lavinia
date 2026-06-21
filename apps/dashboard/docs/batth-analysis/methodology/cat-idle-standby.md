# Category deep-dive: Idle / standby meters

**Lever.** Truly-idle, NON-NEM service agreements that drew **0 kWh** in the latest billing
cycle yet still pay a monthly PG&E customer (standby) charge. Two mutually-exclusive remedies
per meter:

1. **Demote to AG-A1 (reversible).** The default fix. AG-A1 is the lowest customer-charge AG
   rate ($0.68895/meter/day) and carries **no demand charge**. Re-electing an idle AG-C/AG-B
   meter down to AG-A1 cuts the daily customer charge with zero operational change and is
   reversible at the next election if the pump comes back into service. Because the meter is at
   **0 kWh**, energy cost is $0 on *either* schedule, so the savings is purely the
   customer-charge delta with **no energy sign-ambiguity** (this is the clean case the
   AG-C->AG-B engine cannot resolve without intervals).
2. **Close the service agreement (permanent).** Eliminates the entire customer charge but
   permanently retires grid service to that pump. Larger dollars, but a grower decision with
   downside (reconnection cost/time if the pump is ever needed). Carried as per-meter upside,
   **not** in the defensible total.

**Distinguishing truly-idle from NEM-netting zero-kWh.** A meter reading `totalKwh = 0` on the
monthly bill is NOT necessarily idle. NEM-enrolled meters read 0 kWh on the monthly bill *by
design* because their energy is netted under NEM/NEMA true-up accounting (the energy is settled
annually, not monthly). Those meters are pumping; they are not standby candidates. This category
includes ONLY the meters where `nem.nemEnrolled = false` AND `latestCycle.totalKwh = 0`.

- Account 4699664587-8 has **28** zero-kWh meters in the latest cycle.
- **14** of those are NEM-enrolled (zero-kWh by netting, e.g. P004 still posts a $1,409.21
  demand charge and a $3,642.22 cycle total) -> EXCLUDED from this lever.
- **14** are truly-idle NON-NEM (`nemEnrolled=false`, 0 kWh, $0 demand) -> the lever target.

Per the bill rollup: `idleZeroKwhMeterCount=28`, `idleButNemEnrolledCount=14`,
`trulyIdleNonNemCount=14`. This category matches `trulyIdleNonNemCount` exactly.

---

## PG&E rate inputs (eff. 3/1/2026, Advice 7846-E; from brief-pge-ag-rates.md)

Customer (standby) charge, $/meter/day, and the 30-day monthly anchor that ties to the bill:

| Rate (bill code / HV code) | $/day | x30 (mo) | x365 (yr) | Demand charge |
|---|---|---|---|---|
| AG-A1 / HAGA1 | $0.68895 | $20.67 | $251.47 | none |
| AG-A2 / HAGA2 | $0.68895 | $20.67 | $251.47 | Max-Demand only |
| AG-B / HAGB | $0.91565 | $27.47 | $334.21 | none |
| AG-C / HAGC | $1.43343 | $43.00 | $523.20 | Max-Demand + Summer-Peak-Demand |

These daily rates reproduce the bill's printed monthly customer charges exactly
(AG-A1 $20.67, AG-B $27.47, AG-C $43.00 at 30 days), so the demote arithmetic is billing-grade.

**Demote-to-AG-A1 daily delta:**
- AG-C -> AG-A1: $1.43343 - $0.68895 = **$0.74448/day** = $22.33/mo = **$271.74/yr**
- AG-B -> AG-A1: $0.91565 - $0.68895 = **$0.22670/day** = $6.80/mo = **$82.75/yr**
- AG-A1 / AG-A2 -> AG-A1: already at the floor customer charge -> **$0 demote savings**
  (AG-A2 still gains by shedding latent Max-Demand exposure, but at 0 kWh that exposure is $0).

---

## Enumeration — every truly-idle NON-NEM meter (14)

All 14 read `totalKwh = 0`, `demandChargeUsd_structured = null/0`, `nemNetChargeUsd = 0`, and the
printed cycle total equals the customer charge to the cent (the customer charge IS the entire
bill). Inventory `status` / `solarNotes` corroborate idleness; 6 carry an explicit "not using"
note. Inventory `nemType` is null for all 14 (confirms non-NEM).

| # | SA ID | Pump | Bill rate (HV) | Cust $/mo | Demote->AGA1 $/yr | Close $/yr | Inventory status / note |
|---|---|---|---|---|---|---|---|
| 1 | 4692166716 | P075 | AGC (HAGC) | $43.00 | $271.74 | $523.20 | GOOD / "not using" |
| 2 | 4692424863 | P008 (PUMP # 8) | AGC (HAGC) | $43.00 | $271.74 | $523.20 | GOOD |
| 3 | 4697631144 | (none) | AGC | $43.00 | $271.74 | $523.20 | not in inventory |
| 4 | 4698006011 | (none) | AGB | $27.47 | $82.75 | $334.21 | not in inventory |
| 5 | 4699142630 | (none) | AGC (HAGC) | $43.00 | $271.74 | $523.20 | not in inventory roster row |
| 6 | 4699664012 | P069 | AGA1 (HAGA1) | $20.67 | $0.00 | $251.47 | BAD / "not using" |
| 7 | 4699664198 | P072 | AGC (HAGC) | $43.00 | $271.74 | $523.20 | GOOD / "not using" |
| 8 | 4699664286 | P063 | AGA2 (HAGA2) | $20.67 | $0.00 | $251.47 | GOOD / "not using" |
| 9 | 4699664321 | P048 | AGA1 (HAGA1) | $20.67 | $0.00 | $251.47 | GOOD / "not using" |
| 10 | 4699664538 | P056 (PUMP #56) | AGA1 (HAGA1) | $20.67 | $0.00 | $251.47 | GOOD |
| 11 | 4699664561 | P057 | AGB (HAGB) | $27.47 | $82.75 | $334.21 | GOOD / "not using" |
| 12 | 4699664728 | P077 | AGC (HAGC) | $43.00 | $271.74 | $523.20 | GOOD |
| 13 | 4699664955 | P045 | AGA1 (HAGA1) | $20.67 | $0.00 | $251.47 | GOOD |
| 14 | 4699664965 | P043 | AGA1 (HAGA1) | $20.67 | $0.00 | $251.47 | GOOD |
| | | | **TOTAL** | **$436.96** | **$1,795.94** | **$5,316.44** |

`$436.96/mo` standby spend ties exactly to the prompt's ground truth and to
`sum(customerChargeUsd)` across the 14.

---

## Per-meter arithmetic (the dollars shown explicitly)

**9 AG-C meters** (P075, PUMP #8, 4697631144, 4699142630, P072, P077 + the two that are now idle):
each demote = ($1.43343 - $0.68895)/day x 365 = $271.74/yr.
- 9 x $271.74 = **$2,445.66/yr** if all nine were demotable... but only **6** of the AG-C idle
  meters are above the AG-A1 floor here that haven't already been counted — recompute cleanly:
  the truly-idle AG-C set = {P075, PUMP #8, 4697631144, 4699142630, P072, P077} = **6 meters**.
  Wait — re-check against the table: AG-C idle meters are #1,2,3,5,7,12 = **6 meters**.
  6 x $271.74 = **$1,630.44/yr**. (Earlier 9-count erroneously included AG-A1 rows.)

  Correct AG-C count from the enumeration table: rows 1,2,3,5,7,12 -> **6 AG-C meters**.

**2 AG-B meters** (4698006011, P057): each demote = ($0.91565 - $0.68895)/day x 365 = $82.75/yr.
- 2 x $82.75 = **$165.50/yr**.

**6 AG-A1 / AG-A2 meters** (P069, P063, P048, P056, P045, P043): already at the $0.68895/day
floor customer charge -> **$0 demote savings** (no lever; nothing above AG-A1 to shed at 0 kWh).

**Defensible demote total = $1,630.44 (AG-C) + $165.50 (AG-B) = $1,795.94/yr.**

(Cross-check by summing the table's Demote column: 6x$271.74 + 2x$82.75 = $1,795.94. Tie.)

**Close-service alternative = $5,316.44/yr** (all 14 customer charges eliminated permanently),
i.e. the full $436.96/mo x ~12.18 (365/30) annualization. Reported per-finding as upside; NOT in
the defensible total because closing service is a permanent grower decision with reconnection
downside.

---

## Computed by / honesty

- **computedBy:** `src/lib/energy/rateCompare.ts` (the rate-comparison pure function) evaluated at
  0 kWh, reducing to a customer-charge differential: `(dailyRate_current - dailyRate_AGA1) x days`.
  This is **deterministic arithmetic, not AI** — a fixed subtraction of two published $/day
  tariff constants times the billing days. No interval data, no model, no AG-C->AG-B energy term
  (which is null at 0 kWh). The only AI anywhere in the pipeline is the bill-PDF vision extraction
  in `src/lib/extract` that produced these customer-charge line items; the savings math itself is
  pure.
- **needsData: none.** The lever needs only the latest bill (already extracted): the rate code,
  the customer-charge line, and `totalKwh = 0`. No 15-minute intervals are required because the
  energy term is identically $0 on both the current and target schedule. (Intervals would only be
  needed to *re-justify* keeping a meter on AG-C, i.e. to prove a real >35 kW demand — the opposite
  direction.)

## Caveats (shipped with the number)

- **12-month rate-change stickiness.** A rate election sticks ~12 months (brief §4). Don't demote
  a pump that is seasonally idle now but will run > 35 kW within the year — it would strand on
  AG-A1 and re-trip the 35 kW ratchet. Demote only confirmed-idle / "not using" pumps.
- **35 kW one-way ratchet.** If any of the trailing-12 months breached 35 kW metered demand, PG&E
  keeps the meter eligible for AG-B/C. The 0-kWh latest cycle is necessary but a full trailing-12
  check (available from the same bill's annual rows) should confirm before filing each election.
- **AG-A1 vs AG-A2 target.** AG-A1 (no demand charge) is correct for these because they run few/no
  hours. If a demoted pump later runs many hours it may prefer AG-A2; that is a future re-election,
  not part of this idle-standby finding.
- The two AG-A2/AG-A1-already meters with "not using" notes (P063, P069, P048) are the strongest
  **close-service** candidates (idle AND already at the floor rate, so demote yields nothing) — the
  only remaining lever on them is closing the SA.
