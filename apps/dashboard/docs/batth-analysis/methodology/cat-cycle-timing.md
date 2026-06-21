# Category Deep-Dive: Billing-Cycle / Serial-Code Timing

**Lever 5 in `apps/dashboard/CLAUDE.md`'s honest priority list:** *"Billing-cycle timing
(the serial-code calendar). Real at the margins; the visible hook Batth asked for."*

**One-line verdict:** This is a **legibility / calendar lever, not a savings engine.** Its
core functions carry **no dollar by design**, the one dollar-shaped sub-lever needs 15-minute
interval data the bills do not contain (and would double-count the demand-charge category if
it ever fired), and the per-meter serial code that would populate the forward calendar is
**not present in the extracted Batth data at all**. The defensible dollar total for this
category is **$0**.

---

## 1. What this lever actually is

A PG&E meter does not close its billing cycle on a calendar month boundary. It closes on a
**scheduled meter-read date**, and that date is keyed to a **serial / cycle code** printed in
the bill's "Service Information" block (the single letters B..Z on the real 2026 PG&E table).
Each code maps to 12 monthly read dates for the year. Three operationally useful facts fall
out of that mapping:

1. **When each pump's bill "locks in"** — the next scheduled read on or after today. This is
   the home-screen *Calendar* view CLAUDE.md describes: "each meter's billing-cycle close on a
   month grid ... the hook Batth asked for. Graspable in seconds."
2. **What window the current cycle covers** — `(day after prior read) -> next read`. Needed to
   know which days a fresh peak or a usage spike will be billed against.
3. **The cycle *edge*** — because a demand charge is set by the single highest 15-minute spike
   in the *whole* cycle, a fresh peak set in the last days of a cycle is paid for across the
   entire month while only "benefiting" those last few days. If a cycle is about to close and
   the pump has kept its peak low, holding a deferrable irrigation set until the new cycle
   opens lands the unavoidable spike at the *start* of the next cycle instead of the *edge* of
   this one. That is the only place a *dollar* could attach to cycle timing.

The serial code is **distinct from** the Rotating Outage Block (a PSPS code like "14A") that
shares the same Service Information block; only the serial letter drives cycle-close, and the
engine is explicitly built to reject outage-block-shaped codes (`src/lib/pge/schedule.ts`
`isKnownSerial` / `cycleClose` return `null`, never a guess).

---

## 2. The exact engine that prices it (deterministic arithmetic, NOT AI)

Every function below is a **pure, unit-tested deterministic function** in `src/lib/energy` /
`src/lib/pge`. A grep for any LLM/gateway call across `billing.ts`, `cycle-edge.ts`, and
`pge/schedule.ts` returns **nothing** — confirmed live. There is **no AI** anywhere in this
category. (The only AI in the whole product is bill-PDF vision extraction in
`src/lib/extract`, which turns a bill image into structured numbers and never computes a
dollar; it is what *would* read the serial letter off the bill in the first place — see §4.)

| Function | `file` | What it computes | Carries a $? |
|---|---|---|---|
| `cycleClose(serial, month, year, schedule)` | `src/lib/pge/schedule.ts` | scheduled read date for a serial code in a statement month; `null` for unknown serial / outage-block code / bad month/year | **No** |
| `nextCycleClose(serial, fromIso, schedule)` | `src/lib/pge/schedule.ts` | next scheduled close on/after a date | **No** |
| `closeOnOrAfter(readDates, ref)` | `src/lib/energy/billing.ts` | next read date >= ref (the close you are heading toward) | **No** |
| `billingCycleFor(readDates, ref)` | `src/lib/energy/billing.ts` | the `{start, close}` window containing `ref` | **No** |
| `daysToClose(close, ref)` | `src/lib/energy/billing.ts` | whole days until close ("how many days until this bill locks in") | **No** |
| `closeDateForSerial` / `billingCycleForSerial` | `src/lib/pge/schedule-load.ts`, `src/lib/greenbutton/schedule.ts` | fs loaders that wrap the pure math over `fixtures/pge-meter-read-schedule.json` | **No** |
| **`cycleEdge(inputs[])`** | `src/lib/energy/cycle-edge.ts` | the **only** dollar-producing function in the category | **Yes — but interval-gated** |

**The `cycleEdge` dollar formula (the one priced equation in this category):**

```
days        = daysToClose(cycleClose, asOf)                       // pure date math
fire only if 0 <= days <= daysWindow (default 3)                  // near the cycle edge
fire only if cycleToDatePeakKw < typicalPeakKw * highPeakFraction // (default 0.8) no big peak yet
avoidableKw = typicalPeakKw - cycleToDatePeakKw
impactUsd   = roundUsd(avoidableKw * rateUsdPerKw)                // rateUsdPerKw = the meter's OWN $/kW
```

`rateUsdPerKw` is never hardcoded — it is the `effectiveDemandRate` read back out of the
meter's own bill (`demandChargeUsd / peakKw`), per the CLAUDE.md law "Never hardcode a $/kW;
read dollars from the data." The severity is `watch` (a hold-your-sets nudge), not `act`.

**Why this is honest, and why it nets to $0 here:**

- `cycleEdge` needs **`cycleToDatePeakKw` and `typicalPeakKw`** — i.e., the *running* 15-minute
  peak this cycle and the pump's *typical* 15-minute peak. Those come **only from 15-minute
  interval data**. The Batth bill summaries carry a single end-of-cycle `peakKw` per cycle and
  **no interval series**, so `cycleEdge` has no valid input and emits nothing. (This is the
  same interval-data dependency that gates the whole demand-charge family — see
  `findings-demand-charge-exposure.json`.)
- Even with intervals, `cycleEdge` is a **demand-charge-timing micro-lever** — it shaves the
  *fresh demand charge* a late-cycle spike would set. That is the **same demand-charge dollar**
  already enumerated (and conservatively annualized) in the demand-charge category. Counting it
  here would **double-count**. CLAUDE.md is explicit that this timing/staggering class of lever
  is to be **demoted**, not led with: "Do NOT lead with coincident-peak staggering ... Keep any
  staggering code but demote it." `cycleEdge` is the same family.
- It is also a **real-time-ish operational nudge** ("hold deferrable sets for 3 days"), which
  collides with CLAUDE.md's "Planner, not live meter ... No real-time spike promises." It is a
  watch-list hint, not a banked annual saving.

---

## 3. Per-meter enumeration over the real Batth data (the arithmetic, honestly)

The data we have is one consolidated PG&E statement for account **4699664587-8**
(`normalized/billing.json`): 46 metered SAs, statement date 2026-03-26, all billing the
**identical** cycle window **2026-02-11 -> 2026-03-12** (a 29-day WINTER cycle). The Excel
inventory (`normalized/inventory.json`, 183 meters across ~57 accounts / ~6 entities) carries
`trueUpMonth` for 14 solar meters but **no serial / cycle code**.

### 3a. Can we even populate the forward calendar (the hook) per-meter? No.

The calendar hook needs the **serial letter** as input to `cycleClose()`. Grepping the source
billing JSON (`batth-real-billing.json`) and the inventory JSON for any serial / cycle-code /
rotating-outage / read-date field returns **nothing**. The meter records carry `serviceId` and
`meterSerial` (the physical meter *number*, e.g. `1010259637`) — **not** the single-letter
billing cycle code. So today:

- `isKnownSerial(serialCode=null, schedule)` -> **false** for every meter -> no scheduled mark
  can be placed. The engine correctly produces **no fabricated date**.
- The 46 SAs on this statement all share **one** printed window `2026-02-11 -> 2026-03-12`
  (one consolidated bill), so there is not even a spread of distinct closes to draw on the
  grid from the bill alone.

**Dollars from the calendar hook itself: $0.** A calendar is legibility; it does not move a
charge. This is the lever's entire intended value ("the visible hook"), and it is correctly a
zero-dollar feature.

### 3b. The `cycleClose` (statement close) vs cycle-window discipline (still $0)

The data does demonstrate the AR-14 "never conflate scheduled vs actual close" rule that this
engine is built around. Two SAs carry multiple cycles, where the cycle *window* close and the
*statement* close differ:

- **P031 / VINES IRR 75HP / SA 4699664088 (AGC, NEMEXP)** — 4 cycles on this bill:
  `2025-12-11` (true-up cycle, statement-closed 2026-03-26), `2025-12-12 -> 2026-01-11`,
  `2026-01-12 -> 2026-02-10`, `2026-02-11 -> 2026-03-12`. The window close (`close`) and the
  statement close (`cycleClose`) are deliberately separate fields. Peaks climb 2.08 -> 3.36 ->
  3.20 -> **111.52 kW**; demand $1.78 -> $31.03 -> $83.30 -> **$1,112.97**.
- **P038 / SA 4699664743 (AGC, NEMEXPM)** — 4 cycles, the sibling true-up proof meter.

This is exactly the conflation the schedule engine is designed to avoid, and it is **pure
legibility** — knowing *which* close a charge belongs to. **No dollar attaches.** (The
$1,112.97 demand charge on P031's latest cycle and its CONTINGENT NEMEXP true-up are owned by
the **demand-charge** and **solar-NEM** categories respectively, not here.)

### 3c. The `cycleEdge` dollar lever, applied per-meter (every meter -> $0, gated)

`cycleEdge` is the only function that *could* emit a dollar. Walking the gate for every meter
on the bill:

| Gate | Result on the Batth bill |
|---|---|
| `cycleToDatePeakKw` (running 15-min peak this cycle) available? | **No** for all 46 meters — bills carry no interval series |
| `typicalPeakKw` (historical 15-min reference) available? | **No** for all 46 meters — same reason |
| `daysToClose` computable? | Only if a serial-keyed `cycleClose` exists; serial is **absent** (§3a) |

So for **every meter**, `cycleEdge` receives no valid input and the function returns an empty
array. The honest per-meter arithmetic is the same in all 46 cases:

```
cycleEdge(input) with cycleToDatePeakKw = <unknown>, typicalPeakKw = <unknown>
  -> cannot evaluate avoidableKw = typicalPeakKw - cycleToDatePeakKw
  -> emits nothing
  => impactUsd = $0   (for P031, P038, P054, P004, and all others)
```

Worked illustration of *what it would compute if interval data existed* (NOT a claim, just to
show the equation is real and small): suppose P031's cycle closes in 2 days, its typical
15-min peak is ~111 kW, it has so far only set ~20 kW this cycle, and its own bill-derived rate
is the AG-C base `$1,112.97 / 111.52 kW = $9.98/kW`. Then a single avoided fresh spike that
cycle would be `(111 - 20) kW * $9.98/kW = ~$908` **for that one cycle, once** — and it is the
*same* demand dollar the demand-charge category already annualizes. It is a one-cycle timing
nudge, not an incremental annual saving, and it requires the grower to *not need* that pump for
3 days. We do not add it.

### 3d. The one calendar fact that IS in the data: `trueUpMonth` (still $0 in this category)

14 solar meters in the inventory carry a real annual-settlement calendar fact — `trueUpMonth`
(December x6, May x3, January, July, August, October). This is genuinely a "billing-cycle
timing" datum and it is the *right* anchor for the home calendar's solar rows. But the
**dollars** of a true-up belong to the **solar-NEM** category (and the P031 $62,795.65 zero-
credit anomaly there is itself $0-$57k CONTINGENT on the Generation Allocation Summary, never
banked). Surfacing the true-up *month* on the calendar is legibility; it carries **no
rate-timing dollar of its own**.

---

## 4. What it would take to make this lever do anything (honest `needsData`)

- **To populate the calendar hook (the actual deliverable):** extract the **serial / cycle
  letter** from each bill's Service Information block (the AI vision step in
  `src/lib/extract`), store it as `Pump.billingSerial`, then `cycleClose()` /
  `billingCycleForSerial()` light up the per-meter grid against the committed 2026 read-date
  fixture. Needs: **`other` (the serial code field, currently un-extracted)**. Still **$0** —
  it is a legibility feature.
- **To make `cycleEdge` ever emit a dollar:** 15-minute **interval** kWh/kW per meter, plus a
  `typicalPeakKw` baseline. Needs: **`interval`**. And even then it is a demand-charge-timing
  nudge that must be reconciled against (not added to) the demand-charge category to avoid
  double-counting, and demoted per CLAUDE.md.

---

## 5. Total

| Sub-lever | Function | Annual $ | Why |
|---|---|---|---|
| Forward calendar hook (per-meter cycle-close grid) | `cycleClose` / `billingCycleFor` / `daysToClose` | **$0** | legibility by design; also un-populatable today (serial code not extracted) |
| Scheduled-vs-actual close discipline (P031/P038 multi-cycle) | schedule engine | **$0** | pure legibility; charges owned by other categories |
| True-up-month calendar marks (14 solar meters) | inventory `trueUpMonth` | **$0** | calendar fact; true-up dollars belong to solar-NEM (and are contingent) |
| Cycle-edge "hold your sets" nudge | `cycleEdge` | **$0** | interval-data-gated (no input on the bill); would double-count demand-charge; demoted per CLAUDE.md |

**Category defensible annual total: $0.** This lever earns its place on the priority list as
**the visible hook Batth asked for** — a graspable calendar of when each pump's bill locks in —
and as honest infrastructure for not conflating scheduled vs actual closes. It is "real at the
margins" exactly as CLAUDE.md says: the margin is *operational timing of a demand spike*, whose
dollars are already counted (conservatively) under demand charges, not new money to be claimed
here.
