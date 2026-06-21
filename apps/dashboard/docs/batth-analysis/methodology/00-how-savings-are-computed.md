# How Terra Computes Dollar Savings — The Definitive Trace

**Scope:** every finding type the product emits, traced to the exact function, formula,
data inputs, honesty gates, and a yes/no on LLM involvement, with `file:line` citations.

**One-line answer:** Every dollar figure is produced by **deterministic, pure,
unit-tested arithmetic** in `src/lib/energy/*`, priced against PG&E's **published rate
card** (`fixtures/pge-ag-rate-card.json`) and the farmer's **own posted bills**. The
**only** AI in the entire pipeline is bill-PDF **vision extraction** (`src/lib/extract/*`),
which turns a scanned bill image into structured numbers and **never computes a savings
dollar**. "Almond" is a **separate, read-only** chat assistant — it reads the same numbers
the engines already produced; it does not produce them. v1 only **displays** findings;
nothing executes autonomously.

---

## 0. Proof that no LLM lives in the savings engines

Grep over the two directories that produce every dollar figure returns **nothing**:

```
$ grep -rnE "generateText|generateObject|streamText|createGateway|@ai-sdk|gateway\(|anthropic|openai|hasGatewayKey" \
    src/lib/energy src/lib/recommendations | grep -v "\.test\.ts"
NONE FOUND
```

The energy math files import only `@/copy/en` (strings), `@/lib/recommendations` (the
grammar), and each other. No model client, no gateway, no network, no clock, no DB, no fs.
Every file's header states this contract explicitly, e.g. `rate-compare.ts:10`
("Pure: no UI, no DB, no clock, no fs"), `bill-audit.ts:8`, `solar-nem.ts:10`,
`rates.ts:8`.

The complete set of AI/LLM call sites in the app (from the full grep) is:

| Call site | `file:line` | What it does | Touches a savings $? |
|---|---|---|---|
| Bill-PDF vision extraction | `src/lib/extract/reader.ts:109,128` (`generateObject`) | image → structured bill numbers | **No** (produces data rows, not savings) |
| Almond assistant (chat) | `src/lib/almond/responder.ts:332` (`streamText`) | read-only chat over already-computed data | **No** |
| Almond code-gen export (POC, gated off) | `src/lib/almond/skills/codegen-export.ts:184` (`generateText`) | writes HTML/CSS for a PDF of existing findings | **No** |
| Shared gateway boundary | `src/lib/ai/gateway.ts:41` | constructs the model client for the three above | n/a |

None of these is in `src/lib/energy` or `src/lib/recommendations`. The savings number is
computed before any of them ever runs.

---

## 1. The two-sided architecture of a savings claim

Every priced finding is the difference between two numbers, and the honesty of the product
rests on where each comes from:

1. **What the farmer actually pays** — read **verbatim from their own posted bills**
   (`BillingPeriod.totalBillUsd` / `printedTotalCents`, `demandChargeUsd`). Never modeled,
   never invented. The rate-card comment is explicit: *"The farmer's ACTUAL cost is always
   read from their own bills, never from this file"* (`fixtures/pge-ag-rate-card.json:1`).

2. **What the same usage would cost on an alternative** — computed by pure arithmetic from
   the **published PG&E rate card** (`fixtures/pge-ag-rate-card.json`), loaded by
   `loadRateCard()` (`src/lib/pge/rate-card.ts:20`) and priced by
   `cycleCostUnderPlan` / `priceCycleCents` (`src/lib/energy/rates.ts:157,217`).

The savings = (1) − (2), gated by a **bill-reproduction / back-test check**: the engine
must first prove it can reproduce the farmer's *actual* bill from the rate card within a
tolerance before it is allowed to quote any "switch and save" number.

### The rate card (the published reference the math prices against)
- **File:** `fixtures/pge-ag-rate-card.json` — a committed, dated, versioned fixture
  (`version "2026-06.1"`, `effectiveDate "2026-03-01"`).
- **Provenance is per-value and self-documented** in each plan's `sourceNote`: winter
  energy $/kWh, customer-charge-per-day, and max-demand $/kW are **bill-sourced** from the
  real demo account's 2026-02/03 PG&E prints; summer energy, `partial_peak`, AG-C
  peak-period demand, and the AG-4 figures are **representative placeholders** awaiting the
  official tariff sheet (`pge.com/tariffs` `ELEC_SCHEDS_AG.pdf`, named at
  `fixtures/pge-ag-rate-card.json:2,6`).
- **Loaded + validated** by `loadRateCard()` (`src/lib/pge/rate-card.ts:20`), which throws
  at build/dev time if the card is malformed (every ag family present, both size tiers,
  dated, AG-C carries its Demand Charge Limiter — `rate-card.ts:34-118`).
- **CLAUDE.md law:** *"Never hardcode a $/kW; read dollars from the data."* The only
  hardcoded $/kWh and $/kW in the codebase live in this one dated fixture; the engines read
  it, they do not embed rates.

---

## 2. Finding-by-finding trace

### A. Rate optimization (`rate-optimization`)
- **Function:** `rateOptimization(input)` — `src/lib/energy/rate-compare.ts:160`.
- **Formula:**
  - Bucket the meter's own 15-min intervals into TOU energy + billed peaks per cycle:
    `bucketUsage` → `bucketCycle` (`rate-compare.ts:92,57`).
  - Model the **current** rate cost from the card:
    `modeledCurrentUsd = annualCostUnderRate(profile, currentPlan)` (`rate-compare.ts:185`),
    where `annualCostUnderRate` sums `cycleCostUnderPlan` over the cycles
    (`rates.ts:172,157`): `energy = Σ kWh_period × $/kWh_period + maxDemandKw × $/kW +
    (summer) peakWindowKw × peakDemand$/kW + customerCharge`.
  - **Back-test / reproduction error:**
    `reproductionError = |modeledCurrentUsd − actualAnnualBillUsd| / actualAnnualBillUsd`
    (`rate-compare.ts:186-190`). `actualAnnualBillUsd` is the **sum of the meter's real
    billed totals** (passed in from `run.ts:156`).
  - Price the **same usage** on every eligible alternative; keep the cheapest:
    `usd = annualCostUnderRate(profile, plan)` over `eligibleTargets`
    (`rate-compare.ts:194-198,137`).
  - **Savings:** `savingsUsd = roundUsd(modeledCurrentUsd − best.usd)` (`rate-compare.ts:200`).
- **Inputs + source:** meter `rateSchedule`, `solarKw` (Prisma `Pump`); 15-min
  `UsageInterval` rows; `BillingPeriod` totals; the rate card — all assembled in
  `runEngines` (`src/lib/recommendations/run.ts:146-182`).
- **Honesty gates:**
  - **Bill-reproduction gate:** `withinTolerance = reproductionError ≤ tolerance` (default
    ±10%, `rate-compare.ts:163,191`). Out of tolerance → the rec is **demoted to severity
    `info`** and labeled "rough" rather than `act` (`rate-compare.ts:211-214`). The whole
    module header states the gate is the load-bearing part (`rate-compare.ts:6-8`).
  - **Materiality gate:** `savingsUsd ≥ $200/yr` **and** `≥ 3%` of modeled cost
    (`rate-compare.ts:201-203`); otherwise no recommendation.
  - **Solar exclusion:** solar-paired meters are excluded from this gross-consumption model
    (their NEM economics aren't captured) — `run.ts:166-171,160-164`.
  - **Eligibility:** only same-size-class, agricultural, open (non-legacy), different-family
    targets (`rate-compare.ts:137-148`).
- **LLM involved? NO.** Pure arithmetic over interval rows + the rate card.
  Proof: zero AI imports in `rate-compare.ts`/`rates.ts` (§0 grep); tests
  `rate-compare.test.ts`, `rates.test.ts`.
- **⚠ Trust caveat (verified ground truth):** this lever is only trustworthy with real
  **15-minute interval kWh**. Bill summaries carry no interval kWh, so `intervals.length > 0`
  gates it off (`run.ts:168`). The canonical priced sibling `rateLever`
  (`src/lib/energy/rate-lever.ts`, same back-test discipline, also **zero LLM**) likewise
  refuses to quote without a passing recompute. An AG-C→AG-B "savings" emitted *without*
  intervals would be a sign-ambiguous artifact — the gates exist precisely to suppress it.

### B. Demand-charge exposure (`demand-charge`)
- **Function:** `retrospective(input)` — `src/lib/energy/retrospective.ts:102` (re-tagged to
  `DEMAND_CHARGE_TOOL` in `run.ts:218`).
- **Formula:** for each cycle that paid a demand charge:
  - Infer the meter's **own** $/kW from its bill:
    `rate = effectiveDemandRate(demandChargeUsd, peakKw) = demandChargeUsd / peakKw`
    (`retrospective.ts:111` → `demand.ts:64`). **No rate is hardcoded** — it is read back
    out of the farmer's own bill.
  - Find the day whose 15-min peak is an **outlier** above the rest of the month:
    `isOutlier = top.kw > second.kw × (1 + margin)` (margin 0.1, `retrospective.ts:127-131`).
  - **Avoidable dollars:** `impactUsd = roundUsd((top.kw − second.kw) × rate)`
    (`retrospective.ts:135`).
- **Inputs + source:** `UsageInterval` (daily peaks), `BillingPeriod.demandChargeUsd` +
  `peakKw` + `peakAt` (`run.ts:121-143,206-219`).
- **Honesty gates:** skip cycles with no demand charge (`retrospective.ts:109`); `rate`
  null when no charge/peak → no dollar (`demand.ts:68`); a flat month (no clear outlier)
  surfaces as **`info` with no `impactUsd`** ("this month cost a $X demand charge"), only an
  outlier earns severity `act` + a dollar (`retrospective.ts:142-143`).
- **LLM involved? NO.** Pure. Tests `retrospective.test.ts`, `demand.test.ts`.

### C. Bill audit (`bill-audit`)
- **Function:** `billAudit(input)` — `src/lib/energy/bill-audit.ts:74`.
- **Formula:** for each posted cycle, compare its total against the **median of the meter's
  own other same-season cycles** (`median`, `bill-audit.ts:51`). Flag only when **dollars
  jumped but usage did not**:
  - With a peak: `billRatio = total/medianTotal > 1.25` **and**
    `peakRatio = peakKw/medianPeak ≤ 1.12` → `excessUsd = roundUsd(total − medianTotal)`,
    severity `act` (`bill-audit.ts:95-142`).
  - No-peak (summary-only bills): stricter `> 1.5` threshold, severity `watch`
    (`bill-audit.ts:146-188`).
- **Key honesty property:** it **never re-prices the bill** against the rate card — that
  would only say "our model disagrees with PG&E." It compares the farmer's **own bills to
  each other** (`bill-audit.ts:1-6`). A genuine high-usage month moves the peak too, so it
  is left alone (`bill-audit.ts:108-112`).
- **Inputs + source:** `BillingPeriod.totalBillUsd` + `peakKw`; `card.summerMonths`
  (`run.ts:224-233`).
- **Honesty gates:** `totalBillUsd == null` → un-auditable, skipped (`bill-audit.ts:91`);
  needs ≥ 3 comparators for a stable median (`bill-audit.ts:100,151`).
- **LLM involved? NO.** Pure. Tests `bill-audit.test.ts`.

### D. Solar / NEM (`solar`)
Two generations, both pure:
- **Real farms — `runSolarInsight`** (`src/lib/recommendations/run-solar-insight.ts:62`),
  the sole `SOLAR_TOOL` owner for real farms (`run.ts:235-238`):
  - `nemDemandInsight` (`solar-nem.ts:224`): renders only for NEM-solar **AND** AG-C family
    **AND** reconciled **AND** demand actually owed; everything else returns null — fail
    closed (`solar-nem.ts:224-235`). The demand dollar = sum of **reconciled** line-item
    cents (`run-solar-insight.ts:151`, `solar-nem.ts:231`).
  - **Crucial honesty rule:** the demand dollar lives in `impactNote` **only, never
    `impactUsd`** — it is money *owed*, not money *at stake*, so it never inflates the
    rail's at-risk sum (`run-solar-insight.ts:55-61,172-176,183-188`). The net-metering
    credit is **honest-blank** everywhere (FR10).
  - `demandUncoveredShare` (`solar-nem.ts:276`): a **ratio in [0,1]**, rendered as a
    percentage beside the dollar — *"never a savings claim and never a percentage multiplied
    into a dollar"* (`solar-nem.ts:264-269`).
  - F1/F3/F4/F5/F7 (rate-legibility, aggregation audit, grandfather, aging-array,
    demand-response) are all **non-dollar** signals — `impactNote` only, severity `watch`,
    explicitly "never `impactUsd`" (`run-solar-insight.ts:214-219,308-311,392-398,431-436`).
    F7 demand-response is **honest-blank** because no published DR rate table exists
    (`run-solar-insight.ts:524-561`).
- **Demo/seed farms — `solarNemChecks`** (`src/lib/energy/solar-nem.ts:47`): surfaces the
  worst evening-peak demand charge (read from the bill, `solar-nem.ts:70-71`) + a true-up
  tracking note. Demo-only branch (`run.ts:239`).
- **LLM involved? NO.** Pure (`solar-nem.ts:10`). Tests `solar-nem.test.ts`,
  `run-solar-insight.db.test.ts`.
- **⚠ Ground-truth caveat:** the **P031 / VINES 75HP $62,795.65 true-up** is a real
  zero-credit anomaly (the sibling P038 proves the pattern), but recovery is **$0–$57k and
  CONTINGENT** on the Generation Allocation Summary (the arrays may be oversubscribed =
  zero-sum). The engine treats true-up as honest-blank tracking, never as banked savings —
  consistent with the `impactNote`-only rule above. Never present it as money in hand.

### E. Idle / standby meters
- **No dollar finding is emitted for this category.** The relevant pure logic is
  `classifyMeter` / `meterSignature` (`src/lib/energy/classify.ts:133,67`), which labels a
  meter pump-vs-non_pump from its usage shape (`loadFactor = avgKw / peakKw`,
  `classify.ts:110`) for legibility only. The type comment is explicit: a status flag yields
  **no efficiency number** (`src/lib/recommendations/types.ts:16-18`). An idle/standby meter
  surfaces as a coverage/legibility fact, never a fabricated savings dollar.
- **LLM involved? NO.** Pure scoring arithmetic. Tests `classify.test.ts`.

### F. Cycle / billing timing
- **Functions:** `billingCycleFor`, `closeOnOrAfter`, `daysToClose`
  (`src/lib/energy/billing.ts:50,33,67`) — pure date arithmetic over the PG&E meter-read
  schedule fixture (loaded by `src/lib/pge/schedule.ts`).
- **Output:** *when* a cycle closes (the calendar hook), **carries no dollar**. This is the
  visible hook Batth asked for, not a savings claim.
- **LLM involved? NO.** Tests `billing.test.ts`.

### G. Close-the-loop reconciliation (predicted vs actual)
- **Function:** `reconcile(input)` — `src/lib/energy/reconcile.ts:56`. After a bill posts:
  `realizedAvoidedUsd = baselineDemandChargeUsd − actualDemandChargeUsd` (the real bill
  delta), else the sum of followed predictions (`reconcile.ts:66-70`). All figures from real
  posted bills + the farmer's own followed/not-followed status.
- **LLM involved? NO.** Pure. Tests in the reconcile suite.

---

## 3. The persistence path: where the AI output actually lands

The bill-vision extractor is the **only** AI in the data path, and it produces **data
rows**, not savings:

1. **Split → classify → extract:** each single-page PDF goes to `generateObject` over the
   Vercel AI Gateway with a Claude model (`src/lib/extract/reader.ts:105-145`,
   `gateway.ts:41`). It returns Zod-validated **structured bill fields** (rate name, TOU
   kWh, demand charge cents, SA id, printed total) — `reader.ts:66-90`.
2. **Cent gate (trust):** `reconcileBill` → `reconcilePeriod` marks a period
   **`reconciled`** only if its line items sum to **within one cent** of the printed total
   (`src/lib/energy/reconcile.ts:147,161-170`). A page that captures nothing, or fails the
   sum, is withheld as `needs_review` — **never shown as a wrong number**
   (`reconcile.ts:163-169`). This gate is itself pure arithmetic, no model.
3. **Persist:** the validated, cent-gated numbers are written to `BillingPeriod`
   (`printedTotalCents`, `demandChargeUsd`, line items), `NemPeriod`, and the meter's
   `coverageState` (`src/lib/extract/import.ts:192,301-332,445`). Cheap model first
   (Sonnet), escalate to Opus only on a cent-gate failure — the documented cost lever
   (`import.ts:1-6,38-44`).

The engines in §2 then read these **persisted rows** (`run.ts:88-155`). So the data flow is:

```
bill image --[AI: Claude vision, generateObject]--> structured numbers
           --[deterministic cent gate]--> reconciled BillingPeriod rows in Postgres
           --[deterministic pure energy math vs published rate card]--> savings $
```

The AI converts **image → numbers**. The deterministic engines convert **numbers →
savings**. The two never cross.

---

## 4. Almond is a separate, read-only assistant — not the savings engine

- Almond is a **farm-scoped, read-only** chat tool (`src/lib/almond/tools.ts:50-55`:
  *"Nothing here mutates (Almond is read-only…)"*). Its tools wrap the **same dashboard
  loaders** the UI uses and shape **already-computed** findings (`tools.ts:5-26`).
- It runs `streamText` over the gateway (`src/lib/almond/responder.ts:332`), but its inputs
  are the findings the engines already persisted; it has **no path to mutate `impactUsd`** or
  re-derive a savings number. Dev/CI use a deterministic stub (zero external calls,
  `responder.ts:52-60`).
- The chat route resolves the farm **server-side** from the session and never trusts a
  client-supplied `farmId` (`src/app/api/almond/chat/route.ts:54-114`); the model literally
  cannot read another farm or write a dollar.
- The Almond code-gen export (`skills/codegen-export.ts:184`, `generateText`) is a gated-off
  POC that writes the **HTML/CSS of a PDF** of existing findings; it does not compute
  savings, and it is handed to the model only when a flag + gateway key + sandbox creds + a
  prebuilt snapshot are all present (`skills/codegen-export.ts:16-18`,
  `codegen/flags.ts:8-9`).

If Almond were deleted entirely, every savings dollar in the product would still be computed
exactly the same way.

---

## 5. v1 only displays — nothing runs autonomously

The Recommendation grammar is **shaped for future execution but inert today**. Every
`action` carries `execute: null` in v1; the agentic hook is documented as the "later" path:
- The type contract: *"v1 leaves this absent/null and only displays the action's label"*
  (`src/lib/recommendations/types.ts:69-92`).
- Every emitter sets `execute: null` with the comment "v1 displays only; the agentic OS
  later files the rate change here" (`rate-compare.ts:239-241`, `bill-audit.ts:139`,
  `solar-nem.ts:81,108`, `run-solar-insight.ts:208,254,334,…`).

There is **no agent, no cron, no autonomous executor** wired to any finding. The product
computes and shows; the farmer decides.

---

## 6. VERDICT — answering the founder's exact questions

### (1) "How do we know how much money we are saving?"
We compute it as a **difference of two honest numbers**: what the farmer **actually pays**
(read verbatim from their own PG&E bills — `BillingPeriod` totals/demand charges) minus what
the **same metered usage would cost** on an alternative, priced by deterministic arithmetic
against PG&E's **published agricultural rate card** (`fixtures/pge-ag-rate-card.json`,
sourced to `pge.com/tariffs` `ELEC_SCHEDS_AG.pdf` and the real account's 2026 bill prints).
Before any "switch and save $X" claim, the engine must **reproduce the farmer's real bill**
from the rate card within ±10% (the back-test gate, `rate-compare.ts:186-214`); if it
can't, it refuses the dollar claim or demotes it to "rough." Demand-charge dollars are
priced at the meter's **own** $/kW inferred from its bill (`demand.ts:64`), never a
hardcoded rate. Bill-audit dollars compare the farmer's bills **to each other**, never to a
model. Every formula is in pure functions with colocated unit tests (`*.test.ts`).

### (2) "Who is doing that — is it AI?"
**No. Deterministic code does it.** The dollar math lives entirely in
`src/lib/energy/*` and `src/lib/recommendations/*` — pure, no-network, unit-tested
functions. A grep for any LLM/gateway call across both directories returns **nothing** (§0).
The **only** AI anywhere near the data is **bill-PDF vision extraction**
(`src/lib/extract/reader.ts:109,128`, Claude via the Vercel AI Gateway), which converts a
scanned bill **image into structured numbers** and is hard-gated by a one-cent
reconciliation check before those numbers are trusted (`reconcile.ts:147,161`). That AI
does **not** compute, touch, or estimate a savings dollar. "Almond" is a **separate,
read-only chat assistant** that *reads* the numbers the deterministic engines already
produced — it is not the savings engine.

### (3) "We have no agent set up — how is this happening?"
**Correct — and nothing autonomous is running.** The savings are computed the moment a
farm's bills/intervals are imported, by `runEngines` / `runSolarInsight` calling the pure
math, which **persists** the findings to the `Recommendation` table. The app then simply
**displays** them. Every recommendation's executable hook is `execute: null` in v1
(`types.ts:69-92`; every emitter); the action grammar is *shaped* so a future agent could
file a rate change, but **no agent, cron, or executor is wired to anything**. The numbers
appear because deterministic arithmetic ran over imported bill data — not because an agent
is acting on the farm.

---

## Appendix — file:line index of every dollar-producing function

| Finding | Function | `file:line` | Savings formula core | LLM? |
|---|---|---|---|---|
| Rate optimization | `rateOptimization` | `rate-compare.ts:160` | `modeledCurrentUsd − best.usd`, gated by ±10% back-test | No |
| ↳ pricing | `cycleCostUnderPlan` / `priceCycleCents` | `rates.ts:157,217` | `Σ kWh×$/kWh + kW×$/kW + customer` | No |
| ↳ canonical sibling | `rateLever` | `rate-lever.ts` | same, cents back-test | No |
| Demand charge | `retrospective` | `retrospective.ts:102` | `(top.kw − second.kw) × (demandCharge/peakKw)` | No |
| ↳ rate inference | `effectiveDemandRate` | `demand.ts:64` | `demandChargeUsd / peakKw` | No |
| Bill audit | `billAudit` | `bill-audit.ts:74` | `total − median(own same-season bills)` | No |
| Solar/NEM (real) | `nemDemandInsight` + `runSolarInsight` | `solar-nem.ts:224`, `run-solar-insight.ts:62` | demand cents (note only, never at-risk) | No |
| Solar uncovered share | `demandUncoveredShare` | `solar-nem.ts:276` | `demand/(demand+offsettable)` ratio, no $ | No |
| Solar/NEM (demo) | `solarNemChecks` | `solar-nem.ts:47` | worst evening demand charge (read from bill) | No |
| Idle/standby | `classifyMeter` | `classify.ts:133` | legibility label, **no $** | No |
| Cycle timing | `billingCycleFor` | `billing.ts:50` | dates only, **no $** | No |
| Close-the-loop | `reconcile` | `reconcile.ts:56` | `baseline − actual` demand delta | No |
| Rate card load | `loadRateCard` | `pge/rate-card.ts:20` | reads `fixtures/pge-ag-rate-card.json` | No |
| **Bill vision (ONLY AI)** | `createGatewayReader` | `extract/reader.ts:105` | image → numbers; **no savings $** | **Yes** |
| Cent trust gate | `reconcileBill` | `reconcile.ts:173` | line items within 1¢ of printed total | No |
| Almond (read-only chat) | `createModelResponder` | `almond/responder.ts:314` | reads existing findings; **no savings $** | Yes (read-only) |
