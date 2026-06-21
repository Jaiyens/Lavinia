# Why the "Demand charges" number is real — plain-English methodology

**The lever:** Demand charges. PG&E bills most of Batth's pump and shop meters not just for
*how much* electricity they use, but for the single highest 15-minute spike of power they
draw in a billing cycle — the "max demand," priced in dollars-per-kilowatt ($/kW). One bad
overlap of pumps for fifteen minutes sets the demand charge for the whole month.

**The honest headline for this lever, today:** the **measured** demand-charge exposure on
the one bill we have (account 4699664587-8, the 02/11→03/12/2026 winter cycle) is
**$6,058.73**, and it ties to the penny against the bill's own structured total. The
**recoverable** dollars we can defend today are **$0**. Every recovery path is real but is
gated on data we do not yet have. This document explains both numbers honestly.

---

## (1) HOW we know the dollar number — the exact formula, in words

There are two different dollar numbers in this lever. Keep them separate.

### a. The measured exposure ($6,058.73) — this is arithmetic over the bill we hold

For each of the 23 service agreements (meters) on the bill that paid a peak-demand charge
this cycle, we take the **demand charge PG&E already printed on that meter's line** and add
them up:

> exposure = sum over all metered SAs of ( the demand charge dollars PG&E billed that meter )
> = **$6,058.73**

That is not a model and not an estimate. It is a sum of numbers PG&E itself put on the bill.
We checked it against the bill's own rollup total (`totalDemandCharge_structuredUsd`) and it
matches **exactly**. The exposure is concentrated: three meters are 87.6% of it —

- **P054** (SA 4696826125, AG-C): peak 278.88 kW → **$2,783.22** (effective $9.98/kW)
- **P004** (SA 4698660251, legacy AG-5B): peak 171.52 kW → **$1,409.21**
- **VINES 75HP** (SA 4699664088, AG-C): peak 111.52 kW → **$1,112.97**

The other 20 meters together are $753.33, and 10 of the 23 bill under $5 (standby pumps that
barely register a 15-minute peak).

### b. The per-meter demand rate ($/kW) — we read it back out of the bill, never hardcode it

When the deterministic engine reasons about an individual meter's demand cost, it does **not**
look up a rate from any table. It infers that meter's own effective rate from its own bill:

> $/kW for this meter = ( demand charge dollars on the bill ) ÷ ( the peak kW on the bill )

This is `effectiveDemandRate` in `src/lib/energy/demand.ts:64`. It is why we can quote P054
at $9.98/kW and VINES at $9.98/kW (or, on a specific sub-period line, $24.95/kW) — those
fall out of Batth's actual bill, not an assumption.

### c. The avoidable-spike formula (what a recovery dollar would look like)

The engine's deterministic demand finding (`retrospective` in
`src/lib/energy/retrospective.ts:102`) prices an *avoidable* spike this way:

> avoidable dollars = ( the outlier-day peak kW − the next-highest day's peak kW )
> × ( that meter's own $/kW )

In words: if one freak fifteen-minute spike on one day set the whole month's demand charge,
the recoverable money is the gap between that spike and the meter's normal high day, priced
at the meter's own rate. **We cannot run this formula today** — it requires the day-by-day
15-minute peaks, which a bill summary does not contain. That is exactly why the recoverable
number is $0 right now and not a guess.

### The PG&E rate inputs that matter here

- The **$/kW demand rates are read from Batth's own bill lines** (e.g. AG-C Max-Demand
  $24.95–$26.03/kW this winter; legacy AG-5B $20.54–$21.43/kW). We do not invent them.
- This is a **winter** cycle. PG&E's summer rates (Jun–Sep for AG, May–Oct for legacy AG-4/5)
  are **higher**, and AG-C adds a separate **$29.92/kW Summer Peak-Demand charge (5–8pm)** that
  does **not** apply this winter cycle. So $6,058.73 is a winter **floor**, not an annualized
  number. We are deliberately not multiplying it by 12 or annualizing it — that would be
  dishonest without the summer bills.

---

## (2) WHO computes it — and where AI does and does not touch it

**The dollars are arithmetic, not AI.** The measured $6,058.73 is a deterministic sum over
the bill's structured fields — the same `demandChargeUsd_structured` field the
`src/lib/energy` reconciliation rollup produces. The per-meter rate is
`effectiveDemandRate` (`demand.ts:64`); the avoidable-spike math is `retrospective`
(`retrospective.ts:102`). These are pure, unit-tested functions in `src/lib/energy` with
**no model client, no network, no LLM** — a grep across the entire `src/lib/energy` directory
for any AI/gateway call returns nothing.

**The only place AI touched anything:** reading the bill PDF. A Claude vision model
(`src/lib/extract/reader.ts`) turned the scanned bill **image into structured numbers** —
"this line says demand charge $2,783.22, peak 278.88 kW." That is optical reading, the same
job a human does squinting at a paper bill, and it is hard-gated: a bill's line items must
sum to **within one cent** of the printed total before any number is trusted
(`reconcile.ts`). The AI **never computes, estimates, or touches a savings dollar.** It hands
off verified numbers; deterministic code does every dollar of math from there.

So the chain is: **bill image → (AI vision) → verified numbers → (plain arithmetic) →
$6,058.73.** The AI and the dollar math never cross.

---

## (3) WHY the money is real — the mechanism PG&E would actually honor

The demand charge is **not a Terra interpretation** — it is a line PG&E already charged and
collected. The mechanism is concrete and tariff-defined:

- A demand charge is set by the **single highest 15-minute average power draw** in the
  billing cycle, priced at the schedule's $/kW. On a 278.88 kW meter at ~$9.98/kW effective,
  that one peak cost $2,783.22 this cycle — **real money already paid.**
- The way to **reduce** it is equally real and is how PG&E's own programs are designed to
  work: **demand-response enrollment (PDP / CBP / BIP)** pays growers for committed
  curtailment, and **peak shaving** (not letting two big pumps overlap for that one
  15-minute window) directly lowers the billed peak. Batth already curtails in the 4–9pm
  window; DR programs pay for exactly that behavior. This is the most promising path.
- PG&E honors it because the demand charge is a literal meter reading × a tariff rate. Lower
  the reading, or get paid by a DR program for committing to lower it, and the bill goes
  down. There is no dispute about the mechanism — only about *how many kW* are actually
  shavable, which is the open data question below.

What we are **not** claiming: we are not claiming $6,058.73 is "savings." It is **exposure** —
money PG&E correctly billed. The savings is some shavable slice of it, and we will not put a
dollar on that slice until the data lets us.

---

## (4) WHAT could make it wrong / the confidence

**The measured $6,058.73: high confidence.** It is a sum of PG&E's own printed line items
that reconciles to the penny against the bill's own total. The main way it could mislead is
by being **read as annualized** — it is one winter cycle, and summer rates plus AG-C's
$29.92/kW summer peak charge make the true annual exposure **higher**, not lower. Treat
$6,058.73 as a winter floor for one account, not a yearly number for the whole farm.

**The recovery dollars: deliberately $0, low confidence on any positive figure.** Reasons:

- **We cannot tell a spike from steady load off a bill summary.** P054's 278.88 kW might be
  one big pump running flat-out (nothing to recover — it legitimately belongs on a demand
  schedule, well above the 35 kW AG-C threshold) or two pumps that happened to overlap for
  15 minutes (recoverable). **The bill cannot say which.** Only the 15-minute interval series
  can. So we refuse to print a recovery dollar.
- **DR program value needs program terms we don't have.** Curtailable kW comes from interval
  data; the capacity $/kW comes from the specific PDP/CBP/BIP program, which is not on the
  bill.
- **One flagged data-quality issue.** Three **AG-B** meters (TURKEY-AL7 $49.55, P078 $29.69,
  P058 $0.17) carry a structured demand charge, but AG-B is the energy-only 35+ schedule that
  per the PG&E AG-rate brief has **no demand charge**. TURKEY-AL7's line even uses $13.95/kW,
  the AG-A2 primary rate, not an AG-B rate. This is ~$79 total — either a vision-extraction
  artifact or a genuine PG&E mis-classification. It is **logged for review, never totaled as
  recovery.** If it is real mis-billing it would be a **refund**, not a demand saving.
- **One scope exclusion to avoid double-counting.** VINES 75HP is also the meter carrying the
  $62,795.65 NEM zero-credit true-up anomaly. That is a **separate solar/NEM finding** (its
  recovery is $0–$57k and **contingent** on the Generation Allocation Summary — possibly
  zero-sum if the arrays are oversubscribed, and never to be presented as banked). Here we
  count **only** VINES's demand component ($1,112.97), not the true-up.

---

## (5) WHAT data we still need, and what it unlocks

**We need the 15-minute interval kWh series** (Green Button / Share My Data) for the demand
meters, and the **PG&E demand-response program terms** (PDP / CBP / BIP capacity $/kW). The
bill summary we have carries dollars and a single peak kW per meter — it carries no
interval data.

With intervals, each gated finding becomes a defensible dollar:

- **Spike vs. steady load** resolves: we can finally say whether P054's 278.88 kW peak is one
  pump (no recovery) or coincident overlap (recoverable), and run the avoidable-spike formula
  `(billed peak − achievable peak) × $/kW` for real.
- **Curtailable kW** becomes knowable, which prices DR enrollment:
  `curtailable kW × program $/kW`. The three big meters are 561.92 kW of billed peak — the
  enrollment candidates.
- **The full year** comes into view: summer cycles (with their higher rates and AG-C's
  $29.92/kW peak charge) turn this winter floor into a real annual exposure.

Until then, the honest statement is: **we have measured the exposure precisely; we have not
yet earned the right to quote the recovery.**

---

## (6) Two-sentence script for the grower (operator English)

"PG&E charges you for your single biggest 15-minute power spike on each meter, and last
winter that one number cost you $6,058 on this account — with three pumps making up almost
nine-tenths of it. Pull your 15-minute data and we can tell you which of those spikes is a
real overlap you can shave or get paid to curtail, versus a pump that's just honestly running
hard."

---

*Sources: the deterministic code trace in `00-how-savings-are-computed.md` (section 2.B,
`retrospective` / `effectiveDemandRate`) and the per-meter figures in
`findings-deep-demand-charge.json`. All dollars in this document are deterministic arithmetic
over the bill; the only AI in the pipeline is upstream bill-PDF vision extraction in
`src/lib/extract`.*
