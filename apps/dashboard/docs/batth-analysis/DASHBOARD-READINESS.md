# Batth Farms — Dashboard Readiness (view by view)

**Question answered:** with the data we will actually have on day one, will each dashboard
surface render, and is it enough to **demo** and to **deliver**?

**Subordinate to `NUMBERS-RECONCILED.md`** (the single source of truth on dollars) and the
`findings-deep-*.json`. Nothing here contradicts them. Every savings figure is computed by
**deterministic pure functions in `src/lib/energy`** — no AI. The only AI in the pipeline is
the bill-PDF **vision extraction** in `src/lib/extract`, which emits data rows, never a dollar.

---

## The data we actually have (the ground floor for every verdict)

Source: `fixtures/batth-real-meters.json`, landed by `prisma/batth-real-farm.ts` →
`importMeters` (the same path the live UtilityAPI/Green Button connect uses). Verified by
reading the fixture directly:

| Field | Coverage in hand | Consequence |
|---|---|---|
| Meters (pumps) | **186** rows | the inventory is real and complete |
| lat/long (on `meta`) | **178** of 186 | the map has 178 real pins, 8 in the tray |
| Billed cycles (`summaries` non-empty) | **46** meters, **1 cycle each** (2026‑02‑11→03‑12, one winter month) | only 46 meters reconcile; the other 140 are metadata-only |
| `totalBillUsd` per billed cycle | yes (46) | drives `coverageState = "reconciled"`, the printed total, the table cost cell |
| `demandChargeUsd` | **23** of the 46 billed meters | the only structured charge line that exists |
| **`totalKwh`** | **NONE** (no kWh key anywhere in any summary) | kills the chart, kills usage-share precision, kills rate-compare |
| **TOU line items** | **NONE** (importer emits one flat `other` "Energy" line + a `demand` line; never `tou_energy`) | the cost-over-time chart has nothing to stack |
| **`peakKw`** | NONE on the period (a reference `meta.peakKw` exists but is not landed onto `BillingPeriod.peakKw`) | "running hot" and demand-peak history are dead |
| **15-min intervals** | **EMPTY on every meter** | every interval-driven lever no-ops by design |
| **`serialCode`** (Service Information serial letter) | **NEVER populated** — `importMeters` sets `meterSerial`, not `serialCode`; only `onboarding/farm.ts` sets it from a spreadsheet column the fixture lacks | the calendar's *scheduled* marks are empty |
| Solar arrays | **2** (840 kW + 1,092 kW = 1,932 kW), 42 solar-flagged meters | the solar lens has real structure |
| True-up month | on 24 solar/NEM meters | true-up timing/calendar render |
| True-up amount | on 11 meters | a few honest true-up dollars exist |
| `NemPeriod` rows (per-month import/export/net) | **NOT created by the real seed** (fixture carries no `nemPeriods`; `batth-real-farm.ts` writes none) | the drawer's NEM month table is empty |
| Entities / ranches / rate schedules | 6 entities, 36 ranches, 25 distinct rates | filters and grouping are rich |

**Two wiring caveats that gate the live demo (not data, but mechanics):**

1. **`SEED_BATTH_REAL` is not actually wired.** `dashboard-wiring.md` says the runnable
   `prisma/seed.ts` is "hooked behind `SEED_BATTH_REAL=1`," but the flag appears **nowhere**
   in `prisma/` or `src/`. As written, `seed.ts` always seeds the **synthetic** `batth-farm.ts`.
   To render the real account you must seed `seedBatthRealFarm` explicitly.
2. **The real seed never runs the recommendation engine.** `seedBatthRealFarm` lands meters,
   bills, solar, and metadata, but does **not** call `runEngines`. So the **findings rail is
   empty** on the real-Batth farm until the engine is run against that farm id.

---

## View by view

### 1. The Map (178 pins) — **FULLY** (the strongest surface)

- **Renders:** 178 real pins from inventory lat/long; 8 meters land in the honest "no location
  yet" tray (`toMapPins`, never a fake pin, `(0,0)` excluded). 23 of the 46 reconciled meters
  show a floating **printed-bill label** (`latestBillCents`, gated on `reconciled` — AR‑15).
  Attention clay is earned by `needs_review` coverage or a `status === "BAD"` pump; the rest are
  calm green. The solar Map lens can draw the `trueUpSoon` ring on the 24 meters with a true-up
  month.
- **Why it works:** the map reads only lat/long + coverage + status, all of which we have.
- **Partial edge:** the 140 unbilled meters render as calm status dots with **no bill label**
  (correct, by AR‑15 — a status dot, never a fabricated $0). That is honest, not broken.
- **Minimum it needs:** lat/long (have it for 178). Nothing more.

### 2. The Excel table — **FULLY for structure, PARTIAL for money**

- **Renders fully:** all 186 meters down the rows, with name, ranch, entity, rate, legacy flag,
  pump status, coverage state. Filters by entity (6) / ranch (36) / rate (25) / account (57) /
  program all work. This is the legibility win and it is complete.
- **Money columns are PARTIAL by design (AR‑15):** the **cost** cell shows a real printed total
  for the **46 reconciled** meters and the coverage treatment for the other 140. The **demand**
  cell shows a value for the **23** meters that carried a demand charge; the other reconciled
  meters read "None" and the unreconciled ones read the coverage treatment. No fabricated $0.
- **Minimum each cell needs:** cost cell = a `printedTotalCents` (have it for 46); demand cell =
  a demand line item (have it for 23). To fill the other 140 cost cells you need **those
  accounts' bills** (free from PG&E MyEnergy via the vision pipeline).

### 3. Per-meter charts (cost-over-time) — **EMPTY (graceful, not broken)**

- **Renders:** the Energy chart's empty-state. `toChartBars` only stacks `tou_energy` line
  items; the importer emits **zero** of them (one flat `other` "Energy" line + a `demand` line).
  So `bars.length === 0` and `chart-lens.tsx` renders `t.emptyView` (a clean "no trend yet"
  state, verified at chart-lens.tsx:94–108) — it does **not** crash.
- **Why it's empty:** two compounding gaps. (a) No per-bucket TOU split in the summary, and
  (b) only **one** billing cycle per meter anyway, so even a flat-total chart would be a single
  bar with no trend and no year-over-year (`yoyPairs` needs a prior-year equivalent — none
  exists). The chart is a **trend** surface and we have no trend.
- **Minimum it needs:** **TOU energy line items across multiple cycles.** That means the
  **15-min interval pull** ($12/meter, first free) *and* multi-month history — the same data the
  rate-optimization lever needs. Until then this view stays empty.

### 4. The findings rail — **PARTIAL, and EMPTY until the engine is run**

- **First-order blocker (mechanics):** `seedBatthRealFarm` does not call `runEngines`, so on a
  fresh real seed the rail shows **nothing**. Run `runEngines(prisma, farmId)` against the real
  farm to populate it. (`toFindingViews` also drops any finding with no dollar and no note — the
  AC5 honesty law — so empty-shaped engine output stays invisible.)
- **When the engine IS run, what survives on this data:**
  - **Idle/standby demotions (~$1,796/yr)** — the bankable headline. These come from
    customer-charge differentials at 0 kWh; **no interval needed**. ✅ renders.
  - **Bill-audit P027 dispute (~$2,072/yr, "if you win")** — from the printed NEM annual table.
    Renders **only if** the per-month NEM data is persisted; the real seed currently writes
    **no `NemPeriod` rows**, so this finding is at risk of not firing until that data lands. ⚠️
  - **Rate-optimization (#1 lever)** — **DEAD on this data.** With no `totalKwh`/intervals, the
    engine's `bucketUsage` has nothing to bucket and the AG‑C→AG‑B comparison is a sign-ambiguous
    artifact suppressed by the `no_usage_basis` guard (`rate-lever.ts:508`). Only the 2 small
    AG‑C demotes + 1 AG‑A2 case ($843 opportunity, low conf) could show. ⚠️
  - **Demand exposure ($6,058.73/cycle)** — measured, **$0 recoverable** by design (note-only
    without intervals). Renders as a measured-not-recoverable note, never as a saving.
  - **P031 / VINES true-up ($0–$57k contingent)** — renders as a contingent/`needsData` finding,
    never banked.
- **Minimum it needs:** (1) run the engine on the real farm; (2) persist the NEM month table for
  the dispute finding; (3) the interval pull to make rate-optimization (the #1 lever) non-empty.

### 5. The solar lens — **FULLY for structure/timing, EMPTY for the credit dollar (by law)**

- **Renders fully:** both real arrays (840 + 1,092 kW = **1,932 kW**, *not* 12,180), 42 solar
  meters grouped under them, NEM program tokens, the four KPI counts, the needs-review surfacing
  (unlinked meters + unlinked NEMA codes), and the **usage-proportional share** — except that
  share falls to **null (not-on-file)** for meters with no billed `totalKwh`, which is **most of
  them** (only 46 meters carry any bill and none carries kWh). So shares are largely honest-blank.
- **Honest-blank by design:** no net-metering **credit dollar** is ever computed here (Epic G);
  the lens carries structure + timing only. True-up timing works (24 meters have a month); the
  true-up **dollar** shows only where a statement amount is on file (11 meters).
- **Caveat:** nameplates render in the **cautious "unverified layout"** state unless
  `Farm.solarLayoutVerifiedAt` is set (DM4, fail-closed) — correct, but worth a verify before the
  pitch. Grandfather countdown is honest-unknown (no interconnection dates on file).
- **Minimum it needs:** array linkage + nameplate (have it). For credit dollars: a true-up
  **statement** per array (Epic G). For verified nameplates: confirm the inventory column layout.

### 6. The cycle calendar — **PARTIAL → effectively EMPTY of scheduled marks**

- **Renders:** the month grid and any **actual** close marks (`MeterView.periods[].close`) — but
  we hold **one cycle per meter**, all closing in the same 2026‑02→03 window, so "actuals" are a
  single cluster, not a year of rhythm.
- **Scheduled marks are EMPTY:** the calendar's forecast side reads `serialCode` against the 2026
  read-schedule. **`importMeters` never sets `serialCode`** (it sets `meterSerial`, a different
  field). So `anyResolvableSerial` is false, every meter is `unforecastable`, `nextCloses` /
  `upcomingCloses` return nothing, and the "running hot" clause is suppressed (needs ≥4 posted
  peaks; we have peak data on zero periods). The home "next close" line has no answer.
- **This contradicts the hook Batth asked for.** The serial-letter billing calendar is the
  visible hook, and on this data it cannot draw a single scheduled mark.
- **Minimum it needs:** the **Service Information serial letter** captured per meter (from a bill
  scan or the master spreadsheet's serial column) → `Pump.serialCode`. Then the whole forecast
  side lights up with no new PG&E pull.

---

## Bottom line

### Is it enough to DEMO? **Yes — with a tight, honest script and two fixes first.**

What carries the demo, today, with no new data:
- **The Map** (178 real pins, 23 priced) — the "your whole operation, known at a glance" moment.
- **The Table** (186 meters, full structure, 46 priced, rich filters) — the Excel-brained win.
- **The Solar lens** (both real 1,932 kW arrays, true-up timing, honest-blank credits).
- **The idle-demotion finding (~$1,796/yr bankable)** + the P027 dispute (~$2,072 if won) — the
  credible "we already found the money worth chasing" line. **This is the pitch:** legibility +
  the catch + an auditable, refuses-to-inflate process — **not** a five-figure banked number.

Two things to fix **before** demoing the real account:
1. **Seed the real farm AND run `runEngines` against it** (the seed doesn't, and `SEED_BATTH_REAL`
   isn't wired) — otherwise the findings rail is blank.
2. **Persist the NEM month table** (or accept that the P027 dispute finding may not fire), and
   **set `solarLayoutVerifiedAt`** so nameplates don't all wear the "unverified" qualifier.

Demo surfaces to **avoid leaning on**: the cost-over-time **chart** (empty — one cycle, no TOU)
and the **scheduled calendar** (empty — no `serialCode`). Show the calendar's *actual* marks and
the map/table instead, or wire `serialCode` first.

### Is it enough to DELIVER? **Not yet — it delivers legibility, not the headline lever.**

We can deliver, right now, real value: a legible 186-meter operation, 46 reconciled bills, the
two real solar arrays, and **~$1,796/yr of bankable, reversible, zero-change idle demotions**
(plus ~$2,072 contingent on one dispute). That is a genuine, defensible pilot deliverable.

But the **#1 lever (rate optimization)** and the **hook (the billing calendar)** are both
**dead on the data in hand**, and the cost chart is empty. To deliver the full product we are
missing, in priority order:

1. **15-minute interval kWh** (~$12/meter, first collection free, budget $465) → unlocks
   rate-optimization across up to 42 meters, prices demand-charge recovery, and fills the
   cost-over-time chart. **Highest leverage spend.**
2. **The Service Information serial letter per meter** (bill scan or master-sheet column) →
   `Pump.serialCode` → lights up the entire scheduled-calendar hook at **$0**.
3. **The other 56 accounts' bill PDFs** (free from PG&E MyEnergy → the vision pipeline) → prices
   the other ~140 meters' table cost cells and finds the rest of the idle/rate money.
4. **The PG&E Generation Allocation Summary / Form 79‑1202** → resolves the **$0–$57k** P031
   true-up question (real zero-sum risk; never banked until the document is in hand).
5. **Per-array true-up statements** (Epic G) → turns the solar lens's honest-blank credit cells
   into real dollars.
6. **Engine + NEM-table wiring** on the real-seed path (the two mechanics fixes above).

**One-line verdict:** the dashboard is **demo-ready on legibility and the bankable catch** (map,
table, solar, idle findings all render and are honest), but **delivery of the headline levers —
rate optimization, the cost chart, and the billing-calendar hook — is blocked behind a ~$60
interval pull and the serial-letter capture**, neither of which we have yet. Walk in with
"we made your whole operation legible and already found the things worth chasing," not "$60k."
