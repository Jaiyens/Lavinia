# Data sufficiency + savings projection — Bill audit / disputes lever

Engine: `src/lib/energy/bill-audit.ts` (`billAudit()`), called per-pump from
`src/lib/recommendations/run.ts:225`. Pure, deterministic arithmetic. No AI in the
savings path; the only AI anywhere upstream is the bill-PDF vision extraction in
`src/lib/extract`.

All figures below are **projected, pending an actual interval pull** wherever they
describe what new data would add. Bankable-now numbers are traced to
`NUMBERS-RECONCILED.md` and `findings-deep-bill-audit.json`.

---

## 1. What the engine actually computes

`billAudit()` is a **retrospective same-meter, same-season anomaly detector**. It does
not re-price a bill against PG&E's rate card (that would only say "our model disagrees
with PG&E"). For each posted cycle it compares that cycle's dollar total to the **median
of the meter's OTHER same-season cycles**, and flags only when dollars jumped while usage
did not. Two paths:

- **With-peak path** (`severity: "act"`): a cycle flags when
  `totalBillUsd / median > 1 + billTolerance` (default 0.25) **AND**
  `peakKw / medianPeak <= 1 + peakTolerance` (default 0.12). The peak is the proof that
  usage stayed flat while spend rose. Requires `>= minComparators` (default **3**)
  same-season peers that each have a total *and* a usable `peakKw`.
- **No-peak path** (`severity: "watch"`): for summary-only meters with no `peakKw`,
  flags only when `totalBillUsd / median > 1 + noPeakBillTolerance` (default **0.5**, i.e.
  a clearly anomalous bill), at "watch" not "act". Also requires `>= 3` same-season,
  same-(no-peak) peers.

### Exact required inputs (`BillAuditInput`)

| Field | Type | Source | Have it now? |
|---|---|---|---|
| `farmId`, `pumpId`, `pumpName` | string | farm/meter records | yes |
| `bills` | `CycleBill[]` | posted cycles | **partial — 1 cycle/meter** |
| `bills[].start`, `.close` | ISO date | bill cycle window | yes |
| `bills[].totalBillUsd` | number\|null | bill total | yes (46/46) |
| `bills[].peakKw` | number\|null | **interval/demand history** | **15/46 active, distorted** |
| `summerMonths` | number[] | rate card | yes |
| `asOf` | ISO | clock | yes |

The single load-bearing scarcity is `bills`: the engine needs **at least 3 comparable
same-season cycles per meter** for any flag, and **a real `peakKw` per cycle** for the
precise "act" path. Today we have **one cycle per meter** (44 of 46 meters) and `peakKw`
that is bill-summary demand, not a true 15-minute interval peak.

---

## 2. What we have for free (bills + meter list)

Account **4699664587-8** only: 46 billed service agreements, **52 cycles total**, but the
cycle distribution is the whole story:

```
cycleCount per meter:  {1: 44 meters, 4: 2 meters}
distinct cycle windows across all 46 meters:
   2025-12-11 -> 2025-12-11   (2 meters)   winter
   2025-12-12 -> 2026-01-11   (2 meters)   winter
   2026-01-12 -> 2026-02-10   (2 meters)   winter
   2026-02-11 -> 2026-03-12   (46 meters)  winter   <- the one common cycle
```

Consequences for the engine:

- **44 of 46 meters have exactly 1 cycle.** A meter with 1 cycle has **0 same-season
  peers** -> `peers.length (0) < minComparators (3)` -> `continue`. **No flag, both paths.**
- **The 2 multi-cycle meters** (4699664088 VINES 75HP, 4699664743 P038) have 4 cycles —
  **all winter**, so a candidate has at most 3 same-season peers (just clears the gate),
  **but**: every one of those 8 cycles is `coverageState = needs_review`, several are
  NEM **true-up** cycles whose totals are not comparable energy bills (e.g. 4699664088's
  2025-12-11 cycle prints **$62,856.01** — a true-up, not a monthly bill), and the
  `peakKw` values are tiny/inconsistent (0.0148 to 111.52 kW on the same meter). A median
  built from a true-up cycle plus three monthly cycles is meaningless, so even where the
  count gate passes, the **median is not trustworthy** and any flag would be a true-up
  artifact, not a billing error. We treat these as **0 bankable from the engine**.
- **Net: `billAudit()` produces 0 reliable findings from the data in hand.** This is the
  engine behaving correctly — it refuses to flag without comparators.

### So where does the $2,072 come from?

The **P027 dispute (~$2,071.66)** is the bankable bill-audit-category dollar, but it is
**not** produced by `billAudit()`. It is computed by **`summarizeNemMonths()` +
`solarBillFloor()` in `src/lib/energy/solar-nem.ts`** (also pure, deterministic, no AI),
from the bill's printed annual NEM table:

```
disputable = trueUpUsd - (annualImportKwh x NBC_rate)
           = 2461.49 - (16949 x 0.023) = 2461.49 - 389.83 = 2071.66
```

P027 (4697755484) is a clear **net exporter** (import 16,949 / export 39,855 / net
-22,906 kWh) that was nonetheless billed a **+$2,461.49** NEM true-up; effective
$0.1452/kWh of import is ~6.3x the ~2.3c NBC floor, so the export credit is not reaching
this meter. **This needs a single PG&E document (the Generation Allocation Summary /
Form 79-1202) to confirm the mis-application — not interval data.** Confidence: medium.

This is the honest framing: the "bill audit / disputes" *category* banks **~$2,072 if the
P027 dispute wins**, but it is a **NEM-allocation dispute** surfaced from the printed bill,
not an output of the same-meter anomaly engine. The anomaly engine (`billAudit()`) is
**data-starved to zero today** and is the thing a 12-month pull would actually wake up.

---

## 3. What buying interval on the active meters adds

Two distinct things a 12-month interval/bill pull buys for THIS lever:

1. **More comparable cycles (the real unlock).** A 12-month historical pull gives each
   active meter **~12 monthly cycles across both seasons** instead of 1. That is the first
   time `billAudit()` has `>= 3` same-season peers per meter — the count gate finally
   passes for ~6 summer + ~6 winter cycles each, on real (not true-up) months.
2. **A true 15-minute `peakKw` per cycle**, which moves every active meter onto the
   precise **"act"** path (peak proves usage stayed flat) instead of the conservative
   "watch" no-peak path or no flag at all.

Active-meter accounting on the billed account:

```
billed meters:                       46
  idle / zero-kWh:                    28   (no usage -> nothing to audit; skip)
  active (non-idle, has kWh):         18
     of which with a peakKw today:    15
     of which no peakKw today:         3
```

So the **interval buy targets the ~18 active meters** (15 already carry a demand peak,
3 are summary-only). The 28 idle meters are not audit candidates — they are the
rate-demotion lever (item 1, ~$1,796/yr in `NUMBERS-RECONCILED.md`), not bill-audit.

### Budget

UtilityAPI = **$12/meter one-time historical pull, first collection free**; budget = **$465**.

```
18 active meters:  17 x $12 = $204   (first free)   <- comfortably within $465
46 all meters:     45 x $12 = $540   (over budget)
$465 ceiling:      first free + 38 paid = 39 meters
```

Pulling **interval on all 18 active meters costs $204** and leaves $261 of the budget for
the higher-priority rate-optimization pull (the #1 lever, also interval-gated). One pull
authorization = one login = all meters on the account (per the Batth UtilityAPI note).

---

## 4. Meter coverage (now / with buy / total)

| | Meters | What |
|---|---:|---|
| **Covered now** (engine can audit reliably) | **0** | 44 single-cycle + 2 true-up-distorted; engine flags nothing. (~$2,072 P027 is from solar-nem.ts + a PG&E doc, not this engine.) |
| **With the interval/bill buy** | **18** | the active meters on account 4699664587-8, once each has ~12 real monthly cycles + true peaks |
| **Total addressable** | **183** | full Excel inventory across 57 accounts; the other ~137 meters have **no bills in hand** and are not on the billed account |

`withBuy = 18` is the active subset of the **45** inventory meters that sit on the one
billed account; the remaining 138 inventory meters live on 56 other accounts whose **bill
PDFs are not in hand**, so the bill-audit engine cannot touch them until those PDFs are
downloaded (free from PG&E MyEnergy) and run through vision extraction.

---

## 5. Projected ANNUAL $ range (low / likely / high) — PROJECTED, pending actual interval pull

**Scope of this projection:** what the bill-audit / disputes *category* banks per year.
It has two independent components:

- **A. P027 dispute (have the data now; needs one PG&E doc):** $0 if PG&E declines,
  **$2,072** if it wins. This is the only bankable-today dollar and does **not** need the
  interval pull.
- **B. New anomalies the interval pull would surface on the 18 active meters:** unknown
  until the data lands. This is genuinely speculative — `billAudit()` may find nothing
  (the honest base case: PG&E's monthly bills are usually arithmetically correct), or it
  may surface a handful of one-cycle overcharges.

### Component B estimation method (explicit, conservative)

Anomaly detection on monthly bills is a **rare-event** lever, not a recurring-savings
lever: a flagged cycle is a one-time credit/rebill, not an annual stream. We project a
per-meter **expected recovery** as `hit-rate x typical one-cycle excess`, annualized only
to the extent multiple distinct cycles flag.

- 18 active meters, ~12 cycles each = ~216 meter-cycles to scan.
- Typical disputable excess per flagged cycle: anchored to the only comparable signals in
  hand — the (contingent, not banked) candidates in `findings-deep-bill-audit.json`: the
  AG-B phantom-demand line ceiling ~$79/cycle and the wrong-multiplier ~$556/cycle band.
  Use **~$150-$400 per genuinely flagged cycle** as the working range.
- Hit rate on clean monthly bills: **low**. We assume **low: ~0.5%**, **likely: ~1.5%**,
  **high: ~3%** of meter-cycles surface a *defensible* anomaly that PG&E actually credits.

```
B-low    = 216 x 0.005 x $150  ~  $162
B-likely = 216 x 0.015 x $250  ~  $810
B-high   = 216 x 0.030 x $400  ~ $2,592
```

### Combined category range (A + B), annualized

| | Component A (P027) | Component B (new anomalies) | **Total** |
|---|---:|---:|---:|
| **low** | $0 (dispute lost) | ~$162 | **~$162** |
| **likely** | $2,072 (dispute won) | ~$810 | **~$2,882** |
| **high** | $2,072 (dispute won) | ~$2,592 | **~$4,664** |

Rounded for the structured record: **low ~$162 / likely ~$2,880 / high ~$4,660 per year.**

Hard caveats:

- **Component B is PROJECTED, pending actual interval pull.** The hit-rate and per-cycle
  excess are assumptions, not measurements. The honest base case is that monthly bills are
  mostly correct and B trends toward the low end.
- **Component A ($2,072) is a one-time dispute recovery, not a recurring annual stream.**
  It is shown as "annual" only because true-up billing recurs yearly; if the P027
  allocation is corrected at the source it stops being a recoverable each year.
- These dollars are **separate** from the demand-charge lever's measured **$6,058.73/cycle
  exposure** (which is exposure PG&E correctly billed, $0 recoverable until interval data)
  and from the **P031/VINES $0-$57k** contingent true-up (gated on the same PG&E
  allocation summary, real zero-sum risk — never banked here).
- The other **~137 meters on 56 accounts** are out of scope until their bill PDFs are
  downloaded; this lever's dollars do not scale with the interval buy beyond the 18 active
  meters on the one billed account.

---

## 6. Verdict

**works-with-interval-buy.** The deterministic anomaly engine `billAudit()` runs today but
returns **zero** because every meter has one cycle (44/46) or true-up-distorted cycles
(2/46), so the `minComparators: 3` gate never passes. A 12-month interval/bill pull on the
**18 active meters ($204 of the $465 budget)** is what gives the engine the >=3 same-season
comparators and the true 15-min `peakKw` it needs to move to the precise "act" path. The
one bankable-now dollar in this category — **~$2,072 from the P027 dispute** — comes from
`solar-nem.ts` plus a single PG&E document, **not** from this engine and **not** from the
interval pull.
