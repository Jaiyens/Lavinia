# Data sufficiency + savings projection: the "Demand charges" lever

**Lever:** Demand charges (DR enrollment PDP/CBP/BIP, eligible rate move, avoidable-spike shaving)
**Engine:** `src/lib/energy/retrospective.ts` (the `retrospective()` pure function), priced via
`src/lib/energy/demand.ts` (`intervalKw`, `effectiveDemandRate`). Deterministic arithmetic, NOT AI.
The only AI anywhere on this path is the upstream bill-PDF vision extraction in `src/lib/extract`,
which produces data rows and never a savings dollar.
**Measured exposure (this winter cycle):** $6,058.73 across 23 demand-charged SAs on account
4699664587-8 (02/11/2026 -> 03/12/2026). Ties EXACTLY to `rollup.totalDemandCharge_structuredUsd`.

> Bottom line up front: the bill proves the *exposure*. It cannot prove the *recovery*. On bill data
> alone the engine returns **$0 recoverable** by design. With a 15-minute interval pull on the three
> meters that carry ~89% of the exposure, a **conservative ~12% of the annualized demand exposure**
> is realistically recoverable (band ~8-20%), i.e. **~$10k/yr likely (range ~$5.8k-$17k/yr),
> projected and pending the actual interval pull.** This is NOT the staggering pitch (almonds run
> flat-out off-peak in summer with little schedule slack); the recovery is mostly DR-enrollment
> capacity payments on committed curtailment the grower already does, plus the small avoidable-spike
> portion intervals can prove.

---

## 1. What the engine actually needs (read from the code)

`retrospective()` takes a `RetrospectiveInput`:

| Field | Type | Source | Have it now? |
|-------|------|--------|--------------|
| `farmId`, `pumpId`, `pumpName` | string | our DB / meter list | yes |
| `timezone` | string | farm config (America/Los_Angeles) | yes |
| `bills` | `readonly CycleBill[]` | bill PDF vision -> `billing.json` | **yes** |
| `intervals` | `readonly IntervalReading[]` | **15-min ESPI/Green Button pull** | **NO (the gate)** |
| `asOf` | string | "today" | yes |
| `outlierMargin?`, `outlierSeverity?` | optional | defaults | n/a |

Each `CycleBill` needs `{ start, close, demandChargeUsd, peakKw }` (plus optional `tariff`,
`peakAt`, `totalBillUsd`). Each `IntervalReading` is `{ start, durationSec, kWh }`.

**The load-bearing dependency.** Look at the engine body:

- It only emits a cycle at all when `bill.demandChargeUsd > 0` (line 109). We have that field for all
  23 SAs -> every demand cycle surfaces as an informational "this month cost you a demand charge."
- It derives `$/kW` with `effectiveDemandRate(demandChargeUsd, peakKw)` -> `demandChargeUsd / peakKw`.
  We have both, so the rate is real and never hardcoded.
- But the **dollar impact** (`impactUsd`) is computed *only* inside the `isOutlier` branch (lines
  127-140) as `(top.kw - second.kw) * rate`, where `top`/`second` are the two highest **daily peaks**
  from `dailyPeaksInWindow(input.intervals, ...)`. With `intervals = []`, `dailyPeaks` is empty,
  `top`/`second` are `undefined`, `isOutlier` is false, `impactUsd` stays `undefined`, and severity
  drops to `info`. **No interval series = no priced demand finding. By design.**

So the engine confirms the ground truth: demand-charge recovery is $0 (note-only) until interval data
lands. The exposure is carried as a measured-not-recoverable figure.

## 2. What we have for free from bills + meter list

From `normalized/billing.json` (46 billed SAs on one account) we already hold, per demand cycle:
`demandChargeUsd_structured`, `peakKw`, `tariff`, `start`/`close`, `totalKwh`. That is enough to:

- **Surface every demand cycle** as the informational retrospective rec (the `bill.demandChargeUsd > 0`
  gate passes for all 23 SAs).
- **Rank the exposure** and prove the concentration: the 23 demand SAs sum to exactly $6,058.73, and
  three meters carry **$5,421.51 = 89.5%** of it:

  | SA | Pump | Tariff | Winter peak kW | Demand $ (cycle) | Effective $/kW |
  |----|------|--------|---------------:|-----------------:|---------------:|
  | 4696826125 | P054 | AG-C | 278.88 | $2,783.22 | $9.98 |
  | 4698660251 | P004 | AG-5B (legacy) | 171.52 | $1,409.21 | $8.22 |
  | 4699664088 | VINES 75HP / P031 | AG-C | 111.52 | $1,229.08 (sum) | $9.98 |
  | | **Big-3 subtotal** | | **561.92 kW** | **$5,421.51 (89.5%)** | |
  | | 20 tail SAs | mixed | | $637.22 (10.5%) | |

  10 of the 23 demand SAs bill under $5 (standby pumps barely registering a 15-min peak). Tail recovery
  is immaterial even if proven.
- **Derive the effective $/kW** per meter (for later pricing) from the bill's own numbers.

From `normalized/inventory.json` (183 meters / 57 accounts) we get GPM, HP/descriptor, lat/long, rate,
solar/NEM flags. All three big demand SAs are present with coordinates, so they are confirmed real,
locatable pumps (P054 1,800 GPM; P004 2,250 GPM almond well, NEM2AA; VINES 75HP, NEMEXP).

**What the bill structurally cannot tell us** (per `brief-demand-charges.md` and the engine): the bill
gives two numbers per SA - monthly kWh and one max kW. It cannot say *when* the peak hit, *which* pumps
overlapped, whether the peak was a **single essential pump (nothing to recover)** or a **coincident
overlap (shave-able)**, or the **curtailable kW** a DR program would pay for. Those need the 15-min shape.

## 3. What buying interval on the active meters adds

Interval pulls are per-SA via UtilityAPI / Share My Data: trailing-12-month 15-min series, **$12/meter,
first meter free** (per `gap-interval-data.md`). Budget available = $465.

**The first buy (Tier 1) is the 3 big demand meters: 3 SAs = $24 (1 free + 2 x $12).** This unlocks:

1. **DR-enrollment sizing (the main recovery path).** Intervals give the curtailable kW on the 4-9pm
   window Batth already curtails; PDP/CBP/BIP pay capacity $/kW for that committed curtailment. This is
   "the most promising path but fully gated" in the demand findings.
2. **The single-pump vs coincident split.** Intervals tell whether P054's 278.88 kW is one hard-running
   pump (nothing to recover) or stacked overlap (shave-able) - the bill is identical in both cases.
3. **The avoidable-spike dollar** the engine computes as `(top.kw - second.kw) * rate` once daily peaks
   exist.
4. **Finding F (a bonus, not demand recovery):** VINES 75HP billed 111.52 kW vs a ~73.1 kW electrical
   ceiling for 75 HP = 1.56x, a wrong-CT/PT-multiplier signature worth ~$556/cycle if proven.

**Pulling interval does NOT** unlock P031's $62,795.65 NEM true-up (that is the Generation Allocation
Summary, $0-$57k CONTINGENT, never banked), nor any off-account dollar. Do not attach a $57k headline to
an interval buy.

## 4. Meter coverage

| | Count | Note |
|---|------:|------|
| Demand-charged SAs covered NOW (bills in hand) | **23** | all surface as informational exposure recs; $6,058.73 total |
| Recovery-priceable WITH the Tier-1 interval buy | **3** | P054 + P004 + VINES 75HP = 89.5% of exposure, $24 |
| ...extendable to (Tier 2, the 20 tail demand SAs) | up to 23 | immaterial even if proven; not worth the per-meter $12 |
| Total demand-charged SAs that exist in the data | **23** | all on the one billed account 4699664587-8 |
| Total meters in the full inventory | 183 | across 57 accounts; the other ~56 accounts have NO bills in hand, so their demand exposure is unsized |

So: **23 covered now (exposure only) / 3 recovery-priceable with the $24 buy / 23 total demand SAs on the
one account we hold.** The fleet beyond this account is a separate, double-gated wave (needs the
other-account bills first).

## 5. Conservative recoverable % and the projected ANNUAL $ range

### Step A - annualize the exposure (the measured base, not a saving)

This is a **WINTER** cycle (02/11 -> 03/12). PG&E AG summer (Jun-Sep) and legacy AG-4/5 summer
(May-Oct) both carry **higher** max-demand $/kW, and AG-C layers a Summer Peak-Demand charge
($29.92/kW, 5-8pm) that does **not** apply this cycle. So $6,058.73 is a winter **floor**, not 1/12 of
the year. Annual exposure band (measured, NOT recoverable):

| | Assumption | Annual exposure |
|---|-----------|----------------:|
| Low | 12 x flat winter (no summer uplift) | ~$72,700 |
| Likely | 8 winter-equivalent + 4 summer @ 1.5x | ~$84,800 |
| High | 8 winter-equivalent + 4 summer @ 2.0x | ~$96,900 |

(1.5x-2.0x summer uplift bracketed from the AG-1 published anchor of summer $23.00/kW vs winter
$17.28/kW = 1.33x energy, plus the AG-C summer peak-demand adder on top.)

### Step B - apply a CONSERVATIVE recoverable %

`brief-demand-charges.md` (literature-grounded) puts staggering/peak-shave at **15-30% of the demand
charge, ~20-25% as a working number**, with well-de-conflicted farms reaching 30-40%. We deliberately
sit **below** that working number, at a conservative **~12% center, ~8-20% band**, for three honest
reasons:

- **Almonds run flat-out off-peak in summer** (CLAUDE.md): little scheduling slack, so the staggering
  ceiling is low here. Recovery is mostly **DR capacity payments on curtailment Batth already does**,
  not new staggering.
- **The bill cannot yet say** how much of each big peak is single-pump (unrecoverable) vs coincident.
  Until the interval pull, a chunk of the 561.92 kW may be irreducible.
- **DR $/kW is program-dependent** (PDP/CBP/BIP terms are not in the bill); intervals give curtailable
  kW, the program contract gives the rate.

### Projected annual recovery (PROJECTED, pending actual interval pull)

| | Basis | Annual recoverable $ |
|---|------|---------------------:|
| **Low** | 8% of the 12x-winter floor (~$72.7k) | **~$5,800/yr** |
| **Likely** | 12% of the seasonal-likely exposure (~$84.8k) | **~$10,200/yr** |
| **High** | 20% of the seasonal-high exposure (~$96.9k) | **~$17,000/yr** |

**Conservative headline recoverable %: ~12% of annualized demand exposure (band 8-20%).**

These are RANGES with explicit assumptions and are clearly **projected, pending the actual 15-minute
interval pull**. None of this is banked. The engine returns $0 until the intervals land; the $24 Tier-1
buy is what converts "exposure" into a priceable recovery, and even then the DR portion needs the
program $/kW from the enrollment contract.

## 6. Verdict

**works-with-interval-buy.** Bills + meter list give us the full exposure ($6,058.73/cycle across 23
SAs, ranked, with effective $/kW) and surface every demand cycle as an informational rec for free. But
every recovery dollar is gated on the 15-minute interval series (and DR enrollment on the program
$/kW). The cheap, high-density move is the **$24 Tier-1 pull on P054 + P004 + VINES 75HP** (89.5% of
exposure), which unlocks DR sizing, the coincident-vs-single split, the avoidable-spike dollar, and the
~$556/cycle P031 multiplier dispute. Conservative projected recovery once that pull lands: **~$10k/yr
likely, ~$5.8k-$17k/yr range, pending the actual interval data.**
