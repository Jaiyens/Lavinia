# Meters tab: build notes

A new top-level **Meters** agent (beside Energy, which is left completely untouched): a per-meter
demand-risk board that makes PG&E demand exposure obvious at a glance and flags a meter about to
cost more. This file records the decisions made while building it (the user was away; at each fork
I picked the most reasonable option and kept going).

## The one concept the board is built around

PG&E bills a demand charge on the **single highest 15-minute window of the billing cycle,
SEPARATELY PER METER**. What matters is not how much a meter draws but how close it is to beating
its **own** peak-so-far this cycle. So the board's hero number per meter is the **gap**
(headroom = peak-so-far minus current draw), color-coded by how close it is to closing. A pump at
180 kW that already peaked at 200 is SAFE (ceiling set); a pump at 145 kW under a 150 ceiling is
DANGEROUS. The representative dataset includes both cases plus one meter already over its ceiling
(setting a new peak right now).

## Hard constraints, and how they are honored

- **Never pool meters.** Every kW / headroom figure is per-meter only. `risk.ts` has no function
  that takes more than one meter's kW and returns a kW. `MeterGroup` (group.ts) has, by
  construction, **no kW field** - only summed dollars and an at-risk count. A test asserts the
  group object never grows a `peakKw` / `currentKw` / `headroomKw` key.
- **Groups are organizational, not billing units.** A group shows summed dollars (locked demand,
  cross-peak exposure) + an at-risk **count**, and its risk indicator is its **worst** meter
  (`worstLevel`), never an average. No group-level kW or distance-to-peak.
- **No farm-wide distance-to-next-peak.** The top tile's only farm-wide figures are dollar
  roll-ups (sums of independent per-meter charges) and counts. `BoardSummary` has no `farmKw` /
  `distanceToPeakKw` (asserted in board.test.ts).
- **Stagger advice only within ONE meter.** The detail view shows the "spread its own overlapping
  runs apart" note for a pump (one meter), and an explicit "running this meter at the same time as
  another meter has no effect" note otherwise. The daily-risk read never emits cross-meter stagger
  advice (asserted in read.test.ts).

## The ~1-day interval lag

Interval data lags about a day, so the board never shows a draw as "live":

- Every `MeterSnapshot.currentKw` carries `currentAsOf`, the real past instant it is from (the
  generator sets it to ~26h before the reference "now").
- The feed carries one `asOf` freshness stamp; the header renders "Latest meter reads from about
  1 day ago" in a `<time datetime>` element, and **every** meter tile repeats "reading from about
  1 day ago" under its current-draw figure.
- `freshnessPhrase` never returns "live" / "now"; the smallest phrase is "about 1 hour ago".

## The V2 seam (structured, not built)

The board depends only on the **`MetersFeed`** interface (`types.ts`): `load()` returns per-meter
interval snapshots + a freshness `asOf`. The representative generator (`generate.ts`) implements it
now; a live Share My Data feed implements the same interface later with **zero board changes**. The
clear marker is in `generate.ts`:

```
// ============================== LIVE DATA GOES HERE ==============================
```

The `$/kW` demand rate is **resolved by the feed**, server-side, from the shared rate card
(`rate.ts` -> `loadRateCard`), and stored on each snapshot as `dollarsPerKw`. This keeps the
risk/demand math pure and client-safe (no `node:fs` in the browser bundle) and means a live feed
resolves dollars the same way. Demand dollars therefore use the **same rate card as the rest of the
app** - never a hardcoded `$/kW`.

## Dynamic grouping + persisted manual corrections

`resolveGroupName` (group.ts) derives a group with this precedence:
1. a **manual correction** the farmer made (persisted),
2. the source's explicit `group` field (the Shop uses this to exercise the path),
3. inferred from the meter **name** ("Avenue 7 Pump 3" -> "Avenue 7"),
4. physical **proximity** from lat/lng (a coarse ~1 km cell),
5. "Ungrouped" as the honest last resort.

The farmer can **move** a meter to another group (or a new one) and **rename** a group; both write
an override keyed by meter id into `localStorage` (`terra.meters.group.overrides.v1`, mirroring how
the Home bento order persists). Because grouping is recomputed from the data every render and only
explicitly-moved meters carry an override, **a later upload slots new meters into existing groups
without wiping manual fixes** (a test re-runs `buildGroups` with the same override map and confirms
the meter stays re-slotted). A "Reset grouping" affordance clears the overrides.

## Decisions made at forks

- **Foundation availability.** The prompt said the base contains the shared energy foundation
  (`load-shape.ts` etc.), but this worktree was branched one commit before it landed on
  `kamran-apn`. I cherry-picked that foundation commit as a separate prerequisite commit so the
  imports are real, then built the feature on top (the feature commit is clean).
- **Risk color bands.** Chosen against the brief's two anchor cases: 180/200 (10% headroom) must
  read SAFE and 145/150 (3.3%) must read DANGER. So **watch** begins under 8% headroom and
  **danger** under 4% (config.ts `RISK_CONFIG`). A meter at/over its old peak is always danger.
- **Cross-peak dollar consequence.** Priced as a believable small new peak (current draw + 8%
  overshoot) above the current ceiling, times the meter's `$/kW` - the added demand dollars, not an
  unbounded figure (config.ts `CROSS_PEAK_ASSUMPTION`).
- **Billing cycle.** The representative cycle is the calendar month containing "now" (a reasonable
  demo boundary; a live feed carries each meter's real serial-code cycle).
- **Weather for the daily read.** Defaults to a hot afternoon so the high-risk read shows on first
  load; a live build feeds a real forecast hint into `dailyRiskRead`.
- **Collapsed by default.** Groups whose worst meter is safe start collapsed so quiet blocks fold
  away; at-risk groups start expanded.
- **Server vs client split.** The page is a **server component** that pulls the feed (reads the
  card via `node:fs`) and hands resolved snapshots + the reference clock to the client board, so
  nothing fs-bound reaches the browser. The client barrel (`index.ts`) deliberately does **not**
  re-export `generate.ts` / `rate.ts`.

## Where things live

- Pure tested logic: `src/lib/meters/` - `config.ts` (thresholds), `types.ts` (the feed seam),
  `risk.ts`, `group.ts`, `read.ts`, `board.ts`, `curve.ts`, `rate.ts` (server-only $/kW), and the
  representative `generate.ts`. Vitest: `*.test.ts` (34 tests, all pure - no Postgres).
- UI: `src/app/(app)/_components/meters/` - `meters-board.tsx` (client orchestrator + localStorage),
  `top-tile.tsx`, `group-card.tsx`, `meter-tile.tsx`, `meter-detail.tsx`, `risk-style.ts`.
- Copy: `src/copy/en.ts` under `en.meters` (+ the one `en.shell.agents.meters` label).
- Routes: `src/app/(app)/(dashboard)/meters/page.tsx` and `src/app/tour/meters/page.tsx`
  (force-dynamic). Nav registration in `src/app/(app)/_components/shell/agents.ts`.

## Tests run

`src/lib/meters/*.test.ts` were run via a throwaway temp vitest config (no Postgres globalSetup,
since the repo's default config spins up a cluster for `*.db.test.ts`). 34 tests pass. Typecheck +
lint are clean. A production build succeeds and `/meters` + `/tour/meters` both render (verified in
a real browser against a locally-seeded demo DB; `/meters` correctly auth-redirects to `/login`).
