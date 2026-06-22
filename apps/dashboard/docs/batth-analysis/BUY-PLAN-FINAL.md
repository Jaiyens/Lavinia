# Batth Farms — UtilityAPI Buy Plan (FINAL)

**Account:** 4699664587-8 (CHARANJIT S BATTH FARMS) — the one account we hold a reconciled bill PDF for.
**Pricing:** $12 per meter, one-time historical/interval pull. **First collection is free** on the account.
**Auth:** durable UtilityAPI authorization UID 587577 (form 585637), PG&E, expires in 3 years. One auth, no per-meter 2FA.
**Budget available:** $465.

> What interval data actually buys: a trustworthy **energy term**. The bill summary carries dollars and
> demand kW but **no kWh by time-of-use**, so the deterministic rate engine (`src/lib/energy`,
> `rateLever` / `rateOptimization`) models energy as zero and its AG-C→AG-B "switches" are
> sign-ambiguous artifacts (correctly suppressed by `no_usage_basis`). 15-minute interval kWh is the
> single input that turns rate optimization — the #1 lever — from "pending" into priced-and-provable.
> Savings are computed by **deterministic pure functions**; the only AI anywhere is bill-PDF vision in
> `src/lib/extract`, which reads numbers and never computes a dollar.

---

## Classification of the bill: every billed meter on 4699664587-8

**46 billed service agreements.** Each is either:

- **ACTIVE** — has real kWh (>0) and/or a billed demand charge → an interval pull is worth $12
  (it converts a claim into proof and/or feeds the rate model). **26 meters.**
- **IDLE / zero-kWh** — zero kWh and zero demand charge; the cycle is pure customer charge.
  An interval pull would return a flat-line and prove nothing the bill summary doesn't already show.
  The bankable fix here (AG-C/AG-B → AG-A1 demotion, ~$1,796/yr) needs **$0** of interval data. **20 meters.**

Of the 26 active, **23 are AG (pumps + farm shops)** — the legitimate rate-optimization candidates — and
**3 are B1 business** (office / water-system loads on a non-ag rate that has no ag-rate lever and no demand
charge; the rate engine is correctly a no-op on them).

> Note on the 8 "zero-kWh but demand-charged" meters (P004, P031/VINES 75HP, P067, P062, P027, P041, P038,
> P052): they read `idleZeroKwh:true` because energy nets out under NEM accounting, but they carry a real
> billed demand charge, so they are **ACTIVE** by the rule above — interval data prices their demand
> exposure. P004 ($1,409.21) and P031 ($1,112.97) are two of the largest demand charges on the farm.

---

## T1 — Minimum demo (~$60 list, $48 net): the 5 hero meters

The smallest spend that lights up every lever class on one screen. First pull (P054) is free.

| serviceId (SAID) | Meter | Rate | kWh/mo | Demand $ | Why it's a hero |
|---|---|---|---:|---:|---|
| **4696826125** | P054 | AGC | 31,828 | $2,783.22 | **FREE pull.** #1-dollar, hardest-running meter; the rate-opt model on the #1-spend meter; is the 278.88 kW peak one pump or coincident overlap (DR/peak-shave). |
| **4698660251** | P004 | AG5B | 0 (net exporter −16,060) | $1,409.21 | NEM-credit control case + legacy AG-5B hold-to-2027 proof + 2nd-largest demand charge. |
| **4699664088** | P031 / VINES IRR 75HP | AGC | 0 | $1,112.97 | Load shape behind the **$62,795.65** true-up headline; pairs with the Generation Allocation Summary. |
| **4699664553** | CHARANJIT BATH SHOP ELKHORN-18 | AGA2 | 1,924 | $184.16 | Different class: real on-peak load on a *shop* → genuine TOU-shift candidate + the AG-A2→AG-A1 break-even election. |
| **4699664820** | PUMP # 55 | AGC | 14 | $0.61 | Proves the AG-C→AG-A1 demotion stays **<35 kW all year** (the eligibility ratchet the bill can't show); under the bankable floor. |

**Cost: 5 meters, first free → 4 × $12 = $48.** (List $60.)

**Unlocks:** all five energy-lever classes on one demo screen — (1) rate optimization on the top meter,
(2) demand-charge / DR recovery framing on the two biggest demand charges, (3) a non-pump TOU-shift class,
(4) an eligibility-ratchet demotion proof, (5) the NEM-credit control + the P031 anomaly's evidentiary backbone.
**5 meters.**

```
# T1 — copy-paste SAID list (5 meters)
4696826125,4698660251,4699664088,4699664553,4699664820
```

---

## T2 — Recommended: interval on ALL 23 active AG meters of the main account

Every pump and farm shop that has real kWh and/or a demand charge. This is the full rate-optimization
candidate set on the account. The 5 heroes are included (P054 is the free pull).

**Cost: 23 active AG meters, first collection free → 22 × $12 = $264.**

| Check | Value |
|---|---|
| Active AG meters | **23** |
| Billable (first free) | 22 |
| **T2 cost** | **$264** |
| Budget | $465 |
| **Within $465?** | **Yes** ($264 ≤ $465) |
| **Reserve held** | **$201** |

**Unlocks:** the **rate-optimization lever (#1) across the entire billed account** — 23 of 23 active AG
meters become priced, defensible rate-election candidates instead of sign-ambiguous artifacts; the
demand-charge exposure (measured **$6,058.73/cycle**) becomes priceable for DR/peak-shave recovery on every
demand-charged meter; and every AG-C/AG-B → AG-A1 demotion gets its <35 kW eligibility ratchet confirmed by
real interval data rather than asserted. **23 meters.** The $201 reserve funds partial-pull re-collections
(UtilityAPI bills per *successfully collected* meter, and pulls can return partial) without a new budget ask.

```
# T2 — copy-paste SAID list (23 active AG meters; P054 first = free)
4696826125,4698660251,4699664088,4699664553,4699664599,4699664194,4699664794,4699664429,4699664416,4699664335,4699664294,4694038660,4699664016,4695237170,4697755484,4699664441,4699664743,4699664820,4696771732,4695719808,4691715828,4698074516,4699664991
```

---

## T3 — Do NOT buy (23 meters): the idle meters + the 4 business B1 meters

An interval pull on these returns nothing actionable. The idle meters' only fix (rate demotion) is **$0**
off the bill summary; the B1 business meters have no ag-rate lever and no demand charge.

### Idle / zero-kWh (20 meters) — the bill already handles these; demotion is $0
```
4690972110,4691688023,4692166716,4692424863,4692494679,4693142227,4697631144,4698006011,4699141870,4699142630,4699664012,4699664172,4699664198,4699664286,4699664321,4699664538,4699664561,4699664728,4699664955,4699664965
```
(P018, P002, P075, PUMP#8, P003, P028, IRR 100HP K-87, an AGB meter, P017, an AGC meter, P069, OFFICE BIG
RANCH (B1), P072, P063, P048, PUMP#56, P057, P077, P045, P043. **OFFICE BIG RANCH 4699664172 is the 4th B1 meter** —
it is idle-zero, so it lands in this idle bucket and double-qualifies as a business B1 exclusion.)

### Business B1 — active by kWh but no ag lever, no demand charge (3 meters here + the idle B1 above = 4 B1 total)
```
4699664272,4699664540,4699664985
```
(WTR SYS KAMM, an unlabeled B1 load, OFFICE KAMM. With OFFICE BIG RANCH 4699664172 that is the **4 B1 business
meters**; none are interval-worthy — the rate engine is correctly a no-op on B1.)

**Why not:** idle meters → a flat zero-line proves nothing the summary doesn't; their reversible AG→AG-A1
demotion (~$1,796/yr bankable) needs zero interval data. B1 business → outside the ag rate-optimization lever
entirely. Spending here buys curves with no claim to attach them to.

---

## Spend summary

| Tier | Meters | Cost (first free) | Reserve (of $465) | Unlocks |
|---|---:|---:|---:|---|
| **T1 — minimum demo** | 5 hero | **$48** ($60 list) | $417 | all 5 lever classes on one screen |
| **T2 — recommended** | 23 active AG | **$264** | **$201** | rate optimization (#1 lever) across the whole active account |
| **T3 — do NOT buy** | 23 (20 idle + 3 B1; 4 B1 total) | $0 | — | nothing; bill summary already covers them |

**Active-meter count on 4699664587-8: 26 total (23 AG + 3 B1). Interval-worthy AG candidates: 23.**
**T1 = $48 net ($60 list). T2 = $264, within the $465 budget, leaving a $201 reserve.**

---

## Guardrails (do not contradict)

- All savings are computed by **deterministic pure functions** in `src/lib/energy` (no AI). The only AI is
  bill-PDF **vision extraction** in `src/lib/extract`.
- **Bankable now, no new data:** ~$1,796/yr (idle AG-C/AG-B → AG-A1 demotions). **+~$2,072/yr if the P027
  dispute wins** (a net exporter charged a $2,461 NEM true-up).
- **Rate optimization is the #1 lever but is DEAD without 15-min interval kWh** — exactly what T2 buys.
- **Demand exposure measured = $6,058.73/cycle** is exposure PG&E correctly billed, **NOT a saving**;
  recovery needs interval data + DR enrollment.
- **P031 / VINES 75HP $62,795.65 true-up = $0–$57k CONTINGENT** on the PG&E Generation Allocation Summary
  (a *document*, not interval data; real zero-sum risk — arrays are 1,932 kW = 840 + 1,092, not 12,180).
  Never present it as banked.
- The Excel inventory's other ~137 meters across ~56 accounts have **no bills in hand**; their bill PDFs
  are free from PG&E MyEnergy and light up the same vision pipeline at $0. Not on this buy plan.
- All projections are **ranges, pending the actual interval pull** — no fabricated precision.
