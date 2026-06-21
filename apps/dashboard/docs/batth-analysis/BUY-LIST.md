# Batth Farms — UtilityAPI Buy List (the concrete spend plan)

**One line:** Buy 15-minute interval data on **five meters for $60**, hold **$40 in reserve**, and
do not spend the rest of the budget. The farm map and the per-meter monthly dollars are already
**free** (the 183-meter Excel + the one reconciled bill PDF). Spend money on UtilityAPI **only where
an hour-by-hour kWh curve is the single thing that converts a claim into proof or unlocks rate
optimization** — the #1 lever. Everything else (dead-meter demotions, bill-audit disputes, the P031
NEM anomaly) needs **zero** interval data and is not on this list.

> Pricing: a **per-meter historical/interval pull = $12, first collection free** on the account.
> This is the *one-time historical* product, not the bulk/ongoing sync (the ~$2,568 quote that
> scared us was the wrong product). Authorization is already live and durable — UtilityAPI
> authorization **UID 587577** (form 585637), PG&E, expires in 3 years — so these pulls run off an
> auth we already hold; no new 2FA per meter.

---

## What we are NOT paying for (already free)

| Asset | Source | Cost |
|---|--:|--|
| The whole-farm map — 178 of 183 meters with lat/long | 183-meter Excel inventory (`parseInventory`) | $0 |
| Per-meter **monthly dollars** on the billed account | the one PG&E bill PDF, reconciled to $86,942.12 across 46 SAs / 39 periods | $0 |
| The P031 / VINES NEM anomaly write-up ($0–$57k, contingent) | already proven from the bill (sibling P038); recovery is gated on the **Generation Allocation Summary**, a *document*, not interval data | $0 |
| Dead-meter AG-C → AG-A1 demotions, bill-audit disputes (~$5k/yr bankable) | the bill summaries; no interval needed | $0 |

Interval data buys exactly one thing the free path cannot give: **a trustworthy energy term.** Bill
summaries carry dollars and demand kW but **no kWh by time-of-use**, so the rate engine models the
energy side as zero. With energy = 0 the engine's AG-C→AG-B "switches" are **sign-ambiguous
artifacts** (AG-B energy is *higher* than AG-C, so the sign is unknowable) and are correctly
suppressed by the `no_usage_basis` guard. The savings dollars come from **deterministic pure
functions in `src/lib/energy`** (`rateLever` / `rateOptimization` over `fixtures/pge-ag-rate-card.json`);
the only AI anywhere is bill-PDF **vision extraction** in `src/lib/extract`, which reads numbers and
never computes a dollar. Interval data is what lets those deterministic functions price energy and
prove the **35 kW eligibility ratchet** per meter.

---

## The buy: 5 meters, $60

All five are on the one account we hold bills for (**4699664587-8**), so each pull pairs directly with
a printed cycle we can back-test against. The serviceId is the durable PG&E SA ID UtilityAPI keys on.

| # | serviceId | Label (descriptor / pump) | Rate | What the interval pull *proves* | Cost |
|---|---|---|---|---|--:|
| 0 | **4696826125** | **P054 — VINES IRR 100HP S-T31** (1,800 GPM; 278.88 kW peak; $2,783.22 demand; 31,828 kWh/mo) | HAGC | **FREE pull.** The highest-dollar, hardest-running meter on the farm — the rate-optimization model on the #1-spend meter, and whether its 278.88 kW peak is one pump alone (nothing to recover) or coincident overlap (DR/peak-shave recovery). The single most valuable curve we can get. | **$0** |
| 1 | **4698660251** | **P004** (2,250 GPM; 171.52 kW peak; net **exporter** −16,060 kWh) | AG5B (legacy, NEM2AA) | Verifies its **export is actually credited** (NEM credit check — it's a net exporter that pays $0, the control case), and feeds the rate model. Confirms the legacy AG-5B hold-to-2027 decision with real load shape. | $12 |
| 2 | **4699664088** | **P031 / VINES IRR 75HP NEW (PUMP #31)** — the **$62,795.65** true-up meter | AGC (billed) | The load shape behind the headline anomaly. **Pairs with** the Generation Allocation Summary to make the zero-credit gap undeniable. (Interval does **not** by itself decide recovery — the *document* does; this makes the story airtight, not the number bigger.) | $12 |
| 3 | **4699664553** | **CHARANJIT BATH SHOP ELKHORN-18** (1,923.7 kWh; **173.2 kWh on-peak**; 13.7 kW; $184.16 demand) | HAGA2 | A **different category**: real on-peak load on a *shop* (not a flat-out pump) → genuine TOU-shift candidate. Also the AG-A2→AG-A1 **break-even** meter, so one pull resolves both the shift and the rate election. | $12 |
| 4 | **4699664820** | **PUMP #55 / P055** (250 GPM; tiny/flat load) | HAGC | Confirms the **AG-C → AG-A1 demotion is safe** — proves it stays **<35 kW all year** (the eligibility ratchet the bill cannot show). One of the two pumps in the $543.48 bankable floor; interval data turns "on confirmation" into confirmed. | $12 |

**Billed meters: 4 × $12 = $48. With P054's first-collection-free credit applied → net $48 ($60 list, one pull free).**

> Why these five and not the next five: each one converts a *specific* pending claim into proof.
> P054 = the #1-lever model on the #1-dollar meter. P004 = the NEM-credit control + legacy-hold proof.
> P031 = the headline anomaly's evidentiary backbone. ELKHORN-18 = a non-pump TOU-shift class +
> a break-even rate election. PUMP #55 = the eligibility-ratchet proof under the bankable floor.
> Together they unlock the rate-optimization lever across the account: **42 of 46 billed meters
> become legitimate rate-opt candidates once interval TOU usage lands** (the other 4 are business
> B1, correctly no-op).

---

## Spend summary

| Item | Amount |
|---|--:|
| Budget treated as the demo cap | **$100** |
| Buy — 5 meters (1 free + 4 × $12) | **$48 net** ($60 list) |
| **Reserve (hold)** | **$40–$52** |

**Recommended posture: spend ~$48–$60, hold ~$40.**

### Why we do NOT spend the whole budget

1. **The bottleneck is *which* meters deserve interval data, not money.** Even the full $465 (≈ all
   46 billed meters) would not change the recommendation — past these five, the marginal pull tells
   us nothing the bill + inventory don't already show. Spending more would be buying curves we have
   no claim to attach them to.
2. **UtilityAPI bills per *successfully collected* meter, and pulls can return partial.** The reserve
   funds **2–3 adjacent re-pulls** if a curve comes back incomplete, or a sixth meter if one of these
   five surfaces something worth chasing — without going back for budget approval.
3. **The biggest dollars on the table need *documents*, not intervals.** The P031 recovery
   ($0–$57k, **contingent** on the Generation Allocation Summary / Form 79-1202 — never present it as
   banked) and the ~$5k/yr bankable demotions + bill-audit disputes are unlocked by paperwork and
   the bill summaries, at **$0**. Buying more interval data does not move those.
4. **Restraint *is* the pitch.** Showing Batth we spent $48 of his $100 to turn his #1 lever from
   "pending" into PG&E-grade proof — and held the rest in reserve — is exactly the "we see what you
   don't, and we don't waste your money" posture the demo is built on.

---

## Order of operations (when the DB is up and the auth is exercised)

1. Pull **P054 (4696826125)** first — it's free and the highest-value curve.
2. Pull the four billed meters (4698660251, 4699664088, 4699664553, 4699664820).
3. Re-run the pure engines (`scripts/analyze-batth-real.ts` → `rateLever`/`rateOptimization`,
   `demand.ts`) over the now-interval-bearing fixture; the rate-opt findings move from artifact to
   defensible where the meter qualifies.
4. Keep $40 in reserve for partial-pull re-collection.

**Ground-truth guardrails for whoever reads the output:** solar is **1,932 kW total (840 + 1,092)**,
not 12,180 kW. The arrays are likely **oversubscribed**, so P031 recovery may be zero-sum — present
it as "we'll find out from one document," never "we've recovered it." Do **not** show the 3
AG-C→AG-B "switch" findings the harness emits without intervals; they model energy as zero and are
sign-ambiguous artifacts.
