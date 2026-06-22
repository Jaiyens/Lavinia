# Batth Farms — Data Sufficiency and Buy Plan (the master answer)

**For: the two founders. Read this before Tuesday.**

This is the single page that answers the three questions you asked, crisply and honestly:
**(1) exactly which meters to buy, (2) is it enough, and (3) how much will we save.**

It is **subordinate to `NUMBERS-RECONCILED.md`** (the single source of truth on dollars) and
contradicts none of it. It rolls up `BUY-PLAN-FINAL.md`, `SAVINGS-PROJECTION.md`,
`DASHBOARD-READINESS.md`, `SUFFICIENCY-RISKS.md`, and the seven `sufficiency/*.md` writeups.

**The one fact to hold in your head:** every savings figure here is computed by **deterministic
pure functions in `src/lib/energy`** — plain arithmetic against PG&E's rate card, checkable line
by line. **The only AI anywhere in the pipeline is bill-PDF vision extraction in `src/lib/extract`,
which reads numbers off the bill and never computes a dollar.** That refusal-to-inflate is the
credibility asset. Lead with it.

---

## The 60-second executive summary

- **Buy:** 15-minute interval data on the active AG meters of the one account we hold a bill for
  (`4699664587-8`). **Recommended tier = all 23 active AG meters = $264** (first pull free), inside
  the **$465** budget with **$201** reserve. Minimum demo tier = **5 hero meters = $48**.
- **Is it enough?** **To DEMO: yes** — legibility (map + table + solar) plus a **~$1,796/yr
  bankable catch** carries the pitch, *after three free (~half-day) wiring fixes*. **To DELIVER the
  headline levers: not yet** — rate optimization, the cost chart, and the billing-calendar hook are
  blocked, but the unlocks are cheap (~$264 of interval + two **$0** PG&E document/bill pulls).
- **How much will we save?** **Certain today: ~$1,796/yr.** With one dispute won: **~$3,900/yr.**
  **Projected first year after the ~$50–$200 interval pull: ~$8,600 low / ~$16,200 likely /
  ~$26,900 high** — a *labeled projection*, not banked. The big numbers ($6k demand "exposure",
  the $0–$57k P031 true-up) are **exposure / contingent**, never savings — keep them out of the headline.
- **Recommendation:** Buy **T2 ($264, 12-month history)**. Request **two free documents from PG&E**
  (the Generation Allocation Summary for P031; the other 56 accounts' bill PDFs). Download **$0**
  serial letters from the master sheet to light the calendar hook. Walk in with the certain ~$1,796,
  not "$60k."

---

# Question 1 — EXACTLY which meters to buy

**Account:** `4699664587-8` (CHARANJIT S BATTH FARMS) — the one account we hold a reconciled bill for.
**Pricing:** **$12 per meter**, one-time historical/interval pull; **first collection is free** on
the account. **Auth:** durable UtilityAPI UID 587577, PG&E, 3-yr — one auth, no per-meter 2FA.
**Budget:** **$465**.

**What interval data actually buys:** a trustworthy *energy term*. The bill summary carries dollars
and demand kW but **no kWh by time-of-use**, so the rate engine models energy as zero and its
AG-C→AG-B "switches" are sign-ambiguous artifacts (correctly suppressed by `no_usage_basis`).
15-minute interval kWh is the single input that turns **rate optimization — the #1 lever — from
"pending" into priced-and-provable.**

### The classification (rule: ACTIVE = real kWh > 0 and/or a billed demand charge)

| Bucket | Count | What |
|---|---:|---|
| Billed service agreements | **46** | every SA on the account |
| **ACTIVE** | **26** | 23 AG (pumps + farm shops, the rate-opt candidates) + 3 B1 business (no ag lever, no demand charge; the rate engine is correctly a no-op) |
| **IDLE / zero-kWh** | **20** | zero kWh AND zero demand; a flat-line pull proves nothing the summary doesn't |

> Note on the 8 "zero-kWh but demand-charged" meters (P004, P031/VINES 75HP, P067, P062, P027,
> P041, P038, P052): they read `idleZeroKwh:true` because energy nets out under NEM, but they carry
> a real billed demand charge, so they count as **ACTIVE**. P004 ($1,409.21) and P031 ($1,112.97)
> are two of the largest demand charges on the farm.

### The three tiers

| Tier | Meters | Cost (first free) | Reserve (of $465) | What it unlocks |
|---|---:|---:|---:|---|
| **T1 — minimum demo** | 5 hero | **$48** ($60 list) | $417 | all 5 lever classes on one screen |
| **T2 — recommended** | 23 active AG | **$264** | **$201** | rate optimization (#1 lever) across the whole active account + demand-exposure pricing |
| **T3 — do NOT buy** | 23 (20 idle + 3 B1; 4 B1 total) | $0 | — | nothing; the bill summary already covers them |

**T1 — the 5 hero meters (light up every lever class on one screen):**

| SAID | Meter | Rate | Why it's a hero |
|---|---|---|---|
| `4696826125` | P054 | AGC | **FREE pull.** #1-dollar, hardest-running pump (278.88 kW); rate-opt on the top meter |
| `4698660251` | P004 | AG5B | NEM-credit control + legacy AG-5B hold-to-2027 proof + 2nd-largest demand charge |
| `4699664088` | P031 / VINES 75HP | AGC | the load shape behind the $62,795.65 true-up headline |
| `4699664553` | SHOP ELKHORN-18 | AGA2 | a *shop* with real on-peak load → genuine TOU-shift + the AG-A2→AG-A1 election |
| `4699664820` | PUMP # 55 | AGC | proves the AG-C→AG-A1 demotion stays <35 kW all year (the eligibility ratchet the bill can't show) |

```
# T1 — copy-paste SAID list (5 meters, P054 first = free)
4696826125,4698660251,4699664088,4699664553,4699664820
```

```
# T2 — copy-paste SAID list (23 active AG meters, P054 first = free)
4696826125,4698660251,4699664088,4699664553,4699664599,4699664194,4699664794,4699664429,4699664416,4699664335,4699664294,4694038660,4699664016,4695237170,4697755484,4699664441,4699664743,4699664820,4696771732,4695719808,4691715828,4698074516,4699664991
```

**T3 — the do-NOT-buy 23 (for reference; never pull these):**

```
# Idle / zero-kWh (20) — demotion is $0 off the bill summary, no interval needed
4690972110,4691688023,4692166716,4692424863,4692494679,4693142227,4697631144,4698006011,4699141870,4699142630,4699664012,4699664172,4699664198,4699664286,4699664321,4699664538,4699664561,4699664728,4699664955,4699664965
# Business B1 (3 active-by-kWh, no ag lever; + idle B1 4699664172 above = 4 B1 total)
4699664272,4699664540,4699664985
```

### One operational instruction on the pull (cheap, easy to forget)

**Request the MAXIMUM available history (12 months) per SA, not just the latest window** — same
$12/meter, dramatically more value. A single winter window leaves the cost chart near-empty, gives
the bill-audit engine fewer than its 3 required comparators, and *understates* demand exposure
(the $6,058.73 is a **winter floor**; AG-C's summer peak-demand charge doesn't apply this cycle).
The 12-month variant fills the chart, enables year-over-year, captures a summer cycle, and feeds
bill-audit — at the same price.

---

# Question 2 — IS IT ENOUGH?

There are two honest answers, and they are different.

## 2A. Enough to DEMO? **Yes — with a tight script and three free fixes first.**

What carries the demo **today, with no new data**:

- **The Map (178 real pins, 23 priced):** "your whole operation, known at a glance." The strongest
  surface. Needs only lat/long, which we have.
- **The Table (186 meters, full structure, 46 reconciled, rich filters):** the Excel-brained win.
- **The Solar lens (both real 1,932 kW arrays, true-up timing):** real structure; credit dollars
  are honest-blank by design.
- **The idle-demotion finding (~$1,796/yr bankable) + the P027 dispute (~$2,072 if won):** the
  credible "we already found the money worth chasing" line. **This is the pitch.**

**Three free fixes (~half a day of $0 dev work) before you demo the live account** — these are
mechanics, not data, and without them the centerpiece looks broken on stage:

1. **Seed the real farm AND run `runEngines` against it.** `seedBatthRealFarm` never calls
   `runEngines`, and `SEED_BATTH_REAL` is wired nowhere — so a fresh real seed renders an **empty
   findings rail**. Add a smoke assertion: `Recommendation.count > 0` and the idle finding ~$1,796.
   *(~30 min, $0. Without this the demo has no findings.)*
2. **Persist the NEM month table** so the P027 dispute (~$2,072, half the "with one dispute"
   headline) actually fires — the real seed writes no `NemPeriod` rows, and it fails *silently*.
   If you can't, **cut the "~$3,900" line** and pitch the certain $1,796 only. *(~1 hr, $0.)*
3. **Set `solarLayoutVerifiedAt`** after confirming the 840+1,092 kW layout, so nameplates don't
   all wear the "unverified" qualifier. *(~5 min, $0.)*

**Surfaces to AVOID leaning on** (both empty on day-one data — script around them):
- **The cost-over-time chart** (no TOU line items + one cycle → renders its empty state).
- **The scheduled calendar** (no `serialCode` → zero forecast marks; this is the hook Batth named,
  so either capture serials first or scope it out explicitly — surprise-empty is worse than scoped-out).

## 2B. Enough to DELIVER? **Legibility + ~$1,796/yr yes; the headline levers, not yet.**

We can deliver **right now**: a legible 186-meter operation, 46 reconciled bills, the two real solar
arrays, and **~$1,796/yr of bankable, reversible, zero-change idle demotions** (plus ~$2,072
contingent on the one dispute). That is a genuine, defensible pilot deliverable.

But the **#1 lever (rate optimization)**, the **cost chart**, and the **billing-calendar hook** are
all dead on the data in hand. The unlocks are cheap:

1. **15-min interval kWh (T2, ~$264, first free)** → rate optimization across up to 42 meters,
   demand-recovery pricing, fills the cost chart. **Highest-leverage spend.**
2. **Serial letters → `Pump.serialCode`** (from the master sheet or a bill scan) → lights the
   entire scheduled-calendar hook. **$0. The interval buy does NOT fix this.**
3. **The other 56 accounts' bill PDFs** (free from PG&E MyEnergy → the vision pipeline) → prices
   the other ~140 table cells and finds the rest of the idle/rate money. **$0.**
4. **The PG&E Generation Allocation Summary / Form 79-1202** → resolves the $0–$57k P031 question.
   **$0. The interval buy does NOT fix this either.**

### View by view

| View | Demo? | Deliver? | What it needs |
|---|---|---|---|
| **Map (178 pins)** | **FULLY** | **FULLY** | lat/long — have it. Strongest surface. |
| **Excel table** | **FULLY** structure / PARTIAL money | structure done; money fills with more bills | other accounts' bill PDFs ($0) |
| **Per-meter cost chart** | **EMPTY** (graceful) | needs interval | TOU line items + multi-cycle history (the **12-month** interval pull) |
| **Findings rail** | **PARTIAL**, empty until `runEngines` runs | idle ~$1,796 delivers now | run the engine; persist NEM table; interval for rate-opt |
| **Solar lens** | **FULLY** structure / EMPTY credit $ (by law) | structure + timing now | true-up statements for credit $; `solarLayoutVerifiedAt` |
| **Cycle calendar (the hook)** | **EMPTY** of scheduled marks | observed marks now | serial letter → `serialCode` ($0; **not** the interval buy) |

### Per-lever sufficiency at a glance

| Lever | Verdict | Meters now / with-buy / total |
|---|---|---|
| **Rate optimization (#1 lever)** | works-with-interval-buy | 0 / 15 / 42 |
| **Demand charges (DR / rate move / spike-shaving)** | works-with-interval-buy | 23 / 3 / 23 |
| **Solar / NEM** | blocked-pge-doc | 14 / 14 / 56 |
| **Bill audit / disputes** | works-with-interval-buy | 0 / 18 / 183 |
| **Idle / standby demotions** | **works-now-free** | 14 / 14 / 100 |
| **Account / entity / NEMA structure** | blocked-pge-doc | 14 / 14 / 56 |
| **Billing-cycle / serial-code timing (the hook)** | works-now-free | 46 / 46 / 183 |

**Read-through:** the two **works-now-free** levers (idle demotions = the dollars; the calendar =
the hook) carry the demo. The three **works-with-interval-buy** levers are exactly what the $264
pull unlocks. The two **blocked-pge-doc** levers (solar/NEM and structure/NEMA — the same P031
true-up seen twice) are unlocked by a **free document**, not by spending.

---

# Question 3 — HOW MUCH WILL WE SAVE?

One reconciled, deduplicated ledger. **Gated tiers are labeled RANGES, never banked.** The
deduplication discipline matters: the idle demotions are counted **once** (Tier A, not also in
rate-opt); demand **exposure** is not a saving (only its recovery is); the P031 true-up is counted
**once** (Tier D, not in both Solar/NEM and Structure/NEMA); the falsified $795 "demand over-rate"
finding is dropped; cycle-timing is $0 by design (it would double-count demand).

| Tier | What | Status | Low | Likely | High |
|---|---|---|---:|---:|---:|
| **A** | Idle AG-C/AG-B → AG-A1 demotions (8 meters) | **CERTAIN NOW, free** | $1,796 | $1,796 | $1,796 |
| **B** | P027 dispute (net exporter charged a $2,461 true-up) | Winnable **dispute** (PG&E must agree; needs the doc, NOT interval) | $0 | $2,072 | $2,072 |
| **C** | **Unlocked by the interval buy** (rate-opt + demand recovery + bill-audit) | **PROJECTED**, pending the actual pull | $6,805 | $12,310 | $22,992 |
| **D** | P031 / VINES 75HP true-up (one-time) | **CONTINGENT** on the PG&E allocation doc; zero-sum risk | $0 | ~$28,000 | ~$57,500 |
| **E** | Other 56 accounts (portfolio) | Gated on their bills (unsized) | $0 | (extrapolated) | ~$23,600 |

### Tier C broken out (this is what the buy unlocks)

| Component | Low | Likely | High | Assumption (explicit) |
|---|---:|---:|---:|---|
| **C1 — Rate optimization (#1 lever)** | $843 | $1,300 | $3,400 | 2 safe AG-C demotes + 1 AG-A2 winner (low); ratchet-survival of mid-size AG-C (high). Customer-charge core of the low band is bill-exact. |
| **C2 — Demand recovery** | $5,800 | $10,200 | $17,000 | 8 / 12 / 20% of **annualized** demand exposure (~$72.7k–$96.9k). 12% is deliberately below the 20–25% literature figure because almonds run flat-out off-peak. |
| **C3 — Bill audit (interval-only component)** | $162 | $810 | $2,592 | 216 meter-cycles × 0.5–3% hit-rate × $150–$400 excess. A rare-event lever. (P027 lives in Tier B, not here.) |

### The headline ranges (state them exactly like this)

- **Certain, bankable now (A only): ~$1,796/yr.** High confidence, reversible, zero new data.
- **With the one dispute won (A+B): ~$3,868/yr** — matches `NUMBERS-RECONCILED.md`'s "~$3,900."
- **Projected first-year (A+B+C), after the ~$48–$264 interval pull: ~$8,600 low / ~$16,200 likely
  / ~$26,900 high.** This is a **labeled projection**, pending the actual pull — Tier C is 75–90% of
  the top of this range and rests on recovery-% and hit-rate **assumptions the buy does not harden**.
- **Run-rate after full data** (recurring A + C1 + C2 + off-account idle; excludes one-time
  rebills/true-ups): **~$8,400 low / ~$25,100 likely / ~$45,800 high.**

### The two numbers a sharp consultant will attack — label them, don't bank them

- **Demand exposure = $6,058.73/cycle is exposure PG&E correctly billed, NOT a saving.** Engine
  returns **$0 recoverable** until interval data lands. Say "exposure" every single time. Recovery
  is the Tier C2 *range*, not this figure.
- **P031 / VINES 75HP = $62,795.65 true-up → $0–$57k CONTINGENT** on the PG&E Generation Allocation
  Summary. Real **zero-sum risk** on the 1,932 kW (840+1,092) arrays — re-pointing the credit may
  just move the deficit. **One-time, never recurring, never in the running total.** Interval data on
  P031 only verifies the demand-kW anomaly; the **document** is the unlock.

---

## The recommendation (one paragraph)

**Buy T2** — 15-minute interval history on all **23 active AG meters** of account `4699664587-8`,
**$264** (first pull free), inside the $465 budget with a $201 reserve — and **explicitly request
the full 12 months of history per SA**, not just the latest window, so the cost chart, year-over-year,
the summer demand cycle, and the bill-audit comparators all come alive at the same price. (If budget
is tight, T1 at $48 still lights every lever class on one screen, but T2 is the deliverable.) **Request
two free documents from PG&E:** the **Generation Allocation Summary / Form 79-1202** for P031 (resolves
the $0–$57k question for $0), and the **other 56 accounts' bill PDFs** from PG&E MyEnergy (lights up
~137 more meters through the existing vision pipeline for $0). **Download for free** the **serial letters**
from Batth's master spreadsheet into `Pump.serialCode` to turn on the billing-calendar hook he asked
for (the interval buy does not fix this). Then do the half-day of $0 wiring (seed + `runEngines` +
NEM-table persistence + `solarLayoutVerifiedAt`), and walk in leading with the **certain ~$1,796/yr
today (~$3,900 with one dispute), and a credible ~$8.6k–$26.9k projected first year after ~$50–$200
of interval data** — every gated number labeled a projection, never "$60k." The first earns a pilot;
the second gets you caught.
