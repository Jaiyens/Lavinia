# Terra Savings Methodology — The Master Document

**The founder's question, answered in full:** *How do we know how much money we are saving
them? Who does it — is it AI? And why will we actually save that money?*

This is the definitive answer. It is grounded in the code trace
([`methodology/00-how-savings-are-computed.md`](./methodology/00-how-savings-are-computed.md)),
the per-lever plain-English explainers
([`methodology/why-*.md`](./methodology/)), and the confirmed findings on Batth Farms.
Every dollar, every function, every `file:line` here is verifiable in the repo.

---

## 1. THE ANSWER IN ONE PAGE

**Savings is deterministic arithmetic, not AI.** Every dollar Terra puts on the board is the
difference between two honest numbers:

> **savings = (what the farmer actually pays today) − (what the same usage would cost on a
> better-but-eligible alternative)**

- **Side 1 — what they pay** is read **verbatim off the farmer's own posted PG&E bills**
  (`BillingPeriod.totalBillUsd`, `demandChargeUsd`, the printed true-up line). Never modeled,
  never invented. The rate card says so in its own header: *"The farmer's ACTUAL cost is always
  read from their own bills, never from this file"* (`fixtures/pge-ag-rate-card.json:1`).
- **Side 2 — the alternative** is computed by **pure, unit-tested functions in
  `src/lib/energy/*`**, pricing the same usage against PG&E's **published agricultural rate
  card** (`fixtures/pge-ag-rate-card.json`, a dated, versioned fixture).

**Who computes it: deterministic code.** A grep for any LLM or gateway call
(`generateText`, `generateObject`, `streamText`, `@ai-sdk`, `anthropic`, `openai`, `gateway`)
across the entire `src/lib/energy` and `src/lib/recommendations` directories returns
**nothing** (`00-how-savings-are-computed.md` §0). Those files import only string copy, the
recommendation grammar, and each other — no model client, no network, no clock, no database,
no filesystem. Every formula is covered by colocated `*.test.ts` unit tests. **If you deleted
every AI in the product and typed the bill numbers in by hand, every savings dollar would come
out identical.**

**Is it AI? Only the eyes are.** The **single** place an LLM appears in the entire savings
pipeline is **bill-PDF vision extraction** (`src/lib/extract/reader.ts:109,128`, a Claude
model via the Vercel AI Gateway). Its one job is **image → numbers**: it reads a scanned bill
photo and returns structured fields (rate name, kWh, demand-charge cents, SA id, printed
total). It **never computes, estimates, or touches a savings dollar.** And before any number
it reads is trusted, a **deterministic one-cent reconciliation gate** (`reconcile.ts:147,161`)
requires the bill's line items to sum to within a penny of the printed total — a page that
fails is withheld as `needs_review`, never shown as a wrong number.

> **AI: bill image → numbers. Deterministic code: numbers → savings. The two never cross.**

**Is there an agent running? No.** Nothing autonomous acts on the farm. Every recommendation
carries `execute: null` in v1 (`types.ts:69-92`; every emitter); the action grammar is
*shaped* so a future agent could file a rate change, but **no agent, cron, or executor is
wired to anything.** The numbers appear the moment a farm's bills are imported, because pure
arithmetic ran — then the app simply **displays** them. "Almond" (the chat assistant) is a
**separate, read-only** tool that *reads* the findings the engines already produced; it has no
path to compute or mutate a dollar.

**The Batth bottom line:**

| | Amount | Status |
|---|---|---|
| **Bankable now** | **~$272/yr** | The bill alone proves it; reversible; zero operational change |
| **Total defensible** | **~$572/yr** | Adds one interval-gated rate move; confirm-before-file |
| Contingent (not banked) | $0–$57k+ | The P031 true-up and other recoveries, gated on missing data |

Everything beyond ~$572 is **opportunity contingent on data we do not yet hold** (15-minute
intervals, the other ~56 account bills, the Generation Allocation Summary) — real, but never
presented as money in hand.

---

## 2. THE PIPELINE — image to dollar, with file:line

The data flows one direction, and the AI / not-AI boundary is a hard wall in the middle:

```
  Excel inventory (183 meters, ~57 accounts, 6 entities)   PG&E bill PDF (account 4699664587-8, ~46 SAs)
            │                                                          │
            │  roster: SA ids, rates, GPM, lat/long,                   │  the scanned image
            │  NEM type, true-up month, entity                         ▼
            │                                          ┌─────────────────────────────────┐
            │                                          │  EXTRACTION  (THE ONLY AI)       │
            │                                          │  src/lib/extract/reader.ts:109   │
            │                                          │  Claude vision via AI Gateway    │
            │                                          │  generateObject → Zod-validated  │
            │                                          │  structured bill fields          │
            │                                          └─────────────────────────────────┘
            │                                                          │  image → numbers
            │                                                          ▼
            │                                          ┌─────────────────────────────────┐
            │                                          │  CENT GATE  (deterministic)      │
            │                                          │  reconcile.ts:147,161-170        │
            │                                          │  line items within 1¢ of total,  │
            │                                          │  else withheld as needs_review   │
            │                                          └─────────────────────────────────┘
            │                                                          │
            ▼                                                          ▼
     ┌──────────────────────────────────────────────────────────────────────────┐
     │  NORMALIZATION → persisted Postgres rows (UtilityAPI-shaped)               │
     │  src/lib/extract/import.ts:192,301-332,445                                 │
     │  BillingPeriod (printedTotalCents, demandChargeUsd), NemPeriod,            │
     │  Pump (rateSchedule, solarKw), coverageState                              │
     └──────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
     ┌──────────────────────────────────────────────────────────────────────────┐
     │  DETERMINISTIC ENGINES  (NO AI — pure, unit-tested, src/lib/energy/*)      │
     │  assembled by runEngines / runSolarInsight  (run.ts:146-182, 235-238)     │
     │  priced against fixtures/pge-ag-rate-card.json via loadRateCard()         │
     │  (pge/rate-card.ts:20)                                                     │
     └──────────────────────────────────────────────────────────────────────────┘
                                          │  numbers → savings $
                                          ▼
     ┌──────────────────────────────────────────────────────────────────────────┐
     │  DOLLAR FINDINGS  → Recommendation rows (execute: null in v1)             │
     │  { situation, action, impactUsd?, severity, status }                      │
     └──────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                          DASHBOARD DISPLAY  (calendar / table / chart)
                          Almond (read-only chat) reads the same rows
```

**The two data sources:**

1. **The Excel master inventory** — Batth's own spreadsheet. **183 meters across ~57 PG&E
   account numbers and ~6 legal entities**, two solar arrays (**840 kW + 1,092 kW = 1,932 kW
   total**, NOT 12,180 kW), NEM2 aggregation, mixed legacy (AG-4/AG-5) and current
   (AG-A1/A2/B/C) rates, with lat/long, GPM, and true-up month on most rows. This is the
   *roster* — it makes the fleet legible but carries no dollars.
2. **The PG&E bill PDF** — currently **one consolidated statement, account `4699664587-8`,
   covering ~46 metered SAs** for the 2026-02-11 → 2026-03-12 winter cycle. This is the
   *dollars* — the actual billed totals, demand charges, and the printed NEM true-up lines.
   The other ~56 accounts' bills are not yet pulled.

**The extraction step (the only AI):** each single-page PDF goes to `generateObject` over the
Vercel AI Gateway with a Claude model (`reader.ts:105-145`, `gateway.ts:41`), returning
Zod-validated structured bill fields (`reader.ts:66-90`). Cheap model first (Sonnet), escalate
to Opus only on a cent-gate failure — the documented cost lever (`import.ts:1-6,38-44`).

**The cent gate (deterministic trust boundary):** `reconcileBill` → `reconcilePeriod` marks a
period `reconciled` only if its line items sum to within **one cent** of the printed total
(`reconcile.ts:147,161-170`). This gate is itself pure arithmetic — no model. It is what makes
the extracted numbers trustworthy enough to compute against.

**Normalization & persistence:** validated, cent-gated numbers are written to `BillingPeriod`,
`NemPeriod`, and the meter's `coverageState` (`import.ts:192,301-332,445`) — the same
UtilityAPI-shaped rows the rest of the app reads.

**The deterministic engines** (`runEngines` / `runSolarInsight`, `run.ts:146-182,235-238`)
read those persisted rows, price the alternatives against the rate card, apply the honesty
gates, and emit `Recommendation` rows. The dashboard then displays them; Almond reads them.

---

## 3. EACH LEVER — formula, who, why real, confidence, data needed

For each category: the exact formula, who computes it (always deterministic code; only the
bill read is AI), why PG&E would honor the money, the confidence, and what data is still
needed. Full derivations are in the per-lever `why-*.md` files.

### A. Rate optimization (`rate-optimization`)
- **Formula:** `savings = modeledCurrentUsd − cheapestEligible.usd`, where each side is
  `Σ (kWh_period × $/kWh_period) + (peakKw × $/kW) + (customerCharge/day × days)` summed over
  the year. Functions: `rateOptimization` (`rate-compare.ts:160`) / `rateLever`
  (`rate-lever.ts`), pricing via `cycleCostUnderPlan` / `priceCycleCents` (`rates.ts:157,217`).
- **Who:** deterministic pure functions in `src/lib/energy`. **NOT AI.** Tests
  `rate-compare.test.ts`, `rates.test.ts`.
- **Why real:** the grower *elects* their rate schedule and PG&E bills whatever schedule the
  meter is on. This is not a model arguing with PG&E — it is the customer's right to choose an
  eligible schedule. The engine only quotes after it **reproduces the farmer's real bill** from
  the rate card within ±10% (the back-test gate, `rate-compare.ts:186-214`); out of tolerance
  → demoted to "rough" `info`, never quoted as `act`. Plus a materiality gate (≥ $200/yr **and**
  ≥ 3%).
- **Confidence: LOW without intervals.** This lever is only trustworthy with real 15-minute
  interval kWh. Bill summaries carry no interval kWh, so `intervals.length > 0` gates it off
  (`run.ts:168`). **An AG-C→AG-B "savings" emitted without intervals is a sign-ambiguous
  artifact** (summer flips the sign) — the `no_usage_basis` guard (`rate-lever.ts:508`)
  deliberately suppresses it. The confirmed Batth winner (the AG-A2→AG-A1 demand-drop, $300/yr,
  one clear meter) is real but `low` confidence pending per-meter interval confirmation. The
  honest sibling lesson: a blanket AG-A2→AG-A1 swap **loses money** on steady-energy meters
  (e.g. 4699664194 loses ~$139/cycle), which is exactly why the engine checks the sign per
  meter and never fleet-swaps.
- **Data needed:** 15-minute interval kWh (proves each meter stays under the 35 kW AG-A1
  eligibility ratchet, prices the energy side, removes sign-ambiguity) + the other ~56 account
  bills + the official `ELEC_SCHEDS_AG.pdf` tariff sheet.

### B. Idle / standby meters (`idle-standby`)
- **Formula:** for a meter at **zero kWh**, the energy and demand terms are $0 on every
  schedule, so savings collapses to the customer-charge differential:
  `annualUsd = (current $/day − AG-A1 $/day) × 365`. AG-C → AG-A1 =
  `($1.43343 − $0.68895) × 365 = $271.74/yr`. AG-B → AG-A1 = `$82.75/yr`.
- **Who:** the rate-comparison path in `src/lib/energy` evaluated at 0 kWh (the customer-charge
  differential). **NOT AI**; the only AI was the bill-PDF vision read in `src/lib/extract`.
  Tests cover the rate math.
- **Why real:** the most defensible lever in the whole analysis — **no operational bet at all.**
  The meter is dead (zero kWh); we change only the rate schedule the dead service sits on. PG&E's
  own tariff prices AG-A1 strictly lower; the re-rate is **reversible** (if the pump comes back,
  re-rate up) and the lower charge lands on the next bill. The proof the meter is truly idle:
  seven Batth meters printed **exactly $43.00** — the bare AG-C customer charge ($1.43343/day ×
  30), matching the rate card to the penny, with no energy or demand line.
- **Confidence: HIGH** on the cleanest case. At zero kWh the formula has no moving parts beyond
  three published daily rates and a multiply by 365 — no interval data, no peak inference, no
  model.
- **Data needed: none** for the confirmed cleanest meter. To extend across the fleet:
  trailing-12-cycle usage (to rule out seasonally-idle pumps that read zero in the snapshot
  month), identity of unlabeled SAs, and PG&E AG-A1 eligibility / minimum-stay confirmation.

### C. Demand charges (`demand-charge`)
- **Formula:** measured exposure = `Σ (demand charge PG&E already printed on each meter)`. The
  per-meter rate is **inferred from the bill, never hardcoded**:
  `$/kW = demandChargeUsd / peakKw` (`effectiveDemandRate`, `demand.ts:64`). The *avoidable*
  spike = `(outlier-day peak kW − next-highest day peak kW) × that meter's own $/kW`
  (`retrospective`, `retrospective.ts:102`).
- **Who:** deterministic pure functions in `src/lib/energy`. **NOT AI.** Tests
  `retrospective.test.ts`, `demand.test.ts`.
- **Why real:** a demand charge is set by the single highest 15-minute power draw in the cycle ×
  the tariff $/kW — a line PG&E already charged and collected. The way to reduce it
  (demand-response enrollment PDP/CBP/BIP, or not letting two pumps overlap for that one window)
  is exactly how PG&E's own programs are designed to work.
- **Confidence: measured exposure HIGH** ($6,058.73 on the Batth winter bill, ties to the penny
  against the bill's own rollup). **Recoverable dollars: deliberately $0.** A bill summary cannot
  tell a spike (recoverable overlap) from steady load (a big pump legitimately running hard) —
  only the 15-minute interval series can, so we refuse to print a recovery dollar. Note: the
  $6,058.73 is a **winter floor**, not annualized (summer rates and AG-C's $29.92/kW summer peak
  charge make the true annual exposure *higher*).
- **Data needed:** 15-minute interval kWh (resolves spike-vs-steady, prices the avoidable
  formula) + the DR program terms (capacity $/kW) to price enrollment.

### D. Bill audit / billing errors (`bill-audit`)
- **Formula:** for each posted cycle, compare its total to the **median of the meter's own other
  same-season cycles**; flag only when **dollars jumped but usage did not** (`billAudit`,
  `bill-audit.ts:74`). For the P027 NEM case: `disputable = trueUpUsd − (importKwh × NBC_rate)`.
- **Who:** deterministic pure functions in `src/lib/energy` (`billAudit`, `summarizeNemMonths` +
  `solarBillFloor` in `solar-nem.ts`). **NOT AI.** Tests `bill-audit.test.ts`,
  `solar-nem.test.ts`.
- **Why real:** this is not a model disagreeing with PG&E — it is the bill disagreeing **with
  itself or with PG&E's own tariff**, which is exactly what a billing dispute corrects. The audit
  **never re-prices the bill against the rate card** (that would only say "our model disagrees
  with PG&E"); it compares the farmer's **own bills to each other**, so a genuine high-usage month
  (peak moves too) is left alone.
- **Confidence: MEDIUM** on the one real dollar (P027's $2,071.66 net-exporter true-up — the
  *direction* is rock-solid from the printed bill, the *exact* recovery is a ceiling pending the
  allocation document). Everything else in this category is **$0 banked**: HAGA2's earlier $795
  claim was **falsified** when the itemized line didn't support it (we killed our own finding);
  the AG-B demand line is $0 until we read the literal bill line (likely an extraction mislabel).
- **Data needed:** the Generation Allocation Summary / Form 79-1202 (pins P027 and the
  contingent VINES case), itemized AG-B bills, and the other ~56 accounts' bills.

### E. Solar / NEM true-ups (`solar`)
- **Formula:** the "did the credit land?" test = `effective $/kWh = trueUpUsd / net kWh`;
  compared to full-retail AG-C energy vs the ~$0.023/kWh NBC floor. Recovery **range**:
  `ceiling = trueUpUsd − (NBC_rate × importKwh)`; **floor = $0** (zero-sum pool). Functions:
  `nemDemandInsight` + `runSolarInsight` (`solar-nem.ts:224`, `run-solar-insight.ts:62`),
  `auditAllocation` (`solar-allocation.ts`).
- **Who:** deterministic pure functions in `src/lib/energy`. **NOT AI.** Tests
  `solar-nem.test.ts`, `run-solar-insight.db.test.ts`. **Crucial honesty rule:** any demand
  dollar lives in `impactNote` **only, never `impactUsd`** — it is money *owed*, not money *at
  stake*, so it never inflates the at-risk rail (`run-solar-insight.ts:55-61`).
- **Why real:** PG&E honors NEM aggregation credit by tariff, and the **same-account sibling P038
  proves the machinery works** — P038 (same account, same AG-C, same "Solar" group) absorbed
  124,117 kWh of import and trued up to **$0.26** (≈ $0.000002/kWh, fully allocated), while P031
  trued up at **$0.3296/kWh — full retail, ~14× the NBC floor — as if it had no solar at all.**
  That contrast isolates P031 as a linkage/enrollment break, not the tariff.
- **Confidence: LOW.** The anomaly is solid; the **recovery is contingent.** If the **1,932 kW**
  of arrays are oversubscribed across the fleet, re-pointing credit to P031 just debits a sibling
  — zero-sum, $0. Carried in the findings as `annualUsd: 0`, **never $57k banked.**
- **Data needed:** the Generation Allocation Summary (the single document that collapses the
  $0–$57k range) + the other accounts' bills (the off-account "Solar"-group siblings answer the
  zero-sum question directly) + 15-minute intervals.

### F. Account / entity / NEMA structure (`structure-nema`)
- **Formula:** one priced anomaly (P031, same as lever E) plus **four un-priced structural flags**
  that are boolean / set-counting checks over the account roster — distinct-entity-per-group,
  distinct-true-up-months, distinct-name-strings (catches the `BATHH`/`BATTH` typo), net-exporter
  flags. Each returns **$0** because its dollar sign is genuinely unknown until more data.
- **Who:** `analyzeFarm`'s structural grouping (plain set-counting) + the pure NEM math. **NOT
  AI.**
- **Why real:** the cross-entity NEMA flags surface real structural defects (6 of 8 solar groups
  span more than one legal entity, violating PG&E's single-customer-of-record rule), but they are
  **sign-ambiguous** — could be recoverable mis-billing, a stale Excel typo, or a structure PG&E
  unwinds and re-bills *higher*.
- **Confidence: LOW on every finding** — structurally certain, dollar-uncertain by design.
- **Data needed:** the Generation Allocation Summary + the other-entity bills + the Form 79-1202
  NEMA roster (to reconcile entity names against PG&E's customer-of-record records).

### G. Billing-cycle / serial-code timing (`cycle-timing`)
- **Formula:** pure date arithmetic only — `billingCycleFor`, `closeOnOrAfter`, `daysToClose`
  (`billing.ts:50,33,67`) over the PG&E meter-read schedule fixture. The one dollar-shaped
  sub-lever (`cycleEdge`) prices avoided demand at the meter's own bill-derived $/kW.
- **Who:** deterministic pure date functions. **NOT AI** (the only AI involvement is the
  bill-vision step that *reads* the single-letter serial code off the bill — a letter, never a
  date or a dollar).
- **Why real for the calendar:** the deliverable is *when* each bill locks, the visible hook
  Batth asked for. It carries **no dollar by design.**
- **Confidence: defensible total $0, HIGH confidence in that $0.** The calendar has no dollar;
  `cycleEdge` can't run on Batth's data (needs intervals the bills lack) and even if it ran it
  would **double-count the demand-charge lever** — counting it here would book the same dollar
  twice.
- **Data needed:** the per-meter serial letter (unlocks the real forward calendar — still $0,
  legibility) and 15-minute intervals (would let the nudge fire, but the dollars stay the demand
  lever's).

### Idle/standby vs. classification (a note)
The classifier (`classifyMeter` / `meterSignature`, `classify.ts:133,67`) labels a meter
pump-vs-non_pump from its usage shape (`loadFactor = avgKw / peakKw`) for **legibility only** —
a status flag yields **no efficiency number** (`types.ts:16-18`). The *dollar* in the
idle/standby lever (B) comes from the customer-charge differential at zero kWh, not from
classification.

---

## 4. THE NUMBERS, RECONCILED

This is the careful accounting — what is banked, what is contingent, and why nothing is
double-counted.

### Bankable now — ~$272/yr
**One confirmed finding, no data gaps, reversible, zero operational change:**

| Finding | Lever | $/yr | Confidence | Why it's bankable |
|---|---|---:|---|---|
| **Idle P072 on AG-C → demote to AG-A1** (reversible) | idle-standby | **$271.74** | **high** | Computed by `rateCompare.ts` at 0 kWh (customer-charge differential). The bill prints exactly $43.00 = the bare AG-C customer charge, matching the rate card to the penny — proof the meter is truly idle. No interval data needed; the only AI was the bill-PDF vision read. |

**Bankable-now total: ~$272/yr.** This is the floor an investor or Batth can verify on the
printed bill today, with the least hedging.

### Total defensible — ~$572/yr
**Adds one interval-gated rate move that is real but carries a "confirm-before-file":**

| Finding | Lever | $/yr | Confidence | The gate |
|---|---|---:|---|---|
| Idle P072 → AG-A1 (above) | idle-standby | $271.74 | high | bankable now |
| **Low-load-factor AG-A2 meter → AG-A1** (drop the max-demand charge); **1 clear winner, blanket swap loses money** | rate-optimization | **$300** | **low** | Computed by `rateOptimization()` (`rate-compare.ts:160`) interval path / `rateLever()` arithmetic — deterministic, NOT AI. Real (one meter paid an $84.55 demand charge on only 92.4 kWh; AG-A1 has no demand charge), but sized down from $75.85/winter-cycle to ~$300/yr to avoid annualizing a single snapshot, and needs interval kWh to confirm the meter stays under the 35 kW eligibility ratchet. |

**Total defensible: ~$572/yr** (~$272 bankable + ~$300 contingent-on-confirmation).

### Why this is NOT double-counted
- The two findings touch **different meters** (idle P072 vs. the low-load-factor AG-A2 meter) and
  **different charge components** (customer charge vs. demand charge). No overlap.
- The cycle-timing lever (G) claims **$0** precisely *because* its only dollar would be a
  demand-charge dollar already owned by lever C — we refuse to book it twice.
- The measured **$6,058.73** demand exposure is **not** in the savings total — it is money PG&E
  correctly billed (*exposure*, not savings); the recoverable slice is gated at $0 until intervals
  arrive.
- The legacy AG-4C/AG-5B/AG-5C solar meters look like ~$6,744/yr of rate savings on paper but the
  engine's legacy-exempt path holds them at **$0** (their noon-6pm TOU window overlaps midday
  solar and is worth far more than the fixed charge until the 2027 legacy lapse). Quoting that
  $6,744 would be a real error; we don't.

### Contingent — real, but never banked
These are honest opportunities that stay **$0 in the savings total** until specific data lands:

| Item | Range | Gated on |
|---|---|---|
| **P031 / VINES 75HP zero-credit true-up** | **$0 – ~$57,500** | The Generation Allocation Summary. A real zero-credit anomaly (effective $0.3296/kWh, full retail, ~14× the NBC floor; sibling P038 proves the arrangement *can* zero out at $0.26). But NEM aggregation is a **zero-sum pool** — if the 1,932 kW of arrays are oversubscribed, crediting P031 just debits a sibling. **Floor = $0. Never present as banked.** |
| P027 net-exporter true-up | ~$2,072 ceiling | Generation Allocation Summary (medium-confidence direction, exact dollar pending) |
| Fleet-wide idle/standby demotions | ~$271.74/yr per demotable AG-C meter | The other ~56 account bills + trailing-12-cycle usage (96 AG-C/HAGC meters in the inventory; only ~12 on the account we hold) |
| Demand-charge recovery / DR enrollment | unpriced | 15-minute intervals + DR program terms |
| AG-B demand-line refund | ~$950/yr ceiling | The itemized bill line (likely an extraction mislabel) |

**The P031 range, stated honestly:** *"a confirmed allocation error worth $0 up to about $57k,
pending PG&E's allocation summary — and if the array is already fully subscribed, it's zero. We
do not call a dollar of it banked until that paper confirms it."*

---

## 5. WHAT IS AI vs NOT — the crisp table

| Step in the pipeline | AI? | What it does | Touches a savings $? |
|---|:---:|---|:---:|
| **Bill-PDF vision extraction** (`extract/reader.ts:109,128`, `generateObject`, Claude) | **YES** | Reads a scanned bill **image → structured numbers** (rate, kWh, demand cents, true-up) | **No** — produces data rows, never a dollar |
| Cent reconciliation gate (`reconcile.ts:147,161`) | No | Verifies line items sum to within 1¢ of printed total | No |
| Normalization / persistence (`extract/import.ts`) | No | Writes validated rows to Postgres | No |
| Rate optimization (`rate-compare.ts:160`, `rate-lever.ts`) | **No** | `modeledCurrent − cheapestEligible`, ±10% back-test gated | **Yes — computes it** |
| Rate pricing (`rates.ts:157,217`) | No | `Σ kWh×$/kWh + kW×$/kW + customer` | Yes |
| Idle/standby (`rateCompare.ts` at 0 kWh) | **No** | customer-charge differential × 365 | **Yes** |
| Demand charge (`retrospective.ts:102`, `demand.ts:64`) | No | `(spike − next) × (demandCharge/peakKw)` | Yes |
| Bill audit (`bill-audit.ts:74`) | No | `total − median(own same-season bills)` | Yes |
| Solar / NEM (`solar-nem.ts:224`, `run-solar-insight.ts:62`) | No | `trueUp − NBC×import`, note-only never at-risk | Yes |
| Structure / NEMA flags (`analyzeFarm`) | No | set-counting over the roster, $0 by design | Yes ($0) |
| Cycle timing (`billing.ts:50`) | No | date arithmetic, no dollar | No |
| Rate card load (`pge/rate-card.ts:20`) | No | reads `fixtures/pge-ag-rate-card.json` | No |
| **Almond** (`almond/responder.ts`, `streamText`) | Yes (read-only) | chats *over* already-computed findings | **No** — cannot mutate a dollar |
| Autonomous executor / agent | — | **does not exist**; every action is `execute: null` | No |

**The one-line summary of the table:** the only AI in the savings pipeline reads the bill image
into numbers and is hard-gated by a one-cent check; **every dollar of savings is computed by
deterministic, unit-tested arithmetic** in `src/lib/energy` against PG&E's published rate card
and the farmer's own bills. No agent runs. Almond only reads.

---

## Provenance footer
Code trace and `file:line` citations from
[`methodology/00-how-savings-are-computed.md`](./methodology/00-how-savings-are-computed.md);
per-lever derivations from [`methodology/why-*.md`](./methodology/). Ground truth: solar arrays
total **1,932 kW** (840 + 1,092); the bill covers account `4699664587-8` (~46 SAs); the Excel
inventory covers **183 meters across ~57 accounts / ~6 entities**. Savings dollars are
deterministic pure functions in `src/lib/energy` (no AI); the only AI is bill-PDF vision
extraction in `src/lib/extract`. Bankable now **~$272/yr**; total defensible **~$572/yr**; the
P031 true-up is **$0–$57k contingent**, never banked.
