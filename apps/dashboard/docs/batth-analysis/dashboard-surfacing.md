# How each savings finding surfaces in the dashboard UI (Batth demo)

Scope: maps every savings-finding **category** to the dashboard surfaces that show it (map
pin attention state, findings-rail card, the Excel-style table, the chart, the meter drawer),
the exact **Recommendation grammar** fields it maps to, and the **honesty gates** that decide
whether a dollar is allowed to render. Closes with the Tuesday demo click-path.

All savings dollars are computed by deterministic pure functions in `src/lib/energy` (no AI).
The only AI in the pipeline is bill-PDF vision extraction in `src/lib/extract`. The UI never
computes a savings figure; it renders pre-gated numbers off the persisted `Recommendation` rows
and the canonical `MeterView[]`.

---

## 0. The grammar and the two read edges

Every finding is one persisted `Recommendation` row
(`prisma.recommendation`, grammar in `src/lib/recommendations/types.ts`):

```
{ id, farmId, tool, situation, action:{kind,label,params,execute}, impactUsd?, impactNote?,
  severity: info|watch|act, status: pending|done|dismissed|overridden, createdAt, resolvedAt?, result? }
```

Two pure read edges project those rows for the UI:

- **`src/lib/dashboard/findings.ts` → `FindingView[]`** (the rail, the mobile sheet, the drawer,
  the Home bento, the Rate Fix hero). `loadFindings` queries **`status: "pending"` only**, then
  `toFindingViews` maps each row, resolving `tool`, `situation`, `actionLabel` (`action.label`),
  `actionKind` (`action.kind`), `impactUsd`, `impactNote`, `severity`, `meterId`
  (`action.params.pumpId`), `meterName`, `rateSwitchTo` (`action.params.toSchedule`, only when
  `action.kind === "switch_rate"`), and `resultNote` (`result.note`).
- **`src/lib/dashboard/results.ts` → `ResultView[]`** (the drawer "What happened" section).
  `loadTrackedResults` queries **`status: "done"` only** and surfaces predicted-vs-realized.

The data hero itself (chart / table / map / calendar) reads a different edge,
`src/lib/dashboard/load.ts` → `MeterView[]`, and is **finding-agnostic**: it shows the farm's
own billed numbers, not recommendations. Findings light up the hero only indirectly, via the
`?meter=` deep-link (the trace affordance highlights that meter's row/pin and opens the drawer).

### The universal AC5 visibility law (the first honesty gate)

`toFindingViews` drops a row, in one tested place, when **both** `impactUsd` is null **and**
`impactNote` is null (and also when `situation` is blank). A finding with no money and no note
never reaches any surface. `findingsAtRiskUsd` sums only **positive** `impactUsd` (a
credit-shaped finding shows its own card but never inflates "dollars at stake").

---

## 1. The four savings categories (tool tags) and what produces them

| Category | `tool` | `action.kind` | Engine (pure) | Runner | Severity | Carries `impactUsd`? |
|---|---|---|---|---|---|---|
| Rate optimization | `rate-optimization` | `switch_rate` / `review_rate` / `review_legacy_fleet` | `rate-lever.ts` (bill back-test) and legacy `rate-compare.ts` (interval) | `run-rate-lever.ts` / `run.ts` | `act` / `watch` | yes for `switch_rate`, **no** for legacy-fleet |
| Demand-charge exposure | `demand-charge` | `review_peak` | `retrospective.ts` | `run.ts` (re-tagged) | `act` (outlier) / `info` (flat) | only when an avoidable single-day spike exists |
| Bill audit | `bill-audit` | `audit_bill` | `bill-audit.ts` | `run.ts` | `act` (peak path) / `watch` (no-peak path) | yes (the excess over the meter's own median) |
| Solar / NEM | `solar` | `review_solar_demand` (live F2) / `review_solar_peak`, `track_trueup` (legacy demo) | `run-solar-insight.ts` (real) / `solar-nem.ts` (demo) | `runSolarInsight` / `run.ts` | `watch` (demand gap) / `info` (true-up) | the demand dollar rides in **`impactNote`**, not `impactUsd` |

Two retroactive money hooks live on Home but are **not** `Recommendation` rows — they are pure
scans over `MeterView[]`:

- **Refund (Rule 17.1)** — `src/lib/dashboard/refunds.ts` `scanRefunds`: any commercial `B-*`
  meter that should be agricultural. Conservative, hard-rounded-DOWN "up to ~$Xk, verify before
  claiming" estimate. Hides entirely when no commercial meter exists.
- **Spend / KPI rollups** — `src/lib/dashboard/kpi.ts`. Reconciled spend only.

### Which runner actually fires for the real Batth farm (the rate-opt artifact gate)

The live confirm path is `safeRunEngines` in `(app)/onboarding/actions.ts`:
`runEngines(prisma, farmId)` then `runSolarInsight(prisma, farmId)`. **`runRateLever` is defined
but is not wired into any live action** (grep-verified). So the rate-optimization findings on the
real farm come only from `runEngines` (`src/lib/recommendations/run.ts`).

Inside `runEngines`, the interval-based `rateOptimization` (legacy `rate-compare.ts`) is gated
behind **`intervals.length > 0 && pump.solarKw === null`**. The real Batth account is bill-summary
only (no 15-minute interval series; bill summaries carry no kWh), so `intervals.length === 0` for
every meter and **the interval rate emitter never fires**. This is what keeps the
AG-C→AG-B sign-ambiguous "savings" artifact (which the engine can emit without intervals) **off
the demo dashboard**: there is no honest interval basis, so no dollar is produced. What remains
is the legacy-rate aggregate finding (`review_legacy_fleet`, `watch`, **no dollar**), which is
exactly the honest "these meters are on closed rates; we keep checking" message.

The honest dollar-quoting rate path (`run-rate-lever.ts`, gated by the `BACK_TEST_BAND_PCT = 5`
reproduction band in `rate-lever.ts`) is the one to wire if/when a quotable rate switch is wanted;
do **not** wire the interval `rateOptimization` emitter against the no-interval Batth data, or it
will surface the three sign-ambiguous artifacts.

---

## 2. Per-category surfacing

### A. Rate optimization (`tool: "rate-optimization"`)

**Findings rail / mobile sheet** (`shell/findings-rail.tsx` → `finding-card.tsx`):
the standard card — `SeverityBadge`, the `impact` dollar (top-right, whole-dollar via
`formatUsdWhole(centsFromDollars(impactUsd))`), `situation`, `impactNote` (caption), the
`actionLabel` line, and the **trace** button (writes `SURFACE.meter` → opens drawer). For the
real farm the only rate row is the legacy-fleet finding: **no dollar** (it carries `impactNote`
only), `watch` badge, `action.label` "Review the legacy-rate meters".

**Home "Rate Fix" hero** (`rate-fix-card.tsx`): the conversion moment, selected on Home by
`findings.find(f => f.tool === "rate-optimization")`. Inverts the card — pump name + dollar lead,
no severity badge (always an opportunity, never an alarm). The hero dollar is the savings over the
bills on file, **never annualized**; `impactNote` states the true basis. Honesty gate
`analyzed`: when no meter is reconciled yet, a null finding reads "still loading", **not** "every
pump is on its best rate" (the affirmative claim is only honest once analysis was possible). The
`switch_rate` target rides on `rateSwitchTo` off `action.params.toSchedule` — read from the
grounded machine verb, never string-parsed from the label (label copy "Move it to AG-B" never
contains the word "switch").

**Home "What needs a look" list** + **money-found band** (`home-overview.tsx`): each row a
one-line `situation` with a `TypeTag` ("Rate fix") and the dollar only when `impactUsd > 0`.

**Table / Chart / Map**: not a rate-finding surface per se, but the table's **Rate** column
(`RateCell`) is the whole rate-optimization thesis made legible — the code in a green pill with
the plain-English gloss, plus a **Legacy** column flagging AG-4/AG-5. Tracing a rate finding
deep-links to that meter's row/drawer.

**Grammar mapping**: `situation` = `en.rateOptimization.lever.situation` /
`legacyFleet.situation`; `action.kind` = `switch_rate` | `review_rate` | `review_legacy_fleet`;
`action.label` = `en.rateOptimization.action(to)` etc.; `impactUsd` = savings dollars
(`switch_rate` only); `impactNote` = `lever.estimate(...)` (rates used + effective date + billed-day
basis) or `legacyFleet.note()`.

**Honesty gates**: dollar only on a back-test-passing `switch_rate` (the engine refuses to quote
when its model can't reproduce the real bill within tolerance); legacy-fleet and `review_rate`
carry **no** `impactUsd`; the interval artifact path is silent for want of intervals.

### B. Demand-charge exposure (`tool: "demand-charge"`)

**Findings rail / sheet / Home list**: standard `finding-card`. `act` severity (clay left edge)
when a single avoidable day-spike is identified (`impactUsd` present); `info` and **dollarless**
for a flat demand month (kept deliberately so a demand-charged cycle is never silently swallowed).
`TypeTag` is "Spike".

**Meter drawer** (`meter-drawer.tsx`): the richest demand surface. When the latest reconciled
period's `demandCents` is ≥40% of `totalCents`, a plain-language **spike block** renders first —
`en.shell.drawer.spikeHeadline(formatUsdWhole(demandCents))` ("$X set this month's charge"). The
**Demand** money row shows the charge or "None" (honest absence). The meter's own findings list at
the bottom of the drawer repeats the card (minus trace).

**Chart**: demand is **not** in the chart. The chart (`chart.ts` / `chart-lens.tsx`) stacks **TOU
energy dollars only** — peak bucket is `var(--alert)` so an expensive peak-hour stack reads at a
glance, but the demand charge lives in the table and drawer by design.

**Table**: the **Demand** column (`MoneyCell kind="demand"`) shows the latest reconciled demand
charge, or "None" for a reconciled meter with no demand charge, or the coverage treatment when
unreconciled.

**Map**: a high-demand meter shows as a normal pin; `attention` clay is reserved for coverage /
BAD status (see §3), not for a demand dollar.

**Grammar mapping**: `situation` = `en.pumpTiming.retrospective.situation(month, demandChargeUsd)`;
`action.kind` = `review_peak`; `action.label` = the spike-day or month label; `impactUsd` =
avoidable-kW × the bill's own $/kW (outlier only); `impactNote` =
`en.pumpTiming.retrospective.avoidable(...)`. Re-tagged `pump-timing → demand-charge` in `run.ts`.

**Honesty gates**: dollar only when `top.kw > second.kw × (1+margin)` AND a per-kW rate is
derivable; otherwise dollarless info. Demand-charge findings run on **metered, non-solar** pumps
only (solar speaks through the solar checks).

### C. Bill audit (`tool: "bill-audit"`)

**Findings rail / sheet / Home list**: standard `finding-card`. `act` (peak path — dollars
jumped, metered usage did not) or `watch` (no-peak / summary-only path, stricter threshold).
`impactUsd` = the excess over the meter's own same-season median. `TypeTag` is "Bill check".
Copy is honest-framed: "came in higher than its usual month, but its usage did not go up" — never
"PG&E overcharged you."

**Meter drawer**: the audited cycle is visible in the billing detail and **Past cycles** history;
the finding card repeats in the drawer's findings list. The drawer never re-prices the bill (the
audit compares the farmer's own bills, it does not claim the model beats PG&E).

**Table / Chart / Map**: surfaced indirectly — the anomalous month is the tall bar on the chart
and the high **Cost** cell in the table for that meter; trace deep-links there.

**Grammar mapping**: `situation` = `en.billAudit.situation(pump, month)`; `action.kind` =
`audit_bill`; `action.label` = `en.billAudit.action(month)` ("Check the {month} bill");
`impactUsd` = `excessUsd`; `impactNote` = `en.billAudit.impact(excessUsd, month)`.

**Honesty gates**: needs ≥3 comparable same-season cycles for a stable median; the no-peak path
is stricter (`noPeakBillTolerance` default 0.5) and drops to `watch` because without a peak it
cannot rule out a genuine high-usage month.

### D. Solar / NEM (`tool: "solar"`)

**Findings rail / sheet** (`finding-card.tsx`, the **G-2 honest-dollar separation guard**): a
solar finding may carry **exactly one** honest dollar — the F2 demand-charge gap — and it rides in
`impactNote`, never `impactUsd`, because it is a charge already printed on the bill (money owed),
not a net-metering credit. `isSolarBillingFinding(finding)` (true iff
`tool === "solar" && actionKind === "review_solar_demand"`) fronts that note with an **"On your
bill"** chip in its own bordered block so the card can never be misread as "solar saved you X".
The chip is gated on the unique `action.kind`, **not** on `severity === "info"` — the legacy
`track_trueup` info finding (still live on the demo/Tour) is a net-metering message and must not
get the billing chip. `TypeTag` is "Solar".

**Solar tab data hero** (`solar-dashboard.tsx` → `solar-surface.tsx`): the Arrays / Calendar /
Map / Table lenses, a KPI strip with **no dollar tile**, and a five-dimension filter bar
(entity / ranch / rate / account / program). The solar dataset reads per-cycle summaries only,
never an interval series.

**Meter drawer, Solar section** (`meter-drawer.tsx`, `solar` mode): program (plain words),
true-up month, nameplate, arrays, **allocation %** (usage-proportional share, whole percent),
grandfather position, and the printed NEM facts. The credit dollar row reads **`Credit:
creditNotOnFile`** — **honest-blank** until a true-up statement is on file. The **floor** block
("On your bill" chip) groups demand + service + non-bypassable charges that solar categorically
does not offset, visually separated from the net-metering rows. Owner/manager get the
`StatementUpload` affordance (`canAttach`); a viewer / the Tour never see it.

**Map (solar lens)**: pins may carry an additive `trueUpSoon` ring — a **timing** signal, never a
dollar.

**The P031 / VINES 75HP $62,795.65 true-up specifically**: it surfaces as the drawer's printed
NEM rows — `trueUpAmountCents` / `nemChargesCents` via `signedUsd` (a credit said in words) and
the honest-blank `Credit` row — **never as banked or recoverable dollars**. The $0–$57k recovery
is contingent on the Generation Allocation Summary (arrays may be oversubscribed = zero-sum), so
nothing in the UI presents it as money in hand. It is correct to show it as a printed statement
fact and an honest-blank credit, not as an `impactUsd` finding.

**Grammar mapping**: `situation` = `en.solar.demandPeak.situation` / `en.solar.trueUp.situation`;
`action.kind` = `review_solar_demand` (live F2) / `review_solar_peak`, `track_trueup` (demo);
`impactUsd` = **never** (the one honest dollar is in `impactNote` = `en.solar.demandPeak.impact`).

**Honesty gates**: net-metering credits stay honest-blank until a statement settles them; the one
billing dollar is chipped "On your bill"; the floor block is labeled and separated; nameplate
renders cautiously until `solarLayoutVerifiedAt` is set.

---

## 3. The data hero surfaces, independent of findings

### Map pin attention state (`src/lib/dashboard/map.ts`, `meter-map.tsx`, `map-lens.tsx`)

`toMapPins` splits `MeterView[]` into located **pins** and an honest **"no location yet" tray**
(never a fake pin; exact (0,0) is treated as unfilled, not the Gulf of Guinea). Each pin:

- **`attention: boolean`** = `coverageState === "needs_review" || status === "BAD"`. Attention pins
  draw clay (`var(--alert)`); calm pins draw green (`var(--primary)`). Color is always paired with
  the legend label "Needs a look" / "Looks good". **Attention is a coverage / pump-health signal,
  not a dollar-at-risk signal** — there is no $-at-risk pin model.
- **`latestBillCents: number | null`** = the latest printed bill, but **only when
  `coverageState === "reconciled"`** (AR-15). Otherwise null → a status dot, never a fabricated
  number. This is the floating map label.
- **`trueUpSoon?`** (solar map only) = a quiet ring, a timing signal, never a hue or a dollar.

### Excel-style table (`src/lib/dashboard/table.ts`, `meter-table.tsx`)

One row per meter; filter by entity/ranch/rate (+ account/program on solar); sortable; one-click
CSV of exactly the filtered+sorted rows. The money columns are the honesty crux:

- **Cost / Demand cells** carry a figure **only when `coverageState === "reconciled"`**
  (`toMeterRow` sets `costCents`/`demandCents` to null otherwise). An unreconciled meter renders
  the **coverage treatment** (`coverageLabel`), never a fabricated `$0`. A reconciled meter with
  no demand charge renders **"None"** (honest absence, distinct from withheld).
- **Rate** in a green pill + gloss; **Legacy** flag; **Status** clay chip + verbatim word for a
  flagged-BAD pump; **Coverage** pill.
- Row click writes `SURFACE.meter` → opens the drawer (the same seam a finding's trace uses).

### Chart (`src/lib/dashboard/chart.ts`, `chart-lens.tsx`)

One TOU-stacked bar per **billing cycle** (UTC month of close), summing TOU **energy** dollars
across **reconciled** meters in view (a 183-meter account reads as ~12 monthly bars). Demand and
other charges are excluded by design (they live in the table/drawer). YoY compare degrades
honestly — disabled with a plain caption until a prior year of bills exists; it never fabricates a
baseline. `metersWithoutTou` is captioned, not rendered as zero bars.

### Meter drawer (`meter-drawer.tsx`) — the shared drill-in

Opened by the `?meter=` nuqs key from any table row / map pin / finding trace. Every dollar arrives
**pre-gated by `toDrawerDetail`** (`src/lib/dashboard/drawer.ts`): unreconciled → inventory +
coverage state, never a number. Carries the billing detail, the demand spike block, the bill-accuracy
**verified** badge (only on a positive recompute match, `verificationFor` — fail-closed, never a
negative claim), the solar section (§2D), the "What happened" tracked-results section
(predicted-vs-realized, pending until a bill posts), and the meter's own findings list.

---

## 4. The two account-scope facts the demo must keep honest

- **Solar arrays total 1,932 kW (840 + 1,092)**, not 12,180 kW. The drawer's **Nameplate** and
  **Arrays** rows read `solarKw` / `benefitingArrays[].nameplateKw` straight off the meter; the
  solar KPI strip carries no dollar tile. Keep the seed/inventory nameplate at 1,932 kW so the
  cautious-nameplate render and the array list both read true.
- **Coverage scope**: the bill account `4699664587-8` covers ~46 metered SAs (reconciled), while
  the Excel inventory is 183 meters across ~57 accounts / ~6 entities. The honesty machinery makes
  this legible automatically: the ~46 reconciled meters render real Cost/Demand/chart bars; the
  rest render the coverage treatment (needs_review / no_bill) and clay map pins — never fabricated
  dollars.

---

## 5. The Tuesday demo click-path → components

1. **Land on Home (`/` → `HomeOverview`)** — the no-scroll bento. The grower sees, at a glance:
   - **Money-found band** + **Savings tile** — the operation-wide total
     (`Σ max(0, impactUsd)`), opportunity count. (`home-overview.tsx`, `MoneyFoundBand`.)
   - **Rate Fix tile/hero** (`rate-fix-card.tsx`) — the biggest single rate opportunity, or the
     honest "still loading" state if nothing reconciled yet.
   - **"What needs a look" list** — the prioritized findings with TypeTags (Rate fix / Spike /
     Bill check / Solar).
   - **Spend graph**, **satellite Map** (`HomeMap` with pins + floating reconciled bills),
     **Calendar** (cycle closes), **Bills** and **Closes** tiles.

2. **Tap a "What needs a look" row** → deep-links `${energyHref}?meter=<id>` → the **Energy
   dashboard** (`energy-dashboard.tsx`) opens with the **meter drawer** on that meter: billing
   detail, the demand **spike block** if applicable, the **verified** badge, and the meter's
   finding card. This is the "show me one pump's money story" beat.

3. **Switch to the Table lens** (`LensToggle` → `MeterTable`) — the Excel bridge. Sort by **Cost**
   or **Demand** (biggest-first), read the **Rate** pills and **Legacy** flags, see unreconciled
   meters honestly withheld. **Export CSV** (one click) for the Excel-brained grower.

4. **Switch to the Chart lens** (`ChartLens`) — the TOU-stacked spend-over-time trend; the peak
   bucket reads in clay. Toggle **YoY** if a prior year exists (degrades honestly otherwise).

5. **Switch to the Map lens** (`MapLens`) — pins colored by **attention** (coverage needs_review /
   BAD = clay; calm = green), reconciled bills floating, and the honest **"no location yet" tray**.
   The legend pairs every color with its word.

6. **The persistent findings rail** (`FindingsRail`, desktop) / **findings sheet** (mobile) is
   present the whole time on the right — calm, secondary to the data hero, one card per pending
   finding with situation + action + impact + the one-tap done/dismiss response (hidden read-only
   on the Tour / for viewers).

7. **Open the Solar tab** (`/solar` → `SolarDashboard`) — the Arrays / Calendar / Map / Table
   lenses, the no-dollar KPI strip, and a meter's drawer Solar section: program, **1,932 kW**
   nameplate, arrays, allocation %, the **floor "On your bill"** block, and the **honest-blank
   credit** rows. The VINES 75HP true-up shows as a printed NEM statement fact, never as banked
   recovery.

Throughout, the guardrails the demo must not trip: **no dollar renders unless
`coverageState === "reconciled"`**; the three interval rate-opt artifacts never appear (the
emitter is silent for want of intervals); net-metering credits stay honest-blank; the one solar
billing dollar is always chipped "On your bill"; and money is shown as the story, not a lone
screaming hero number.
