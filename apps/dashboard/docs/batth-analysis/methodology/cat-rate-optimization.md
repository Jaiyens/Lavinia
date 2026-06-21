# Category Deep-Dive: Rate Optimization (Lever 1, the headline)

**Scope.** Every instance, across the 46 metered service agreements on bill account
`4699664587-8`, where a meter sits on a costlier rate schedule than an ELIGIBLE alternative
given its real demand and usage. This is the #1 energy lever (`apps/dashboard/CLAUDE.md`:
"183 meters on mixed legacy/current rates almost guarantees some are wrong... zero
operational change").

**The one honesty rule that governs this whole category.**
Rate optimization is priced by **deterministic arithmetic** in `src/lib/energy/rate-lever.ts`
(`rateLever()`) and `src/lib/energy/rate-compare.ts` (`rateOptimization()`), against the
published rate card `fixtures/pge-ag-rate-card.json`. **No AI is involved in any dollar here.**
But the single bill we hold is **one ~30-day winter cycle (2026-02-11 -> 2026-03-12)** that
carries **no kWh interval series**. That breaks the engine's two pricing inputs:

1. **Energy is modeled as 0.** With no interval kWh, `bucketUsage` buckets nothing
   (`rate-compare.ts:57-89`), and on an idle bill the printed TOU energy is literally `0`.
   So the only thing left to price is the **customer charge** ($/day) and, on the few
   cycles that printed one, a tiny winter **max-demand** charge.
2. **The 35 kW eligibility ratchet is unobservable.** AG-A1/AG-A2 eligibility is a
   **trailing-12-month** test: a meter is eligible only if its max 15-minute demand stayed
   **below 35 kW in every one of the last 12 months** (`brief-pge-ag-rates.md` §4, §5). One
   winter cycle cannot prove that. A 1,000-1,400 GPM irrigation pump idle in February is
   almost certainly **>35 kW in July**, so it is **NOT demotable** even though its winter
   bill is a bare customer charge.

**Consequence (the load-bearing caveat).** The engine itself encodes this. For a CURRENT
(non-legacy) schedule with `totalKwhTested <= 0` it returns `none / no_usage_basis` and
**refuses to quote a switch** (`rate-lever.ts:508-510`):

> *"an idle winter meter's customer-charge delta is not a defensible reason to switch
> between current usage-tiered schedules (summer flips it)."*

And the AG-C -> AG-B comparison the engine would emit without intervals is **sign-ambiguous**:
AG-B trades AG-C's cheap energy ($0.159-$0.184/kWh winter) for higher energy
($0.307-$0.336/kWh) in exchange for a lower customer charge and no peak-period demand. With
energy forced to 0, that comparison reduces to "whoever has the smaller customer charge
wins" — a pure artifact of the missing kWh, not a real saving. **We therefore quantify the
OPPORTUNITY and report a small DEFENSIBLE floor; we do not assert bill-only AG-C savings.**

Every finding below is marked `needsData=interval`. The real money in this lever is unlocked
**only** by a trailing-12-month 15-minute interval pull per meter.

---

## The engine that prices this (deterministic, not AI)

| Concern | Function | `file:line` | AI? |
|---|---|---|---|
| Map a printed schedule label ("AG5B Large...") to a card plan + real size tier | `mapScheduleLabel` | `rate-lever.ts:143` | No |
| Reduce a billing period to a priceable cycle | `cycleFromPeriod` | `rate-lever.ts:242` | No |
| Back-test: recompute the meter's CURRENT charges from the card, compare to print | `backTestMeter` | `rate-lever.ts:340` | No |
| Price the same cycles on every eligible candidate | `costUnderPlanCents` -> `priceCycleCents` | `rate-lever.ts:374`, `rates.ts:~217` | No |
| The lever decision (band gate, usage-basis gate, 35 kW ratchet, savings floor) | `rateLever` | `rate-lever.ts:443` | No |
| Interval-path variant (when intervals exist) | `rateOptimization` | `rate-compare.ts:160` | No |

Header contracts assert purity: `rate-lever.ts:10` and `rate-compare.ts:11`
("Pure: no UI, no DB, no clock, no fs"). The **only** AI in the product is bill-PDF vision
extraction in `src/lib/extract/*`, which produces the data rows below and **never computes a
savings dollar** (`methodology/00-how-savings-are-computed.md` §0).

**Rate inputs used (from `fixtures/pge-ag-rate-card.json`, eff. 2026-03-01; customer
charges/day are bill-sourced):**

| Schedule | Customer charge $/day | x 365 = $/yr | Demand charge | Notes |
|---|---|---|---|---|
| AG-A1 | 0.68895 | **251.47** | **none** | cheapest fixed, no demand, highest energy |
| AG-A2 | 0.68895 | **251.47** | max-demand only ($11.79-$21.43/kW) | same fixed as A1 |
| AG-B  | 0.91565 | 334.21 | none (energy-only) | 35+ class |
| AG-C  | 1.43343 | **523.20** | $21.43/kW max + $29.92/kW summer-peak | 35+ class, cheapest energy |
| AG-5B (legacy) | 1.19446 | 435.98 | $27.89/$20.54 max + $10.45/kW peak | closed; expires <= 2027 |
| AG-5C (legacy) | 5.30871 | **1,937.68** | $14.90/kW max + $14.57/kW peak | closed; highest fixed of all |
| AG-4C (legacy) | 2.15003 | 784.76 | $16.22/kW max + $7.08/kW peak | closed |

---

## Enumeration of every instance

### Finding R1 — 10 idle/near-zero AG-C (HAGC) pumps stranded on the 35+ high-use schedule

**The instance.** 10 meters print on AG-C (the bill spells it "AGC Ag35+ kW High Use"; the
inventory shows 8 of them are actually **HAGC** = AG-C at transmission voltage, same
$1.43343/day customer charge) with **near-zero load this cycle**:

- **7 print exactly $43.00** = pure customer charge, zero kWh, zero demand:
  P075 (`4692166716`), PUMP # 8 (`4692424863`), `4697631144`, `4699142630`,
  P072 (`4699664198`), P077 (`4699664728`), and PUMP 73 (`4691715828`, $44.21 = $43.00 +
  $1.21 on 5.48 kWh).
  - Arithmetic: AG-C $1.43343/day x 30 days = **$43.00**. Reproduces the print exactly.
- **3 within ~$3 of that floor:** P041 (`4699664441`, $45.50, peak 0.16 kW),
  P038 (`4699664743`, $136.04 incl. a NEM true-up cycle, winter peak 0.0148 kW),
  `4699664820` (PUMP # 55, $45.89, peak 0.024 kW on 14 kWh).

**Per-meter arithmetic (customer-charge differential, the only bill-defensible piece):**
- AG-C $1.43343/day -> AG-A1 $0.68895/day = **$0.74448/day x 365 = $271.74/yr/meter.**
- 10 meters x $271.74 = **$2,717.40/yr** gross customer-charge opportunity.
- AG-A1 also carries **no demand charge** (vs AG-C's $21.43/kW max + $29.92/kW summer-peak),
  so a confirmed demotion removes all demand exposure on top.

**Why the headline number is OPPORTUNITY, not banked savings (the interval gate):**
- These are mostly **large irrigation pumps** (inventory GPM: P077 1,400; P075 1,000; PUMP #8
  800; P041/P038 1,300). A 1,000+ GPM pump idle in February is almost certainly **>35 kW in
  July**, which **disqualifies AG-A1** under the trailing-12-month ratchet
  (`brief-pge-ag-rates.md` §4: "a single demand spike can strand a meter on the 35+ class for
  up to a year"). **They are NOT safely demotable** on this evidence.
- **P041 and P038 are NEM/solar-paired** (`NEMEXP` / `NEMEXPM`) — solar export agreements, not
  idle pumps; demoting them is a separate solar decision, not arbitrage.
- The engine's `no_usage_basis` guard (`rate-lever.ts:508`) means a correct run on this
  single idle winter cycle emits **no AG-C switch finding at all**.

**Defensible floor.** Only the genuinely small meters are plausibly always-<35 kW and thus
safely demotable on confirmation: **PUMP # 55 (250 GPM)** and **P072 (300 GPM)**. Two meters
x $271.74 = **$543.48/yr** is the defensible-on-confirmation floor; the remaining ~$2,174 is
real **opportunity contingent on interval data proving each pump never breaches 35 kW**.

- `annualUsd` (defensible) = **$543.48** ; opportunity ceiling = **$2,717.40**.
- `computedBy`: `rateLever()` customer-charge differential (deterministic arithmetic;
  `rate-lever.ts` `priceCycleCents` customer-charge term). No AI.
- `needsData = interval`.

---

### Finding R2 — 4 idle AG-5C legacy pumps carrying a $1,938/yr customer charge

**The instance.** P028 (`4693142227`), P062 (`4695237170`), P052 (`4695719808`),
P027 (`4697755484`) sit on legacy **AG-5C**, each printing ~$159-$162 this cycle on **zero
kWh** — essentially the bare AG-5C customer charge.

**Per-meter arithmetic:**
- AG-5C $5.30871/day x 30 days = **$159.26** -> reproduces P028's $159.26 print exactly
  (P062/P052/P027 add $0.38-$3.01 of tiny winter demand).
- AG-5C $5.30871/day = **$1,937.68/yr** — the **highest fixed charge of any schedule on this
  farm**, ~7.7x AG-A1's $251.47/yr.
- Naive differential to AG-A1: ($5.30871 - $0.68895) x 365 = **$1,686.21/yr/meter**;
  x 4 = **$6,744.84/yr** gross.

**Why this is $0 to act on today (high confidence).** Every one is **NEM2-paired solar**
(`solarGroupLabel` 4433/4444/5219, `nemType` NEM2AA). Per `brief-pge-ag-rates.md` §2, these
are **deliberately parked on legacy AG-5C to hold the noon-6pm legacy TOU peak window** that
overlaps midday solar production; the modern AG 5-8pm peak no longer overlaps solar. Moving
them to Schedule AG **early would destroy solar value far exceeding the $1,686/yr fixed
charge**. They force-transition to Schedule AG only when solar-legacy eligibility lapses (no
later than **2027-07-31**). The `rateLever` engine treats legacy plans as exempt from the
usage-basis guard (the move off a closed schedule is "structurally right"), but the **right
action is to HOLD**, so the defensible savings today is **$0**.

- `annualUsd` = **0** (hold until 2027); opportunity at the 2027 lapse depends on whether
  each is then idle/<35 kW (re-run R1's analysis with intervals at that time).
- `computedBy`: `rateLever()` legacy-exempt path; arithmetic customer-charge term. No AI.
- `needsData = interval` (to evaluate the post-2027 demotion).

---

### Finding R3 — 4 idle AG-5B legacy pumps (+1 running) — rate is intentional, hold

**The instance.** P018 (`4690972110`), P002 (`4691688023`, billed -$149.11 = a NEM credit
cycle), P003 (`4692494679`), P067 (`4694038660`, winter peak 1.02 kW, $13.12 demand) sit on
legacy **AG-5B**, idle this cycle. P004 (`4698660251`) is also AG-5B but **runs hard**
(winter peak **171.52 kW**, $1,409.21 demand, billed $3,642.22) and is **correctly
demand-rated**.

**Per-meter arithmetic:**
- AG-5B $1.19446/day x 30 = **$35.83** -> reproduces P018/P003's $35.83 print exactly.
- AG-5B $1.19446/day = $435.98/yr; naive differential to AG-A1 = $184.51/yr/meter.

**Why $0 today (high confidence).** Same logic as R2 — all NEM2-paired solar
(`solarGroup` 4433/4444), deliberately on the legacy TOU window, hold until the 2027 lapse.
P004's 171.52 kW peak **proves the AG-5 fleet legitimately exceeds 35 kW when running**, so
none of these is a candidate for AG-A1 even after 2027 unless interval data shows the
specific meter idle year-round.

- `annualUsd` = **0** (hold). `computedBy`: `rateLever()` legacy path; arithmetic. No AI.
- `needsData = interval`.

---

### Finding R4 — 1 idle AG-4C legacy pump (P017)

**The instance.** P017 (`4699141870`, "PUMP # 17"), legacy **AG-4C**, idle this cycle
(billed $64.50, $1,911.35 NEM true-up). Inventory `status: BAD`, NEM2AA solar-paired,
500 GPM.

**Per-meter arithmetic:**
- AG-4C $2.15003/day x 30 = **$64.50** -> reproduces the $64.50 print exactly.
- AG-4C $2.15003/day = $784.76/yr; naive differential to AG-A1 = **$533.29/yr**.

**Why $0 today.** Solar-paired legacy on the protected TOU window; hold to 2027. Note the
inventory flags this pump `BAD` (status), so its future is a repair/retire decision, not a
rate election. After the 2027 lapse, if confirmed idle/<35 kW (500 GPM is plausibly
demotable), it would carry the AG-4C->AG-A1 differential — but that needs interval data.

- `annualUsd` = **0** (hold). `computedBy`: `rateLever()` legacy path; arithmetic. No AI.
- `needsData = interval`.

---

### Finding R5 — 5 AG-B meters: low-demand, but AG-B has no demand charge (small/sign-ambiguous)

**The instance.** `4698006011` ($27.47, idle), P058 (`4698074516`, $29.31, peak 0.012 kW),
P078 (`4699664416`, $103.43, peak 5.32 kW, 56.71 kWh), `4699664429` ($187.57, peak 5.672 kW,
252 kWh), P057 (`4699664561`, $27.47, idle) sit on current **AG-B** (35+ med-use class).

**Why the dollar here is small and sign-ambiguous:**
- AG-B already carries **no demand charge** (energy-only recovery; `brief-pge-ag-rates.md`
  §1). The only fixed differential to AG-A1 is ($0.91565 - $0.68895) x 365 = **$82.75/yr**.
- But AG-A1's energy is **higher** than AG-B's (winter peak $0.33989 vs $0.33597; off-peak
  $0.31060 vs $0.30671). For the two meters with real usage (`4699664429` 252 kWh,
  P078 57 kWh), the extra energy on AG-A1 partially or fully offsets the $82.75 fixed saving
  — the sign depends on full-year kWh we do not have. For the idle ones, the $82.75 is again
  the "summer flips it" customer-charge artifact the engine refuses to quote
  (`rate-lever.ts:508`).
- AG-B meters reaching ~5.6 kW in winter may well exceed 35 kW in summer (these are pumps),
  re-confirming the 35+ class and barring AG-A1.

**Defensible floor = $0.** No defensible bill-only saving; the swing is small, seasonal, and
sign-ambiguous without intervals.

- `annualUsd` = **0** (opportunity only). `computedBy`: `rateLever()` -> `no_usage_basis` /
  `no_savings`; arithmetic. No AI.
- `needsData = interval`.

---

### Finding R6 — AG-A2 meters with low load factor may be cheaper on AG-A1 (drop the max-demand charge)

**The instance.** Several meters are on current **AG-A2** (<35 kW high-use; carries a
$11.79-$21.43/kW max-demand charge, lower energy than AG-A1). The candidate is the
**low-load-factor** AG-A2 meter — high demand $, few kWh — where dropping AG-A2's max-demand
charge for AG-A1's higher energy on a small kWh base nets positive. AG-A1 and AG-A2 share the
**same $0.68895/day customer charge**, so this is purely a demand-vs-energy trade.

**Per-meter arithmetic (this winter cycle, illustrative):**
- `4699664794`: paid **$84.55 demand** on only **92.4 kWh**. On AG-A1 the extra energy is
  92.4 x ($0.31060 - $0.21642) = **$8.70**, so AG-A1 saves ~**$75.85 this cycle** — a clear
  low-load-factor win. Annualized recurring demand-charge avoidance is on the order of a few
  hundred $/yr **if** the profile holds.
- **The trade flips for steady-energy meters:** `4699664194` (2,392 kWh, $86.41 demand) would
  pay ~$225 MORE energy on AG-A1 = a **net LOSS** of ~$139/cycle; `4699664599` loses
  ~$20/cycle; `4699664553` is roughly break-even. So a blanket AG-A2->AG-A1 swap **loses
  money**.

**Defensible floor.** Real only for the 1-2 demand-dominated, low-kWh AG-A2 meters (chiefly
`4699664794`), and even there the magnitude needs a full year of intervals to size. A
conservative defensible figure for the single clear winner is **~$300/yr** (recurring
demand-charge avoidance, sized down from the $75.85 winter-cycle delta to avoid annualizing a
one-cycle snapshot), contingent on interval confirmation.

- `annualUsd` (defensible, conservative) = **$300.00** ; opportunity higher.
- `computedBy`: `rateOptimization()` interval path / `rateLever()` arithmetic. No AI.
- `needsData = interval`.

---

### Finding R7 — ~87 more AG-C/HAGC meters on 45 other accounts (no bills held)

**The instance.** The 183-meter inventory carries **96 meters on AG-C/HAGC** (13 AGC +
83 HAGC). Only ~12 fall on the one account we hold bills for (`4699664587-8`); the other
**~87 sit on ~45 accounts with NO billing data** in this dataset (largest pools: account
`1909940814-8` ~21 meters, `6539944461-4` 11 meters). If the on-account ratio holds (10 of 12
AG-C meters idle/sub-1-kW), the bulk are also AG-A1/HAGA1 demotion candidates, each ~$271.74/yr
in customer charge alone plus demand-exposure removal.

**Cannot be dollar-quantified.** No bills -> no usage, no demand, no back-test; no interval
data -> no eligibility. Requires **both** the other-account bills **and** trailing-12-month
intervals.

- `annualUsd` = **0** (unquantifiable here). `computedBy`: n/a (would be `rateLever()` once
  data lands). No AI.
- `needsData = other-account-bills` (then interval).

---

## Category total — defensible dollars only

| Finding | Defensible $/yr | Opportunity ceiling $/yr | needsData |
|---|---|---|---|
| R1 AG-C idle -> AG-A1 (2 safe small pumps) | **543.48** | 2,717.40 | interval |
| R2 AG-5C idle (hold to 2027) | 0 | 6,744.84 (post-2027) | interval |
| R3 AG-5B idle (hold to 2027) | 0 | 738.04 (post-2027) | interval |
| R4 AG-4C idle (hold to 2027) | 0 | 533.29 (post-2027) | interval |
| R5 AG-B low-demand (sign-ambiguous) | 0 | small | interval |
| R6 AG-A2 low-load-factor -> AG-A1 | **300.00** | several hundred | interval |
| R7 ~87 AG-C/HAGC on 45 accounts | 0 | large (unquantifiable) | other-account-bills |
| **TOTAL DEFENSIBLE** | **$843.48** | — | — |

**Headline.** The defensible bill-only rate-optimization total is **$843.48/yr** — the two
genuinely-small idle AG-C pumps safely demotable on confirmation, plus the one clear
low-load-factor AG-A2 winner. Everything larger (the ~$2,174 of remaining AG-C idle meters,
the ~$8,000 of legacy AG-5C/5B/4C fixed charges, and the ~87 off-account AG-C/HAGC meters) is
**real opportunity that this lever cannot bank from bill summaries alone**. It is unlocked by
a **trailing-12-month 15-minute interval pull per meter** — the exact wedge the product is
built around (`brief-demand-charges.md` §4: "the bill tells you that you have a peak; only the
15-minute interval data tells you... whether it was a coincidence you can break, and how many
dollars breaking it is worth").

**Do not** report the engine's bare AG-C -> AG-B "savings" as real: with energy modeled as 0,
that comparison is a sign-ambiguous artifact of the missing kWh, and the engine's own
`no_usage_basis` guard (`rate-lever.ts:508`) suppresses it.
