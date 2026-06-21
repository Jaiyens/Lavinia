# Why Rate Optimization Is the #1 Lever — Plain-English Methodology

**The lever in one line:** Some of Batth's 183 meters are sitting on the wrong PG&E rate
schedule. Moving a meter to the right schedule lowers the bill with **zero change to how the
farm runs** — same pumps, same hours, same gallons. That is why it is #1: it is found money
that costs the grower nothing operationally.

**The honest headline number from the data we hold today:** **$843.48/yr** defensible, on the
one account we have bills for. Everything above that is **opportunity, not banked** — it
unlocks only when we get interval data and the rest of the account bills. This document
explains exactly how we got to that number and why we trust it (and where we don't).

---

## (1) HOW do we know the dollar number — the formula in plain words

A rate-optimization saving is always a **difference between two costs**:

> **savings = (what this meter costs on its current PG&E schedule) − (what the SAME usage would
> cost on the cheapest schedule it's eligible for)**

Both sides are computed the same way — by adding up the parts of a PG&E agricultural bill:

> **cycle cost = (kWh used in each time-of-use period × that period's $/kWh)
> + (the meter's billed peak kW × the schedule's $/kW demand charge)
> + (the fixed customer charge, $/day × days in the cycle)**

(In code: `cycleCostUnderPlan` / `priceCycleCents` in `src/lib/energy/rates.ts`, summed over
a year by `annualCostUnderRate`.)

### The PG&E rate inputs (where the $/kWh and $/day come from)
All the rate numbers live in **one committed, dated file**:
`fixtures/pge-ag-rate-card.json` (version `2026-06.1`). The engine **reads** rates from this
card; it never hard-codes a rate in the math. The two kinds of values on the card:

- **Bill-sourced (high confidence):** the customer charges and demand $/kW that we read
  straight off Batth's real 2026-02/03 PG&E prints. These are the ones doing the work in the
  $843.48 number below.
- **Placeholder (awaiting the official tariff sheet):** summer energy $/kWh, partial-peak,
  and some AG-C/AG-4 figures, flagged in the card's `sourceNote`, pending PG&E's
  `ELEC_SCHEDS_AG.pdf` from pge.com/tariffs.

### Worked example — the cleanest dollars we have
The defensible $843.48 is two pieces:

1. **$543.48/yr — two small idle AG-C pumps demoted to AG-A1 (customer-charge only).**
   On account 4699664587-8, seven AG-C meters printed **exactly $43.00** for the cycle — that
   is the bare AG-C customer charge ($1.43343/day × 30 days), zero kWh, zero kW. AG-A1's
   customer charge is **$0.68895/day**. So the per-meter saving is purely the fixed-charge
   gap:
   > (\$1.43343 − \$0.68895) × 365 = **\$271.74/yr per meter**.
   Only two of them (PUMP #55, 250 GPM, and P072, 300 GPM) are small enough to plausibly stay
   under 35 kW all year and actually qualify for AG-A1 → **2 × $271.74 = $543.48**.

2. **$300/yr — one low-load-factor AG-A2 meter moved to AG-A1 (drop the demand charge).**
   Meter 4699664794 paid an **$84.55 demand charge on only 92.4 kWh**. AG-A1 has no demand
   charge but slightly higher energy. The trade:
   > AG-A1 extra energy = 92.4 kWh × (\$0.31060 − \$0.21642) = **\$8.70**
   > AG-A1 saving = \$84.55 demand − \$8.70 energy = **\$75.85 this winter cycle** → sized down
   > to ~**\$300/yr** to avoid annualizing a single snapshot.

That same math, run on a *steady-energy* AG-A2 meter, shows a **loss** (e.g. 4699664194 would
lose ~$139/cycle because its 2,392 kWh of higher energy swamps the demand it saves). That is
why we do **not** blanket-switch — the engine checks the sign per meter.

---

## (2) WHO computes it — deterministic function, "this is arithmetic, not AI"

**A pure, unit-tested function does the math. There is no AI in the savings number.**

- The dollars come from **`rateLever()` / `rateOptimization()`** in
  `src/lib/energy/rate-lever.ts` and `src/lib/energy/rate-compare.ts`, which call the pricing
  function `priceCycleCents` in `src/lib/energy/rates.ts`.
- These files import only strings and each other — **no model client, no network, no
  randomness, no clock**. A grep for any LLM/gateway call across the entire `src/lib/energy`
  directory returns **nothing**. The math is the same every time you run it, and it is covered
  by colocated unit tests (`rate-compare.test.ts`, `rates.test.ts`).

**Where AI touched this — and only this:** the *only* AI anywhere near rate optimization is
**bill-PDF vision extraction** (`src/lib/extract/reader.ts`, Claude via the Vercel AI
Gateway). It does one job: **read a scanned bill image and turn it into structured numbers**
(rate name, kWh, demand-charge cents, printed total). It never computes a saving. And before
any extracted number is trusted, a **deterministic one-cent check** must confirm the bill's
line items add up to within a penny of the printed total — otherwise the page is withheld for
review, never shown as a wrong number. So the division of labor is clean:

> **AI: bill image → numbers. Deterministic code: numbers → savings.** They never cross.

There is also no agent running. The number appears because pure arithmetic ran over imported
bill data — not because anything autonomous is acting on the farm.

---

## (3) WHY the money is real — the mechanism PG&E would actually honor

The saving is real because **the grower elects their rate schedule, and PG&E bills whatever
schedule the meter is on.** This is not a model arguing with PG&E — it is the customer's
**right to choose an eligible schedule**:

- A pump that is **idle or tiny** is paying the **high-use AG-C** fixed customer charge
  ($1.43343/day) for nothing. AG-A1 ($0.68895/day) bills the identical zero usage for less.
  Same meter, same (zero) operation, lower bill. PG&E honors the election; nothing about the
  farm changes.
- A **low-load-factor** meter (big demand spikes, few kWh) is paying a demand charge it could
  drop by electing a no-demand-charge schedule. PG&E's own tariff offers both; the customer
  picks.

Critically, the engine only quotes the saving after it can **reproduce the farmer's real bill
from the rate card** within a tolerance (the back-test gate). The clearest proof we have:
AG-C $1.43343/day × 30 days = **$43.00**, which is the *exact printed total* on seven of
Batth's meters. When our model of the current bill matches PG&E's actual bill to the dollar,
the difference we quote against the alternative schedule is trustworthy.

---

## (4) WHAT could make it wrong — the confidence, honestly

The defensible $843.48 is real on the bills we hold. The reasons the **bigger** numbers are
held back (and why even the small ones carry a "confirm first"):

- **No interval kWh = energy is modeled as zero.** Bill summaries carry totals, not the
  15-minute interval kWh the rate math needs to price energy across time-of-use periods. On a
  single idle winter cycle the engine literally can't see the energy side, so an
  AG-C→AG-B style "saving" it might emit is a **sign-ambiguous artifact** ("summer flips it") —
  the `no_usage_basis` guard (`rate-lever.ts:508`) deliberately **suppresses** it. We are not
  hiding savings; we are refusing to quote a number we can't stand behind.
- **The 35 kW eligibility ratchet is unobservable without intervals.** AG-A1 is only available
  if the meter stays under 35 kW; **one month ≥ 35 kW disqualifies it for a year**. Eight of
  the ten idle AG-C candidates are large transmission-voltage pumps (P077 at 1,400 GPM, P075
  at 1,000, P041/P038 at 1,300) that almost certainly exceed 35 kW in summer. That is exactly
  why only the two genuinely small pumps count toward the defensible floor.
- **Legacy solar rates must NOT be moved — and the engine knows it.** Nine meters on legacy
  AG-4C/AG-5B/AG-5C carry the highest fixed charges on the farm (e.g. AG-5C at $1,937.68/yr).
  A naive switch looks like $6,744/yr of savings. **Act value = $0** until the 2027 legacy
  lapse, because their noon-6pm TOU window overlaps midday solar and is worth far more than the
  fixed charge. The engine's legacy-exempt path holds them. Quoting that $6,744 would be a real
  error; we explicitly don't.
- **AG-A2 → AG-A1 cuts both ways.** It saves on low-load-factor meters and **loses** on
  steady-energy meters. The $300 is one confirmed winner, not a fleet swap.

**Confidence summary:** $843.48 = medium-to-high (bill-reproduced, but pending per-meter
interval confirmation of <35 kW). Everything above it (toward a ~$2,717 on-account ceiling and
the ~87 off-account meters) = **opportunity, contingent on data**, not banked.

---

## (5) WHAT data we still need, and what it unlocks

| Data we need | What it unlocks | Roughly how much |
|---|---|---|
| **15-minute interval kWh** (trailing 12 months, per meter) | Prices the energy side, proves each meter stays <35 kW, removes the sign-ambiguity, lets us quote AG-A1/AG-A2/AG-B switches honestly | Turns the remaining on-account ~$2,174 of opportunity into defensible dollars where the meter qualifies |
| **The other ~45 account bills** (we hold 1 of ~57) | The 183-meter inventory has 96 AG-C/HAGC meters; only ~12 are on the account we have. The other ~87 likely hold the same stranded-customer-charge arbitrage | If the on-account ratio holds, ~$271.74/yr per demotable meter in customer charge alone, plus dropped demand exposure |
| **The official PG&E AG tariff sheet** (`ELEC_SCHEDS_AG.pdf`) | Replaces the placeholder summer-energy and AG-C/AG-4 figures on the rate card with confirmed numbers | Hardens confidence on every switch that touches summer energy |
| **The Generation Allocation Summary** (solar) | Separate lever, but relevant: tells us whether the P031/P038 true-up anomaly is recoverable or zero-sum | Not a rate-optimization dollar; do not bank it here |

The pattern is consistent: **bills make a meter legible; intervals make a switch trustworthy.**

---

## (6) The 2-sentence script for Batth (operator English)

> "Some of your pumps are parked on PG&E's high-use rate even though they barely run, so
> you're paying a bigger monthly fixed charge than you have to — moving each one to the right
> schedule is a pen-stroke at PG&E, nothing changes about how you pump, and on the two we're
> sure about it's about $543 a year back in your pocket, plus another $300 on a pump getting
> hit with a demand charge it doesn't need. We're being careful and only counting the ones the
> bill already proves; once you give us the 15-minute meter data, we can check every pump
> against the 35-kW cutoff and likely turn up a lot more across your other accounts."

---

### One-line provenance footer
Numbers from `findings-deep-rate-optimization.json`; mechanism and code citations from
`00-how-savings-are-computed.md`. Math: `rateLever`/`rateOptimization` in `src/lib/energy`
(deterministic, unit-tested, **no AI**). Rates: `fixtures/pge-ag-rate-card.json`. The only AI
in the pipeline is bill-PDF vision extraction in `src/lib/extract`, which reads the bill and
never computes a dollar.
