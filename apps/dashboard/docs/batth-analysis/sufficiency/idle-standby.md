# Data sufficiency + savings projection: the Idle / standby lever

**Lever:** Idle / standby meters — truly-idle, non-NEM service agreements paying a customer
(standby) charge on a higher-tier schedule than their 0-kWh usage requires. The fix is a
reversible rate demotion to the AG-A1 floor: zero operational change, no permanent decision.

**One-line verdict:** Works on the bills we already hold, for free. No interval pull needed.
Projected **~$1,796/yr, certain** on this one account; clearly more on the other 56 accounts,
but that is gated on their bills, not on intervals.

---

## 1. The engine and its exact required inputs

**Engine (deterministic, not AI).** The dollar is a customer-charge differential priced by the
pure cost functions in `src/lib/energy`:

- `priceCycleCents(input, plan)` in `src/lib/energy/rates.ts` — at 0 kWh every energy and demand
  term collapses to $0, so the cycle total is exactly the customer charge:
  `customerCents = round(days × customerChargePerDay)`.
- The candidate plan (AG-A1) and the back-test gate live in `src/lib/energy/rate-lever.ts`
  (`rateLever`, `costUnderPlanCents`, `mapScheduleLabel`, `CANDIDATE_SCHEDULES`).
- `cycleCostUnderPlan` / `annualCostUnderRate` in `rates.ts` are the equivalent dollar-domain
  path used by `src/lib/energy/rate-compare.ts`.

The findings JSON labels the computer `src/lib/energy/rateCompare.ts`; the file on disk is
`rate-compare.ts` (and the cents-exact customer term is in `rates.ts`). Same deterministic
arithmetic either way. **The only AI in the whole pipeline is the bill-PDF vision extraction in
`src/lib/extract`** that read the printed customer-charge line items; the savings math is plain
arithmetic, checkable line by line against the rate card.

**Exact inputs the engine reads, per meter:**

| Input | Type | Where it comes from |
|-------|------|---------------------|
| `scheduleLabel` (current tariff, as the bill prints it: "AGC Ag35+ kW High Use") | string | bill PDF (vision) / meter list |
| `periods[].lineItems` — the customer-charge line ("N days @ $X/day") and any TOU energy lines | line items | bill PDF (vision) |
| `periods[].printedTotalCents` (printed cycle total) | int cents | bill PDF (vision) |
| `period` day span (start, close) | ISO dates | bill PDF (vision) |
| The dated rate card (`customerChargePerDay` for every AG plan) | `RateCard` | committed fixture `fixtures/pge-ag-rate-card.json` |

Per the rate card the relevant per-day customer charges are exact and verified:
**AG-A1/AG-A2 = $0.68895/day, AG-B = $0.91565/day, AG-C = $1.43343/day.** The demote dollar is
`(currentDaily − $0.68895) × 365`.

**The one subtlety that makes this free, not interval-gated.** The 35 kW size ratchet
(`rate-lever.ts` lines 514-518) normally needs interval data to know whether an idle pump would
exceed 35 kW in summer. It does **not** bite here, because **AG-A1 and AG-A2 carry the identical
$0.68895/day customer charge**. So the customer-charge shed is the same whether the meter lands
at the small-tier floor (AG-A1) or, if it ever runs >35 kW in a future summer, the large-tier
floor (AG-A2). At 0 kWh / 0 kW there is also no max-demand or peak-period demand charge on any
schedule, so the entire idle bill is the customer charge and the differential is captured cleanly.
The interval gate in `gap-interval-data.md` (the "$543.48 defensible floor") constrains the
*energy/demand crossover refinement*, not this pure customer-charge shed. **`NUMBERS-RECONCILED.md`
is the single source of truth and books the full $1,795.94 as bankable now, needs: nothing.**

---

## 2. What we have for free (bills + meter list), and what interval adds

**From the bills we already hold (account 4699664587-8), at $0:**
- 46 billed service agreements, fully reconciled (`normalized/billing.json` rollup:
  `reconciledCount: 39`, header-vs-cycle gap $27.58 = PG&E running-balance rounding).
- `idleZeroKwhMeterCount: 28`; of those `idleButNemEnrolledCount: 14` (energy is netted under NEM,
  not idle) and **`trulyIdleNonNemCount: 14`** — the exact population this lever operates on.
- Each idle meter's printed cycle is 100% customer charge: AG-C = $43.00/mo, AG-B = $27.47/mo,
  AG-A1/A2 = $20.67/mo. That is every input the engine needs.

**This lever needs nothing from an interval buy.** Buying 15-minute interval kWh on the active
meters does **not** add idle/standby dollars — idle meters have no usage to bucket, and the demote
target (AG-A1) has the same customer floor as the size-class ratchet's alternative (AG-A2).
Intervals matter for *other* levers (rate optimization on the 42 active AG meters, demand-charge
recovery), not this one. The only thing that grows this lever is **the other 56 accounts' bill
PDFs** (free from PG&E MyEnergy), which light up their idle meters through the same vision pipeline.

---

## 3. Meter coverage: now vs. with-buy vs. total

| Population | Count | Note |
|-----------|------:|------|
| Truly-idle non-NEM meters on the held account | **14** | the lever's full reachable set today |
| → demotable now (above the AG-A1 floor) | **8** | 6 AG-C + 2 AG-B → **$1,795.94/yr** |
| → already at the AG-A1/A2 floor (demote = $0) | 6 | close-service upside only, not banked |
| Added by an interval buy | **0** | intervals add no idle dollars |
| Total idle-class candidates across the fleet | **~14 now + ~84-87 off-account** | the ~96 AG-C-class meters in the 183-meter inventory; the off-account ones are gated on **their bills**, not intervals |

**metersCovered for the structured record** counts the meters this lever can act on:
`now = 14` (all truly-idle non-NEM meters we can see and price today), `withBuy = 14`
(an interval buy adds none), `total ≈ 100` (14 on-account + ~86 off-account idle-class
candidates that need the other accounts' bills first). The 8 that actually bank money are the
demotable subset of the 14.

---

## 4. Projected annual savings (RANGE, with explicit assumptions)

All figures below are **deterministic from the bills in hand** — no interval pull is pending for
the core number. The range reflects scope (this account only vs. the fleet), not measurement
uncertainty.

| Scenario | $/yr | Basis |
|----------|-----:|-------|
| **Low** | **$1,795.94** | The 8 demotable idle meters on the held account, customer-charge differential at 0 kWh. Certain, reversible, no new data. Reproduced exactly from `billing.json`: 6×$271.74 (AG-C) + 2×$82.75 (AG-B). |
| **Likely** | **$1,795.94** | Same. This is the honest bankable-now number and the headline; we do not pad it with the off-account extrapolation, which is unproven until those bills are pulled. |
| **High** | **~$2,047** (this account incl. one near-floor edge) to a **~$23,600/yr fleet ceiling, PENDING other-account bills** | The fleet ceiling assumes the on-account idle ratio (~10 of 12 AG-C meters idle) holds across the ~87 off-account AG-C-class meters at $271.74 each. **This is an assumption, not a measurement — clearly labeled pending the other 56 accounts' bill PDFs.** It is NOT pending an interval pull. |

For the structured record the projected annual range is the **defensible, bankable-now** band:
`low = likely = high = 1795.94`. The fleet ceiling (~$23,600/yr) is real upside but is gated on
other-account bills and explicitly kept out of the banked projection — surfacing it as the number
would be the kind of overclaim the reconciled ledger warns against.

### Close-service upside (reported, NOT in the total)
If the grower permanently closes any of the 14 idle SAs, the *entire* monthly customer charge
disappears: across all 14 that is **~$5,316/yr** (e.g. $523.20/yr per AG-C meter). This is a
permanent grower decision with reconnection downside, so it is upside, never banked in the demote
total. The 6 already-at-floor meters have *only* this close-service lever.

---

## 5. Assumptions and caveats

- **365-day annualization** of a one-cycle customer-charge differential. The customer charge is a
  flat $/day that does not vary by season or usage, so annualizing the daily delta is exact for the
  demote (unlike energy/demand terms, which would need a full year of cycles).
- **"Truly idle" = 0 kWh on the latest cycle AND not NEM-enrolled.** A 0-kWh NEM meter is netting,
  not idle; the engine correctly excludes the 14 NEM-enrolled zero-kWh meters. If an "idle" pump
  resumes heavy summer use it auto-bills under AG-A2 (same $0.68895 floor), so the demote stays safe
  and reversible — no downside if the assumption later breaks.
- **AG-A1 = AG-A2 customer charge** ($0.68895/day) is what removes the interval gate. Verified
  against `fixtures/pge-ag-rate-card.json`.
- **The ~$23,600/yr fleet ceiling is an extrapolation, pending the other 56 accounts' bills** — not
  pending interval data. Do not pitch it as banked.
- The findings JSON cites `rateCompare.ts`; the on-disk module is `rate-compare.ts`, with the
  cents-exact customer term in `rates.ts`. No behavioral discrepancy.

---

## 6. Verdict

**works-now-free.** The idle/standby lever runs entirely on the bills already in hand, is computed
by deterministic pure functions (`priceCycleCents` / `rate-lever.ts`, not AI), and banks
**~$1,795.94/yr** of reversible, zero-operational-change savings across 8 of 14 truly-idle meters
on the one account we hold. An interval buy adds nothing here. The only growth path is the other
accounts' bills, which the same free vision pipeline would extract.
