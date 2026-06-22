# Batth Farms — Tiered Savings Projection

**The answer to "how much will we save?" — one reconciled ledger, no double-counts.**

This file rolls the seven per-lever sufficiency writeups
(`docs/batth-analysis/sufficiency/*.md`) and the structured per-lever records into a single,
tier-honest projection. It is **subordinate to `NUMBERS-RECONCILED.md`** (the single source of
truth) and does not contradict it: bankable-now is **~$1,796/yr certain**, plus **~$2,072/yr if
the one dispute wins**; everything larger is **gated** (projected, labeled).

Every dollar below is computed by **deterministic pure functions in `src/lib/energy`** (rate
deltas, customer-charge sheds, NBC-floor arithmetic) — **no AI**. The only AI in the pipeline is
the bill-PDF **vision extraction** in `src/lib/extract`, which reads numbers off the bill and
never emits a savings figure. Where a number is gated, it is presented as a **RANGE with explicit
assumptions** and is clearly **"projected, pending the actual interval pull / PG&E document /
other-account bills."** None of the gated tiers is banked.

**Scope of what we hold:** ONE account (`4699664587-8`) with ~46 billed SAs (28 idle/zero-kWh,
~18 active), plus a 183-meter Excel inventory across ~56 *other* accounts with **no bills in
hand**. The interval authorization is live (UtilityAPI UID 587577, 3-yr); pulls are **$12/meter,
first collection free**. Budget available = **$465**.

---

## The deduplication discipline (why these tiers don't overlap)

The single biggest reconciliation hazard is that the **idle AG-C/AG-B → AG-A1 demotions** were
originally booked in *both* the `idle-standby` lever **and** the `rate-optimization` lever. They
are counted **once**, in Tier A (idle/standby). Tier C's rate-optimization band is therefore the
**residual** — only the *active*-meter rate moves that idle/standby does not already capture.
Concretely:

- **Tier A** = the 8 truly-idle non-NEM demotable meters → **$1,795.94** (`idle-standby.md`).
- **Tier C rate-opt** = the 2 plausibly-<35 kW AG-C demotes on *active*-ish stranded meters
  (PUMP #55, P072, `$543.48`) + the 1 AG-A2 low-load-factor winner (`~$300`) + active-AG upside.
  These are the rate-opt low/likely/high band **$843 / $1,300 / $3,400** — and they are a
  **different meter population** than the 8 idle demotions in Tier A. No meter is counted twice.

Other dedup rules applied (from `NUMBERS-RECONCILED.md`):
- The **$795 "demand $/kW over-rate" finding was FALSIFIED** and is dropped.
- **Demand exposure $6,058.73/cycle is exposure PG&E correctly billed, NOT a saving.** Only the
  *recovery* (Tier C demand band) is a dollar, and it is $0 until intervals land.
- **Cycle-timing (Lever 5) is $0 by design** — a calendar moves no charge; its only $-shaped
  sub-lever (`cycleEdge`) would double-count the demand category, so it stays $0 everywhere.
- **P031 is never banked** — $0–$57k **contingent** on the PG&E Generation Allocation Summary,
  with real zero-sum risk on the 1,932 kW (840+1,092) arrays.
- **Structure/NEMA's $0–$57k and Solar/NEM's $0–$57k are the SAME P031 true-up** seen through two
  levers — counted **once** in Tier D, not added together.

---

## TIER A — CERTAIN NOW, free (idle demotions)

**Status: bankable now. High confidence. Reversible. Zero operational change. Zero new data.**

The 8 truly-idle non-NEM meters on the held account paying a customer (standby) charge on a
higher-tier schedule than their 0-kWh usage needs, demoted to the AG-A1 floor. At 0 kWh every
energy/demand term is $0, so the bill is 100% customer charge and the differential is exact:
`6 × $271.74 (AG-C→AG-A1) + 2 × $82.75 (AG-B→AG-A1) = $1,795.94/yr`. The 35 kW ratchet does not
bite (AG-A1 and AG-A2 share the identical `$0.68895/day` floor), which is why this is free and not
interval-gated.

| Band | $/yr | Basis |
|---|---:|---|
| Low | **$1,795.94** | 8 demotable idle meters, customer-charge differential, certain. |
| Likely | **$1,795.94** | Same — the honest headline. Not padded with off-account extrapolation. |
| High | **$1,795.94** | Same on the held account. (Fleet ceiling ~$23,600 lives in Tier E, gated.) |

**Tier A total (certain, bankable now): $1,795.94/yr.**
Close-service upside (~$5,316/yr if the grower permanently closes the 14 idle SAs) is a permanent
decision with reconnection downside — **reported, never banked.**

---

## TIER B — WINNABLE DISPUTE (P027)

**Status: data in hand now; needs PG&E to agree (one document, not interval). Medium confidence.**

P027 (SA 4697755484) is a clear **net exporter** (import 16,949 / export 39,855 / net −22,906 kWh)
that was nonetheless charged a **+$2,461.49** NEM true-up. Computed deterministically by
`solar-nem.ts` (`summarizeNemMonths` + `solarBillFloor`):
`disputable = 2,461.49 − (16,949 × $0.023 NBC) = $2,071.66`.

| Band | $/yr | Basis |
|---|---:|---|
| Low | **$0** | PG&E declines the dispute. |
| Likely | **$2,071.66** | Dispute wins; the export credit is re-applied. |
| High | **$2,071.66** | Same ceiling (the disputable slice is bounded by the NBC floor). |

**Tier B total (if won): ~$2,072/yr.** This is a one-time true-up correction shown as an
annual-equivalent because true-up billing recurs yearly; correcting it at the source stops it
recurring. Needs the **Generation Allocation Summary / Form 79-1202** to confirm — **not** an
interval pull.

---

## TIER C — UNLOCKED BY THE ACTIVE-METER INTERVAL BUY

**Status: PROJECTED, pending the actual 15-minute interval pull. Ranges, not banked.**

**The spend that unlocks this tier.** A per-SA 15-min historical pull is **$12/meter, first
collection free** (auth already live). The high-density buy is **5 meters net $48** (P054 free +
4 × $12) covering ~89% of demand exposure and the rate-opt core; covering *all* active meters
(the 15 active-AG for rate-opt + the 3 priced demand meters + 18 active for bill-audit) lands at
**~$168–$204**, comfortably inside the $465 budget and the "~$250 active-meter interval buy"
framing. One authorization = one login = all meters.

This tier has **two independent levers** that the interval pull converts from "engine refuses to
quote" into priceable findings. They are added (different meter populations, no overlap):

### C1 — Rate optimization (the #1 lever)

Dead without 15-min interval kWh today: the bill summary carries no kWh-by-TOU split, so AG-C→AG-B
"savings" are sign-ambiguous artifacts the `no_usage_basis` guard correctly suppresses. With
intervals, the engine prices the energy term, checks the 35 kW ratchet per meter, and **also
suppresses money-losing swaps** (a naive AG-A2→AG-A1 flip loses ~$139/cycle).
Coverage: **0 now / 15 active-AG with the buy / 42 addressable** on this account.

| Band | $/yr | Composition |
|---|---:|---|
| Low | **$843** | 2 plausibly-<35 kW AG-C demotes ($543.48) + 1 AG-A2 winner ($300). |
| Likely | **$1,300** | Above + 1–2 mid-size AG-C the ratchet spares + a favorable AG-B. |
| High | **$3,400** | All 10 on-account AG-C/HAGC survive ($2,717.40) + AG-A2 winner + AG-B (~$400). |

*(Asymmetric bonus, not banked: the interval also prevents ~$1,668/yr of wrong-swap loss.)*

### C2 — Demand-charge recovery

Measured exposure = **$6,058.73/cycle** across 23 demand SAs (89.5% concentrated in P054 + P004 +
VINES 75HP). **That exposure is correctly billed — NOT a saving.** Recovery is $0 until intervals
size the curtailable kW (DR enrollment PDP/CBP/BIP on curtailment Batth already does, plus the
small avoidable-spike slice). Annualized exposure ~$72.7k–$96.9k; recoverable at a **conservative
~12% center (8–20% band)** — deliberately below the 20–25% literature working number because
almonds run flat-out off-peak with little schedule slack.
Coverage: **23 exposure now / 3 recovery-priceable with the $24 buy / 23 total** on this account.

| Band | $/yr | Basis |
|---|---:|---|
| Low | **$5,800** | 8% of the 12×-winter floor (~$72.7k). |
| Likely | **$10,200** | 12% of the seasonal-likely exposure (~$84.8k). |
| High | **$17,000** | 20% of the seasonal-high exposure (~$96.9k). |

### C3 — Bill-audit / disputes (the interval-unlocked component only)

`billAudit()` returns **0 today** — 44/46 meters have a single cycle, so the `minComparators: 3`
gate never passes. A 12-month pull gives each active meter ~12 real monthly cycles + a true
15-min `peakKw`, waking the anomaly engine. This is a **rare-event** lever (a flagged cycle is a
one-time rebill), projected as `meter-cycles × hit-rate × typical excess`.
Coverage: **0 now / 18 active with the buy / 183 total**.
*(Note: the **P027 dispute is excluded here** — it is booked once in Tier B, sourced from
`solar-nem.ts` + a PG&E doc, not from this engine or the interval pull.)*

| Band | $/yr | Basis |
|---|---:|---|
| Low | **$162** | 216 meter-cycles × 0.5% × $150. |
| Likely | **$810** | 216 × 1.5% × $250 (the interval-only component, P027 lives in Tier B). |
| High | **$2,592** | 216 × 3.0% × $400. |

### Tier C total (C1 + C2 + C3), projected, pending interval pull

| Band | $/yr |
|---|---:|
| **Low** | **$6,805** |
| **Likely** | **$12,310** |
| **High** | **$22,992** |

All three bands are **projected, pending the actual interval pull.** The recovery percentages and
hit-rates are assumptions, not measurements; the engine returns $0 on these levers until intervals
land. Summer tariff sheets could shift the AG-C/AG-A2 rate numbers (the customer-charge core of C1
Low is bill-exact and robust).

---

## TIER D — CONTINGENT (P031, on the PG&E doc)

**Status: PROJECTED, contingent on the PG&E Generation Allocation Summary / Form 79-1202.
A one-time true-up correction, NOT a recurring annual saving. NEVER banked.**

P031 / VINES 75HP (SA 4699664088) carries a **$62,795.65** true-up at effective **$0.3296/kWh**
(~14× the ~$0.023 NBC floor) = essentially zero allocated credit, while its same-account, same-group
sibling P038 trued a 124,117 kWh import down to **$0.26** — the on-bill control proving the
allocation machinery works and simply did not reach P031. **The Solar/NEM lever and the
Structure/NEMA lever describe the SAME true-up; it is counted ONCE here.**

| Band | $ (one-time) | Basis |
|---|---:|---|
| Low | **$0** | Zero-sum floor. If the 1,932 kW (840+1,092) arrays are oversubscribed, re-pointing P031's credit only moves the deficit; the ~$4,382 NBC residue is unavoidable. |
| Likely | **~$28,000** | Coin-flip midpoint, "expected value under maximum uncertainty," not a defensible claim. Pinning it needs the off-account "Solar"-group siblings' true-up status. |
| High | **~$57,500** | Ceiling: `62,795.65 − 0.023 × 230,223 = $57,500.52`, only if the Summary shows P031 absent / 0% allocated AND the array group had unallocated kWh. |

**Tier D total (contingent, one-time): $0 / ~$28,000 / ~$57,500.** Interval data on P031 only
verifies the demand-kW anomaly (111.52 kW vs a ~73 kW 75-HP ceiling) and export TOU timing — it
does **not** unlock this recovery; the **document** does. Free to pull.

---

## TIER E — PORTFOLIO (the other 56 accounts)

**Status: UNSIZED / gated on the other accounts' bill PDFs (free from PG&E MyEnergy, then the
same vision pipeline lights them up at $0). Ceilings shown are extrapolations, NOT measurements.**

The 183-meter inventory spans ~56 *other* accounts with **no bills in hand**. The same levers
apply at scale, but none can be priced until those PDFs are pulled.

| Component | Indicative ceiling | Basis (extrapolation, labeled) |
|---|---:|---|
| Off-account idle-class demotions (~87 AG-C-class meters) | **~$23,600/yr** | On-account idle ratio (~10 of 12 AG-C idle) applied at $271.74 each. Assumption, not a measurement. |
| Off-account rate-opt / demand / bill-audit | **unsized** | Needs those bills, then intervals — double-gated. |
| Off-account solar / NEMA orphans (42 of 56 solar meters, incl. both named arrays) | **unsized** | Needs those bills + the allocation Summary. |

**Tier E total: unsized; ~$23,600/yr is the single defensible *idle-demotion* extrapolation
ceiling, explicitly gated on the other accounts' bills.** Do not pitch it as banked.

---

## The honest headline

### Expected first-year range

| Component | Low | Likely | High |
|---|---:|---:|---:|
| **A — Certain now (idle demotions)** | $1,796 | $1,796 | $1,796 |
| **B — Dispute (P027), if won** | $0 | $2,072 | $2,072 |
| **C — Interval-buy unlock (rate-opt + demand + bill-audit)** | $6,805 | $12,310 | $22,992 |
| **Expected first-year (A+B+C)** | **~$8,600** | **~$16,200** | **~$26,900** |

- **Certain, bankable now (A only): ~$1,796/yr.**
- **With the one dispute won (A+B): ~$3,868/yr** — matches `NUMBERS-RECONCILED.md`'s "~$3,900."
- **First-year expected (A+B+C), projected after the ~$48–$204 interval pull:
  ~$8,600 low / ~$16,200 likely / ~$26,900 high.**

Tiers **C is projected** (pending the actual interval pull) and **B is contingent** on PG&E
agreeing. The certain floor is **A alone (~$1,796)**.

### Run-rate after full data (recurring, all gates cleared)

Run-rate = the recurring annual stream once the interval pull, the PG&E allocation document, and
the other accounts' bills are all in hand. It **excludes the one-time** items (Tier D P031 true-up
and Tier B/C3 one-time dispute/rebill recoveries are recurring only insofar as the structures
recur):

| Component | Low | Likely | High |
|---|---:|---:|---:|
| A — idle demotions (recurring) | $1,796 | $1,796 | $1,796 |
| C1 — rate optimization (recurring) | $843 | $1,300 | $3,400 |
| C2 — demand recovery (recurring) | $5,800 | $10,200 | $17,000 |
| E — off-account idle demotions (gated ceiling) | $0 | ~$11,800 | ~$23,600 |
| **Run-rate after full data** | **~$8,400** | **~$25,100** | **~$45,800** |

*(Run-rate deliberately drops the one-time bill-audit rebills (C3) and the one-time P031 true-up
(Tier D, $0–$57.5k). Add Tier D **once** as a non-recurring event if and when the allocation
document resolves it favorably. Tier E "likely" is the ~$23,600 idle ceiling halved to reflect the
unproven off-account idle ratio — clearly an extrapolation, pending those bills.)*

---

## Tier totals at a glance

| Tier | What | Status | Low | Likely | High |
|---|---|---|---:|---:|---:|
| **A** | Idle demotions | **Certain now, free** | $1,796 | $1,796 | $1,796 |
| **B** | P027 dispute | Winnable dispute (PG&E agrees) | $0 | $2,072 | $2,072 |
| **C** | Interval-buy unlock (rate-opt + demand + bill-audit) | Projected, pending interval pull | $6,805 | $12,310 | $22,992 |
| **D** | P031 true-up | Contingent on PG&E doc (one-time) | $0 | ~$28,000 | ~$57,500 |
| **E** | Other 56 accounts | Gated on their bills (unsized) | $0 | (extrapolated) | ~$23,600 |

**Bottom line:** Walk in with **"~$1,796/yr certain today, ~$3,900 with one dispute, and a
credible ~$8.6k–$26.9k projected first year once we pull ~$50–$200 of interval data" — not "here's
$60k."** The first earns a pilot; the second gets you caught. Every gated number is a labeled
projection, never banked.
