# Category deep-dive: Demand charges (Batth Farms, account 4699664587-8)

*Prepared 2026-06-21. Scope: every demand-charge instance on the one bill account we have fully
extracted (`4699664587-8`, statement 2026-03-26, ~46 metered SAs, one billing cycle each:
**02/11/2026 -> 03/12/2026**). Pricing engine: `src/lib/energy` deterministic pure functions
(`demand.ts` for peak kW, `billing.ts` / reconciliation for the per-cycle rollups). **No AI is
involved in any dollar on this page** -- the only AI in the system is the bill-PDF vision
extraction in `src/lib/extract` that produced `billing.json` upstream; every number below is
plain arithmetic over that extracted JSON.*

---

## 0. What this category is and what we can and cannot defend

A PG&E demand charge bills the **peak rate of power draw (kW)** -- the single highest 15-minute
average in the billing month -- separately from energy (kWh). On Batth's ag schedules the demand
component is the Max-Demand charge ($/kW) and, on AG-C in summer, an additional Summer Peak-Demand
charge ($29.92/kW) assessed on the highest 15-min demand in the 5-8 p.m. window.

**The honest framing for this whole category (read before any dollar):**

1. **What we have is ONE winter cycle.** The extracted bill covers 02/11 -> 03/12/2026, which is
   PG&E *winter* (AG summer = Jun-Sep; legacy AG-4/AG-5 summer = May-Oct). Winter Max-Demand rates
   are the *lowest* of the year (e.g. AG-C secondary winter is in the low-$20s/kW vs summer, and the
   $29.92/kW AG-C Summer Peak-Demand charge does **not** apply in winter at all). The $6,058.73 of
   demand on this cycle is therefore a **winter floor**, not an annual figure. Summer demand on these
   same pumps -- when almonds and vines are irrigated flat-out -- is materially higher. We do **not**
   have the summer bills, so we do **not** annualize or extrapolate; we report the one cycle we can
   tie to the data.

2. **The demand charge itself is a real, already-paid cost -- it is NOT "savings."** The number that
   matters for this finding is the **recoverable** slice: the dollars a grower could *avoid* by
   (a) enrolling in a demand-response program (PDP / CBP / BIP) that pays for curtailment they may
   already do, or (b) a demand-reducing operational change (staggering / sequencing pump starts,
   soft-start/VFD on inrush, off-peak shifting). **Per the demand-charge brief, you cannot price the
   *avoidable* portion of any peak without 15-minute interval data** -- the bill's single kW number
   is identical whether the peak was one essential pump running alone (nothing to recover) or three
   pumps that overlapped for 15 minutes by habit (a real opportunity). Every avoidable-spike finding
   below is therefore marked **`needsData = interval`** and carries **no defensible dollar** yet.

3. **We do NOT lead with staggering.** Per the dashboard's honest lever priority and the
   project brief, coincident-peak staggering only helps an operation that has slack in its schedule,
   not peak-season almonds running flat-out off-peak. It is kept as a lever and enumerated, but
   demoted, and it is interval-gated.

**Bottom line on defensible dollars:** the only demand-charge dollars we can defend *today* from the
single extracted cycle are **$0 of recovery**, because recovery is contingent on interval data
(to size avoidable spikes / rate moves) or on a DR-program enrollment whose payment we cannot
quantify without the program's $/kW capacity rate and the farm's curtailable kW. The **measured
exposure** (the demand dollars actually billed this cycle, the thing a recovery program acts on) is
**$6,058.73**. `totalAnnualUsd` in the structured file is reported as **0** (defensible recovery),
and the exposure is carried in the evidence and in a dedicated exposure finding so it is not lost.

---

## 1. The exposure, ranked by demand $ (this cycle, structured per-cycle peak-demand charge)

This is the canonical `demandChargeUsd_structured` per meter, summed across the meter's cycle(s),
sorted descending. It ties **exactly** to the rollup field `totalDemandCharge_structuredUsd =
$6,058.73`. Computed by a deterministic sum over `billing.json` (no AI).

| Rank | Demand $ | Peak kW | Meter (SA) | Tariff | Pump / descriptor |
|---|---:|---:|---|---|---|
| 1 | **$2,783.22** | 278.88 | 4696826125 | AGC (Ag 35+ High Use) | P054 |
| 2 | **$1,409.21** | 171.52 | 4698660251 | AG5B (legacy) | P004 |
| 3 | **$1,112.97** | 111.52 | 4699664088 | AGC (Ag 35+ High Use) | VINES IRR 75HP |
| 4 | $184.16 | 13.70 | 4699664553 | AGA2 (<35 High Use) | BATH SHOP ELKHORN-18 |
| 5 | $127.81 | 9.51 | 4699664599 | AGA2 (<35 High Use) | (unlabeled) |
| 6 | $86.41 | 3.95 | 4699664194 | AGA2 | VINES IRR 15HP BR-T2 |
| 7 | $84.55 | 3.84 | 4699664794 | AGA2 | FARM SHOP SWANSON-T31 |
| 8 | $49.55 | 5.67 | 4699664429 | AGB (35+ Med Use) | FARM SHOP TURKEY-AL7 |
| 9 | $29.69 | 5.32 | 4699664416 | AGB (35+ Med Use) | P078 |
| 10 | $21.67 | 4.60 | 4699664335 | AGA1 (<35 Low Use) | P060 |
| 11 | $17.61 | 3.73 | 4699664294 | AGA1 (<35 Low Use) | FARM SHP 7HP GRANT-T43 |
| 12 | $13.12 | 1.02 | 4694038660 | AG5B (legacy) | P067 |
| 13 | $8.56 | 1.82 | 4699664016 | AGA1 (<35 Low Use) | FARM SHOP YELLOW S-T29 |
| 14 | $3.37 | 0.08 | 4699664743 | AGC | P038 |
| 15 | $3.01 | 0.16 | 4697755484 | AG5C (legacy) | P027 |
| 16 | $3.01 | 0.16 | 4695237170 | AG5C (legacy) | P062 |
| 17 | $2.50 | 0.16 | 4699664441 | AGC | P041 |
| 18 | $0.61 | 0.02 | 4699664820 | AGC | PUMP # 55 |
| 19 | $0.56 | 0.04 | 4696771732 | AGA2 | P066 |
| 20 | $0.38 | 0.02 | 4695719808 | AG5C (legacy) | P052 |
| 21 | $0.31 | 0.01 | 4691715828 | AGC | PUMP 73 |
| 22 | $0.17 | 0.02 | 4699664991 | AGA1 (<35 Low Use) | FARM SHOP 400AC-AL11 |
| 23 | $0.17 | 0.01 | 4698074516 | AGB (35+ Med Use) | P058 |
| | **$6,058.73** | | **23 meters** | | **(ties to rollup)** |

**The shape of the exposure (the load-bearing fact):** the top three meters -- **P054, P004, and
VINES 75HP** -- carry **$5,305.40 of the $6,058.73 = 87.6%** of all demand on the account. The other
20 metered SAs together carry $753.33, and **10 of the 23 carry under $5** (idle / standby pumps that
barely register a demand peak). Any demand-recovery effort is, in practice, a three-meter problem.

Arithmetic check on the three big meters (structured per-cycle charge / structured peak kW):

- P054: $2,783.22 / 278.88 kW = **$9.98/kW** effective on this winter cycle.
- P004: $1,409.21 / 171.52 kW = **$8.22/kW** (legacy AG5B, billed on the 03/01-03/12 sub-period
  at $20.54/kW; the cycle also shows a 02/11-02/28 sub-period at 170.88 kW @ $21.43/kW = $2,197.18 in
  the free-text lines, hence the larger `demandChargeTextUsd` of $3,606.39 -- see note in section 3).
- VINES 75HP: $1,112.97 / 111.52 kW = **$9.98/kW** (AG-C, 03/01-03/12 sub-period @ $24.95/kW;
  the 02/11-02/28 sub-period billed 109.6 kW @ $26.03 = $1,711.73 in the free-text lines).

---

## 2. Per-meter enumeration of the recovery lever (every instance, with arithmetic)

For each material meter the recovery question is the same: **how much of this billed demand is
*avoidable* (recoverable via a DR enrollment or a demand-reducing change), and how much is an
essential single-pump peak you cannot move?** The brief is explicit that this split is **invisible on
the bill** and requires 15-minute interval data. So each finding states the measured exposure, the
exact PG&E rate inputs, and the data still required. Recovery dollars are withheld (interval-gated).

### 2.1 P054 -- SA 4696826125 -- AGC -- $2,783.22 demand this cycle (the headline)
- **Measured:** peak 278.88 kW; structured demand $2,783.22 (winter). Free-text line shows the
  02/11-02/28 sub-period max demand **244.32 kW @ $26.03/kW = $3,815.79** (the `demandChargeTextUsd`).
  This meter also has the account's largest energy (31,828 kWh, $11,727 total cycle) -- it is a real,
  hard-running pump, not a standby.
- **Recovery formula (DR enrollment):** `recovery = curtailable_kW x program_capacity_$_per_kW`
  -- e.g. PG&E BIP pays a monthly capacity incentive per kW of committed curtailment; CBP/PDP credit
  the avoided peak-period demand. **None of `curtailable_kW` or the program $/kW is in the bill**, so
  no dollar is bookable.
- **Recovery formula (avoidable spike):** `recovery = (billed_peak_kW - achievable_peak_kW) x
  demand_$_per_kW`. `achievable_peak_kW` is only knowable from the 15-min interval series (is the
  278.88 kW one pump running alone, or coincident overlap?). **`needsData = interval`.**
- A 278.88 kW peak is well above the 35 kW AG-C threshold; this meter legitimately belongs on a
  demand-charged schedule. The lever here is **DR enrollment + interval-proven peak shaving**, not a
  rate demotion.

### 2.2 P004 -- SA 4698660251 -- AG5B (legacy) -- $1,409.21 demand this cycle
- **Measured:** peak 171.52 kW; structured $1,409.21. Free text: 02/11-02/28 **170.88 kW @ $21.43**
  = $2,197.18 plus 03/01-03/12 **171.52 kW @ $20.54** = $1,409.21 (two sub-periods inside one cycle;
  `demandChargeTextUsd` = $3,606.39). This is a NEM2 solar-paired almond well on legacy AG5B.
- **Note:** AG5B is a *legacy* schedule scheduled to expire 2027; on force-transition to Schedule AG
  this meter's demand exposure structure changes (AG-C Summer Peak-Demand would newly apply). That is
  a rate-migration finding, tracked separately under rate optimization, not double-counted here.
- **Recovery:** same two formulas as P054; both interval-gated. `needsData = interval`.

### 2.3 VINES IRR 75HP -- SA 4699664088 -- AGC -- $1,112.97 demand this cycle
- **Measured:** peak 111.52 kW; structured $1,112.97 (03/01-03/12 @ $24.95/kW). Free text also has
  02/11-02/28 **109.6 kW @ $26.03 = $1,711.73**, plus two earlier true-up-cycle sub-periods (4.48 kW
  @ $25.62 = $74.05; 3.36 kW @ $26.03 = $31.03). This is the same SA carrying the **$62,795.65 NEM
  zero-credit true-up anomaly** -- that anomaly is a NEM/solar finding, **not** counted here; this
  line is only its demand component.
- **Recovery:** interval-gated. `needsData = interval`.

### 2.4 The tail (meters 4-23) -- $753.33 combined
- ELKHORN-18 ($184.16, 13.70 kW) and SA 4699664599 ($127.81, 9.51 kW) are AGA2 shop meters; the rest
  are sub-$90 and mostly sub-$5 standby pumps. Per-meter recovery here is immaterial and the
  arithmetic ($/kW x kW) is dominated by fixed AGA2 Max-Demand at $11.79-$21.43/kW on tiny kW.
- **One billing anomaly worth a flag (not a demand-recovery dollar):** three meters on **AG-B carry a
  demand line** -- TURKEY-AL7 ($49.55), P078 ($29.69), P058 ($0.17) -- yet per the PG&E AG-rate brief
  **AG-B has NO demand charge** (it is the energy-only 35+ schedule). This is either an extraction
  artifact or a genuine mis-billing. It is small (~$79 combined) and is logged for review, not totaled.

---

## 3. Why two demand totals exist in the data (do not double-count)

`billing.json` exposes two demand figures and they are **not** comparable:

- **`demandChargeUsd_structured`** -- the canonical *single* per-cycle peak-demand charge (one number
  per cycle). Summed across all meters = **$6,058.73**. **This is the figure used in this analysis.**
- **`demandChargeTextUsd`** -- a re-sum of every free-text "Demand Charge" line, which can appear
  more than once per cycle because a 30-day cycle spans two PG&E rate sub-periods (e.g. P004 shows
  both a 02/11-02/28 line and a 03/01-03/12 line). Summing those double-counts within a cycle.

Using the text total would overstate the category. We use the structured total throughout.

---

## 4. Recoverable paths (qualitative; all interval- or program-gated)

1. **Demand-response enrollment (PDP / CBP / BIP).** Growers like Batth already curtail in the
   4-9 p.m. window; these programs *pay* for that. Recovery = `curtailable_kW x program_$/kW`. Needs
   the program's capacity rate and the farm's curtailable kW (from interval data). **`needsData =
   interval`** (and program terms).
2. **Eligible rate move.** Where a meter's demand structure is wrong for its load (e.g. a legacy
   AG5B/AG5C facing force-transition, or a sub-35 kW meter stranded on a demand schedule), moving
   schedule changes the demand exposure. That analysis lives in the **rate-optimization** category to
   avoid double-counting; flagged here only where the demand component is the driver. The AG5B/AG5C
   2027 expiry on P004/P027/P052/P062 is the cross-reference.
3. **Avoidable-spike reduction (staggering / soft-start / off-peak shift).** Demoted per project
   priority. Recovery = `(billed_peak_kW - achievable_peak_kW) x demand_$/kW`, and `achievable_peak_kW`
   is unknowable from the bill. **`needsData = interval`.**

---

## 5. Defensible total

- **Measured demand exposure this cycle (winter floor):** **$6,058.73** across 23 meters, 87.6%
  concentrated in P054 + P004 + VINES 75HP. (Annual exposure is higher -- summer rates and the AG-C
  Summer Peak-Demand charge are not in this single winter cycle -- but we do not extrapolate without
  the summer bills.)
- **Defensible *recoverable* dollars today:** **$0**. Every recovery path is gated on 15-minute
  interval data (to size avoidable peak / curtailable kW) or on DR-program terms we do not have.
  `totalAnnualUsd = 0`.

This is the honest position: we can name the exposure precisely from the bill, but the bill alone
cannot price a single recoverable dollar of it. That gap is exactly the interval-data wedge.
