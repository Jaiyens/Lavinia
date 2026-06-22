# Data sufficiency + savings projection: the Solar / NEM lever

Lever 4 of the honest-priority list. Engine: `src/lib/energy/solar-nem.ts`
(+ `src/lib/energy/solar-allocation.ts` for the aggregation audit) driven by
`runSolarInsight` in `src/lib/recommendations/run-solar-insight.ts`.

**Bottom line up front.** This lever is, by deliberate design, a **$0-bankable,
legibility-and-dispute-readiness lever** on the data in hand. The savings engine
is a set of **deterministic pure functions** (no AI; the only AI in the pipeline
is the bill-PDF vision extraction in `src/lib/extract` that produced
`billing.json`), and they **refuse to put a dollar at stake** for solar: solar
never lowers the demand charge, so the engine surfaces the demand reality as an
explanation (note text), never as `impactUsd`. The one genuinely large number
here — the **P031 / VINES 75HP $62,795.65 true-up, recovery $0–$57k** — is
**contingent on the PG&E Generation Allocation Summary**, not on buying interval
data. **Buying interval on the active meters does NOT unblock this lever.** It
only *verifies* the credit story (the 111.52 kW vs 75 HP demand anomaly, the TOU
timing of P027/P004 exports); the PG&E document is what turns $0 into dollars.

---

## 1. What the engine actually needs (exact required inputs)

The dollar-bearing surface is `nemDemandInsight(input)` in `solar-nem.ts`, called
per meter by `runSolarInsight`. Its input type `NemDemandInsightInput`:

| Field | Type | Source today |
|---|---|---|
| `isSolar` | boolean | inventory `solarFlag` (master sheet) → `MeterView.isSolar` |
| `scheduleLabel` | string \| null | bill / inventory `rateSchedule` |
| `coverageState` | `"no_bill" \| "needs_review" \| "reconciled"` | billing reconciliation state (NOT interval) |
| `nemMonths[]` | `{ start, netKwh, amountCents }` | the printed NEM monthly-net table on the bill |
| `cycleDemandCents[]` | `(number \| null)[]` | the per-cycle demand line items on the bill |
| `trueUpAmountCents` | number \| null | the printed annual true-up |
| `card` | `RateCard` | committed PG&E rate-card fixture |

**The hard gate (all five must hold, else it returns `null` = no insight, fail-closed):**

1. `isSolar === true`
2. `planFromLabel(scheduleLabel).family === "AG-C"`
3. `coverageState === "reconciled"`
4. summed `cycleDemandCents > 0` (a demand charge is actually owed)
5. at least one printed NEM month on file (`summarizeNemMonths !== null`)

Two pure siblings ride along in `runSolarInsight` once the gate passes:
`solarBillFloor(lineItems)` (splits the bill into the solar-uncoverable floor —
demand + NBC + service — vs the offsettable `tou_energy`) and
`demandUncoveredShare(...)` (the demand share of demand+offsettable, a **ratio,
never a dollar**). Their inputs are the per-cycle `lineItems` (kind + integer cents)
already on the reconciled bill.

The aggregation audit (F3) uses `solar-allocation.ts`:
`allocateArray` needs each benefiting meter's **`cumulativeKwh`** (sum of per-cycle
`totalKwh` — a summary, never the 15-minute series); `auditAllocation` additionally
wants a **recorded/stated allocation share** per meter to flag a mismatch — which
**nothing in the launch data carries**, so that branch is silent today.

**Every one of these inputs is a bill/meter-list fact. None is a 15-minute interval.**
The module header is explicit: "Pure: no UI, no DB, no clock, no fs," and the
allocation engine is "OOM-SAFE BY CONSTRUCTION … cannot touch intervals."

---

## 2. What we have for free, from bills + meter list

From `normalized/billing.json` (account **4699664587-8**, 46 billed SAs) and
`normalized/inventory.json` (183 meters):

- **14 NEM-enrolled meters** on the billed account, **11 carrying a printed true-up**,
  **$83,338.49 of true-ups total**, every one with its full printed monthly-net table
  (9–13 months each). This is rich, real, free input.
- **56 solar-flagged meters** across the 183-meter inventory, in **8 array groups**,
  with `nemType` tokens (NEM2AA / NEM2AG / NEM2M / NEMEXP / NEMEXPM / NEMS) and
  true-up months. **13 of these carry a nameplate kW** — the two named arrays
  (**1,092 kW** on P006/P013/P024/P099 + 1 unlabeled; **840 kW** on
  P106/P118/P119/P120/P121/P122/P142/P154), total **1,932 kW** (ground truth).
- The **P031 anomaly is fully visible from the bill alone**: import 230,223 kWh /
  export 39,718 / net 190,505 kWh, true-up **$62,795.65** → effective **$0.3296/kWh**
  (full retail, ~14× the ~$0.023 NBC floor) ⇒ essentially **zero allocated credit**.
  Its sibling **P038** (same account, same "Solar" group, 124,117 kWh net import,
  trues up to **$0.26** = ~$0.000002/kWh) is the on-bill **control case** proving the
  allocation machinery works on this exact arrangement and simply did not reach P031.

**What the gate does to that free data is the catch:** the legacy labels
`AG5B`/`AG5C`/`AG4C` map (in `rate-lever.ts`) to families **AG-5 / AG-4**, **not AG-C**.
So `nemDemandInsight`'s `family === "AG-C"` test **rejects every legacy AG-5/AG-4
NEM meter** (P003, P028, P052, P027, P018, P062, P067, P002, P004, P017). The only
NEM-solar meters on the **true AG-C family** are **P031, P038, P041**:

| Meter | Family | isSolar | Demand owed | Coverage | NEM months | Passes gate? |
|---|---|---|---|---|---|---|
| **P031** (VINES 75HP) | AG-C | yes | $1,112.97 | **needs_review** | 13 | **No** (coverage) |
| **P038** | AG-C | yes | $0.15 | **needs_review** | 13 | **No** (coverage) |
| **P041** | AG-C | yes | $2.50 | reconciled | 5 | **Yes** |

So **today the dollar-bearing F2 insight fires on exactly one meter — P041 — over a
trivial ~$3 demand charge.** P031 and P038 are blocked from the F2 surface by
`coverageState = needs_review` (a billing-reconciliation state — these meters have
free-text demand lines that did not fully tie out, **not** an interval gap).

The F1 rate-legibility flag, F3 allocation audit, F4 grandfather watch, F5
aging-array flag, and F7 demand-response routing all also live in this engine and
**all carry honest-blank dollars by design** (`impactNote` only, never `impactUsd`).
F4/F5 are additionally data-gated on a PTO date and a per-array generation series
that the launch export does not carry, so they are silent.

---

## 3. What buying interval on the active meters adds

**It does not unblock this lever.** Concretely:

- **`coverageState` is a billing reconciliation state, not an interval state.**
  Interval kWh does not flip P031/P038 from `needs_review` to `reconciled`. So
  buying interval does **not** make the P031 F2 insight emit.
- **`nemDemandInsight` reads zero interval fields.** Its inputs are NEM months,
  cycle demand cents, the rate card — all already on the bill.
- **The P031 recovery is priced by `solar-allocation.ts` + NBC-floor arithmetic and
  is contingent on the PG&E Generation Allocation Summary / Form 79-1202**, full stop.
  Recovery floor $0 (NBC residue ~$4,382 is unavoidable; the 1,932 kW arrays may be
  oversubscribed = zero-sum), ceiling ~$57,500 only if the Summary shows P031
  absent/0% AND the array group had unallocated kWh.

What interval on **P031 / P004** *does* add is **verification, not recovery**:
- P031 bills **111.52 kW** demand — **1.56× the electrical ceiling of a 75 HP motor**
  — a wrong-multiplier candidate the interval series would confirm or clear.
- P027 (net **−22,906 kWh**, a net exporter still charged a **$2,461.49** true-up)
  and P004 (net **−16,059.88 kWh**) have export TOU timing whose dollar value is
  "UNCOMPUTABLE without interval kWh." Interval would let us *value* the export
  timing and *support* the P027 dispute — but the dispute and the P031 recovery both
  still need PG&E to agree / produce the allocation doc to recover cash.

So: **interval = a stronger evidence file for the credit story; the PG&E document =
the actual unlock.** This is the case where the buy-list spend is the *wrong* lever
to point at this finding.

---

## 4. Meters covered: now vs with the interval buy vs total

Counting **the solar/NEM population this lever speaks to**:

- **Total solar/NEM meters in the operation:** **56** solar-flagged across 183
  (14 on the billed account, 42 off-account with no bills in hand). The named-array
  capacity is real (1,932 kW) but 40 of those 56 sit on the other ~56 accounts.
- **Covered now (engine produces *any* solar finding from data in hand):** **14** —
  the 14 NEM-enrolled meters on account 4699664587-8 are visible to the engine
  (true-up, net position, P031/P038 anomaly + its on-bill control). Of those, the
  **dollar-bearing F2 demand insight emits on exactly 1 (P041)**; the rest surface
  as legibility / dispute-readiness (P031, P027) or honest-blank context.
- **With the interval buy:** **still 14.** Interval does not add a meter to this
  lever — it does not change the gate, the coverage state, or the off-account
  population. It strengthens the *evidence* on P031/P004/P027 already in the 14.
  (Interval's real payoff is the **rate-optimization** and **demand-recovery**
  levers, not solar/NEM.)

`metersCovered = { now: 14, withBuy: 14, total: 56 }`.

The remaining **42 off-account solar meters** (incl. the entire 1,092 kW and 840 kW
named arrays, and the P031/P038 "Solar"-group siblings P033/P083/P034/P074/P026 that
answer the zero-sum question) need **those accounts' bill PDFs**, not interval.

---

## 5. Projected annual $ range (PROJECTED — pending the PG&E document, not interval)

This lever's **engine-bankable savings = $0/yr** — by design. Solar does not reduce
a demand charge, and the engine never books the demand dollar as a saving. The only
upside is the **P031 audit recovery, which is a one-time true-up correction, not an
annual saving, and is contingent on the PG&E Generation Allocation Summary.**
Stated as the contingent recovery range (the honest way to size it):

- **Low: $0** — the defensible floor. NEMA allocation is a zero-sum pool; if the
  1,932 kW arrays are oversubscribed across the fleet, re-pointing P031's credit only
  moves the deficit to another meter, net $0. The ~$4,382 NBC residue is unavoidable.
- **Likely: ~$0–$10,000** — partial recovery if the Summary shows P031 was dropped
  from the allocation but the array group had only *some* spare generation. Pinning
  this requires the off-account "Solar"-group siblings' true-up status (their bills),
  so it stays a wide, honestly-uncertain band.
- **High: ~$57,500** — the ceiling: `62,795.65 − 0.023 × 230,223 = $57,500.52`,
  realized only if the Generation Allocation Summary shows P031 absent / 0% allocated
  **and** the array group had unallocated kWh to redirect to it. Never banked.

> **Label:** PROJECTED — contingent on the **PG&E Generation Allocation Summary /
> Form 79-1202**, which is a **free document pull, not the interval buy**. Interval on
> P031/P004 verifies the demand-kW anomaly and the export TOU timing but does **not**
> by itself recover any of this. Recurring annual savings from this lever ≈ **$0**;
> the range above is a **one-time** contingent true-up recovery.

Separately, the **P027 dispute (~$2,072/yr)** is booked under the bill-audit lever,
not here — it is a NEM true-up on a net exporter, winnable only if **PG&E agrees**,
and likewise needs the allocation summary, not interval.

---

## Assumptions

- NBC floor ≈ **$0.023/kWh** (the brief-nem-nema non-bypassable-charge floor);
  the $57,500 ceiling is `trueUp − NBC × annualImport`.
- "Covered now = 14" counts the NEM-enrolled meters on the billed account that the
  engine can reason about; the dollar-bearing F2 insight realistically fires on **1**
  (P041, ~$3). The 42 off-account solar meters need those accounts' bills.
- `coverageState` is treated as a **billing-reconciliation** state (per `load.ts`),
  independent of interval availability — so buying interval does not move P031/P038
  into the F2 gate.
- All figures are **deterministic** (pure functions in `src/lib/energy`); the only AI
  upstream is the bill-PDF vision extraction in `src/lib/extract`.
- The 1,092 kW + 840 kW = 1,932 kW capacity is ground truth; arrays are **not** the
  discredited 12,180 kW figure. The $62,795.65 true-up is a real zero-credit anomaly
  with genuine zero-sum risk — **never banked**.
