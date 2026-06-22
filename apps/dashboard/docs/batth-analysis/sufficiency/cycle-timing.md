# Data sufficiency + savings projection — Billing-cycle / serial-code timing (Lever 5)

**Lever:** the serial-code meter-read calendar — "when does each pump's PG&E bill lock in."
This is CLAUDE.md Lever 5: *"Billing-cycle timing (the serial-code calendar). Real at the
margins; the visible hook Batth asked for."* It is the **home Calendar view** — the thing
Batth asked to see first.

**Bottom line up front:** this lever **renders today, for $0, from data we already hold**, and it
is **worth ~$0/yr in directly-attributable savings by design**. It is legibility, not a savings
engine. Buying interval data does **not** add a cycle-timing dollar. Do not attach a savings number
to the calendar; its value is the hook + the catch.

---

## 1. The engine (deterministic, not AI)

The dollar-free date math is pure functions over a list of read dates and a reference "today":

- **`src/lib/energy/billing.ts`**
  - `closeOnOrAfter(readDates, ref)` — the next scheduled close on/after `ref`.
  - `billingCycleFor(readDates, ref)` — `{ start, close }` for the cycle containing `ref`
    (opens day-after prior read, closes on next read).
  - `daysToClose(close, ref)` — whole days until close (0 on close day, negative past it).
- **`src/lib/pge/schedule.ts`** (the serial-letter path)
  - `cycleClose(serialCode, month, year, schedule)` — the scheduled close for a serial letter
    in a statement month, or `null`.
  - `nextCycleClose(serialCode, fromIso, schedule)` — next close on/after a date.
  - `isKnownSerial(serialCode, schedule)` — whether a stored code resolves in the table at all
    (a Rotating-Outage-Block code like `"14A"` is non-null yet resolves to nothing).
- **`src/lib/pge/schedule-load.ts`** + **`src/lib/greenbutton/schedule.ts`** — server-side fs
  loaders for the committed table `fixtures/pge-meter-read-schedule.json`
  (`year: 2026`, cycles `B…Z` plus the demo `MR-07/14/21`).

The only dollar-shaped sub-lever lives in **`src/lib/energy/cycle-edge.ts`** (`cycleEdge`), priced at
the meter's own bill-derived `effectiveDemandRate` from `src/lib/energy/demand.ts` via
`src/lib/energy/recommend.ts` (`pumpTimingDraft`, `roundUsd`).

**All of the above is deterministic pure arithmetic. No LLM / AI gateway call appears in any of these
files.** The only AI anywhere in the product is bill-PDF **vision extraction** in `src/lib/extract`
(it produces data rows — including, if asked, the serial letter off the bill — never a dollar).

---

## 2. Exact inputs the engine needs

| Function | Required inputs |
|---|---|
| `closeOnOrAfter` / `billingCycleFor` / `daysToClose` | `readDates: string[]` (ISO `YYYY-MM-DD`, ascending), `ref: string` (today) |
| `cycleClose` / `nextCycleClose` / `isKnownSerial` (forward serial path) | `serialCode` (single letter **B–Z**), `month`, `year`, the loaded `MeterReadSchedule` |
| `cycleEdge` (the one $ sub-lever) | `cycleClose`, `asOf`, **`cycleToDatePeakKw`** (running 15-min peak this cycle), **`typicalPeakKw`** (historical 15-min reference), `rateUsdPerKw` (bill-derived) |

Two distinct ways to feed the calendar:

1. **Observed path (no serial code):** feed `readDates` directly from the posted-bill cycle
   boundaries. This needs **no serial letter**.
2. **Forward/projected path (serial code):** look up the meter's single-letter serial in the 2026
   table to project the *next* close before a bill posts. This needs the serial letter, which
   `cycleClose()`/`isKnownSerial()` gate strictly (no guess).

---

## 3. What we have for free (bills + meter list)

### From `normalized/billing.json` (account 4699664587-8, 46 billed SAs)
Every billed cycle carries **actual cycle dates**: `start`, `close` (the metered window) **and**
`cycleClose` (the statement/posted close). For example P018: `start 2026-02-11`, `close 2026-03-12`,
`cycleClose 2026-03-26`. Verified across all 46 meters:

- **All 46 SAs share the identical window `2026-02-11 → 2026-03-12`** (single consolidated winter
  statement). Statement `cycleClose` is `2026-03-26` on 32 cycles (`null` on 20).
- Only **P031 (4699664088 / VINES 75HP)** and **P038 (4699664743)** carry extra history — 4 cycles
  each, with distinct windows (`2025-12-12→2026-01-11`, `2026-01-12→2026-02-10`, …). They are the
  scheduled-vs-actual-close legibility example (their peaks climb `2.08→3.36→3.20→111.52 kW`).

So the calendar can render the **observed** last close for all 46 meters **today, free** — it is the
`close` / `cycleClose` field, fed straight into `daysToClose`. The window placement engine
(`billingCycleFor`) and the scheduled-vs-actual discipline (keeping `cycle.close` separate from
`cycle.cycleClose`, AR-14) work on this data with no extra purchase.

### From `normalized/inventory.json` (183 meters across ~57 accounts)
The one genuine forward-calendar datum present: **`trueUpMonth` on 14 of 183 meters**
(December ×6 incl. P031/P038/P041/P033/P083/P034, May ×3, January ×2, July ×1, August ×1, October ×1).
These are the correct anchors for the calendar's **solar true-up rows** (settlement month per meter).
The dollars of any true-up belong to the **solar-NEM** category, not here.

### What is ABSENT (the gap)
**No serial / cycle / read-schedule code exists in either file.** Grepping
`serial|serialCode|cycleCode|billingSerial|readDate|scheduleLetter|cycleLetter` over both
`billing.json` and `inventory.json` returns **nothing**. Meters carry `serviceId` (the SA ID, e.g.
`4690972110`) and a physical `meterSerial`/`meterNumber` (e.g. `1010253089`) — **not** the
single-letter PG&E cycle code (B–Z) that `cycleClose()` keys on. With `serialCode = null`,
`isKnownSerial()` is `false` for all 46 meters, so the **forward, schedule-projected** mark cannot be
placed per meter, and the engine correctly **places no fabricated date** rather than guess.

---

## 4. What buying interval data adds (to THIS lever)

**Almost nothing.** Interval data ($12/meter, first free) is the gate for *rate optimization,
demand-charge recovery, and bill-audit* — **not** for the calendar:

- Interval data is a 15-minute kWh/kW **series**; it does **not** carry the PG&E **serial cycle code**.
  So it does **not** populate the forward serial-keyed projection either. The serial letter comes
  from the **bill's Service Information block** (vision extraction in `src/lib/extract`), or from a
  Green Button / UtilityAPI account-metadata field — a separate, ~$0 extraction step, not an
  interval purchase.
- Interval data *would* finally give the one $ sub-lever (`cycleEdge`) valid input
  (`cycleToDatePeakKw` + `typicalPeakKw`). But per the deep findings and `gap-interval-data.md`
  Finding G, `cycleEdge` is **(a)** demoted by CLAUDE.md ("keep any staggering code but demote it";
  "Planner, not live meter"), and **(b)** any dollar it emits is the **same demand dollar already
  annualized in the demand-charge category** — surfacing it here would **double-count**. So its
  honest contribution to *this* category stays **$0** even with intervals.

**Net:** interval data does not turn the calendar into a savings number. The only thing that
*enriches* the calendar is the cheap serial-letter extraction (a UX/legibility upgrade for the
forward projection), still worth $0/yr.

---

## 5. Meters covered

| | Count | Basis |
|---|---:|---|
| **Covered now (free)** | **46** | All billed SAs render an **observed** cycle close from `billing.json` `close`/`cycleClose`; +14 of 183 carry a `trueUpMonth` solar mark from `inventory.json`. Forward *serial-projected* marks: 0 (no serial code). |
| **Added by the interval buy** | **0** | Interval data carries no serial code and adds no cycle-timing dollar; `cycleEdge` would double-count demand. |
| **Total addressable** | **183** | The full inventory could show observed/true-up marks; the other ~137 meters need their **own bills** (free from PG&E MyEnergy) for window dates — a bills gap, not an interval gap. |

(Forward *schedule-projected* close per meter for all 46 unlocks only after the **serial letter** is
extracted into `Pump.billingSerial` — a vision/metadata step, ~$0, still $0/yr saving.)

---

## 6. Projected annual savings — RANGE

**This lever is a calendar. A calendar moves no charge.** The directly-attributable savings are:

| Scenario | $/yr | Why |
|---|---:|---|
| **Low** | **$0** | Honest defensible total. The category's deliverable is legibility; CLAUDE.md frames it as "real at the margins." |
| **Likely** | **$0** | Same. The schedule-vs-actual discipline, the forward close grid, and the true-up marks are all **$0** by design; their dollars (demand, NEM true-up) are owned by other categories and counted there. |
| **High** | **$0** | Even the one $-shaped sub-lever (`cycleEdge`) is $0 here: interval-gated with no valid bill input, **demoted** by CLAUDE.md, and a **double-count** of the demand category if it ever fired. **Pending actual interval pull**, an *illustrative* one-time cycle-edge avoidance might be on the order of a few hundred dollars for one cycle on one meter (e.g. P031 ≈ (111−20 kW) × $9.98/kW ≈ ~$908 once) — but this is **not bankable in this category** and **must not be added** to the headline. |

**Assumptions / caveats (explicit):**
- "$0" is a **deliberate, defensible** total, not a data gap. The engine refuses to invent a dollar a
  calendar doesn't have.
- The illustrative `cycleEdge` figure is **projected, pending actual interval pull**, is **once-off
  not annual**, and is the **same demand dollar** booked in `findings-demand-charge-exposure.json`
  ($6,058.73/cycle measured exposure) — counting it here double-counts.
- True-up-month marks (14 meters) are legibility; their dollars are the solar-NEM category, where the
  P031 headline is **$0–$57k CONTINGENT** on the PG&E Generation Allocation Summary, never banked.

---

## 7. Verdict

**`works-now-free`.** The calendar — the visible hook Batth asked for — renders **today, from data we
already hold, at $0 cost**: observed cycle closes for all 46 billed meters plus 14 solar true-up
marks. It needs **no interval purchase** and **no PG&E document** to ship.

Two honest caveats that do **not** change the verdict:
1. The **forward, serial-keyed projection** (next close before a bill posts) is dark until the
   single-letter serial code is extracted into `Pump.billingSerial` — a ~$0 vision/metadata step, not
   an interval buy. Until then the calendar shows the **observed** close, never a guessed one.
2. The lever is worth **$0/yr** in attributable savings by design. Sell it as *legibility + the catch*
   (the scheduled-vs-actual discipline that surfaces things like the P031 multi-cycle anomaly), not as
   a savings number.
