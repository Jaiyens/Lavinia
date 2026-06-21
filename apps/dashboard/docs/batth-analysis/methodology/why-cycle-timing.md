# Why the Billing-Cycle / Serial-Code Timing Lever — Plain-English Methodology

**Lever 5 in CLAUDE.md.** This is the calendar hook Batth asked for: a month grid showing
*when* each meter's bill locks in. Read this before you explain it to Batth or to an investor,
because the honest headline is unusual for a "savings" lever:

> **The defensible dollar total for this lever is $0.** It is legibility infrastructure — a
> calendar — not a savings engine. The one dollar-shaped sub-lever inside it cannot run on the
> data we have, and if it could, it would double-count the demand-charge lever. Anyone who
> quotes a cycle-timing savings number is wrong.

That honesty is the product. Below is exactly why, structured as the six questions a founder
needs answered.

---

## (1) HOW do we know the dollar number — the formula and the rate inputs

There are two things this lever computes, and only one of them has a dollar in it.

**The calendar (the actual deliverable) — no dollar by design.**
The forward billing-cycle grid is pure date arithmetic. In plain words: each PG&E meter prints
a single-letter **serial / cycle code** (B through Z) in its Service Information block. That
letter maps, via PG&E's published 2026 meter-read schedule, to the day each month the meter is
read and the cycle closes. The engine looks up that close date, sets the cycle window as "the
day after the prior read" through "the next read," and counts the days until close. The
equations are:

- `close = closeOnOrAfter(readDates, today)` — the next read/close on or after today
- `{start, close} = billingCycleFor(readDates, today)` — the open window
- `days = daysToClose(close, today)` — how many days until this bill locks

**There is no dollar term in any of these.** A calendar tells the grower *when* a bill locks,
not how to make it smaller. That is the entire point — it is the visible hook, not a saving.

**The one dollar-shaped sub-lever (`cycleEdge`) — the "hold your sets" nudge.**
This is the only part of the lever that can emit a number. The formula, in plain words: if a
demand-charged meter is within 3 days of its cycle close **and** its running peak so far this
cycle is well below its usual peak (under 80%), it could still avoid setting a fresh demand
spike before the meter reads. The avoided dollars would be:

```
avoidableKw = typicalPeakKw − cycleToDatePeakKw
impactUsd   = roundUsd(avoidableKw × rateUsdPerKw)
```

The rate input is **not a PG&E rate-card number and is never hardcoded.** It is the meter's
**own** $/kW, inferred from that meter's own bill:
`rateUsdPerKw = demandChargeUsd ÷ peakKw` (the `effectiveDemandRate`). So if a meter was
charged $1,112.97 of demand on a 111.52 kW peak, its own rate is $9.98/kW, read straight back
out of its bill.

**But on the Batth data this formula evaluates to $0 for every one of the 46 metered SAs**
(see section 4 for why), so there is no real dollar to report.

---

## (2) WHO computes it — deterministic functions, NOT AI

Every number and every date in this lever is produced by **deterministic, pure, unit-tested
functions**. There is no AI anywhere in the calculation.

| What | Function | File | AI? |
|---|---|---|---|
| Cycle close lookup | `cycleClose`, `nextCycleClose`, `isKnownSerial` | `src/lib/pge/schedule.ts` | No |
| Window + days-to-close | `closeOnOrAfter`, `billingCycleFor`, `daysToClose` | `src/lib/energy/billing.ts` | No |
| The "hold your sets" dollar | `cycleEdge` → `pumpTimingDraft`, `roundUsd` | `src/lib/energy/cycle-edge.ts`, `recommend.ts` | No |
| The meter's own $/kW | `effectiveDemandRate` | `src/lib/energy/demand.ts` | No |

These files import only each other and the meter-read schedule fixture
(`fixtures/pge-meter-read-schedule.json`). Grep them for any LLM or gateway call
(`generateText`, `generateObject`, `@ai-sdk`, `anthropic`, `gateway`) and you get **nothing**.
No model, no network, no clock-of-its-own — date math against a published table.

**This is arithmetic, not AI. Say it plainly to Batth.**

The **only** place AI touches this lever at all is one narrow READ step: bill-PDF vision
extraction (`src/lib/extract`, Claude via the Vercel AI Gateway) is what *reads the serial
letter off the photographed bill*, the same way it reads the rate name and the demand charge.
It turns an image into the letter "P018." It does not compute a date and it does not compute a
dollar. Once that letter is captured, the deterministic schedule lookup does all the work.

---

## (3) WHY the money would be real — the mechanism PG&E honors

For the **calendar itself there is no money to honor** — it is legibility, and that is fine.

For the **`cycleEdge` nudge**, the underlying mechanism is genuinely real and is the same one
PG&E already honors today: a PG&E demand charge bills the **single highest 15-minute peak in
the cycle**, times $/kW. If a meter is a day from closing the cycle and has not yet set a high
peak, then *not* setting a fresh spike in those last hours genuinely keeps the billed peak —
and the demand charge — lower. PG&E bills exactly that maximum, so the saving is mechanically
real.

The catch, and the reason this lever claims $0, is that **this is the very same demand-charge
dollar already counted in the demand-charge lever.** The demand-charge findings already
annualize each meter's peak exposure (P054 $19,483/yr, P004 $11,274/yr, P031 $7,791/yr
conservative). The cycle-edge nudge is just *one tactic, on one cycle, for avoiding that same
peak.* Counting it here too would book the same dollar twice. So the mechanism is real, but the
dollar belongs to a different lever, and this lever honestly claims none of it.

---

## (4) WHAT could make it wrong / the confidence

Confidence that the **defensible total is $0: high.** Three independent reasons, each
sufficient on its own:

1. **The calendar carries no dollar by design.** A date cannot be "wrong by $X."

2. **`cycleEdge` has no valid input on the Batth data.** It needs `cycleToDatePeakKw` (the
   running 15-minute peak so far this cycle) and `typicalPeakKw` (a historical 15-minute
   reference). Both come **only** from 15-minute interval data. The Batth bills are summaries —
   one end-of-cycle peak per meter, no interval series. With no intervals,
   `avoidableKw = typicalPeakKw − cycleToDatePeakKw` is unevaluable, so the function returns an
   empty array and `impactUsd = $0` for every meter. (Illustratively only, never as a claim: if
   intervals existed and P031 closed in 2 days having set ~20 kW vs its ~111 kW typical, at its
   own $9.98/kW the avoided fresh spike would be roughly (111−20) × 9.98 ≈ $908 for that one
   cycle, once — and that is the same demand dollar already booked under the demand lever.)

3. **Double-counting and CLAUDE.md demotion.** Even with intervals, the dollar is the
   demand-charge lever's. And CLAUDE.md explicitly demotes this timing/staggering class ("keep
   any staggering code but demote it") and forbids real-time spike promises ("Planner, not live
   meter"). It is a watch-list nudge, not a banked annual saving.

A fourth, quieter failure mode: the forward calendar **cannot even be populated per-meter
today.** The cycle-close lookup needs the single-letter serial code, and that field is absent
from the extracted Batth data — the meter records carry the service ID and the physical meter
serial number (e.g. 1010259637), not the cycle letter. With the serial null, `isKnownSerial` is
false for all 46 meters, and the engine correctly places **no scheduled mark** rather than
fabricating a date. (As a further wrinkle, all 46 SAs on this one consolidated statement share
the identical window 2026-02-11 → 2026-03-12, so the bill alone gives no spread of distinct
closes.)

So the failure mode of this lever is the safe one: it shows nothing rather than a wrong number.

---

## (5) WHAT data we still need, and what it unlocks

Two distinct missing inputs, two distinct unlocks — and neither turns this into a dollar lever:

- **The per-meter serial / cycle letter** (the "needs: other" gap). The AI vision step in
  `src/lib/extract` would read the single letter off each bill's Service Information block into
  a `Pump.billingSerial` field. **Unlocks:** the real per-meter forward calendar — Batth's home
  screen showing each of 183 meters' distinct cycle-close on a month grid. This is the headline
  hook, and it is still $0 — it is legibility, not a saving.

- **15-minute interval kWh** (the "needs: interval" gap). Bill summaries carry none. **Unlocks:**
  the `cycleEdge` "hold your sets" nudge could actually fire on the right meters near close
  (P054, P004, P031). Even then, the dollars it surfaces are demand-charge dollars and must not
  be added on top of the demand lever — so it remains a $0 *category* contribution, just a more
  actionable nudge.

One real calendar datum we *do* have: **`trueUpMonth`** is set on 14 of the solar meters in the
inventory (December ×6 including P031/P038, May ×3, January ×2, plus July/August/October). That
is the one genuine billing-cycle-timing fact in the Batth data and the correct anchor for the
calendar's solar rows. But the dollars of any true-up belong to the solar/NEM lever (and the
P031 headline is contingent $0–$57k, never banked) — not to cycle timing.

---

## (6) The 2-sentence script for the grower

> "This screen is your bill calendar: it shows the exact day each of your meters reads and its
> charges lock in for the month, so nothing ever surprises you. It does not by itself save you
> money — it is the map that makes the rate, demand, and solar savings on your other meters
> easy to see and act on in time."

---

## Summary

The billing-cycle / serial-code timing lever is honest legibility, not a dollar engine: its
deliverable is a forward calendar showing *when* each meter's bill closes, computed by
deterministic pure date arithmetic (`src/lib/energy/billing.ts` + `src/lib/pge/schedule.ts`
over the published PG&E meter-read schedule fixture) with **no AI** — the only AI involvement is
the bill-vision step that would READ the single-letter serial code off the photographed bill,
which produces a letter, never a date or a dollar. The lone dollar-shaped sub-lever (`cycleEdge`,
the "hold your sets" near-close nudge) prices avoided demand at the meter's **own** bill-derived
$/kW (`demandChargeUsd ÷ peakKw`, never hardcoded), but it cannot run on Batth's data because it
needs 15-minute intervals the bill summaries lack, and even if it ran it would double-count the
demand-charge lever — so the defensible category total is **$0** with high confidence. What we
still need is the per-meter serial letter (unlocks the real forward calendar, still $0
legibility) and 15-minute intervals (would let the nudge fire, but the dollars stay the demand
lever's), with `trueUpMonth` on 14 solar meters being the one genuine timing datum already in
hand — anchored to the solar/NEM lever, not this one.
