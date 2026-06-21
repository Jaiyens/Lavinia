# Batth Farms Pilot — Decision Document (CORRECTED)

**This supersedes the auto-generated `REPORT.md`.** Same underlying data and analysis; this version fixes
three things a sharp farmer or his accountant would have caught, and re-aligns the story to our own product
strategy (`apps/dashboard/CLAUDE.md`).

**What changed from the auto-draft, and why:**
1. **Removed a double-count.** The draft booked the P031 NEM anomaly *twice* — once as "$41k re-allocate array
   credit" and once as "$22k P031's own generation" — and summed them ($63,792). They are the **same meter, same
   anomaly, two competing theories.** You cannot bank both. Corrected below to a single ranged figure.
2. **Corrected the array size.** The draft said "12,180 kW array fleet" (it misread the Excel's `1092kw`/`840kw`
   *group labels* as per-meter nameplates). The real number, confirmed by our own `CLAUDE.md`, is **two arrays,
   840 kW + 1,092 kW = 1,932 kW total.** This matters: 1.9 MW against this pump load means the arrays are likely
   **oversubscribed**, so re-pointing credit to P031 may be zero-sum. Never tell Batth he has 12 MW of solar.
3. **Separated "bankable now" from "investigate."** The big number ($62,796) is an *anomaly to investigate*,
   not a *saving we can promise*. Conflating them is the fastest way to lose credibility in the room.

---

## 1. THE DECISION — data strategy

**Do not spend $3,000. You already own the demo.** The full **183-meter farm map** (178 with lat/long) and the
**per-meter monthly dollars** come free from two files you already have:
- the **183-meter Excel** (ingests via `parseInventory`), and
- the **one PG&E bill PDF** you already extracted and reconciled to the cent (`$86,942.12`, 39 reconciled periods,
  in `fixtures/extract/batth-account-4699664587.json`).

Both pipelines already exist and already ran. **No UtilityAPI call is needed to put Batth's entire priced
operation on one screen.** The ~$2,568 quote that scared you was for the wrong product (bulk/ongoing sync). The
right product is a **one-time historical pull at $12/meter, first collection free.**

**UtilityAPI is surgical:** buy 15-minute interval data only where an hour-by-hour curve is the *only* thing that
converts a claim into proof. **Recommended spend: $60 (five meters). Reserve: $40.** (Budget treated as the
$100 demo cap you set; even the full $465 wouldn't change the recommendation — the bottleneck is *which* meters
are worth interval data, not money.)

---

## 2. WHAT'S HONESTLY ON THE TABLE

Split into what we can **bank now** (no external documents, low-risk, reversible) and what we can **investigate**
(big, but contingent on a PG&E document we don't yet have). **Lead the demo with legibility + the catch; quote the
bankable number; frame the big number as an investigation.**

### A. Bankable now — conservative, reversible: ~$5,000–$8,000/yr
| Fix | Annual $ | Risk | Source |
|---|--:|---|---|
| **Demote 6 idle AGC meters → AG-A1** (drop the $43.58/mo high-use customer charge + demand exposure to $20.95/mo). Reversible. | **~$1,629** | low | idle-standby |
| **Bill-audit disputes** with PG&E (no operational change): P027 is a **net exporter (−22,906 kWh/yr) yet billed a $2,461 NEM true-up** (~$2,072 disputable); two AG-A2 meters billed demand at **~$22/kW vs $13.45/kW** on same-rate peers (~$795). | **~$2,867** | low | bill-audit |
| **Two genuinely-small pumps stranded on AG-C → AG-A1** (survived the trailing-12-month eligibility objection). | **~$543** | low | rate-arbitrage |
| **Billing error to flag**: two HAGB (AG-B) meters carry a **demand-charge line, but Schedule AG-B has no demand charge.** Real error; not yet dollarized — quantify and dispute. | TBD | low | bill-audit |
| *Optional, less reversible:* close ~14 truly-dead non-NEM services (vs just demoting). Full upside if all closed. | up to ~$5,244 | med (meter removal is ~permanent) | idle-standby |

**Banked headline number for the room: ~$5k/yr of safe, reversible fixes**, up to ~$8–10k if dead services are
closed. Small, but *certain* — and it earns the right to make the big claim.

### B. The investigation — the "wow," NOT a banked saving
**P031 / VINES IRR 75HP (SA 4699664088): a $62,795.65 annual true-up at an effective $0.330/kWh — full retail,
≈14× the non-bypassable-charge floor — meaning this NEM-enrolled pump received essentially *zero* solar credit.**

- **The proof it's a real defect (airtight):** its near-identical sibling **P038**, in the *same* "Solar"/NEMEXPM
  bucket with a *larger* net import (124,117 kWh) and zero exports, owes **$0.26**. The allocation machinery works
  for P038 and not for P031 → an enrollment/linkage break on one SA, not a broken array.
- **The honest caveat (say it before he does):** the arrays total **1,932 kW (~2.9–3.7M kWh/yr)**, and the pump
  load is far larger, so the arrays are likely **oversubscribed**. If so, re-pointing credit to P031 is **zero-sum**
  across the farm. **Recoverable = $0 to ~$57k**, decided entirely by **one document: the Generation Allocation
  Summary / Form 79-1202 roster.** If P031 is absent/0% while the arrangement has headroom (or it was wrongly
  dropped mid-year), it's real recovery; if the arrays are fully subscribed, it's a reallocation, not a windfall.
- **The action costs nothing:** pull that one document. Plus **5 more off-account pumps** (P074, P026, P033, P083,
  P034) carry the identical orphan signature — a portfolio-wide NEM audit, bill-gated.

**How to say it:** *"Your VINES pump paid a $62,796 true-up at full price while the identical pump next to it paid
26 cents. We found it on page 89 of a bill you'd never read. One document tells us how much of it comes back —
that's the first thing we'd pull."* That is the "we see what you don't" moment, told honestly.

> **Do NOT present the portfolio structural findings ($120k "fragmented arrays", $30k "cross-entity eligibility",
> $12k "true-up misalignment") as dollar claims.** They're low-confidence, partly built on the 12,180 kW misread,
> and need every account's bills + Allocation Summaries. Mention them as *"a portfolio-wide NEM audit is the
> biggest structural opportunity, sized after we see the other accounts."*

### C. The headline lever — rate optimization (needs interval data)
Your `CLAUDE.md` ranks **rate optimization #1** (~40% on one pump, zero operational change). Honestly, **our engine
cannot produce a rate-optimization number yet** — it needs an interval-derived load profile and an honesty gate
that reproduces posted bills; our fixture has no intervals. *(An engineering pass is re-checking whether the
fixed rate-label parsing unlocks anything from bill-summary data alone — result folded in below when ready.)*
**This is the cleanest justification for the $60 spend:** interval data on the biggest-spend meters is exactly
what turns the #1 lever from "pending" into a dollar figure.

### D. Demand charges — reframe, do NOT lead with staggering
The latest cycle alone carried **$5,939.40 in demand charges across 23 meters** (engine-verified, matches the
bills) — annualized and summer-weighted, the farm's largest controllable charge category. **But per our own
`CLAUDE.md`: do NOT lead with coincident-peak staggering** — it doesn't help peak-season almonds running flat-out
off-peak. Reframe demand as **(1) rate optimization** (move demand-charged meters to no-demand rates where the
trailing-12-month peak allows) and **(2) demand-response enrollment** (PDP/CBP/BIP pay for the 4–9pm curtailment
he already does). Keep the staggering code; demote it in the pitch.

---

## 3. THE $60 UTILITYAPI PLAN (reframed around the #1 lever)

Per-meter historical/interval pull = **$12** (first free). **Spend $60 on five meters. Hold $40.** Purpose is to
unlock **rate optimization** and verify **NEM credit** — not to prove staggering.

| Buy | Meter | What the interval pull unlocks |
|---|---|---|
| 1 | **P054** — biggest-spend pump (278.88 kW, $2,783/mo demand, 31,828 kWh/mo) | The **rate-optimization model** on the highest-dollar meter (the #1 lever) + whether its peak is rate-shiftable. |
| 2 | **P004** — 171.52 kW, net export −16,060 kWh, $0 true-up | Verifies its export is **actually credited** (the NEM credit check) and feeds the rate model. |
| 3 | **P031 / VINES 75HP** — the $62,796 true-up | Shows the load shape behind the headline anomaly; pairs with the Allocation Summary to make the credit gap undeniable. |
| 4 | **ELKHORN-18 SHOP** — 1,924 kWh, 173 kWh on-peak | A *different* category: real on-peak load to TOU-shift (a shop, not a flat-out pump). |
| 5 | **PUMP #55** — tiny/flat load | Confirms the AG-C → AG-A1 demotion is safe (the one rate finding flagged needs-interval). |

**Reserve $40** because UtilityAPI bills per *successfully collected* meter (pulls can come back partial), and it
funds 2–3 adjacent pulls if the data warrants. Don't spend the whole budget — the dead-meter and bill-audit
findings need zero interval data.

---

## 4. WHAT IS BUILT (code-ready; not yet rendered — DB is down)

- **Fixture:** `fixtures/batth-real-meters.json` (186 meters; 46 with real bill summaries, rest map/metadata-only;
  `intervals: []`). In worktree `wf_814e52aa-a50-39`, uncommitted.
- **Engine harness:** `scripts/analyze-batth-real.ts` — runs the pure energy engines over the fixture.
- **Engine-verified output:** demand-charge engine = **$5,939.40 across 23 cycles** (matches the bills exactly);
  bill-audit = honest $0 (one cycle each, below its 3-comparator minimum); rate-optimization = $0 *(label-parse
  fix + interval-gating under re-check)*.
- **Local Postgres is DOWN (`localhost:5432` closed)**, so I did **not** seed/render the dashboard — to render the
  186-pin map + findings, start your DB and run `npm run db:seed`. Everything else (pure engines, typecheck) is
  verified without a DB.

---

## 5. TUESDAY DEMO SCRIPT (corrected, product-aligned)

1. **Open on the whole farm, mapped and priced.** 178 pins from the Excel, every meter's dollars from the one bill
   — *"$86,942 last month across 46 billed meters; here's your entire operation on one screen."* This is the
   **legibility** win (our #1 principle) and it cost nothing.
2. **The catch.** P031 vs P038: *"$62,796 versus 26 cents on two identical pumps. We read page 89 so you don't
   have to. One document tells us how much comes back."* — framed as the anomaly we'd investigate first.
3. **The quick wins.** *"~$5–8k of fixes we can start today — idle meters on the wrong rate, a demand charge billed
   on a rate that has none, a net-exporter charged a true-up."* Certain money earns the big claim.
4. **The lever + the ask.** *"Your biggest lever is rate optimization. That needs your 15-minute data — which is the
   $60 we'd spend to turn these from findings into PG&E-grade proof. $40 stays in reserve."* The plan is the close.

---

## 6. RISKS / WHAT WE DID NOT VERIFY

- **P031 recovery may be zero-sum** if the 1,932 kW arrays are oversubscribed. Number is $0–$57k pending the
  Generation Allocation Summary / Form 79-1202. Present as "we'll find out," never "we've recovered it."
- **Rate optimization produces no number without interval data.** The #1 lever is currently the least-quantified —
  that's the whole point of the $60 spend. Don't claim a rate-opt dollar figure on Tuesday.
- **Demand charges:** lead with rate-opt + DR enrollment, not staggering (per `CLAUDE.md`).
- **Closing dead services is ~permanent** — get a PG&E reconnection quote first; reconnection/line-extension can
  dwarf the saved customer charge. Demoting rates is the safe, reversible move.
- **Single-cycle bill data.** Bill-audit needs ≥3 comparators (correctly no-op'd); demand backbone is the latest
  cycle annualized. A 12-month pull firms this up.
- **DB down → not yet rendered.** Verify the map + findings actually render before the demo machine is set.
- **3 billed meters absent from the 183-meter inventory; 5 inventory meters lack lat/long** — minor map gaps.
- **Deliverables uncommitted** in worktree `wf_814e52aa-a50-39`; main checkout is clean. Commit/copy before setup.

---

## 7. THE NUMBERS, RECONCILED (no double-counts)

| Bucket | Figure | Status |
|---|--:|---|
| Account printed total (one cycle) | $86,942.12 | fact (reconciled) |
| Demand charges, latest cycle, 23 meters | $5,939.40 | engine-verified |
| NEM true-ups, 11 meters | $83,338.49 | fact (from bills) |
| **Bankable now (safe/reversible)** | **~$5,000/yr** | defended |
| Bankable if dead services closed | up to ~$8–10k/yr | less reversible |
| **P031 NEM anomaly (investigate)** | **$0–$57k/yr** | needs Allocation Summary |
| Rate optimization (the #1 lever) | pending | needs interval data ($60 spend) |
| Portfolio NEM structural audit | unsized | needs other accounts' bills |

*Counted once each. The P031 anomaly is NOT added to the bankable total — it's a separate, contingent line.*
