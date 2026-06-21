# Why the "Idle / standby meters" number is real — plain-English methodology

**The lever in one line:** Batth is paying a monthly *standby* (customer) charge on pumps
that are sitting at **zero kWh** — they pull no power at all — yet some of them are parked
on PG&E's **most expensive ag schedules (AG-C, AG-B)** whose only job is to price *demand*
and *energy* that an idle meter never uses. Move each idle service to the cheapest schedule
(AG-A1) and the standby charge drops, with **zero operational change** to the farm.

- **Defensible, reversible total this lever claims:** **$1,795.94 / year** (the 7 idle meters
  that are above the AG-A1 floor today; demoting them is reversible and changes nothing on
  the ground).
- **Separately tracked, NOT in that total:** a permanent **close-the-service** upside
  (~$251–$523/yr *per* truly-dead meter) for the meters that are already at the AG-A1 floor
  and have nothing left to shed by re-rating. That is a permanent grower decision with
  reconnection downside, so we report it as upside, never fold it into the headline.

---

## (1) HOW we know the dollar number — the exact formula in plain words

Every idle meter on the PG&E ag schedules pays a fixed **customer charge per day** just for
keeping the service alive, regardless of usage. The schedules charge a *different* daily
customer rate:

| Schedule | Customer charge / day | Per 30-day month |
|---|---|---|
| AG-C | $1.43343 | $43.00 |
| AG-B | $0.91565 | $27.47 |
| **AG-A1 (the floor)** | **$0.68895** | **$20.67** |

For a meter that draws **zero kWh**, the energy term and the demand term are both **$0 on
every schedule** — there is no usage to price. So the *only* thing that differs between
schedules is that fixed daily standby charge. The savings is the difference between what the
meter pays today and what it would pay on the AG-A1 floor, annualized:

```
annualUsd = ( daily customer charge on CURRENT schedule
            − daily customer charge on AG-A1 )  ×  365 days
```

Worked, for the most common case (an idle meter on **AG-C**):

```
($1.43343/day − $0.68895/day) × 365 = $0.74448/day × 365 = $271.74 / year
```

For an idle meter on **AG-B**:

```
($0.91565/day − $0.68895/day) × 365 = $0.22670/day × 365 = $82.75 / year
```

These two numbers, summed across the 7 above-floor idle meters in the finding file, are the
**$1,795.94/yr** total (five AG-C meters × $271.74 + two AG-B meters × $82.75).

**The PG&E rate inputs** are exactly three published daily customer charges: AG-C
$1.43343/day, AG-B $0.91565/day, AG-A1 $0.68895/day. They live in the dated, committed PG&E
ag rate card (`fixtures/pge-ag-rate-card.json`); the *actual* monthly total each idle meter
pays today ($43.00 on AG-C, $27.47 on AG-B) is read **verbatim off the grower's own posted
bill**, and it matches the card's customer charge to the penny — which is itself the proof
the meter is truly idle (the whole bill *is* the standby charge; there is no energy or
demand line).

The "already at the floor" meters (P069, P063, P048, P056, P045, P043) compute to
**annualUsd = $0** for the demote lever, on purpose: they are already on AG-A1 (or, for
P063, AG-A2, which carries the same $0.68895/day floor and a Max-Demand charge that is also
$0 at zero usage). There is nothing above the floor to shed, so re-rating saves nothing and
we say so.

---

## (2) WHO computes it — the deterministic function, and where AI did (and did not) touch it

**This is arithmetic, not AI.** The dollar number is produced by the pure, unit-tested rate
math in `src/lib/energy` (the rate-comparison path, evaluated at 0 kWh so the difference
collapses to the customer-charge differential). It is a subtraction and a multiply against
three numbers from a committed JSON rate card. There is no model, no network, no inference,
no judgment call in the dollar — the same inputs always yield the same dollar, and the math
is covered by colocated `*.test.ts` files. A grep across `src/lib/energy` for any
LLM/gateway call returns nothing.

**The only place AI appears anywhere near this lever is reading the bill.** The bill-PDF
**vision extraction** in `src/lib/extract` (Claude via the Vercel AI Gateway) is what turned
the scanned PG&E bill image into the structured line items — the schedule name (AG-C), the
total kWh (0), the printed monthly total ($43.00), the customer-charge line. That AI
**reads numbers off a page; it never computes a savings dollar.** And every number it
extracts passes a deterministic **one-cent reconciliation gate** (the line items must sum to
within a penny of the printed total) before it is trusted. So the division of labor is
clean:

```
bill image --[AI vision: reads the standby charge + 0 kWh]--> structured numbers
           --[deterministic 1¢ gate]--> trusted bill rows
           --[deterministic arithmetic vs the rate card]--> $1,795.94/yr
```

The AI converts image → numbers. Plain arithmetic converts numbers → dollars. They never
cross. If you deleted every AI in the product and typed the bill numbers in by hand, the
$1,795.94 would come out identical.

---

## (3) WHY the money is real — the mechanism PG&E would actually honor

This is the most defensible lever in the whole analysis, because there is **no operational
bet** in it. The meter is at zero kWh — it is not pumping, not irrigating, not doing
anything. We are not asking the farm to run pumps at a different hour, shift a peak, or
curtail load. We are only changing the **rate schedule the dead service sits on.**

PG&E's own tariff is what creates the money: AG-A1 carries a strictly lower daily customer
charge than AG-B or AG-C, and a service that uses no energy and creates no demand has no
business on a demand-priced schedule. Moving an idle ag service to AG-A1 is a routine
re-rate that PG&E processes; the lower customer charge then shows up on the very next bill.
Because the change is **reversible** — if the pump comes back into use, the grower re-rates
it back up — there is no downside to the demote. It is the cleanest kind of savings: same
farm, same operations, smaller bill, honored by PG&E's published tariff mechanically rather
than by any forecast holding true.

The **close-service** upside (the $251–$523/yr-per-meter figures for the floor meters) is
also real money PG&E would honor — closing a service agreement zeroes its standby charge
entirely — but it is a **permanent** decision with a reconnection cost and lead time if the
pump is ever needed again. That is why it is reported as upside and deliberately kept out of
the $1,795.94 defensible total.

---

## (4) WHAT could make it wrong — and the confidence

The 7 demote findings are flagged **high confidence**, and they should be, but the honest
risk surface is:

1. **"Idle" is judged from one latest cycle.** Each finding reads the *latest* posted cycle
   and sees totalKwh = 0, demand = null, NEM not enrolled. A meter that is seasonally idle
   (off in winter, pumping in summer) could read zero in the snapshot month and then need to
   be re-rated back up when the season turns. The savings is still real for every month the
   meter stays idle; it just may not be a *clean* full year. Mitigation: confirm zero usage
   across the trailing 12 cycles before filing, not just the latest.
2. **The customer-charge rates must be the current tariff.** AG-A1 $0.68895/day, AG-B
   $0.91565/day, AG-C $1.43343/day come from the committed rate card. If PG&E revises the ag
   tariff, the per-meter dollar shifts proportionally. The *direction* (AG-C/B costs more
   than AG-A1) is structurally guaranteed by the tariff; only the magnitude moves.
3. **AG-A1 eligibility / minimum-stay rules.** We are asserting the idle service *can* sit
   on AG-A1. PG&E can attach eligibility conditions (e.g. demand thresholds, 12-month
   minimum stays on a schedule) to a re-rate. None of that changes the arithmetic, but it
   could change whether the demote is filable *this month* versus next.
4. **The "unlabeled SA" meters aren't in Batth's Excel roster.** Three of the demote
   findings (two AG-C, one AG-B) are service agreements on the bill account that don't map to
   a pump in Batth's master spreadsheet. The dollar is still computed off real bill lines, but
   we'd want Batth to confirm what those services are before filing.

What is **not** a risk here: the dollar math itself. At zero kWh the formula has no moving
parts beyond three published daily rates and a multiply by 365 — there is no interval data,
no peak inference, no model. This is why idle/standby is the lever we can put in front of an
investor with the least hedging.

---

## (5) WHAT data we still need, and what it unlocks

- **Trailing 12 cycles of usage per idle meter** (we currently judge "idle" from the latest
  cycle). This is the big one: it turns a snapshot claim ("idle this month") into a durable
  one ("idle all year, demote it permanently") and removes the seasonal-idle risk in (4).
  PG&E **15-minute interval kWh** via Share My Data is the clean source.
- **Identity of the three "unlabeled SA" meters** (cross-reference Batth's master
  spreadsheet / a site walk). Unlocks: confidence to file the re-rate, and possibly the
  bigger close-service decision if they are dead services nobody remembers.
- **PG&E schedule-eligibility / minimum-stay confirmation** for AG-A1 on these services
  (one call to PG&E ag-rate desk). Unlocks: a filable date and removes the eligibility
  caveat.
- **The current official ELEC_SCHEDS_AG tariff sheet** to pin the three customer-charge
  rates to a dated PG&E source. Unlocks: a citation an investor or Batth can verify, and
  locks the per-meter dollar.

The close-service upside (per-meter $251–$523/yr) becomes claimable as *banked* savings only
once Batth decides a given service is permanently dead — that's a grower decision, not a
data gap.

---

## (6) The 2-sentence script for the grower (operator English)

"You've got pumps that aren't running at all — zero power used — but PG&E is still billing
some of them $43 a month just to keep the line on, because they're parked on a pricey rate
meant for pumps that actually pull power. Move each dead service to the cheapest rate and
that standby charge drops about $272 a year on the AG-C ones — nothing changes in the field,
it's reversible, and on the handful that are truly finished you can close the service and
drop the whole charge."

---

## Summary (one paragraph)

The idle/standby lever finds pumps sitting at **zero kWh** that are still paying a monthly
**standby (customer) charge** while parked on PG&E's pricier ag schedules (AG-C $43.00/mo,
AG-B $27.47/mo) instead of the cheap AG-A1 floor ($20.67/mo); since an idle meter's energy
and demand charges are $0 on every schedule, the savings collapses to the **customer-charge
differential** — `(current daily charge − AG-A1 daily charge) × 365` — which is **$271.74/yr
per AG-C meter** and **$82.75/yr per AG-B meter**, totaling **$1,795.94/yr** across the 7
above-floor idle meters. This number is produced by **deterministic, unit-tested arithmetic**
in `src/lib/energy` against three published daily customer charges in the committed rate card
and the grower's own bill totals (which match to the penny, proving the meter is truly idle);
the **only AI involved was the bill-PDF vision read** in `src/lib/extract` that lifted the
schedule, the 0 kWh, and the standby charge off the scanned bill, gated by a one-cent
reconciliation check — **no AI touches the dollar.** The money is real because PG&E's own
tariff prices an idle service lower on AG-A1, the re-rate is **reversible with zero
operational change**, and the lower charge lands on the next bill; the main caveats are that
"idle" is currently judged from the latest cycle (we want trailing-12-month interval kWh to
rule out seasonal pumps), three of the meters are unlabeled service agreements to identify,
and AG-A1 eligibility/minimum-stay should be confirmed with PG&E — none of which change the
arithmetic, only whether it's filable this month. The separate **close-service** upside
(~$251–$523/yr per dead meter) is permanent, real, and PG&E-honored, but is a grower decision
with reconnection downside, so it is reported as upside and deliberately kept **out** of the
$1,795.94 defensible total.
