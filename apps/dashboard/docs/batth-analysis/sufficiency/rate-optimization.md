# Data sufficiency + savings projection — Rate optimization (the #1 lever)

**Engine:** `src/lib/energy/rate-compare.ts` (`rateOptimization`) + `src/lib/energy/rates.ts`
(`annualCostUnderRate`, `cycleCostUnderPlan`, `priceCycleCents`), pricing against
`fixtures/pge-ag-rate-card.json`. The cycle-level (bill-only) sibling is
`src/lib/energy/rate-lever.ts` (`rateLever`), which carries the `no_usage_basis` guard
(`rate-lever.ts:508`) that is the reason this lever is dead without intervals.

**Determinism:** every dollar below is plain arithmetic in `src/lib/energy` — customer-charge
deltas, TOU energy at posted `$/kWh`, demand at posted `$/kW`. **No AI.** The only AI in the
product is bill-PDF vision in `src/lib/extract`, which emits data rows, never a savings figure.

> Verdict: **works-with-interval-buy.** On the bills alone the engine refuses to quote (by
> design). With a 15-minute interval pull on the active meters it banks a real, narrow range.

---

## 1. What the engine requires (read from the code)

`rateOptimization(input)` (`rate-compare.ts:160`) needs, per meter:

| Input | Type | Source |
|---|---|---|
| `currentSchedule` | string (`"AG-C"`, `"AG-A2"`, …) | the bill / meter list — **we have it** |
| `actualAnnualBillUsd` | number | sum of the meter's printed bill totals — **we have it** |
| `card` | `RateCard` | committed fixture `pge-ag-rate-card.json` — **we have it** |
| `profile: MeterUsageProfile` | `{ cycles: CycleUsage[]; observedPeakKw }` | **the gap** — see below |

`MeterUsageProfile.cycles` is built by `bucketUsage(intervals, bills, tz, card)`
(`rate-compare.ts:92`). Each `CycleUsage` (`rates.ts:85`) carries:

- `energyKwh: { peak, partial_peak, off_peak }` — **split by TOU period**, produced by
  `bucketCycle` walking 15-minute `IntervalReading[]` through `isInPeakWindow`. **A bill
  summary cannot produce this split.** The bill carries one cycle kWh total (and on these idle
  cycles, `0`), never the 5–8pm-vs-rest allocation the energy term prices.
- `maxDemandKw` and `peakWindowDemandKw` — the highest 15-min kW overall and inside the peak
  window. `peakWindowDemandKw` is **interval-only**; the bill prints one cycle peak, never the
  in-window peak that the AG-C summer demand charge needs.
- `observedPeakKw` — drives `sizeClassFor` (the 35 kW small/large split, `rates.ts:117`) and
  the trailing-12-month eligibility ratchet.

Then `rateOptimization` models the current rate, computes `reproductionError` against
`actualAnnualBillUsd`, and **only emits a "switch and save" recommendation when it reproduces
the real bill within ±10% AND clears a $200 / 3%-of-bill floor**. That bill-reproduction gate
is the honesty mechanism — and it is exactly what a `0`-kWh idle cycle cannot pass.

---

## 2. What the bills + meter list give us for free

From `normalized/billing.json` (account **4699664587-8**, statement 2026-03-26) and the
183-row `inventory.json`, with **zero** new spend:

- **`currentSchedule` and `actualAnnualBillUsd` for all 46 billed SAs.** 42 are AG tariffs
  (the rate-opt scope); 4 are `B1` business meters the engine returns `null` for (non-ag,
  `rate-compare.ts:171`).
- **The full legibility layer**: which meter is on AG-C/HAGC vs AG-A1/A2/B vs legacy AG-4/AG-5,
  the per-day customer charge each prints, the idle-vs-active flag, and the bill-reproduction
  proof that the card is right (an idle AG-C meter prints exactly `$1.43343/day × 30 = $43.00`;
  AG-5C prints `$5.30871/day × 30 = $159.26`). This proves the engine can reproduce the bill —
  the load-bearing trust line — **on the standing charges**.
- **What it does NOT give**: any kWh-by-TOU split, any in-window demand kW, or the
  trailing-12-month peak history. So the energy and demand terms are modeled as `0`, the size
  ratchet is unobservable, and `rate-lever.ts:508` returns `no_usage_basis` rather than emit a
  sign-ambiguous AG-C→AG-B "saving." **This is the engine correctly refusing, not a bug.**

**Active vs idle (this account):** 18 of 46 SAs are active (`idleZeroKwh=false`); 28 idle.
Of the 18 active, **15 are AG meters** (3 AG-C, 5 AG-A2, 3 AG-B, 4 AG-A1) and 3 are B1
(out of scope). That 15–18 active band is the "~18–25 active billed meters" referenced;
the precise figure on the one account in hand is **18 active / 15 active-AG**.

---

## 3. What buying interval adds

A per-SA 15-minute pull (UtilityAPI / Share My Data, **$12/meter, first meter free**) supplies
the `IntervalReading[]` that `bucketUsage` needs, which:

1. Fills `energyKwh.{peak,off_peak}` so the engine can see whether **AG-A1's higher winter
   energy** (`peak 0.33989`, `off 0.31060`) eats the **AG-C/AG-A2 customer-charge or
   demand saving** — the sign question that kills every blanket swap today.
2. Supplies `observedPeakKw` across the trailing year so the **35 kW ratchet** becomes
   observable — the difference between a safe AG-C→AG-A1 demote and one PG&E reverses because
   the pump crossed 35 kW for one summer month.
3. Supplies `peakWindowDemandKw` so AG-C summer cycles can be priced at all (the cycle-level
   path skips them today, `rate-lever.ts:530`).

Net effect: the engine moves from "refuses to quote" to "quotes a bill-reproduced, ratchet-
checked number" on the active meters, and — just as valuable — **suppresses money-losing swaps**
(a naive AG-A2→AG-A1 flip on a steady-energy meter loses ~$139/cycle; see §4).

**Targeted buy for this lever:** the 15 active-AG meters dominate. The highest-value rate-opt
pulls are the 10 on-account AG-C/HAGC demotion candidates + the 4 AG-A2 crossover meters
(Finding A + B). Cost = 14 meters = **$168** standalone, or **$72** for the cheap high-certainty
core (7 meters: the 2 safe AG-C + the AG-A2 winner + loss-check + the 3 demand meters that take
the free pull). Budget available = $465, so the full rate-opt-relevant pull is affordable.

---

## 4. Per-meter savings model (THIS farm, derived not assumed)

All deltas use the exact posted card values. AG-C `$1.43343/day`, AG-A1/A2 `$0.68895/day`,
AG-B `$0.91565/day`, AG-A1 winter energy `peak 0.33989 / off 0.31060`, AG-A2 winter energy
`peak 0.24571 / off 0.21642`.

**Finding A — stranded idle AG-C/HAGC → AG-A1 (customer-charge shed).**
`(1.43343 − 0.68895) × 365 = $271.74/yr per demotable meter`, plus removal of the AG-C demand
column. Of the 10 on-account AG-C/HAGC meters near the floor, only **PUMP #55 (250 GPM) and
P072 (300 GPM)** are plausibly always <35 kW → safe-on-confirmation floor **2 × $271.74 =
$543.48/yr**. The other 8 are large pumps (P077 1400 GPM, P075 1000, P041/P038 1300) likely
>35 kW in summer → the ratchet probably bars AG-A1; interval data tells us which survive,
toward a **$2,717.40/yr** on-account ceiling.

**Finding B — low-load-factor AG-A2 → AG-A1 (drop the max-demand charge).** Same `$0.68895`
customer charge, so this is a pure demand-vs-energy trade. Clear winner **4699664794**: `$84.55`
demand on only `92.4 kWh`; AG-A1 extra energy `92.4 × (0.31060 − 0.21642) = $8.70`, so it saves
`$84.55 − $8.70 = $75.85` this winter cycle → **~$300/yr** (conservatively sized, not annualized
off one snapshot). Counter-check **4699664194** (2,392 kWh): AG-A1 extra energy `$225.25` >
`$86.41` demand saved → **net LOSS ~$139/cycle**. So a blanket AG-A2→AG-A1 swap loses money;
intervals confirm the one winner and **prevent ~$1,668/yr of wrong-swap loss** across the 4.

**Finding C — AG-B → AG-A1.** Customer-charge delta `(0.91565 − 0.68895) × 365 = $82.75/yr`,
but AG-A1's winter energy is *higher* than AG-B (`peak 0.33989 vs 0.33597`, `off 0.31060 vs
0.30671`), so on the metered AG-B meters the extra energy offsets part/all of $82.75. Net sign
needs full-year kWh → **$0 defensible today**, confirm with interval.

**Legacy AG-4/AG-5 solar pumps — HOLD to 2027.** `$0` by design: the legacy noon–6pm TOU window
overlapping midday solar is worth more than the fixed-charge delta until the solar-legacy lapse
(≤2027-07-31). Not part of this projection.

**P054 / P004 / VINES 75HP are NOT rate-opt meters.** P054 (AG-C, 31,828 kWh, 278.88 kW) is a
hard-running pump — its lever is DR/peak-shave, not a demote. P004 (171 kW) and VINES 75HP/P031
(111 kW) read `idleZeroKwh=true` only because NEM nets energy to 0; they run hard. Their demand
exposure ($6,058.73/cycle measured) belongs to the demand lever, not here.

---

## 5. Wexus "~40% on one pump" anchor, derived from THIS farm

The Wexus benchmark is the order-of-magnitude a single mis-rated pump can move. Derived from
Batth, not borrowed: an idle stranded AG-C meter carries `$1.43343/day = $523.20/yr` of standing
charge; AG-A1 is `$0.68895/day = $251.47/yr`. The rate fix cuts **~52% of that meter's standing
bill** — the same magnitude as the Wexus one-pump figure, on Batth's own numbers, with zero
operational change. The benchmark is *consistent with* this farm; we do not import its dollars.

---

## 6. Coverage

| | Meters | What |
|---|---:|---|
| **Now (bills only)** | **0** | Engine emits **no** rate-opt recommendation — `no_usage_basis` / bill-reproduction gate fails on `0`-kWh cycles. Legibility only. |
| **With interval buy** | **15** | The 15 active-AG meters on account 4699664587-8 become priceable (3 AG-C + 5 AG-A2 + 3 AG-B + 4 AG-A1). Of these, ~3–6 plausibly yield a *positive* finding once the ratchet is checked; the rest are confirmed-no-switch (real value: prevents losing swaps). |
| **Total addressable** | **42** | All 42 AG SAs on this one account. Across the full 183-meter / 57-account inventory the AG-C/HAGC fleet is ~96 meters, but the other ~87 are **double-gated** (need other-account bills first, then intervals) and are not counted as interval-only coverage. |

**How many active meters yield a finding once interval lands:** of the 15 active-AG meters,
expect **3 to 6** to produce a *positive* switch recommendation (the 2 safe AG-C demotes that
survive the ratchet, the 1 AG-A2 winner, and 0–3 mid-size AG-C / favorable AG-B that the
interval ratchet may spare). The remaining active-AG meters are confirmed no-switch — the
finding there is "stay put," which is itself worth the pull because it blocks a money-losing
flip.

---

## 7. Projected ANNUAL $ range — rate optimization, this account (pending actual interval pull)

| Band | $/yr | Composition |
|---|---:|---|
| **Low** | **$843** | Only the 2 plausibly-<35 kW AG-C demotes ($543.48) + the 1 AG-A2 winner ($300) survive. = the bill-only defensible total. |
| **Likely** | **$1,300** | The 2 safe AG-C + 1–2 mid-size AG-C that the ratchet spares + the AG-A2 winner, plus a favorable-sign AG-B meter; the interval also *prevents* ~$1,668/yr of wrong-swap loss (asymmetric value not added into this banked line). |
| **High** | **$3,400** | All 10 on-account AG-C/HAGC survive the ratchet ($2,717.40) + AG-A2 winner ($300) + AG-B sign confirmed favorably (~$400). |

**All three are "projected, pending actual interval pull."** They are the rate-opt lever on the
**one** account whose bills we hold. They deliberately **exclude**: the ~87 off-account AG-C
fleet (a ~$23,600/yr ceiling, but double-gated on other-account bills and an assumed idle
ratio); the legacy AG-4/AG-5 HOLD-to-2027 pumps; demand-charge recovery; and the P031 $0–$57k
allocation question. Those are real but belong to other levers/gates.

### Assumptions (explicit)
1. Card values in `pge-ag-rate-card.json` are accurate; winter customer charge / demand /
   energy are **bill-sourced**, summer energy + AG-C peak-period demand are **representative
   placeholders** pending the summer tariff sheet. Summer pricing could shift the AG-C and
   AG-A2 numbers; the customer-charge deltas (the bulk of the Low band) are bill-exact and
   robust to that.
2. "Safe small" = a pump whose trailing-12-month peak stays <35 kW every month. We **assume**
   PUMP #55 and P072 hold (250/300 GPM); interval data confirms or revokes per meter.
3. AG-A2 winner sized to ~$300/yr rather than annualizing one winter cycle's $75.85 ×
   12 ≈ $910, to avoid over-claiming off a snapshot. A full-year low-load-factor confirmation
   could lift it.
4. Reversible, zero-operational-change rate elections only; no DR, no curtailment, no pump
   work in any figure here.
5. Loss-prevention (~$1,668/yr of avoided wrong-swap on the AG-A2 meters) is **not** added to
   the banked range — it is value the lever delivers but not a positive saving.
</content>
</invoke>
