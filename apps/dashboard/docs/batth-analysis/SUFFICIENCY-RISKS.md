# Batth Farms — Sufficiency Risks (the skeptic's brief)

**Thesis being attacked:** *"Bills + the meter list + the proposed active-meter interval buy are
enough — for the Tuesday demo AND to deliver value to Batth."*

**Verdict: NO, not as currently wired.** The data we hold is enough for a *legibility* demo and a
~$1,796/yr bankable catch, but **three of the six dashboard surfaces are empty on day-one data**,
**two seed-mechanics bugs leave the findings rail blank**, the **interval buy does not fix the hook
Batth himself asked for** (the billing calendar), and **the headline projection ($8.6k–$26.9k
first-year) leans entirely on un-pulled, assumption-laden tiers.** The interval buy is necessary and
cheap, but it is not sufficient, and several things it does **not** touch are exactly where a sharp
consultant will push.

This file is **subordinate to `NUMBERS-RECONCILED.md`** and contradicts none of its dollars. Every
figure here traces to that ledger, `SAVINGS-PROJECTION.md`, `DASHBOARD-READINESS.md`, the
`findings-deep-*.json`, and code/fixture facts I verified directly (cited inline). Savings are
computed by **deterministic pure functions in `src/lib/energy`** — no AI; the only AI is bill-PDF
vision in `src/lib/extract`.

---

## Facts I verified directly (not asserted — checked)

| Claim | How verified | Result |
|---|---|---|
| Fixture carries **no** interval data | `fixtures/batth-real-meters.json`: 186 meters, **0** with non-empty `intervals` | TRUE — every interval-driven lever no-ops |
| Fixture carries **no** landed peak | **0/186** meters have non-zero `peakKw` | TRUE — "running hot" / demand-peak history dead |
| Summaries carry **no kWh** | 46 meters have `summaries`; **0** summaries carry a non-null `totalKwh` | TRUE — rate-opt chart + usage share dead |
| Importer never emits TOU lines | `import.ts` only writes `kind:"other"` (Energy) + `kind:"demand"`; never `tou_energy` | TRUE — cost-over-time chart has nothing to stack |
| `peakKw` derived from intervals | `import.ts:249` `peakKw: peak?.kw ?? null` (peak comes from intervals) | TRUE — no intervals ⇒ null peak ⇒ empty calendar "running hot" |
| Importer sets `meterSerial`, not `serialCode` | `import.ts:206/218` set `meterSerial`; `serialCode` set **only** in `farm.ts` (spreadsheet path) | TRUE — scheduled-calendar marks empty on the UtilityAPI/seed path |
| `SEED_BATTH_REAL` is wired | `grep` across `prisma/` + `src/` | **FALSE — appears nowhere.** `seed.ts` seeds synthetic farm |
| Real seed runs the engine | `prisma/batth-real-farm.ts` has **no** `runEngines` call (it lives in `src/lib/recommendations/run.ts`) | **FALSE — findings rail blank on a fresh real seed** |
| Real seed persists NEM months | `batth-real-farm.ts` writes **no** `nemPeriods`/`NemPeriod`; fixture has no such key | **FALSE — P027 dispute finding at risk of not firing** |

Those last three are not data gaps — they are **wiring bugs that will make the live account look
broken on stage** unless fixed first. They are the cheapest, highest-leverage fixes in this file.

---

## TOP 5 RISKS (ranked by demo-blast-radius × likelihood a consultant exposes it)

### Risk 1 — The findings rail is BLANK on a fresh real seed (the demo's whole point disappears)
**Severity: SHOW-STOPPER.** The pitch is "we already found the money worth chasing." But
`seedBatthRealFarm` never calls `runEngines`, and `SEED_BATTH_REAL` is not wired, so seeding the
real account renders the synthetic farm **or** a real farm with an empty rail. Either way the
$1,796 idle catch and the P027 dispute — the *only* two credible dollars we can show — do not
appear. If someone "just seeds Batth and clicks around" the morning of, the centerpiece is gone.

**Cheapest fix (~30 min, $0):**
1. Wire the seed switch (or a one-line script) that runs `seedBatthRealFarm` **then**
   `runEngines(prisma, farmId)` against that farm id. Commit it. Do **not** demo off an
   un-engined seed.
2. Add a smoke assertion: after seed, `Recommendation.count({ where:{ farmId } }) > 0` and the
   idle-demotion finding totals ~$1,796. If it's 0, you know before Batth does.

---

### Risk 2 — The P027 dispute (~$2,072, half of the "with one dispute" headline) may silently not fire
**Severity: HIGH.** Per `DASHBOARD-READINESS.md` §4 and confirmed in the seed: the real seed writes
**no `NemPeriod` rows**, and the fixture carries none. The bill-audit P027 finding is sourced from
the per-month NEM import/export table. No rows ⇒ the finding may not fire ⇒ the headline collapses
from "~$3,900 with one dispute" to "~$1,796," halving the only non-gated number we have. Worse, it
fails **silently** (`toFindingViews` drops dollar-less, note-less findings by the AC5 honesty law),
so you won't notice it's missing until Batth asks "what about my solar bills?"

**Cheapest fix (~1 hr, $0):** Persist the P027 NEM months into `NemPeriod` from the already-parsed
billing data (the import/export/net numbers are in `findings-deep-bill-audit.json` /
`normalized/billing.json`). Then re-run the engine and **eyeball that the P027 finding renders with
its $2,072 "if you win" note** before Tuesday. If you can't get NEM-table persistence done, cut the
"with one dispute, ~$3,900" line from the script and pitch the certain $1,796 only — do not promise
a number the screen can't show.

---

### Risk 3 — The billing-calendar hook (the thing Batth ASKED for) is empty — and the interval buy does NOT fix it
**Severity: HIGH, and structurally embarrassing.** Batth's stated hook is the serial-letter billing
calendar. On day-one data the **scheduled marks are empty**: `importMeters` sets `meterSerial`, not
`serialCode`, so `anyResolvableSerial` is false, every meter is `unforecastable`, and the home
"next close" line has no answer (`DASHBOARD-READINESS.md` §6, verified in `import.ts`). **The
interval buy does nothing for this** — `serialCode` comes from a bill scan or the master
spreadsheet's serial column, not from UtilityAPI intervals. So we'd be spending $48–$264 on the buy
and the **one surface the customer named** would still be blank.

**Cheapest fix (~1–2 hr, $0, no PG&E pull):** Capture the Service Information serial letter per
meter from the master spreadsheet (Batth's inventory likely already has a serial/route column) or
from the bill scans we hold, and land it into `Pump.serialCode` (the `farm.ts` path already supports
it — `serialCode`/`billingSerial` at `farm.ts:373–374`). That lights up the **entire** scheduled-
calendar hook at $0. If the serial column genuinely isn't in the sheet, **do not demo the scheduled
calendar** — show the *actual* close marks + map + table, and explicitly say the forecast calendar
turns on once we capture serials. Surprise-empty is worse than scoped-out.

---

### Risk 4 — The cost-over-time CHART is empty, and even the interval buy gives only ONE month of history
**Severity: MEDIUM-HIGH.** Two compounding gaps: (a) no TOU line items (importer emits one flat
"Energy" + one "demand" line, verified), and (b) **only one billing cycle per meter** (winter
2026-02-11→03-12). So `bars.length === 0` and the chart renders its empty state. Here's the trap the
buy-plan glosses: the proposed UtilityAPI pull is framed as a **single historical interval pull per
SA**. A 15-min interval stream gives you a *usage shape*, but **the cost-over-time chart and
year-over-year need multiple billed cycles**, and the demand-recovery / rate-opt confidence bands in
`SAVINGS-PROJECTION.md` Tier C implicitly assume ~12 months ("216 meter-cycles," "12 real monthly
cycles"). **We hold one winter cycle.** A single winter cycle also *understates* demand exposure —
the demand-charge finding itself flags $6,058.73 as a **winter FLOOR**, because AG-C's $29.92/kW
summer peak-demand charge doesn't apply in winter. If the buy returns only the most recent interval
window (not 12 months), the chart stays near-empty and the Tier C math has fewer cycles than its
own formula assumes.

**Cheapest fix (~$0 incremental, must be explicit in the buy):** When you place the UtilityAPI
pull, **request the maximum available history (12 months) per SA, not just the latest window** —
same $12/meter, dramatically more analytical value (fills the chart, enables YoY, gives the
bill-audit engine its `minComparators: 3`, and captures at least one summer cycle so demand exposure
isn't a winter floor). Verify the pull returns ≥ several cycles before quoting any Tier C band out
loud. Until multi-cycle data lands, **script around the chart** (`DASHBOARD-READINESS.md` says so):
lead with map + table, treat the chart as "fills in as cycles post."

---

### Risk 5 — The big projected numbers ($8.6k–$26.9k first-year, $6k+ demand "exposure") are too soft to say out loud, and the buy doesn't make them hard
**Severity: HIGH (credibility / "getting caught").** The headline first-year range is **A (certain
$1,796) + B (contingent dispute) + C (projected, assumption-laden)**. Tier C is **75–90% of the top
of that range** and every dollar in it rests on assumptions the engine *refuses to compute* until
intervals land: demand-recovery at "a conservative ~12% (8–20%)" of exposure, bill-audit at "1.5%
hit-rate × $250." **The interval buy does not validate those percentages** — it only makes the
*inputs* real; the recovery % and hit-rate are still analyst assumptions, not measurements. A PG&E-
literate consultant will do three things that bite:
- **Convert "exposure" into "recovery" in his head** and call you out if you imply $6,058.73/cycle
  is savings. It is **correctly billed exposure, NOT a saving** (`findings-deep-demand-charge.json`:
  `totalAnnualUsd: 0`, recoverable = 0). Say "exposure" every single time or you get caught.
- **Question the 12% DR-recovery figure** — almonds run flat-out off-peak with little schedule
  slack (CLAUDE.md's own warning against leading with coincident-peak staggering). He may argue the
  realistic recovery is *lower* than 12%, not higher.
- **Probe P031's $62,795.65** — if you've let "$57k" leak into the headline, he'll point out it's
  **zero-sum** on 1,932 kW of arrays and **contingent on a document you don't have**. The buy-plan's
  own guardrail: never present it as banked; interval data on P031 does **not** unlock it — the
  **document** does.

**Cheapest fix ($0): label discipline + a numbers-firewall in the script.** Walk in with the
*certain* number as the headline (**~$1,796/yr today, ~$3,900 with one dispute won**) and present
Tier C strictly as **"projected, pending the interval pull we'd run in the pilot — a range, with
the assumptions written on the slide."** Show the demand figure as **"$6,058.73/cycle of exposure we
can target, $0 recoverable until we pull intervals and check DR terms,"** never as savings. Keep
P031 as a labeled $0–$57k *contingent, one-time, needs-a-PG&E-document* item, never in the running
total. The deterministic engine's refusal to inflate **is the credibility asset** — lean on it:
"every dollar is checkable line-by-line against PG&E's rate card."

---

## What the interval buy does NOT fix (so we stop pretending it's the whole answer)

| Gap | Does the active-meter interval buy fix it? | What actually fixes it | Cost |
|---|---|---|---|
| **P031 / VINES $62,795.65 true-up** | **No** — interval only verifies the demand-kW anomaly | PG&E **Generation Allocation Summary / Form 79-1202** (a document) | $0 |
| **The other 56 accounts / ~137 meters** (Tier E, ~$23,600 idle ceiling unsized) | **No** — buy is scoped to this one account's 23 active AG meters | Those accounts' **bill PDFs** (free, PG&E MyEnergy → vision pipeline) | $0 |
| **Multi-cycle history / YoY / chart** | **Only if you explicitly request 12 months** — a single-window pull does not | Request max history in the pull (see Risk 4) | same $12/meter |
| **Summer demand exposure** (winter $6,058.73 is a floor) | **Only if the pull spans a summer cycle** | 12-month pull captures a summer cycle | same $ |
| **The billing-calendar hook (`serialCode`)** | **No** — serials are not in interval data | Master-sheet serial column or bill scan → `Pump.serialCode` | $0 |
| **Solar credit dollars** (lens honest-blank) | **No** | Per-array **true-up statements** (Epic G) | $0–low |
| **NEM month table for P027 dispute** | **No** — it's a wiring/persistence task | Persist `NemPeriod` rows from parsed bills | $0 (dev) |
| **B1 business meters, idle meters** | **No** (correctly — buy excludes them; bill summary already covers idle demotions) | n/a — already handled | $0 |

The honest framing: the **$48–$264 interval buy unlocks exactly one tier (C)**, and even that needs
the *12-month* variant. The four cheapest, highest-impact remaining unlocks (P031 document, other-
account bills, serial capture, NEM-table persistence) are **all $0** and **none** are bought with
UtilityAPI. Spending $264 on intervals while skipping the $0 serial capture would be optimizing the
expensive lever and ignoring the free one the customer actually asked for.

---

## Where we could specifically embarrass ourselves on Tuesday

1. **Click the cost chart on a live meter → empty state** in front of Batth (one cycle, no TOU).
   *Mitigate: don't navigate there; or pre-stage the empty state as "fills in as cycles post."*
2. **Open the calendar → no scheduled close marks** on the hook he named. *Mitigate: capture
   serials first (Risk 3) or show only actual marks + scope it.*
3. **Findings rail blank** because the seed didn't run the engine. *Mitigate: Risk 1 fix + smoke
   check.*
4. **Quote "$6k in demand savings"** and get corrected by the consultant that it's billed exposure.
   *Mitigate: Risk 5 label discipline.*
5. **Let "$60k" / "$57k" (P031) slip into the headline** and get asked for the allocation document
   you don't have. *Mitigate: keep it a labeled contingent line, never in the total.*
6. **Nameplates all wearing the "unverified layout" qualifier** because `solarLayoutVerifiedAt`
   isn't set (`DASHBOARD-READINESS.md` §5, DM4 fail-closed) — looks like we're unsure of basic
   facts. *Mitigate: set `solarLayoutVerifiedAt` after confirming the 840+1,092 kW layout.*
7. **Demand total claims 23 meters but 10 of 23 bill under $5** (standby pumps); if a viewer sorts
   the demand column they'll see a lot of near-zero rows. *Mitigate: lead with the top-3 = 87.6%
   concentration story, which is the honest and stronger framing.*

---

## The MINIMUM additional, cheap steps to de-risk (do these, in order)

**Before Tuesday (all $0, all small dev tasks — these are mechanics, not data):**
1. **Wire seed + engine + smoke check** (Risk 1). Seed real farm, run `runEngines`, assert the rail
   has the ~$1,796 idle finding. ~30 min. *Without this the demo has no findings.*
2. **Capture `serialCode` from the master sheet** into `Pump.serialCode` (Risk 3). ~1–2 hr. Lights
   the calendar hook at $0. If impossible, **scope the calendar out of the script explicitly.**
3. **Persist `NemPeriod` rows** so the P027 dispute fires (Risk 2). ~1 hr. If impossible, cut the
   "~$3,900 with one dispute" line and pitch the certain $1,796.
4. **Set `solarLayoutVerifiedAt`** after confirming the 1,932 kW layout (Risk/embarrassment #6).
   ~5 min.
5. **Rehearse the label-discipline script** (Risk 5): certain $1,796 headline; Tier C as a labeled
   projected range; "exposure not savings"; P031 as contingent, never in the total. **Avoid leaning
   on the chart and the scheduled calendar** unless #2 is done.

**The pilot ask (cheap, and these are what actually deliver — sequenced by leverage):**
6. **Pull 12 months of interval history on the 23 active AG meters** (T2, ~$264 of the $465 budget,
   first SA free) — **explicitly request max history, not the latest window** (Risk 4). This is the
   one paid step; it converts rate-opt from "pending" to priced, prices demand recovery, fills the
   chart, captures a summer cycle, and gives bill-audit its 3 comparators. (T1 minimum is $48 if
   budget-tight, but T2 is the deliverable.)
7. **Request the PG&E Generation Allocation Summary / Form 79-1202** for P031 — $0, resolves the
   $0–$57k question (the document, not intervals, is the unlock).
8. **Download the other 56 accounts' bill PDFs** from PG&E MyEnergy — $0, lights ~137 more meters
   through the existing vision pipeline (`src/lib/extract`).

**Net:** ~half a day of $0 dev work makes the demo honest and non-broken; ~$264 + two free document
pulls is what turns the projected tiers into delivered value. The interval buy is necessary and
cheap — but on its own it fixes **one** of the five top risks (Risk 4/Tier C inputs) and **none** of
the other four.

---

## Bottom line

Bills + meter list + the interval buy are **enough to demo legibility and a ~$1,796 bankable catch,
and enough to start a credible pilot — but not enough, as wired, to demo without three $0 fixes
first, and not enough on their own to deliver the headline levers.** The interval buy is real
leverage on exactly one tier; the cheapest and most customer-visible wins (the calendar hook, the
findings rail, the dispute, the other accounts, the P031 document) are **free** and are **not** what
the buy purchases. Do the half-day of wiring, request **12 months** when you pull, keep every gated
number labeled, and lead with the certain dollar — then the answer to "is it enough?" becomes "yes,
for an honest demo and a defensible pilot." Lead with "$60k" off this data and you get caught.
