---
baseline_commit: ccbc2a2ed58c90ac84168314ccf2ea9a5bccdf70
---

# Story 3.1: Recommendation feed, findings rail, and finding card

Status: done

## Story

As a grower,
I want findings shown calmly beside my data, each with a plain situation, one action, and a dollar number,
so that I can act on what is costing me without the screen turning into a to-do list.

## Acceptance Criteria

1. **Given** the findings rail (desktop) / bottom sheet (mobile), **When** rendered, **Then** recommendations render in the grammar (situation + action + impactUsd?/impactNote? + severity + status + result?), secondary to the dashboard, in the feed and the relevant meter's drawer, never as a home hero card.

2. **Given** a finding card, **When** rendered, **Then** it shows the situation, one concrete action, the dollar impact (num-tabular), severity, and a one-tap response; v1 records status and shows the after-the-fact result, never executing.

3. **Given** severity, **When** rendered, **Then** act = alert accent, watch = typography only, info = muted; no new severity color.

4. **Given** a finding focus, **When** activated, **Then** it highlights the meter's map pin / table row, tracing to data visible on the dashboard.

5. **Given** a finding with no dollar impact and no impactNote, **When** evaluated, **Then** it is not shown; **Given** no findings, **Then** the rail reads "Nothing needs you right now"; all copy lives in `/copy`.

### AC interpretation notes (read before coding)

This story ships the findings SURFACE (FR-13 / UX-DR14 / UX-DR15): the rail, the mobile sheet, the drawer section, and the finding card with its one-tap response. It does NOT build or rebuild any lever - 3.2-3.4 own the engines. The data source is the `Recommendation` TABLE for the dashboard farm, read as-is.

- **Data reality (probed 2026-06-09 in dev.db):** the REAL account (isDemo=0, what `dashboardFarm()` returns) has ZERO Recommendation rows - the live rail renders the calm empty state, which is the honest day-one truth (same law as 2.9's zero-pin map). The demo seed carries 10 pending recs created by the LEGACY engines (`runEngines` in `src/lib/recommendations/run.ts`, called from `prisma/seed.ts`): rate-optimization (4), solar (4), demand-charge (1), bill-audit (1). Those rows conform to the grammar and render fine; do NOT touch the legacy engines, do NOT call `runEngines` on the real farm, and do NOT surface anything new from the demoted coincident-peak lever.
- **Meter linkage:** `Recommendation` has no pump column; per-meter recs carry `action.params.pumpId` = the Pump cuid, which is exactly what the nuqs `meter` key holds (the drawer matches `m.id === meterId`). Extract `meterId` from `action.params.pumpId` when it is a string; the fleet-level finding (`review_legacy_fleet`, `params.pumpIds` array) and any malformed action yield `meterId: null` and simply render without a trace target. Narrow the Prisma `JsonValue` safely (no `any`; `noUncheckedIndexedAccess` is on).
- **Finding focus = the existing drill-in (AC4):** tapping a finding card's trace affordance sets the canonical `meter` key (NO new query param - nuqs law). That opens the shared 2.5 drawer AND the lenses highlight the open meter: the table row whose `m.id` equals the open `meter` key gets `aria-current` + a visible tint; the map pin for that meter gets an emphasized ring. Both islands already write `meter`; they now also read it. Color is never the only signal (aria-current / aria-label carry the state).
- **One-tap response (AC2):** two responses on a pending card - "Done" -> status `done`, "Not now" -> status `dismissed` (both set `resolvedAt`). `overridden` stays in the grammar but gets no button here (the legacy pump-timing surface used it; this surface does not need it yet). The mutation is a Server Action in NEW `src/app/(app)/actions.ts` returning the discriminated `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }` (AR-11 - do not throw for expected failures; the legacy void-throwing `src/app/dashboard/pump-timing/actions.ts` is NOT the pattern and must not be imported). Verify the rec belongs to the dashboard farm before updating; `revalidatePath("/")` after. The rail shows `pending` findings; a resolved card leaves the rail on revalidate. When a row carries `result` (Epic 4 populates it), render its note/number on the card - the seam exists, 4.2 owns the predicted-vs-realized presentation.
- **Visibility + order (AC5):** a finding with `impactUsd === null` AND `impactNote === null` is filtered out in the pure mapping, not in JSX. Sort with the EXISTING `compareFindings` (`src/lib/recommendations/top-finding.ts`: severity rank desc, then impactUsd desc) - do not reinvent it.
- **Money display:** `Recommendation.impactUsd` is legacy Float DOLLARS, not cents - do NOT migrate the column and do NOT present cent precision (savings estimates are never cent-exact per 3.3). Render via the shared formatter (`formatUsd(Math.round(usd * 100))` or an approx variant in `/lib/format`), `tabular-nums`, e.g. "$13,645". The sheet summary uses a compact form ("~$34k").
- **Mobile sheet summary (closes deferred-work line "2-2: ~$X segment"):** `findingsSummary` grows the at-risk segment per DESIGN.md - "3 findings · ~$34k up" (sum of visible findings' impactUsd; omit the segment when the sum is 0/absent). Plain words, no em dashes, no exclamation.
- **Where data loads:** `(app)/layout.tsx` is a Server Component mounting `<FindingsRail />` / `<FindingsSheet />`; make it async and load findings there (dashboardFarm -> findings edge). `energy-dashboard.tsx` separately loads them for the drawer. Both run in the same request; either call the edge twice (SQLite, cheap) or wrap it in React `cache()` - dev's choice, keep it simple. `revalidatePath("/")` re-renders the layout, so the rail refreshes after a one-tap response.

## Tasks / Subtasks

- [x] **Task 1: Pure finding view-model + DB edge** - `src/lib/dashboard/findings.ts`: `FindingView = { id, situation, actionLabel, impactUsd: number | null, impactNote: string | null, severity: Severity, status: RecStatus, meterId: string | null, meterName: string | null, result: { note } | null }` (import `Severity`/`RecStatus` from `@/lib/recommendations/types`, never re-declare). Pure `toFindingViews(rows)`: safe-narrow `action` Json (label + params.pumpId), drop no-impact-no-note findings, sort via `compareFindings`; `meterName` resolved from the meters list when available. DB edge `loadFindings(prisma: PrismaClient, farmId: string)` querying `status: "pending"` recs. Colocated `findings.test.ts` for the pure part: visibility filter, pumpId extraction, malformed-action tolerance (meterId null, label fallback from `/copy`), sort order, purity. (AC1, AC5)
- [x] **Task 2: FindingCard** - `src/app/(app)/_components/finding-card.tsx` (client): situation line (body-md), one concrete action label, dollar impact in `type-num tnum` (impactNote when no $), reused `SeverityBadge` (`src/components/ui/severity-badge.tsx` - act carries the alert accent on the card edge, watch/info stay type-only/muted per spec), result line when present, and the one-tap responses (Done / Not now) calling `resolveFinding` via `useTransition` with pending state. A trace affordance (the card body / a labeled button) sets the nuqs `meter` key when `meterId` is present; cards without a meter render without it. Tap targets >= 44pt; every control labeled role + state. (AC2, AC3, AC4)
- [x] **Task 3: Server action** - `src/app/(app)/actions.ts`: `resolveFinding(id, response: "done" | "dismissed"): Promise<ActionResult<null>>` - resolve the dashboard farm, verify the rec belongs to it, update status + resolvedAt, `revalidatePath("/")`; expected failures return `{ ok: false, error }` with a `/copy` string. Define and export the `ActionResult<T>` union here (first (app) action). (AC2)
- [x] **Task 4: Populate the three surfaces** - `findings-rail.tsx` renders the card list (empty state unchanged when none); `findings-sheet.tsx` takes the findings, peek summary = count + "~$X up" segment, expanded body = the same cards; `(app)/layout.tsx` goes async and feeds both. `meter-drawer.tsx` findings seam: replace the placeholder with that meter's cards (match `meterId === m.id`; keep `findingsEmpty` for none; no trace affordance inside its own drawer). `energy-dashboard.tsx` passes findings to the drawer. The rail stays secondary: no findings content anywhere in the KPI strip or hero. (AC1, AC2)
- [x] **Task 5: Highlight the trace target (AC4)** - `meter-table.tsx`: the row matching the open `meter` key gets `aria-current="true"` + a visible tint (token-only); `map-lens.tsx`: the matching pin's marker element gets an emphasized ring + its aria-label notes it is open. Both keep writing `meter` exactly as today; lens switching must not drop filter or open meter (existing nuqs law - verify, do not rework). (AC4)
- [x] **Task 6: Copy** - extend `src/copy/en.ts` `shell` namespace: findings card strings (response labels Done / Not now, trace aria fn (meter name), resolved/pending action feedback, unreadable-action fallback label), `findingsSummary(count, atRiskUsd?)` with the compact dollar segment. Plain operator English; no em dashes, no exclamation marks; never kW/jargon. (AC2, AC5)
- [x] **Task 7: Tests + validate** - findings.test.ts green; lint + tsc + full vitest green. Browser-verify on the real account: rail + sheet show the calm empty state (AC5). Then insert a TEMPORARY pending Recommendation row for the real farm (situation + action JSON with a real pump cuid + impactUsd + severity act), verify: card renders in the rail with clay accent + tabular dollars; trace tap sets `?meter=` (drawer opens, table row highlighted, map pin ringed); drawer shows the card under Findings; "Done" records status and the card leaves the rail; sheet summary reads "1 finding · ~$X up". DELETE the temp row and verify the db is restored (the 2.9 temp-data pattern - state it honestly in the Dev Agent Record). (AC1-5)

### Review Findings

- [x] [Review][Patch] An exception from the resolveFinding invocation itself (offline, timeout) escapes the transition to the error boundary instead of the card's inline error [finding-card.tsx]
- [x] [Review][Patch] resolveFinding check-then-update is not atomic (two card instances of the same finding can interleave and overwrite each other's response) and `id` is not runtime-checked like `response` is [actions.ts]
- [x] [Review][Patch] revalidatePath("/") is page-scoped: responding from /energy leaves the rail/sheet/drawer stale until navigation, and a second tap shows a false "did not save" [actions.ts]
- [x] [Review][Patch] Unknown stored status coerces to "pending" (fail-open: a corrupted row resurrects as actionable); severity's fallback fails safe but status should fail closed [findings.ts]
- [x] [Review][Patch] A whitespace-only situation renders a card with a blank narrative line (impactNote/label are trimmed, situation is not) [findings.ts]
- [x] [Review][Patch] findingsAtRiskUsd has no sign guard (one negative impact deflates the "~$X up" sum) and a sub-cent positive sum renders "~$0 up" [findings.ts, findings-sheet.tsx]
- [x] [Review][Patch] Every `meter` key change tears down and rebuilds all map markers (~183 at Batth scale) just to move one ring, dropping keyboard focus mid-interaction; the ring also replaces the pin's elevation shadow instead of stacking; the open pin's aria-label does not note the open state (Task 5 wording) [map-lens.tsx]
- [x] [Review][Patch] MeterDrawer's findings prop is optional with a [] default: a future call site that forgets it silently renders the calm "Nothing needs you" line over real findings [meter-drawer.tsx]
- [x] [Review][Patch] Both response buttons read "Saving" while one request is in flight, with no aria-busy, so the grower cannot tell which response is being recorded [finding-card.tsx]
- [x] [Review][Patch] Misleading comments: "This meter's pending findings" where the farm's findings load, and the load-bearing-looking orderBy that is only a stable-sort tiebreaker [energy-dashboard.tsx, findings.ts]
- [x] [Review][Patch] Sort order with null-impact (note-only) findings is untested; pin that the comparator treats null as 0 [findings.test.ts]
- [x] [Review][Defer] resolveFinding has no caller-identity check; the (app) group has no auth surface until Epic 5 (5.1 gates it) — deferred, owned by 5.1 [actions.ts]
- [x] [Review][Defer] A result carrying numbers but no note renders nothing in the result slot — deferred, 4.2 owns predicted-vs-realized presentation [finding-card.tsx]
- [x] [Review][Defer] Findings load twice per request (layout + page) from two snapshots — licensed by the story ("call the edge twice, keep it simple"); React cache() micro-opt when more (app) routes exist [layout.tsx]

## Dev Notes

### Scope boundary

- **No lever work.** 3.2 (tariff fixture), 3.3 (rate lever), 3.4 (solar insight) produce the real findings; 3.5-3.7 add the calendar/pump-health/DR surfaces. This story renders whatever grammar-conformant rows exist.
- **No engine rewiring.** `runEngines` / `run.ts` and the legacy `/dashboard/pump-timing` route stay untouched (they read the legacy interval/billing fields and serve the old surface until replaced).
- **No schema change.** `Recommendation` is used as-is (`impactUsd` Float dollars, `action`/`result` Json, severity/status String unions).
- **No execution.** `action.execute` stays null-respected; v1 displays and records only.
- **Result presentation** beyond a simple inline line is 4.2.

### What exists to build on

- **`src/lib/recommendations/types.ts`** - the grammar verbatim (`Severity`, `RecStatus`, `RecommendationAction`, `RecommendationResult`). **`top-finding.ts`** - `compareFindings` / `SEVERITY_RANK` (reuse, tested).
- **`src/components/ui/severity-badge.tsx`** - the DESIGN.md severity treatment already built and token-correct (act = alert-container, watch = weight only, info = muted) with labels from `en.ui.severity`. Reuse; do not restyle.
- **`src/app/(app)/_components/shell/findings-rail.tsx` + `findings-sheet.tsx`** - the placeholder shells (rail: sticky 320px aside; sheet: peeking bottom bar with `findingsSummary(count)` already wired). **`meter-drawer.tsx` lines ~342-344** - the labeled findings seam with `t.findingsHeader` / `t.findingsEmpty`.
- **`src/lib/dashboard/load.ts`** - `MeterView` (`id` = Pump cuid, `name`), `loadDashboard`; **`energy-dashboard.tsx`** - the server component that feeds KPI strip / lens region / drawer. **`src/lib/onboarding/farm.ts` `dashboardFarm()`** - farm resolution (real outranks demo).
- **nuqs pattern:** `useQueryState("meter")` directly (see `meter-drawer.tsx:92`, `map-lens.tsx`, `meter-table.tsx`); canonical keys only (`lens|entity|ranch|rate|meter`).
- **`src/lib/format.ts`** - `formatUsd(cents)`; money formatting lives here, never inline.
- **Tokens:** `--alert` / `alert-container` (act accent), `--primary`, `--outline-variant` hairlines, `--radius-lg` on the card, `type-num tnum` for dollars, 44px tap floor. Three colors max per screen.
- **DB edge convention:** takes an explicit `PrismaClient` (see `load.ts`, `run.ts`); app code uses the singleton `src/lib/db.ts`.

### Critical guardrails

1. **The rail is calm, never a to-do list.** Findings are secondary; nothing findings-related enters the KPI strip or becomes a hero card (AC1). Empty state is the existing copy, never an apology or a fabricated count.
2. **No-impact findings are invisible (AC5)** - filtered in the tested pure function.
3. **Canonical keys only.** The trace writes `meter`; no new query param for highlight state.
4. **ActionResult, not throw** for expected failures (AR-11); farm-ownership check before the update (a rec id arrives from the client).
5. **No new severity color; tokens only; no hex.** act = clay accent, watch = typography, info = muted - exactly the badge + an edge accent.
6. **Copy in `/copy`**; grower language; no em dashes/exclamations; dollar phrasing concrete ("$13,645", "~$34k up").
7. **TS strict + no-`any` + `noUncheckedIndexedAccess`** - the Json narrowing is the trap; write a small typed narrowing helper, not casts. (`as unknown as Prisma.InputJsonValue` is for WRITES only, per run.ts.)
8. **Pure derivations tested; islands render/wire only.** New math-free mapping still gets its colocated `*.test.ts` (it is the findings trust surface).
9. **Zero external calls; demo/real never merge** - findings load for the resolved dashboard farm only.
10. **A11y:** cards and responses are real buttons >= 44px; severity readable without color; the trace announces its meter; `aria-current` on the highlighted row.

### Previous story intelligence (2.9 / 2.8)

- **Temp-data verification pattern (2.9):** the real account lacks the data class under test (there: coordinates; here: recommendations) - verify end-to-end by inserting temporary real-farm rows, exercising the UI, then reverting and confirming restoration. Record it honestly.
- **Conditional-mount lifecycle (2.8/2.9):** effects/instances bound to conditionally mounted containers must init/cleanup on that mount state - relevant if the sheet body mounts on expand.
- **Honest captions beat silent omission** - the empty rail and the no-meter card states get words, not blanks.
- **react-hooks/refs lint (2.9):** ref writes belong in effects, not render.
- **Gates at 2.9 close:** lint, tsc, 55 files / 374 tests green, browser verification, production build. Match that bar.

### Project Structure Notes

- New: `src/lib/dashboard/findings.ts` + `findings.test.ts`, `src/app/(app)/_components/finding-card.tsx`, `src/app/(app)/actions.ts`.
- Modified: `src/app/(app)/layout.tsx`, `_components/shell/findings-rail.tsx`, `shell/findings-sheet.tsx`, `_components/meter-drawer.tsx`, `_components/energy-dashboard.tsx`, `_components/meter-table.tsx`, `_components/map-lens.tsx`, `src/copy/en.ts`.
- Untouched: `src/lib/recommendations/*` (types/compare reused as-is), `run.ts`, legacy `src/app/dashboard/pump-timing/*`, `prisma/schema.prisma`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1] - the five ACs verbatim; FR-13; Epic 3 carries UX-DR14 + UX-DR24.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-13] - feed + drawer placement, never a home hero card; no-impact findings hidden.
- [Source: _bmad-output/planning-artifacts/architecture.md#Implementation Patterns] - recommendation grammar verbatim from `/lib/recommendations/types.ts`; ActionResult shape; nuqs canonical keys; no new severity colors (AR-15); Server Actions + explicit revalidate (AR-11).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md#finding-card, #bottom-sheet] - card anatomy (situation + action + $ num-tabular + severity + one-tap response); sheet peek "3 findings · ~$78k ↑".
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md#findings] - "a finding about Pump 21 highlights its map pin / table row when focused"; the rail is calm by default.
- [Source: src/lib/recommendations/{types,top-finding}.ts; src/components/ui/severity-badge.tsx] - the grammar, the comparator, the badge to reuse.
- [Source: src/app/(app)/_components/shell/{findings-rail,findings-sheet}.tsx; meter-drawer.tsx] - the three placeholder seams this story fills.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] - the 2-2 "~$X" sheet-summary deferral this story closes.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- tsc exit 0; lint clean; npm test -> 56 files / 382 tests green (+7 findings.test.ts, +1 money.test.ts compact case); `npm run build` compiles the production bundle clean.
- Browser-verified via Playwright against the dev server on the REAL account (0 recommendations): rail + mobile sheet both read the calm empty state, zero page errors (AC5). Then the 2.9 temp-data pattern: inserted a temporary pending act-severity Recommendation for real pump P003 (action.params.pumpId = its cuid) and verified the full flow - rail card rendered "ACT | $4,322 | situation | Move it to AG-A | Show P003 | Done | Not now" (clay left edge, tabular whole dollars); "Show P003 on the dashboard" set `?meter=` and opened the 2.5 drawer; the drawer's Findings section showed the same card WITHOUT the trace button; the table row behind carried `aria-current="true"` + tint; mobile sheet summary read "1 finding · ~$4.3k up" and expanded to the card; "Done" recorded status and the rail returned to the empty state on revalidate. Pin ring verified with temporary coordinates on P003 (`?lens=map&meter=...`): 1 pin with `aria-current="true"` and a computed `rgb(26, 26, 23) 0px 0px 0px 3px` ring (the --on-surface token), dropping to 0 after drawer close. Temp rec deleted and coordinates reverted; db confirmed restored (0 recs on the real farm, 0 located pumps).

### Completion Notes List

- **The findings surface is live and honest.** The real account carries no recommendations yet (the levers land in 3.2-3.4), so the live rail/sheet show the calm empty state - the same day-one-truth law as 2.9's pinless map. Cards light up as engine stories persist findings; the demo seed's 10 legacy-engine recs render through the identical path.
- **The visibility law lives in one tested pure function:** `toFindingViews` drops no-impact-no-note findings (whitespace notes count as absent), safe-narrows the `action`/`result` Json without `any` (malformed rows render with the /copy fallback, never throw), extracts the meter linkage from `action.params.pumpId`, and sorts with the existing `compareFindings`. The DB edge queries pending rows only and takes an explicit PrismaClient.
- **One-tap response records, never executes:** `resolveFinding` in the new `(app)/actions.ts` is the first shell Server Action and establishes the AR-11 `ActionResult<T>` shape - farm-ownership + pending checks return `ok:false` with /copy strings; success stamps status + resolvedAt and revalidates "/", so the layout-loaded rail, sheet, and drawer all refresh without the card. `overridden` stays in the grammar, unused here.
- **Trace = the canonical drill-in:** the card's trace button writes only the nuqs `meter` key; the table row (aria-current + container-high tint) and the map pin (charcoal --on-surface ring + aria-current) now read that key, so a focused finding highlights data already visible (AC4) with no new query param and no new hue. The map refit is guarded to actual pin-set changes so re-ringing a pin never yanks the grower's camera.
- **The 2-2 deferred sheet summary is closed:** `findingsSummary(count, compactUsd?)` emits "N findings · ~$X up" from the new lowercase `formatUsdCompact` (cents-in, like every formatter); the segment is omitted when no finding carries a number.
- **Severity discipline held:** the existing SeverityBadge is reused untouched; act adds only the clay left-edge accent on the card; watch/info stay type-only/muted. Dollar impact renders whole-dollar (never cent-precision) via the shared formatters.

### File List

- `src/lib/dashboard/findings.ts` (new) - pure toFindingViews/findingsAtRiskUsd + the loadFindings DB edge.
- `src/lib/dashboard/findings.test.ts` (new) - 7 tests: visibility filter, linkage extraction, malformed-action tolerance, sort, union narrowing + result note, purity, at-risk sum.
- `src/app/(app)/actions.ts` (new) - ActionResult<T> + resolveFinding (farm-checked, revalidates).
- `src/app/(app)/_components/finding-card.tsx` (new) - the grammar card: badge, tabular dollars, action label, result seam, trace button, Done / Not now via useTransition.
- `src/app/(app)/_components/shell/findings-rail.tsx` (modified) - renders the card list; empty state unchanged.
- `src/app/(app)/_components/shell/findings-sheet.tsx` (modified) - findings prop, "N findings · ~$X up" peek, expanded card list.
- `src/app/(app)/layout.tsx` (modified) - async; loads the dashboard farm's pending findings for rail + sheet.
- `src/app/(app)/_components/meter-drawer.tsx` (modified) - optional findings prop; the seam now renders that meter's cards (no trace) or the calm empty line.
- `src/app/(app)/_components/energy-dashboard.tsx` (modified) - loads findings and feeds the drawer.
- `src/app/(app)/_components/meter-table.tsx` (modified) - open-meter row highlight (aria-current + tint) on desktop row and mobile list item.
- `src/app/(app)/_components/map-lens.tsx` (modified) - open-meter pin ring (aria-current + --on-surface ring), refit guarded to pin-set changes, shared refit helper.
- `src/lib/format/money.ts` / `money.test.ts` (modified) - formatUsdCompact (lowercase compact dollars) + tests.
- `src/copy/en.ts` (modified) - shell.findings card strings; findingsSummary grows the at-risk segment.

## Code Review (2026-06-09)

Adversarial review (Blind Hunter diff-only + Edge Case Hunter with repo access + Acceptance Auditor against the spec) against baseline ccbc2a2. The auditor re-ran the gates independently (tsc clean, 382 tests green at review time) and passed all five ACs: visibility law in the tested pure layer, canonical `meter` key only, no new severity color, whole-dollar money via shared formatters, copy in /copy, legacy engines/schema untouched, findings never a hero card.

Triage of 26 raw findings: 11 patches applied, 3 deferred with record, 4 dismissed with reason (trace-dead-on-other-routes was false - both (app) routes render the dashboard; the comparator already null-guards impact, now pinned by a test; the mobile drawer (z-50) covers the sheet (z-30) and closing returns to it with state intact per the drawer contract; FindingView's `resultNote` is the spec's `result.note` flattened, functionally equivalent).

Patches: uncaught action-invocation rejection now lands in the card's inline error (try/catch); `resolveFinding` is atomic (`updateMany` gated on farm + pending in the WHERE - two card instances can no longer overwrite each other's response), runtime-checks `id`, treats an already-resolved tap as settled, and revalidates the LAYOUT so responding from /energy refreshes the rail/sheet/drawer; unknown stored status now fails closed (`dismissed`, never actionable); whitespace-only situations are dropped in the pure layer; the at-stake sum ignores negative impacts and the sheet gates its segment on whole cents; the map highlight toggles ring + aria in place on live markers (no ~183-marker teardown per drawer toggle, no keyboard-focus loss), the ring stacks over the elevation shadow, and the open pin's label notes "Its detail is open"; the drawer's findings prop is required; per-response "Saving" labels + aria-busy; two misleading comments fixed; null-impact sort order pinned by test.

Deferred with record (deferred-work.md): caller-identity on (app) Server Actions (5.1 owns auth), numeric result rendering when `note` is absent (4.2 owns predicted-vs-realized), and the double findings load per request (licensed; React cache() when more routes land).

Post-review validation: tsc exit 0, lint clean, 56 files / 384 tests green (+2 review tests), `npm run build` clean, browser re-verified (in-place pin ring with stacked shadow + open-state label, ring drops on close without rebuild, resolve from /energy refreshes the layout-loaded rail; temp data reverted, db restored).

## Change Log

- 2026-06-09: Code review - 11 patches (action error path, atomic + layout-revalidating resolve, fail-closed status, situation guard, sign-guarded at-stake sum, in-place map highlight + stacked ring + open-state label, required drawer prop, per-response saving labels, comment honesty, sort test), 3 deferred with record, 4 dismissed with reason. lint + tsc + 384 tests + production build + browser re-verification green. Status -> done.
- 2026-06-09: Implemented Story 3.1 - the findings surface (rail, mobile sheet with at-risk peek, drawer section, finding card with one-tap response recording via the first (app) Server Action; trace-to-meter highlights on table row and map pin via the canonical `meter` key). Honest empty states on the real account; visibility/sort law in a pure tested module. lint + tsc + 382 tests + production build + browser verification (incl. temp-rec and temp-coordinates passes, reverted) green. Status -> review.
