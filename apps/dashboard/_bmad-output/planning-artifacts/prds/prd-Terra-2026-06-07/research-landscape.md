# Research Note: PG&E Ag Energy Landscape (discovery grounding)

_Background research run during Discovery, 2026-06-07. Facilitator grounding for the
PRD — not user-authored. Fold relevant facts into the PRD at the Features/levers stage;
keep dollar figures out (read from the bill/feed, never hardcode)._

## 1. PG&E agricultural rate schedules (2025–2026)

- **Current defaults:** AG-A1 / AG-A2 (under 35 kW; low-use vs high-use energy crossover)
  and AG-B / AG-C (35 kW and over; medium vs high use). A1-vs-A2 and B-vs-C is a usage
  (kWh) crossover — high-use variants trade a higher fixed charge for lower per-kWh energy.
- **Size threshold (load-bearing):** on AG-B/AG-C if reported rated capacity ≥ 35 kW, OR
  rated capacity < 35 kW but metered max demand hit ≥ 35 kW in any of the last 12 months.
- **Demand charge:** among the defaults, **only AG-C carries a summer peak demand charge
  ($/kW)**, with a Demand Charge Rate Limiter (caps total $/kWh, ~$0.50/kWh cited).
  AG-A1/A2/B are effectively energy-/TOU-driven. This is the crux of "wrong rate" savings.
- **TOU peak (commonly gotten wrong):** post-2021 ag peak is **5:00–8:00 p.m. every day,
  year-round** (no partial-peak on ag rates). Summer season = June–September. The retired
  12–6pm peak is gone. **This is distinct from the 4–9pm window (that is the PDP/DR event
  window, not the base TOU peak).**
- **Legacy schedules phasing out:** AG-1, AG-4, AG-5, AG-R(A), AG-V → transitioning to
  AG-A1/A2/B/C. Transition began 2021; moves at the March billing cycle with ≥45 days notice.
- **Switching cadence (product constraint):** a customer may change TOU rate plans **up to
  once per 12 months**. A rate-optimization rec therefore has a real annual cadence limit.
- **What drives "wrong rate" savings:** (a) low-utilization pump stuck on demand-charge
  AG-C when an energy rate is cheaper; (b) meter still on legacy AG-4/5 mismatched to its
  run pattern; (c) A1/A2 or B/C high/low-use mismatch past the kWh breakeven; (d) size
  misclassification. Wexus's "~40% on one pump" = reclassification on an outlier meter;
  **10–15% is the credible fleet number.**
- _Uncertain:_ exact $/kW and $/kWh change every rate case and weren't extractable — read
  from the customer's bill/feed.

## 2. Demand-response programs an ag pumper can join

- **PDP (Peak Day Pricing):** optional overlay on the AG TOU rate. 9–15 event days/yr,
  event window **4–9pm, Jun 1–Sep 30**. Summer-rate discount in exchange for event
  surcharge; 12-month bill protection for new enrollees; opt out anytime. Cleanest fit for
  a grower already dark 4–9pm.
- **CBP (Capacity Bidding Program):** aggregator-run, **no minimum load**, ag rates
  eligible, needs interval meter. Monthly capacity payment ($/kW, richest Jul–Sep) + energy
  payment per curtailment. Season May 1–Oct 31; ≤1 event/day, 4-hr max. Best low-friction
  entry for smaller pumpers.
- **BIP (Base Interruptible Program):** **minimum 100 kW** max demand; must be on a demand
  TOU rate. Monthly $/kW incentive; commit to a Firm Service Level; **$6.00/kWh penalty**
  above FSL during events. ≤1 event/day, ≤6 hr, ≤10/month, ≤180 hr/yr. Big clusters only.
- **AgFIT → Hourly Flex Pricing (HFP):** AgFIT folded into PG&E HFP pilot (Nov 1, 2024 –
  Dec 31, 2027). **Flag: as of 3/26/2026 PG&E STOPPED accepting ag technology incentive
  applications — the $8M ag cap is exhausted.** Don't promise the $160/kW automation rebate
  without re-checking reopen status.
- **Stackable:** ADR ($200/kW, requires PDP or CBP), ELRP (voluntary emergency, no penalty).
- _Mapping:_ a grower already dark 4–9pm is the textbook PDP/CBP enrollee (paid for behavior
  they already do). But peak-season almonds running flat-out can't curtail — DR value
  concentrates in shoulder seasons / operations with slack.

## 3. NEM2 aggregation (NEMA) for ag solar

- One system credits multiple metered accounts of the same customer of record on the same
  or contiguous parcels; excess allocated to benefiting meters at end of each billing month.
- **True-up:** standard NEM is 12-month; ag/large-commercial settle energy monthly (credits
  roll forward) with annual reconciliation. Multiple arrays = multiple true-up dates.
- **Load-bearing:** generation credits offset **energy charges only** — NOT demand charges,
  non-bypassable charges (NBCs), the NEMA maintenance fee, or minimum/customer charges.
  Because the AG demand charge is set by the **5–8pm peak** (solar collapsing/gone), **solar
  routinely fails to shave the demand-charge peak.** "Net-zero on energy" can still owe
  substantial demand + NBC monthly — a concrete retrospective finding.
- NBCs apply to every kWh consumed from the grid (low-single-cents/kWh, not creditable).

## 4. Green Button / Share My Data (ESPI) + Bayou

- **ESPI feed contains:** interval usage (15-min where available, TOU indicators), billing
  records / billing & meter-read dates, and — per PG&E — rate schedule and voltage class.
  Delivered as ESPI XML over RESTful APIs (NAESB ESPI).
- **Does NOT reliably contain bill PDFs:** ESPI 4.0 (Dec 2023) added optional bill-image
  support, but availability depends on PG&E + third-party implementing 4.0 — treat bill PDFs
  as not dependably in the feed (the bill-photo/vision fallback stays justified). The
  rate-schedule field is listed but its reliability/granularity is unverified per-export —
  keep the bill-scan cross-check.
- **PG&E enforces mandatory MFA on all meters** — pushes toward authorized Share My Data /
  aggregator flows over credential scraping.
- **Bayou:** returns bill + interval data (15-min best case), consumption/demand/net/
  generation, JSON/CSV, ~2 min after connect; ~71% US coverage; handles MFA.
- **CORRECTION to the saved "one account per login" assumption:** Bayou's July 2023 release
  added support for **multiple utility account numbers and meters under a single login**.
  The documented one-account limit appears outdated per Bayou's changelog — BUT a verified
  live PG&E test may still have returned a single account (PG&E-side scoping). **Re-verify
  against the live flow; keep spreadsheet / Green Button upload as the safe fallback for
  57-account / multi-entity farms like Batth either way.**

## 5. Competitive landscape (beyond Wexus)

- **Wexus** — closest competitor; whole-farm bill management, per-meter rate analysis,
  demand-charge/peak tracking, YoY trends, equipment disaggregation. Markets "10%+ annual
  savings." The bar to beat on simplicity and price.
- **AgMonitor (formerly PowWow Energy)** — hardware-free, ML-based; RanchMonitor does the
  overlapping energy work (manage solar/NEMA ROI, optimize legacy→new rate transition,
  irrigate off-peak). The most direct functional overlap with the energy thesis.
- **Polaris Energy Services** — services/automation aggregator; enrolls growers in DR/
  automation incentives, installs hardware, manages enrollment→payment. Owns the DR-
  enrollment relationship Terra would otherwise refer out.
- **Utility-bill audit firms** (e.g. National Utilities Refund) — manual, retrospective,
  contingency-fee overcharge audits. The analog incumbent Terra's "legible + retrospective"
  software automates and makes continuous.
- **SGMA water-energy** — no dominant rate-optimization tool; adjacency, not head-to-head.
- **Synthesis:** none lead with a radically simple, calendar-first,
  retrospective-before-predictive surface for a low-software-literacy owner — that is the
  differentiation. Moats to respect: AgMonitor's RanchMonitor (solar/NEMA + rate-transition)
  and Wexus's rate-analysis brand.

## Flags carried into discovery
1. **5–8pm (TOU rate peak) vs 4–9pm (PDP/DR event window)** — keep distinct in copy and math.
2. **Bayou multi-account** — docs now claim multi-account/login since 2023; reconcile with
   the live PG&E test before committing "spreadsheet-only for multi-account."
3. **HFP ag automation incentive is currently CLOSED** (cap hit 3/2026); pricing pilot runs
   to 2027. Don't promise the rebate without re-checking.
4. **One rate switch per meter per 12 months** is a real product constraint on rate recs.
