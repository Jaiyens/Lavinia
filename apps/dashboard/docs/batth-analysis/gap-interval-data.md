# The interval-data gap: what 15-minute kWh unlocks, by meter, and what it costs

**Question this answers:** which Batth findings are stuck at "opportunity, not banked" purely because we hold
**bill summaries (no kWh, no 15-minute intervals)** instead of the **15-minute interval series**, exactly which
meters need pulling, what each pull unlocks, and the cost at **$12/meter (first meter free)** so we can rank
the spend by dollars-unlocked-per-dollar-spent.

## Ground truth held (do not contradict)
- Solar arrays total **1,932 kW** (840 + 1,092), NOT 12,180 kW.
- Bill account **4699664587-8** covers **46 metered SAs**; **42 of the 46 are on AG tariffs** (the
  rate-optimization scope), the other **4 are B1 business** meters. The Excel inventory covers **183 meters
  across 57 accounts / 7 billing-name strings (~6 legal entities)**.
- Savings dollars are computed by **deterministic pure functions in `src/lib/energy`** (rateLever,
  rateOptimization, demand, solar-nem, solar-allocation). The **only AI** in the product is **bill-PDF vision
  extraction in `src/lib/extract`** (it produces data rows, never a savings dollar; it is also what would read
  the serial letter / itemized demand line off a bill).
- **Rate optimization needs 15-minute interval kWh to be trustworthy.** Bill summaries carry no kWh, so on the
  single idle winter cycle we hold, energy is modeled as 0, the 35 kW eligibility ratchet is unobservable, and
  the engine's AG-C->AG-B comparison is a **sign-ambiguous artifact** (suppressed by the `no_usage_basis` guard
  at `rate-lever.ts:508`). Every large rate-optimization dollar is **OPPORTUNITY, not banked**.
- The **P031 / VINES 75HP $62,795.65** zero-credit true-up is a **real** anomaly (sibling P038 proved the
  allocation machinery zeroes a 124,117 kWh import to $0.26). Recovery is **$0-$57k CONTINGENT on the Generation
  Allocation Summary** (the 1,932 kW arrays may be oversubscribed = zero-sum). **Never banked, never overstated.**

## Why intervals are the gate (the one-paragraph version)
A PG&E bill summary gives us one end-of-cycle peak kW and a monthly kWh total per SA. It does **not** give us
*when* the kWh and the peak happened. Three of our six finding categories cannot be priced without that timing:

1. **Rate optimization** needs the full-year kWh-by-TOU-period to (a) see whether AG-A1's higher energy rate
   eats the customer-charge saving, and (b) observe the trailing-12-month 35 kW ratchet that decides AG-A1
   eligibility. On the idle winter cycle we hold, kWh = 0, so the engine cannot tell a safe demotion from a
   money-losing one.
2. **Demand charges** need the 15-minute shape of the peak to tell a *single-pump* peak (nothing to recover)
   from a *coincident overlap* (shave-able), and to size curtailable kW for DR enrollment.
3. **Bill audit** (CT/PT multiplier check) needs the true metered 15-minute peak to prove a billed peak is
   inflated by a wrong multiplier.

Solar/NEM recovery, by contrast, is gated on a **different** document (the **Generation Allocation Summary**),
not on intervals; off-account findings are gated on the **other-account bills**. Those are called out below so we
do not buy intervals expecting them to unlock solar dollars.

---

## Per-finding gap table

Legend for "gate": **INTERVAL** = unlocked by 15-min interval data (the subject of this doc);
**ALLOCATION** = needs the PG&E Generation Allocation Summary (not intervals);
**OTHER-BILLS** = needs the other-account bills (not intervals);
**NONE** = already defensible from the bill we hold.

| # | Finding | Category | Defensible now | Opportunity if interval-proven | Gate | Meters |
|---|---------|----------|----------------|--------------------------------|------|--------|
| A | Stranded idle AG-C/HAGC pumps -> AG-A1 (customer-charge shed) | rate-opt | $543.48/yr (2 small) | up to ~$2,717/yr (10 on-account) + ~$23,600/yr fleet (87 off-account) | INTERVAL (+ OTHER-BILLS for the 87) | 10 on-account AGC/HAGC |
| B | Low-load-factor AG-A2 -> AG-A1 (drop max-demand charge) | rate-opt | $300/yr (1 winner) | sign-confirmed full-year delta on 4 AG-A2 | INTERVAL | 4699664794, 4699664194, 4699664599, 4699664553 |
| C | 5 AG-B meters: AG-A1 customer-charge delta vs higher energy | rate-opt | $0 (sign-ambiguous) | confirm net sign on 2 metered AG-B | INTERVAL | 4698006011, 4698074516, 4699664416, 4699664429, 4699664561 |
| D | Demand-charge recovery: P054 / P004 / VINES 75HP | demand | $0 | DR-enrollment + peak-shave on 561.92 kW of billed peak | INTERVAL (+ DR program terms) | 4696826125, 4698660251, 4699664088 |
| E | Tail demand meters (ranks 4-23) | demand | $0 | immaterial even if proven | INTERVAL | 20 SAs (ELKHORN-18 etc.) |
| F | VINES 75HP billed 111.52 kW = 1.56x a 75 HP ceiling (CT/PT multiplier) | bill-audit | $0 | ~$556/cycle if a 2x multiplier is proven | INTERVAL | 4699664088 |
| G | Cycle-edge "hold your sets" nudge | cycle-timing | $0 (demoted, double-counts D) | watch-list nudge only | INTERVAL | P054, P004, P031 |
| H | Legacy AG-4/AG-5 solar pumps (AG-5C/5B/4C) -> AG-A1 | rate-opt | $0 (HOLD to 2027) | re-run post-2027 lapse | INTERVAL (deferred) | 9 NEM2AA legacy SAs |
| -- | P031 zero-credit true-up | solar-nem | $0 | $0-$57k CONTINGENT | **ALLOCATION (not interval)** | 4699664088 |
| -- | P027 net-exporter charged $2,461 true-up | bill-audit | $2,071.66 | -- | ALLOCATION confirms; defensible now | 4697755484 |
| -- | 42 off-account solar SAs / cross-entity NEMA | solar/structure | $0 | $0-$57k zero-sum answer | **OTHER-BILLS + ALLOCATION** | off-account |

> The "interval unlocks" total below deliberately **excludes** the solar/NEM contingent band ($0-$57k on P031
> and the off-account orphans) because those are not interval-gated. Buying intervals does not move them.

---

## Exactly which meters to pull, and what each pull unlocks

Pulling intervals is per-SA. PG&E (via UtilityAPI / Share My Data) returns the trailing-12-month 15-minute
series for one SA per authorization-scoped meter. Cost model: **$12/meter, first meter free.** So a pull of
*N* meters costs **`max(0, N-1) x $12`**.

### Tier 1 - the 3 big demand meters (Finding D, the highest-value interval pulls on the farm)
These three carry **87.6%** of the entire account's measured demand exposure ($5,305.40 of $6,058.73 this winter
cycle) and are the only credible **DR-enrollment** candidates (561.92 kW of billed peak between them).

| SA | Pump | Tariff | Winter peak kW | Demand $ this cycle | What the interval pull unlocks |
|----|------|--------|----------------|---------------------|--------------------------------|
| 4696826125 | P054 | AGC | 278.88 | $2,783.22 | Single-pump vs coincident split; curtailable kW for PDP/CBP/BIP; this is also the largest-energy meter (31,828 kWh) so it is a hard-running pump, lever is DR + shave, NOT a rate demote |
| 4698660251 | P004 | AG5B (legacy) | 171.52 | $1,409.21 | Same DR sizing; also feeds the 2027 force-transition rate-migration model |
| 4699664088 | VINES 75HP / P031 | AGC | 111.52 | $1,112.97 | DR sizing **AND** Finding F: prove the true 15-min metered peak vs the 75 HP ~73.1 kW electrical ceiling (1.56x = wrong-multiplier signature) |

- **Cost:** 3 meters = **$24** (first free, then 2 x $12).
- **Unlocks (interval-attributable):** the full DR-enrollment path on 561.92 kW (the demand findings call this
  "the most promising path but fully gated"), the avoidable-spike split on the same kW, **and** Finding F's
  ~$556/cycle multiplier dispute on P031. DR capacity payments are program-rate-dependent and not in the bill;
  even a conservative DR capacity value lands these three as **by far the densest dollars-per-pull on the farm.**
- Note: P031's $62,795.65 true-up is **not** unlocked here (that is the Generation Allocation Summary). The
  interval pull on P031 only unlocks its **demand** component (Finding F + DR).

### Tier 2 - the 10 idle AG-C/HAGC demotion candidates (Finding A) + the 4 AG-A2 swap candidates (Finding B)
These are the rate-optimization meters where intervals turn "opportunity" into "banked." The lever is reversible,
zero operational change, and worth **$271.74/yr per demotable AG-C meter** (the AGC->AGA1 customer-charge delta)
or the demand-vs-energy crossover on AG-A2.

**Finding A - 10 on-account AGC/HAGC (idle / near-floor this cycle):**

| SA | Pump | GPM | Tariff | Why interval-gated |
|----|------|-----|--------|--------------------|
| 4699664820 | PUMP #55 | 250 | HAGC | **plausibly always <35 kW** -> safe demote (part of the $543.48 defensible floor) |
| 4699664198 | P072 | 300 | HAGC | **plausibly always <35 kW** -> safe demote (part of the $543.48 defensible floor) |
| 4692166716 | P075 | 1000 | HAGC | likely >35 kW in summer; ratchet unobservable without intervals |
| 4692424863 | PUMP #8 | 800 | HAGC | likely >35 kW in summer |
| 4699664728 | P077 | 1400 | HAGC | likely >35 kW in summer |
| 4697631144 | (unlabeled) | -- | HAGC | not in Excel roster; needs intervals to classify |
| 4699142630 | (unlabeled) | -- | HAGC | not in Excel roster; needs intervals to classify |
| 4691715828 | PUMP 73 | -- | AGC | ran 5.48 kWh this cycle; ratchet unobservable |
| 4699664441 | P041 | -- | AGC | NEMEXP solar export agreement, not a pure idle pump |
| 4699664743 | P038 | -- | AGC | NEMEXPM solar (the sibling proof meter), not a pure idle pump |

**Finding B - 4 AG-A2 demand-vs-energy crossover:**

| SA | Pump | This-cycle signal | Interval verdict needed |
|----|------|-------------------|-------------------------|
| 4699664794 | SWANSON | $84.55 demand on only 92.4 kWh -> **wins ~$75.85/cycle on AG-A1** | confirm low-load-factor holds all year ($300/yr defensible winner) |
| 4699664194 | VINES 15HP | 2,392 kWh -> **net LOSS ~$139/cycle if switched** | confirm: do NOT switch |
| 4699664599 | -- | loses ~$20/cycle | confirm break-even/loss |
| 4699664553 | ELKHORN-18 | break-even | confirm |

- **Cost (Tier 2 alone, if Tier 1 already took the free meter):** 14 meters = **$168** (14 x $12).
- **Unlocks:** turns the **$543.48/yr** floor (2 safe demotes) toward the **$2,717.40/yr** ceiling for the 10
  on-account AGC meters, **plus** locks the sign on the 4 AG-A2 meters (confirming the **$300/yr** winner and,
  just as important, **preventing the ~$139/cycle loss** a blanket AG-A2->AG-A1 swap would cause on 4699664194).
  Sign-prevention is real value: without intervals a naive engine would emit the money-losing swap.

### Tier 3 - the ~87 off-account AGC/HAGC fleet (Finding A, fleet extrapolation)
The 183-meter inventory carries **96 AG-C class meters (13 AGC + 83 HAGC)**. Only ~12 sit on the bill account we
hold; the other **~84-87 sit on ~45 other accounts** (largest pools: account 1909940814-8 ~21 meters,
6539944461-4 ~11 meters) with **no billing data at all**. These need the **other-account bills first** to back-test
usage, **then** intervals to confirm eligibility per meter.

- If the on-account ratio holds (10 of 12 AGC meters idle/sub-1-kW), each demotable meter is **$271.74/yr** in
  customer charge alone. At ~87 candidates that is a **~$23,600/yr** fleet ceiling.
- **Cost (intervals only):** ~87 meters = **~$1,044** (87 x $12). **But this is double-gated** - you must also
  obtain the other-account bills (no marginal $ here, but a separate data-acquisition step), and the ratio is an
  assumption until back-tested. Treat Tier 3 as a second wave, not a first buy.

### Not interval-gated (do not buy intervals for these)
- **P031 $62,795.65** and the off-account solar orphans: gated on the **Generation Allocation Summary** + the
  other-account bills. Intervals do nothing for the allocation question.
- **P027 $2,071.66 disputable**: already defensible from the bill we hold (net-exporter direction is unambiguous
  on the printed annual NEM table). The allocation summary only *confirms* it; no interval needed.
- **Legacy AG-4/AG-5 solar pumps (Finding H)**: $0 today by design - **HOLD to the 2027 solar-legacy lapse**.
  Re-run the AG-A1 demotion sweep with intervals *at that time*, not now.

---

## Ranked by dollars-unlocked-per-dollar-spent

This is the buy order. "Unlocked" counts only interval-attributable dollars (DR/shave for demand, rate-delta for
rate-opt, multiplier dispute for audit); it **excludes** the solar/NEM contingent band, which intervals do not move.

| Rank | Buy | Meters | Cost | Interval-attributable unlock | $/$ density | Why first |
|------|-----|--------|------|------------------------------|-------------|-----------|
| **1** | **Tier 1: P054 + P004 + VINES 75HP** | 3 | **$24** (1 free + 2x$12) | DR enrollment on **561.92 kW** of peak (87.6% of all demand exposure) + the **~$556/cycle** P031 multiplier dispute (Finding F). Even a conservative DR capacity value dwarfs $24. | **highest** | One free meter belongs here; 3 meters carry 88% of demand exposure; the only DR candidates on the farm |
| **2** | **Finding B: the 1 clear AG-A2 winner (4699664794) + the 1 loss-prevention check (4699664194)** | 2 | **$24** | Confirms **$300/yr** banked AND **prevents a ~$139/cycle (~$1,668/yr) loss** from a wrong blanket swap | **very high** | Tiny spend; both bank-and-protect; loss-prevention is asymmetric value |
| **3** | **Finding A: the 2 safe-small AGC demotes (PUMP #55, P072)** | 2 | **$24** | Locks the **$543.48/yr** reversible floor as banked (removes the "on confirmation" caveat) | **high** | These two are already the most likely <35 kW; cheap to make certain |
| **4** | **Finding A: the other 8 on-account AGC/HAGC** | 8 | **$96** | Moves the on-account AGC ceiling from $543/yr toward **$2,717/yr**; reclassifies the 2 unlabeled SAs | **medium** | Larger pumps likely fail the 35 kW ratchet; intervals tell us which survive |
| **5** | **Finding B: the remaining 2 AG-A2 (4699664599, 4699664553)** | 2 | **$24** | Confirms break-even/loss; completeness, low new dollars | **low** | Mostly confirmatory |
| **6** | **Tier 3: ~87 off-account AGC/HAGC** | ~87 | **~$1,044** | Fleet ceiling **~$23,600/yr** IF the idle ratio holds | **medium, but double-gated** | Needs other-account bills first; ratio is an assumption until back-tested; biggest raw $ but lowest certainty per dollar |

### Recommended first buy (the cheap, high-certainty core)
**Ranks 1-3 = 7 meters = $72 total** (first meter free, then 6 x $12). That single $72 spend:
- opens the entire **DR-enrollment path** on the three meters that are 87.6% of demand exposure,
- banks the **$300/yr** AG-A2 winner and **prevents the ~$1,668/yr** wrong-swap loss,
- converts the **$543.48/yr** idle-AGC demote from "defensible on confirmation" to **banked**,
- and unlocks the **~$556/cycle** P031 multiplier dispute.

Everything above that ($96 for the remaining 8 AGC meters; ~$1,044 for the off-account fleet) is a **second wave**
justified only after the first buy proves the model and (for Tier 3) after the other-account bills land.

## What interval data does NOT fix
- It does **not** unlock **P031's $62,795.65** (Generation Allocation Summary) or any off-account solar dollar
  (other-account bills). Do not let a "$57k" headline get attached to an interval purchase.
- It does **not** create a cycle-timing dollar (Finding G stays $0: demoted per CLAUDE.md, and would double-count
  the demand category if it ever fired).
- It does **not** change the legacy AG-4/AG-5 HOLD-to-2027 posture (Finding H).
- The DR capacity dollars it unlocks are **program-rate-dependent** (PDP/CBP/BIP terms are not in the bill);
  intervals give us the curtailable kW, the program contract gives the $/kW.
