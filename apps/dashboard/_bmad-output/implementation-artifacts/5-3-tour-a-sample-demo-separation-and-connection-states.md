---
baseline_commit: 9d32032749f4e20703043fcae2c5d5990017b889
---

# Story 5.3: Tour a sample, demo separation, and connection states

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a prospective grower or investor,
I want to tour a representative dashboard and, once connected, see honest connection states,
so that I can judge the product immediately and never see a blank or a faked screen.

## Acceptance Criteria

1. **Given** "Tour a sample", **When** selected, **Then** it opens the badged representative dashboard with zero commitment.

2. **Given** representative/demo data, **When** rendered, **Then** a persistent "Representative data" badge shows; a connected real farm outranks the seed (`dashboardFarm` resolution) and the two never merge; real financials are never shown to investors.

3. **Given** a live pull pending, **When** rendered, **Then** the header/findings show "PG&E is connecting. Your bills are already in." and the dashboard keeps working on uploaded bills (never blocked on the LOA).

4. **Given** a partial import, **When** rendered, **Then** the dashboard shows what we have, unreadable fields are flagged "Confirm it", the map renders known pins, and unlocated meters list in the "no location yet" tray.

### AC interpretation notes (read before coding)

- **Most of this story is ALREADY built; the job is to close three gaps and verify the rest.** Inventory of what exists (do NOT rebuild): the persistent "Representative data" badge renders in `energy-dashboard.tsx:62-65` when `dataKind === "representative"` (AC2 badge - DONE); `dashboardFarm` already returns the real farm first and falls back to the demo, never merging, one `dataKind` per call (AC2 resolution - DONE); the map already renders only valid pins and lists the rest in a "no location yet" `<details>` tray (`map.ts` `toMapPins`, `map-lens.tsx`) (AC4 map+tray - DONE); the `needs_review` coverage state already withholds figures and shows "Needs review" in the table/drawer/map (AC4 coverage - DONE). The three GAPS this story closes: (1) AC1 - an explicit "Tour a sample" entry that opens the representative dashboard with zero commitment; (2) AC2's "real financials never shown to investors" GUARANTEE for that public tour (pin it to the demo so a real farm can never leak); (3) AC3 - the pending-connection banner; plus a small AC4 "Confirm it" affordance.

- **AC1 "Tour a sample" = a PUBLIC, demo-pinned dashboard (zero commitment = no sign-in, no connect).** "Zero commitment" means a prospect/investor can see the representative dashboard without signing in or connecting anything. So add a PUBLIC route `/tour` (OUTSIDE the `(app)` group so it is not auth-gated; add `/tour` to `isPublicPath` in `auth.config.ts` and confirm the middleware matcher lets it through), and a "Tour a sample" link on the login page (`(auth)/login/page.tsx`) pointing at `/tour`. The tour renders the representative dashboard data hero (the existing `EnergyDashboard`) plus a clear "Connect your farm" CTA back to `/login` (or `/onboarding`).

- **AC2 GUARANTEE - the public tour MUST be pinned to the demo (`isDemo`), never `dashboardFarm`.** `dashboardFarm` prefers the REAL connected farm; if a real farm exists in the DB, a naive public `/tour` would expose that grower's real financials to anyone - exactly what AC2 forbids ("real financials are never shown to investors"). So the tour MUST resolve the demo farm DIRECTLY (`isDemo: true`), never `currentFarm`/`dashboardFarm`. Add a `demoFarm(prisma)` resolver (mirror the demo branch of `dashboardFarm`, `dataKind: "representative"`) and a `loadDashboard(prisma, { demoOnly: true })` option (or a `loadDemoDashboard`) that uses it; thread a `demoOnly` prop through `EnergyDashboard`. Write a test proving `demoFarm` returns the demo EVEN WHEN a real connected farm exists (the no-leak guarantee). The badge already renders for `representative`, so the tour is badged automatically.

- **The tour is READ-ONLY by omission.** Render the `EnergyDashboard` hero (KPI strip + lens toggle + chart/table/map/calendar + the shared drawer) in a minimal PUBLIC layout - do NOT include the `(app)/(dashboard)` shell (agent rail with sign-out, the findings rail with its one-tap `resolveFinding` action, which requires `auth()`). The drawer's display content is fine; just do not wire the authed resolution actions. A prospect looks, they do not act. Keep the page a Server Component; reuse the existing hero unchanged except for the `demoOnly` data source.

- **AC3 pending-connection banner.** When the dashboard farm has a `pge_smd` Connection with `status: "pending"` (a live PG&E pull in flight) AND the farm already has bills loaded (meters with billing data), show a calm banner reading "PG&E is connecting. Your bills are already in." The dashboard already works off uploaded bills (`Pump.billingPeriods`), so it is NEVER blocked on the LOA / the live pull - this banner just makes the in-flight state honest. Read the connection status server-side (in `energy-dashboard.tsx` or the `(dashboard)` layout) and render the banner near the farm header. It must NOT show for the demo (the demo is not "connecting") nor for a fully-active real farm. Copy in `en.ts`; plain operator English, no em dashes, no exclamation marks. This is mostly a future/Bayou state in v1 (the connect flow flips the connection active at confirm), so it is honest-and-ready, proven by a test/fixture rather than the live seed.

- **AC4 "Confirm it" on the dashboard.** The map (known pins) + the "no location yet" tray + the `needs_review` "figures withheld" treatment already satisfy most of AC4. Add the explicit "Confirm it" affordance: a `needs_review` meter (a field we could not read/reconcile) shows a small "Confirm it" label/link in the meter drawer (and optionally the table cell), so the grower knows that meter needs a second look. Reuse the existing `coverageState === "needs_review"` signal; do NOT invent a new state. Keep it text + treatment (not color-only). Copy in `en.ts`. Do NOT blank-fake: an unread field stays withheld with the "Confirm it" prompt, never a fabricated value.

- **Demo separation is a LAW, not a feature - verify it, do not weaken it.** The demo (Batth seed) is `isDemo: true` and is DISPOSABLE synthetic placeholder data (project-context); a real connected farm (`isDemo: false` + active `pge_smd`) outranks it via `dashboardFarm` and the two are separate Farm rows that never merge. This story must NOT change `dashboardFarm`/`currentFarm` ranking or add `userId` filtering (still deferred). The public tour's demo-pinning is the one new separation guarantee. Real financials only ever render to the signed-in owner on the authed dashboard; the public tour only ever renders the synthetic demo.

- **Do NOT regress the auth gate or the onboarding flow.** `/tour` is the ONLY new public route; everything else under `(app)` stays gated (5.1). The login page gains one link. The pending banner and "Confirm it" are additive to the existing dashboard. No schema change. No new ingest. TS strict, no `any`, copy in `en.ts` (no em dashes / no exclamation), Server Components for reads.

## Tasks / Subtasks

- [x] Task 1: Demo-pinned data path (AC1, AC2 guarantee)
  - [x] Add `demoFarm(prisma)` to `src/lib/onboarding/farm.ts`: resolve the latest `isDemo: true` farm with `FARM_INCLUDE`, returning `{ farm, dataKind: "representative" }` or null - NEVER `currentFarm`. (Mirror the demo branch of `dashboardFarm`.)
  - [x] Add a `demoOnly` option to `loadDashboard` (or a `loadDemoDashboard`) in `src/lib/dashboard/load.ts` that resolves via `demoFarm` instead of `dashboardFarm`.
  - [x] DB-integration test: `demoFarm` returns the demo even when a real connected farm exists (the no-leak guarantee); `loadDashboard({demoOnly})` projects the demo's meters with `dataKind:"representative"`.

- [x] Task 2: The public Tour route (AC1)
  - [x] New `src/app/tour/page.tsx` (OUTSIDE `(app)`): a Server Component rendering the representative dashboard hero (`<EnergyDashboard demoOnly />`) in a minimal public wrapper, with a "Connect your farm" CTA linking to `/login`. No agent rail, no findings-resolution actions.
  - [x] Thread a `demoOnly?: boolean` prop through `EnergyDashboard` (`src/app/(app)/_components/energy-dashboard.tsx`) so it loads via the demo path; the badge already renders for `representative`.
  - [x] Public access: add `/tour` to `isPublicPath` in `src/lib/auth.config.ts`; confirm the middleware matcher does not block it and an UNauthenticated request to `/tour` returns 200 (not a redirect to `/login`).
  - [x] Add a "Tour a sample" link on `src/app/(auth)/login/page.tsx` -> `/tour`. Copy in `en.ts`.

- [x] Task 3: Pending-connection banner (AC3)
  - [x] In `energy-dashboard.tsx` (or the `(dashboard)` layout), read whether the farm has a `pge_smd` Connection `status:"pending"` and has bills loaded; if so render a calm banner "PG&E is connecting. Your bills are already in." near the farm header. Never for the demo or a fully-active farm.
  - [x] Copy in `en.ts` (`en.shell.*`): the banner line. Plain operator English; no em dashes; no exclamation marks.
  - [x] A small pure helper (e.g. `pendingPullBanner(connections, hasBills)`) so the show/hide logic is unit-tested without the DB.

- [x] Task 4: "Confirm it" affordance for unread fields (AC4)
  - [x] In `src/app/(app)/_components/meter-drawer.tsx` (and optionally the table cell), surface a "Confirm it" label/link for a `coverageState === "needs_review"` meter, alongside the existing withheld-figures note. Text + treatment, not color-only; never a blank-faked value.
  - [x] Copy in `en.ts`. Reuse the existing `needs_review` signal; no new state.

- [x] Task 5: Verify the already-built ACs + gates (AC2, AC4)
  - [x] Confirm (and, where cheap, pin with a test) the existing guarantees: the badge renders for `representative`; `dashboardFarm` returns the real farm first and the demo only as fallback (never merged); the map renders known pins and lists unlocated meters in the tray. If any lacks a test, add a small one.
  - [x] Browser/SSR verification against `dev.db`: unauthenticated `/tour` renders the badged demo dashboard (200, badge visible, "Connect your farm" CTA); `/tour` shows the demo even though dev.db has the demo seed; the authed dashboard is unchanged. Record outcomes honestly in the Dev Agent Record (note that the pending banner is a future/Bayou state proven by test, not the live seed).
  - [x] Update/add an e2e: unauthenticated `/tour` is reachable and renders the representative badge (a public page, unlike the gated dashboard).
  - [x] Gates: `npm run lint`, `npx tsc --noEmit`, full `npm test`, `npm run build`, `npm run test:e2e`. Honest Dev Agent Record.

## Dev Notes

### Scope boundary

- IN: `demoFarm` + the `demoOnly` data path; the public `/tour` route + login link + `isPublicPath` entry; the pending-connection banner + its pure helper; the "Confirm it" drawer affordance; copy; tests; verification.
- OUT: any change to `dashboardFarm`/`currentFarm` ranking or `userId` filtering (deferred); a new schema/state; new ingest; rebuilding the badge, the map tray, or the coverage treatments (all already built); a real Bayou pull (dormant); "real financials to investors" beyond the demo-pinning guarantee (the separation already holds).

### What exists to build on (read these first)

- `src/lib/onboarding/farm.ts:1241-1252` `dashboardFarm` (mirror its demo branch for `demoFarm`); `:1216` `currentFarm`; `:1228` `DashboardFarm`/`dataKind`; `FARM_INCLUDE`.
- `src/lib/dashboard/load.ts:211` `loadDashboard` (+ `DashboardData`, `dataKind`) - add the `demoOnly` path; `loadMetersForFarm`.
- `src/app/(app)/_components/energy-dashboard.tsx:22` `EnergyDashboard` (the hero; `:62` the badge already keyed on `dataKind`) - add the `demoOnly` prop + the pending banner.
- `src/app/(app)/(dashboard)/layout.tsx` - the shell layout the tour must NOT use; `src/app/(app)/layout.tsx` - the auth gate the tour sits outside.
- `src/lib/auth.config.ts` `isPublicPath` (+ the 5.1 allowlist) and `middleware.ts` matcher - add `/tour`.
- `src/app/(auth)/login/page.tsx` - add the "Tour a sample" link.
- `src/app/(app)/_components/map-lens.tsx` + `src/lib/dashboard/map.ts` `toMapPins` (known pins + `unlocated` tray) - AC4, already built; read for the "Confirm it" tie-in.
- `src/app/(app)/_components/meter-drawer.tsx` + `coverage-pill.tsx` + `src/lib/recommendations/types.ts:24` `CoverageState` (`no_bill|needs_review|reconciled`) - the `needs_review` signal to attach "Confirm it" to.
- `prisma/schema.prisma` Connection (`status` pending|active|revoked; `type` pge_smd) - read for the pending banner; no schema change.
- `src/copy/en.ts` - `en.shell.representativeBadge` (exists), the coverage labels; add the tour/banner/confirm-it strings.

### Critical guardrails

1. **Public tour is demo-pinned** (`demoFarm`, never `dashboardFarm`) so a real farm can NEVER leak to `/tour` (AC2). Proven by a test.
2. **Tour is read-only** - the hero only, no agent rail / findings-resolution (those need `auth()`); no shell.
3. **`/tour` is the only new public route**; everything else under `(app)` stays gated (no 5.1 regression). Verify unauth `/tour` -> 200.
4. **Pending banner only for a real farm mid-pull with bills already in** - never the demo, never a fully-active farm; honest in-flight state, never blocking on the LOA. Pure show/hide helper, tested.
5. **"Confirm it" reuses `needs_review`** - text + treatment, never blank-faking an unread field; no new state.
6. **No `dashboardFarm`/`currentFarm` change, no schema change, no new ingest.** TS strict, no `any`, `noUncheckedIndexedAccess`, copy in `en.ts` (no em dashes / no exclamation / grower's words), Server Components for reads.

### Previous story intelligence (5.1, 5.2)

- 5.1 gated `(app)` (middleware + layout `auth()`), added `isPublicPath`, the JWT `session.user.id`, `Farm.userId`. 5.2 built the connect-a-source onboarding, split the `(app)` layout into auth-only + `(dashboard)` shell (so onboarding renders for a farm-less user), and set `Farm.userId`. The `(dashboard)` no-data redirect goes to `/onboarding` only when `dashboardFarm` is null (the demo seed keeps it non-null, so a signed-in no-farm user actually sees the badged demo - which is the in-product "tour"). `/tour` adds the PUBLIC (no-sign-in) version.
- The 5.2 review deferred owner-scoped `dashboardFarm` resolution (multi-tenant); do NOT pull that into 5.3. The public tour's demo-pinning is orthogonal and safe.
- Gate bar at 5.2 close: lint, tsc, 546 tests / 71 files, build, e2e 4/4. Match or exceed.
- One-story-per-commit; dev-story stamps `baseline_commit` from HEAD (now 5.2's commit).

### Project Structure Notes

- New: `src/app/tour/page.tsx` (+ maybe a tiny `tour/_components`); `demoFarm` in `farm.ts`; the `demoOnly` path in `load.ts`; a pure pending-banner helper (+ test) in `src/lib/dashboard/`; DB test for `demoFarm`.
- Modified: `src/app/(app)/_components/energy-dashboard.tsx` (`demoOnly` prop + pending banner), `meter-drawer.tsx` ("Confirm it"), `src/lib/auth.config.ts` (`/tour` public), `src/app/(auth)/login/page.tsx` (tour link), `src/copy/en.ts` (strings), `e2e/*` (tour public reachability). Possibly `middleware.ts` matcher (only if `/tour` is excluded).
- Untouched: `dashboardFarm`/`currentFarm` bodies, the badge/map-tray/coverage code (reused), `prisma/schema.prisma`, the onboarding flow.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.3; #Epic 5] - the four ACs; tour the badged representative dashboard; honest connection states; never a blank or faked screen.
- [Source: _bmad-output/project-context.md#Prisma/data model] - `isDemo` separation + `dashboardFarm()` resolution; the demo seed is disposable synthetic placeholder; real connected farm outranks the seed and they never merge; never show the representative seed as the grower's own.
- [Source: _bmad-output/project-context.md#Product/domain anti-patterns] - legible-first; the dashboard is the pitch; never a blank/faked screen.
- [Source: src/lib/onboarding/farm.ts:1241-1252] - `dashboardFarm` (mirror the demo branch); `:1216` `currentFarm` (the real-farm rank the tour must bypass).
- [Source: src/app/(app)/_components/energy-dashboard.tsx:62-65] - the existing `representative` badge; the hero to render on `/tour`.
- [Source: src/lib/dashboard/map.ts; src/app/(app)/_components/map-lens.tsx] - the known-pins + "no location yet" tray (AC4, already built).
- [Source: src/app/(app)/_components/coverage-pill.tsx; src/lib/recommendations/types.ts:24] - the `needs_review` coverage signal for "Confirm it".
- [Source: src/lib/auth.config.ts; src/app/(auth)/login/page.tsx] - `isPublicPath` to extend and the login surface to add the tour link.
- [Source: _bmad-output/implementation-artifacts/5-2-connect-a-data-source-operator-operable-onboarding.md] - the layout split + the demo/representative fallback this story makes publicly tourable.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (dev-story workflow).

### Debug Log References

- `npx vitest run src/lib/dashboard/connection.test.ts src/lib/dashboard/demo.db.test.ts src/lib/auth.config.test.ts` - 14 pass (the pending-banner predicate, the demo no-leak guarantee, the `/tour` public path).
- `npm run lint` clean; `npx tsc --noEmit` exit 0 (after clearing the `.next` type cache).
- `npm test` - 555 pass / 73 files (5.2 closed at 546 / 71; +9 tests, +2 files).
- `npm run build` - succeeds; the new public `/tour` route is present.
- `npm run test:e2e` - 6 pass (added: `/tour` is public + the login page links to it).
- Live dev.db check (`next start`, demo seed present): unauthenticated `GET /tour` -> 200 rendering the "Representative data" badge + the "Connect your farm" CTA; `GET /` -> 307 (still gated). The tour shows the demo even with the seed in the db, and the gate is intact.

### Completion Notes List

- **AC1 - "Tour a sample" public, zero commitment.** New public route `src/app/tour/page.tsx` (outside `(app)`, allowlisted in `isPublicPath`) renders the `EnergyDashboard` hero with a "Connect your farm" CTA to `/login`. A "Tour a sample" link was added to the login page. Verified live: unauthenticated `/tour` -> 200 with the badge, no sign-in.
- **AC2 GUARANTEE - the tour is demo-pinned so real financials never leak.** Added `demoFarm(prisma)` (resolves `isDemo` directly, never `currentFarm`) and `loadDashboard(prisma, { demoOnly })`; `EnergyDashboard` takes a `demoOnly` prop the tour passes. The `demo.db.test.ts` proves `demoFarm` returns the demo even when a real connected farm exists, while `dashboardFarm` still prefers the real farm - the two never merge. The persistent badge (already built) renders because `demoFarm` is always `dataKind:"representative"`.
- **AC2 separation (already built) - verified.** `dashboardFarm` returns the real farm first and the demo only as fallback; pinned by the same DB test. No change to the resolver ranking; no `userId` filtering added (still deferred from 5.2).
- **AC3 - pending-pull banner.** `EnergyDashboard` reads the farm's `pge_smd` connections and renders "PG&E is connecting. Your bills are already in." only when a REAL farm's connection is pending AND bills are already loaded (the pure `showPendingPullBanner` decides, unit-tested for all branches). Never for the demo or an active farm. The dashboard always works off uploaded bills, so it is never blocked on the LOA. This is a future/Bayou in-flight state in v1 (the connect flow flips the connection active at confirm), so it is proven by the unit test rather than the live seed.
- **AC4 - "Confirm it".** The map known-pins + the "no location yet" tray + the `needs_review` figures-withheld treatment were already built (verified). Added the explicit "Confirm it" chip in the meter drawer for a `needs_review` meter, beside the existing withheld note - text + treatment, never a blank-faked value, reusing the existing `coverageState` signal (no new state).
- **Read-only by omission.** The tour renders only the data hero inside a `NuqsAdapter` (for the lens/drawer URL state) - not the `(app)/(dashboard)` shell, so there is no agent-rail sign-out and no findings-resolution action (those require `auth()`). A prospect looks; they do not act.
- **No regressions.** `/tour` is the only new public route; everything else under `(app)` stays gated (the e2e still confirms `/` and `/energy` redirect to `/login`). No schema change, no new ingest, no change to `dashboardFarm`/`currentFarm` ranking.

### File List

- `src/lib/onboarding/farm.ts` (modified) - new `demoFarm` resolver; `dashboardFarm` now delegates its demo branch to it.
- `src/lib/dashboard/load.ts` (modified) - `loadDashboard` takes a `demoOnly` option (resolves via `demoFarm`).
- `src/lib/dashboard/connection.ts` (new) - the pure `showPendingPullBanner` helper.
- `src/lib/dashboard/connection.test.ts` (new) - the banner predicate tests.
- `src/lib/dashboard/demo.db.test.ts` (new) - the demo no-leak / separation DB-integration test.
- `src/app/(app)/_components/energy-dashboard.tsx` (modified) - `demoOnly` prop + the pending-pull banner.
- `src/app/(app)/_components/meter-drawer.tsx` (modified) - the "Confirm it" chip for `needs_review`.
- `src/app/tour/page.tsx` (new) - the public Tour a sample route.
- `src/app/(auth)/login/page.tsx` (modified) - the "Tour a sample" link.
- `src/lib/auth.config.ts` (modified) - `/tour` added to `isPublicPath`.
- `src/lib/auth.config.test.ts` (modified) - `/tour` public assertion.
- `src/copy/en.ts` (modified) - `en.shell.pendingPull`, `en.shell.table.drawer.confirmIt`, `en.tour.*`.
- `e2e/auth.spec.ts` (modified) - `/tour` public reachability + the login tour link.

### Change Log

- 2026-06-10: Implemented Story 5.3 (Tour a sample, demo separation, connection states). New public demo-pinned `/tour` route (+ login link, `isPublicPath` entry) via `demoFarm` + `loadDashboard({demoOnly})` + an `EnergyDashboard` `demoOnly` prop, so a real grower's financials can never leak to an unauthenticated visitor; the pending-pull banner (`showPendingPullBanner`, AC3); the "Confirm it" drawer chip (AC4). Verified the already-built badge/map-tray/coverage. No schema change, no resolver-ranking change. Gates green: lint, tsc, 555 tests, build, e2e 6/6, live dev.db tour check. Status -> review.
- 2026-06-10: Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 4 ACs confirmed fully satisfied; the AC2 demo-pinning no-leak property was confirmed genuinely enforced and test-proven, and the already-built parts (badge, dashboardFarm ranking, map pins+tray, needs_review coverage) were preserved, not rebuilt. 3 findings patched, 2 deferred, 2 dismissed. Gates re-run green (lint, tsc, 555 tests, build, e2e 6/6) and the read-only fix verified live (the tour drawer renders findings with zero response buttons). Status -> done.

## Review Findings

Adversarial three-layer review (2026-06-10). The leak-prevention design (demo-pinning) was verified safe by all three layers and is proven by `demo.db.test.ts`. The one consensus defect was the public tour exposing live, auth-requiring finding buttons.

Patches (applied):

- [x] [Review][Patch] The public tour rendered live finding Done/Dismiss buttons that fail for anonymous visitors [finding-card.tsx, meter-drawer.tsx, energy-dashboard.tsx] - HIGH (blind+edge). The tour loads the demo farm's pending findings into the drawer, and the response buttons call `resolveFinding`, which (correctly) fails auth - but they rendered as actionable and surfaced an error when tapped, breaking the read-only promise. Added a `readOnly` prop threaded `EnergyDashboard(demoOnly) -> MeterDrawer -> FindingCard` that hides the response buttons (and the error line). Findings still render read-only as the money story. Verified live: the tour drawer shows 0 response buttons while the drawer itself renders.
- [x] [Review][Patch] `hasBills` counted a `needs_review` meter as "bills are in" [energy-dashboard.tsx] - LOW (edge). The banner says "Your bills are already in," but `coverageState !== "no_bill"` also matched mid-review meters that show no figures. Tightened to `=== "reconciled"`, so the banner's promise is only made when there are usable figures.
- [x] [Review][Patch] The pending-pull `connection.findMany` ran on every render, including the public tour where the result is always discarded [energy-dashboard.tsx] - LOW (blind+edge, perf). Gated the query on `dataKind === "real"` (the banner can never show for the demo anyway).

Deferred (recorded in deferred-work.md):

- [x] [Review][Defer] `<Link><Button>` renders a `<button>` nested in an `<a>` (invalid nested-interactive HTML) on the tour CTA - a pre-existing pattern (also in 5.2's source picker); the e2e still resolves the link role. Fix properly by giving `Button` a polymorphic `asChild`/`as` (or a link variant) and updating both call sites.
- [x] [Review][Defer] On a deployment with NO demo seed, `/tour` renders the authenticated empty-state copy ("Connect a data source") to an anonymous visitor - confusing on a public surface (no data leaks). Add a tour-specific demo-missing fallback. The committed seed makes this rare in practice.

Dismissed:

- [x] [Review][Dismiss] Cross-tenant / real-data leak on `/tour` (High, all three probed) - VERIFIED SAFE: `demoFarm` queries `isDemo: true` directly and never `currentFarm`; `loadDashboard({demoOnly})` has no fallback to `dashboardFarm`; `isPublicPath("/tour")` is an exact match. Proven by `demo.db.test.ts` (with both a demo and a real farm present, the tour resolves the demo).
- [x] [Review][Dismiss] The "Confirm it" chip shows on the tour's demo `needs_review` meters but an anonymous visitor cannot act (Low, edge) - it is a non-interactive `<span>` label (illustrative of the honest state), not a control; nothing breaks.
