---
baseline_commit: b5bcf0b
---

# Story 2.2: Three-zone OS shell, agent rail, lens toggle, and responsive collapse

Status: done

## Story

As a grower,
I want a single calm shell that holds my farm with my agents on one side and findings on the other,
so that I always know where I am and the depth is one tap away on any device.

## Acceptance Criteria

1. **Given** the `(app)` layout on desktop/tablet, **When** rendered, **Then** the three-zone inverted-L shows agent-rail (240, left) / data hero (center) / findings-rail (320, right), the center stacking KPI strip -> lens toggle -> active lens -> drawer overlay.

2. **Given** the agent rail, **When** rendered, **Then** it lists agents (not features): Energy active (primary) and Home; future Water/Labor at reduced opacity with a "coming" tag, non-interactive; Home = the Energy dashboard today.

3. **Given** mobile, **When** rendered, **Then** the agent rail becomes a bottom tab bar, the center goes full width, the findings rail collapses to a peeking bottom sheet ("N findings - ~$X up"), and the drawer becomes a full-height sheet; side margins hold at 20px.

4. **Given** the lens toggle, **When** used, **Then** it is a segmented control (Chart / Table / Map / Calendar) reading/writing the nuqs `lens` key, one lens visible at a time, defaulting to the simplest available lens; switching lenses never drops the active filter or open `meter`.

5. **Given** data landing, **When** the hero renders, **Then** it performs one orchestrated staggered reveal, fires once per data-landing, honors `prefers-reduced-motion` (instant); carousels, autoplay-every-open, badge anxiety, push, and "spike now" alerts are banned.

6. **Given** accessibility, **When** built, **Then** every interactive element is labeled role + state (the lens toggle announces the active lens), focus traversal is KPI strip -> lens -> findings rail (-> drawer), tap targets are >=44pt, and all copy lives in `/copy` in plain operator English (no kW/jargon, no em dashes/exclamation).

### AC interpretation notes (read before coding)

This story builds the **OS shell chrome** (three zones + agent rail + persistent findings rail + lens toggle + reveal + responsive collapse) and the routes that mount it. It builds the SLOTS, not their contents: the KPI strip is Story 2.3, the lens CONTENT (table 2.4, chart 2.8, map 2.9, calendar 3.5) and the drawer 2.5 land later. Build the lens-toggle + active-lens REGION now so those slot in; render an honest "coming" placeholder per lens until its story fills it.

- **Routing.** Create the `(app)` route group. `(app)/layout.tsx` is the three-zone shell; `(app)/page.tsx` is Home and `(app)/energy/page.tsx` is Energy, both rendering the same `EnergyDashboard` (Home == the Energy dashboard today). The `(app)` group owns `/`, so **delete the current `src/app/page.tsx`** (the redirect to `/dashboard/pump-timing`). The legacy `src/app/dashboard/pump-timing/**` tool stays reachable by direct URL (replaced wholesale in Epic 5); it is NOT wrapped by the new shell. The root `src/app/layout.tsx` (html/body/Inter) stays as-is and wraps both.
- **Data source.** The page resolves the farm via `dashboardFarm(db)` from `@/lib/onboarding/farm` (the documented entry; allowed in `/app` - it is NOT a raw-source module, the guard only forbids `@/lib/bayou/client` + the normalize/extract raw modules). After `npm run db:import-fixture` this returns the **real reconciled Batth account** (`dataKind:"real"`, 46 meters, 39 reconciled / 7 needs_review, no badge). When `dataKind:"representative"` (the synthetic seed fallback), render a persistent "Representative data" badge in the shell (EXPERIENCE.md state pattern). `dashboardFarm` null (truly empty install) -> a calm "connect a data source" message (real onboarding is Epic 5; do not build it here). For 2.2 the page needs only `farm.name`, `farm.pumps.length`, and `dataKind`.
  - **Prerequisite fixture fix (done in this story):** `scripts/persist-demo-fixture.ts` now also marks the real farm connected (an active `pge_smd` Connection) so `dashboardFarm`/`currentFarm` select it - otherwise `db:import-fixture` would not actually make the reconciled account the dashboard farm (its stated purpose) and the synthetic seed would keep winning. Re-run `npm run db:import-fixture`. No resolver change (zero legacy-tool risk).
- **nuqs (AC4).** Add `nuqs` (architecture-specified, pre-authorized). Wrap the `(app)` subtree in `NuqsAdapter` (`nuqs/adapters/next/app`). The lens toggle is a client island using `useQueryState("lens", ...)`. Canonical keys (architecture): `lens` (`chart|table|map|calendar`), plus `entity|ranch|rate|meter` later - every component reads/writes these exact keys; no component invents its own. `useQueryState` touches only its own key, so switching `lens` cannot drop `meter`/filters - prove this with a test on the pure lens helper and by NOT clearing other keys.
- **Lens default = simplest AVAILABLE lens (AC4).** The epics.md AC text says "defaulting to the simplest available lens"; DESIGN.md and EXPERIENCE.md both name **Chart** as the default face. These reconcile: encode a lens registry in a pure tested `src/lib/dashboard/lens.ts` with `LENSES` in **priority order (chart first)** + an `available` flag and `defaultLens()` = first available. Today only `table` is available (its content lands in 2.4; the tab is the live one); chart/map/calendar render a "coming" placeholder and are non-interactive like the future agents, so the live default is Table. When 2.8 flips `chart.available = true`, the default **automatically becomes Chart**, converging on the DESIGN/EXPERIENCE default face. `parseLens(value)` validates against the union and falls back to the default for unknown/absent/not-yet-available.
- **Agent rail (AC2).** Lists AGENTS, not features: Home (-> `/`) and Energy (-> `/energy`, the live PG&E agent, primary/active styling), then Water and Labor at reduced opacity with a "coming" tag, non-interactive (`aria-disabled`, no link). Active state from `usePathname`. Desktop = left rail (`w-agent-rail`); mobile = a fixed bottom tab bar (same items). Home and Energy both resolve to the dashboard today.
- **Findings rail (AC1/AC3).** Persistent right rail (`w-findings-rail`), present on every `(app)` screen. Findings CARDS are Epic 3; for 2.2 it renders the calm empty state ("Nothing needs you right now.", EXPERIENCE.md), NOT an apology. Mobile: collapses to a peeking bottom sheet showing a summary line; tap to expand to the rail content. With zero findings the summary is the calm empty line (no fabricated count).
- **Reveal (AC5).** One orchestrated staggered reveal of the center sections, fired ONCE per data-landing (gate replay via `sessionStorage` so a lens switch or in-session nav does not replay it), honoring `prefers-reduced-motion` (instant final state). Reuse the existing `.reveal` CSS (easing `cubic-bezier(0.16,1,0.3,1)`, `--i` stagger, the reduced-motion block) from Story 2.1's `globals.css`; `motion` is available if a JS orchestration is cleaner, but the CSS reveal already meets the spec. Banned: carousels, autoplay-on-every-open, badge-count anxiety, push, "spike now".
- **A11y (AC6).** Lens toggle is a labeled segmented control (`role="tablist"`/`tab` or radiogroup) that announces the active lens (`aria-selected`/`aria-current`); the rail items carry role + active/disabled state; tap targets >=44px (`h-11`+); focus order KPI -> lens -> findings rail. All visible text from `src/copy/en.ts` (new `dashboard`/`shell` namespace), plain operator English, no kW/jargon, no em dashes/exclamation.

## Tasks / Subtasks

- [x] **Task 0: Fixture-connect fix + nuqs** (AC: 4) - `scripts/persist-demo-fixture.ts` now adds an active `pge_smd` Connection to the real farm (idempotent); re-ran `npm run db:import-fixture` and confirmed `dashboardFarm` returns the real 46-meter account (`dataKind:"real"`, 39 reconciled / 7 needs_review). `npm install nuqs` -> 2.8.9.
- [x] **Task 1: Pure lens registry** (AC: 4) - `src/lib/dashboard/lens.ts`: `Lens` union, `LENSES` registry (priority order + `available`), `LENS_KEYS`, `defaultLens()`, `isLensAvailable()`, `parseLens(value)`. `lens.test.ts` (6 tests): four canonical keys; default `table` while only table is available; unknown/absent/not-yet-available -> default; available passes through; priority order makes chart the default the moment it ships.
- [x] **Task 2: Route group + shell layout** (AC: 1, 3) - deleted `src/app/page.tsx`; added `src/app/(app)/layout.tsx` (three-zone inverted-L; `NuqsAdapter`; desktop rail/center/findings, mobile full-width center + bottom tab bar + bottom sheet, 20px mobile margins, `export const dynamic = "force-dynamic"`), `(app)/page.tsx` (Home) and `(app)/energy/page.tsx` (Energy), both rendering `EnergyDashboard`.
- [x] **Task 3: Agent rail + mobile tab bar** (AC: 2, 3, 6) - `_components/shell/agents.ts` (shared `AGENTS` + `isAgentActive`), `agent-rail.tsx` (desktop, Wordmark + Home/Energy live via `usePathname`, Water/Labor dimmed "Coming" non-interactive), `agent-tabbar.tsx` (mobile bottom bar). Role + state labels; >=44px (`h-11`/`h-16`).
- [x] **Task 4: Findings rail + mobile sheet** (AC: 1, 3) - `findings-rail.tsx` (persistent, calm "Nothing needs you right now.") + `findings-sheet.tsx` (mobile peeking summary -> tap to expand, `aria-expanded`). Honest count (0 -> calm summary, never fabricated).
- [x] **Task 5: Lens toggle + active-lens region + reveal + dashboard composition** (AC: 1, 4, 5, 6) - `lens-toggle.tsx` (segmented tablist, nuqs `lens`, `aria-selected`, unavailable lenses `disabled`+"Coming"), `lens-region.tsx` (reads `lens`, honest placeholder frame), `reveal.tsx` (pure Server Component applying `.reveal` + `--i` in markup -> CSS reveal on data-landing, no replay on lens switch / client nav since the DOM is reused; reduced-motion via globals.css), `energy-dashboard.tsx` (representative badge only for the seed, farm header, reveal-wrapped header -> [KPI slot 2.3] -> lens toggle -> lens region). Copy in `src/copy/en.ts` under a new `shell` namespace (sits beside the legacy `dashboard` namespace).
- [x] **Task 6: Tests + validate** (AC: all) - `lens.test.ts` green; `npm run lint` clean, `npx tsc --noEmit` clean, `npm test` 46 files / 300 tests, `npm run build` clean (`/` + `/energy` are `ƒ` dynamic, no CSS warning, legacy routes intact); `no-raw-source-in-ui.test.ts` green; `db:import-fixture` green. **Browser check done:** `npm run dev` -> `/` and `/energy` HTTP 200 rendering the real "Batth Farms" with NO representative badge; desktop screenshot shows the three zones (rail with Home active + Energy + Water/Labor "Coming", center hero, findings rail "Nothing needs you right now"); mobile screenshot shows the bottom tab bar + peeking findings sheet + full-width center; `?lens=bogus` falls back to the default; legacy `/dashboard/pump-timing` still 200.

## Dev Notes

### Scope boundary (what is NOT in this story)

- **No KPI cards** (2.3), **no meter table content** (2.4), **no drawer** (2.5), **no chart** (2.8), **no map** (2.9), **no calendar** (3.5), **no findings cards / recommendations** (Epic 3). Build the SLOTS + the toggle + placeholders only.
- **No auth, no onboarding flow** (Epic 5). `dashboardFarm` null -> a calm message, not a built flow.
- **Do not modify the legacy `dashboardFarm`/`currentFarm` resolvers** or the legacy pump-timing tool. The only data-layer change is the `persist-demo-fixture.ts` connection fix (a fixture, not a resolver).
- **No new charting/map dep.** Only `nuqs` is added this story.

### What exists to build on

- **`src/app/globals.css`** (Story 2.1) - the DESIGN.md tokens (`bg-paper`, `bg-surface-container-*`, `text-on-surface`/`-variant`, `border-outline-variant`, `bg-primary`, `bg-inverse-surface`, `--shadow-elevated`), `w-agent-rail`/`w-findings-rail`, `rounded-[var(--radius-lg)]`, the `.type-*` roles, and the `.reveal` staggered animation + `prefers-reduced-motion` block. Use these; add no new token here.
- **`src/components/ui/`** (Story 2.1) - `Button`, `Input`, `SeverityBadge`. Use `Button` for any action.
- **`src/lib/onboarding/farm.ts`** - `dashboardFarm(prisma)` -> `{ farm, dataKind } | null`; `farm` includes `name`, `pumps` (with `blocks`), `people`, `connections`, `blocks`. `src/lib/db.ts` - the Prisma singleton for Server Components.
- **`src/lib/cn.ts`** - `cn()`. **`src/copy/en.ts`** - add a `dashboard` (or `shell`) namespace.
- **Architecture** - `(app)/layout.tsx` shell; client islands only for the toggle/drawer/map/charts; nuqs keys `lens|entity|ranch|rate|meter`; Server Components read Prisma.

### Critical guardrails

1. **`no-raw-source-in-ui` stays green.** `/app` imports only the canonical/DB read path (`@/lib/onboarding/farm`, `@/lib/dashboard/*`), `@/components/*`, `@/copy`. Never `@/lib/extract/*` or a normalize raw mapper.
2. **One lens visible; switching never drops `meter`/filters (AC4).** nuqs per-key updates; do not `router.replace` the whole querystring.
3. **Honest coverage everywhere (AR-15).** No fabricated numbers/counts. The empty findings rail is a calm sentence, not a "0". The representative badge shows only for the seed, never for the real account.
4. **Reveal fires once per data-landing, honors reduced-motion.** No autoplay-every-open, no carousels (banned list).
5. **Copy in `/copy`, grower language.** No kW / "15-minute interval" / AI jargon on the surface; no em dashes, no exclamation marks.
6. **Server Components by default; client islands only** for the toggle, rail (pathname), reveal, and mobile sheet. Keep the page/layout/dashboard as Server Components reading Prisma.
7. **TS strict + no-`any` + `noUncheckedIndexedAccess`.** Setting a CSS custom property in React inline style needs a typed cast (`{ ["--i"]: i } as React.CSSProperties`).

### Concrete shapes (recommended)

```ts
// src/lib/dashboard/lens.ts
export type Lens = "chart" | "table" | "map" | "calendar";
type LensDef = { key: Lens; available: boolean };
export const LENSES: LensDef[] = [
  { key: "chart", available: false },   // Story 2.8
  { key: "table", available: true },    // Story 2.4 (content); the live default today
  { key: "map", available: false },     // Story 2.9
  { key: "calendar", available: false } // Story 3.5
];
export function defaultLens(): Lens {
  return (LENSES.find((l) => l.available) ?? LENSES[1]!).key; // first available; table fallback
}
export function parseLens(value: string | null | undefined): Lens {
  const hit = LENSES.find((l) => l.key === value && l.available);
  return hit ? hit.key : defaultLens();
}
```

```tsx
// (app)/layout.tsx (Server Component)
import { NuqsAdapter } from "nuqs/adapters/next/app";
// desktop: grid [agent-rail | 1fr | findings-rail]; mobile: center full-width + fixed bottom tab bar + bottom sheet
```

### Previous story intelligence (2.1, done)

- Tokens + primitives are in place; reference them, never hardcode hex/font. `bg-paper` is the canvas (NOT `bg-surface`, which is legacy white). Containers step `bg-surface-container-*`; hairline `border-outline-variant`; lift only the drawer/sheet (`shadow-[var(--shadow-elevated)]`).
- The `.reveal` class + reduced-motion block already exist - reuse, do not re-add motion that bypasses reduced-motion.
- `dev.db` holds the real reconciled account after `db:import-fixture` (39 reconciled / 7 needs_review across 46 meters) - now selectable by `dashboardFarm` thanks to the Task 0 connection fix.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2] - the six ACs verbatim.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md#Information Architecture, #Component Patterns, #State Patterns, #Responsive & Platform, #Accessibility Floor] - the three-zone IA, agent rail vs features, lens toggle behavior (switching never loses entity/filter/drawer; default to the simplest available lens), the persistent findings rail + mobile bottom sheet, the once-per-data-landing reveal, the calm empty states, >=44pt + focus order.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md#Layout & Spacing, #Components] - inverted-L + copilot, agent-rail 240 / findings-rail 320, lens-toggle/agent-rail/bottom-sheet component specs.
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture, #URL state (nuqs), #Complete Project Directory Structure] - client islands, nuqs canonical keys, the `(app)/` file layout.
- [Source: _bmad-output/project-context.md#Design system, #Critical Don't-Miss] - data dashboard not a to-do list; home = Energy dashboard today; representative badge for the seed; real outranks demo.
- [Source: src/lib/onboarding/farm.ts] - `dashboardFarm` / `DashboardFarm`. [Source: src/app/globals.css] - tokens + `.reveal`. [Source: src/components/ui/] - primitives.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` -> 46 files / 300 tests (+6 lens). `npm run build` -> clean (no CSS warning after excluding `_bmad-output` from Tailwind's source scan; `/` + `/energy` render as `ƒ` dynamic; the 16 legacy routes still build).
- `npm run db:import-fixture` -> 52 pumps / 52 periods / 284 line items + the real farm now connected; `dashboardFarm` -> `{ dataKind:"real", pumps:46 }`, coverage 39 reconciled / 7 needs_review.
- Browser (dev): `/` and `/energy` HTTP 200; desktop screenshot = three zones (agent rail with Home active, Energy live, Water/Labor "Coming"; center "Your farm / Batth Farms" + lens toggle Table-active; findings rail "Nothing needs you right now"); mobile screenshot = bottom tab bar + peeking findings sheet + full-width center; `?lens=bogus` -> 200 (falls back to default); no "Representative data" badge (real account).

### Completion Notes List

- **The three-zone OS shell is live** as the `(app)` route group at `/` (Home) and `/energy` (Energy), both rendering one `EnergyDashboard`. Deleted the old `src/app/page.tsx` redirect; the legacy `dashboard/pump-timing/**` tool stays reachable by direct URL and still builds (now showing the real farm, which is the documented "real outranks demo" intent). The root `layout.tsx` (html/body/Inter) is unchanged.
- **Prerequisite data fix (Task 0):** the reconciled account had no PG&E connection, so `dashboardFarm`/`currentFarm` (which require an active `pge_smd` connection per project-context) skipped it and the synthetic seed won - `db:import-fixture` was not actually making the real account the dashboard farm. `persist-demo-fixture.ts` now marks the real farm connected (idempotent), so the reconciled account (46 meters, 39 reconciled / 7 needs_review) is the dashboard farm with no badge. No resolver change -> zero legacy-tool risk.
- **Agent rail lists agents, not features:** Home + Energy live (active via `usePathname`, primary styling), Water + Labor dimmed with a "Coming" tag and non-interactive (`aria-disabled`, no link). Collapses to a mobile bottom tab bar with the same items.
- **Persistent findings rail** (right, 320px) renders the calm empty state ("Nothing needs you right now.", findings cards are Epic 3); mobile collapses it to a peeking bottom sheet (tap to expand, `aria-expanded`), with an honest count summary (0 -> the calm line, never a fabricated number).
- **Lens toggle (AC4):** a segmented tablist over the nuqs `lens` key (canonical key, per architecture), one lens visible, default = the simplest AVAILABLE lens (Table today; Chart becomes default the moment 2.8 flips its availability). Unavailable lenses are `disabled` + "Coming". Because the toggle only writes the `lens` key, switching never drops `entity/ranch/rate/meter`. A stale/unknown deep link (`?lens=chart` before chart ships, `?lens=bogus`) falls back to the default.
- **Reveal (AC5):** a pure Server Component applies `.reveal` + the `--i` stagger to each section in the markup, so the one orchestrated reveal plays when the DOM is created (data-landing) with no flash/JS/hydration risk, honors `prefers-reduced-motion` (globals.css), and does NOT replay on a lens switch (URL-only update) or Home<->Energy nav (React reuses the DOM). No carousels/autoplay/badge-anxiety/push/"spike now".
- **Slots, not contents:** the KPI strip (2.3), table (2.4), drawer (2.5), chart (2.8), map (2.9), calendar (3.5), and findings cards (Epic 3) are intentionally NOT built; the lens region shows an honest "This view is on the way." placeholder so the shell composes and each later story slots into a fixed seam. No new charting/map dep; only `nuqs` added.
- **Tailwind source scope:** added `@source not "../../_bmad-output"` so Tailwind never scans the BMAD markdown artifacts (story prose quotes arbitrary-value class examples that otherwise emit invalid generated CSS) - a permanent fix for all future story prose.

### File List

- `scripts/persist-demo-fixture.ts` (modified) - mark the real farm connected (active `pge_smd`) so it is the dashboard farm.
- `package.json` / `package-lock.json` (modified) - added `nuqs` 2.8.9.
- `src/app/page.tsx` (deleted) - the old redirect; `(app)/page.tsx` now owns `/`.
- `src/app/globals.css` (modified) - `@source not "../../_bmad-output"`.
- `src/lib/dashboard/lens.ts` (new) + `lens.test.ts` (new) - the pure lens registry + tests.
- `src/app/(app)/layout.tsx` (new) - three-zone shell + `NuqsAdapter` + `force-dynamic`.
- `src/app/(app)/page.tsx` (new, Home) + `src/app/(app)/energy/page.tsx` (new, Energy).
- `src/app/(app)/_components/energy-dashboard.tsx` (new) - center composition.
- `src/app/(app)/_components/lens-toggle.tsx` + `lens-region.tsx` (new) - nuqs lens islands.
- `src/app/(app)/_components/shell/{agents.ts, agent-rail.tsx, agent-tabbar.tsx, findings-rail.tsx, findings-sheet.tsx, reveal.tsx}` (new) - rail, mobile tab bar, findings rail + sheet, reveal.
- `src/copy/en.ts` (modified) - new `shell` namespace (agents, lens, findings, badge, farm header, no-farm state).

## Change Log

- 2026-06-09: Implemented Story 2.2 - the three-zone OS shell (`(app)` route group: agent rail / data hero / findings rail), agent rail (agents not features; Home + Energy live, Water/Labor "Coming"), the nuqs `lens` toggle (segmented Chart/Table/Map/Calendar, default = simplest available = Table, switching never drops other URL keys), the responsive collapse (mobile bottom tab bar + peeking findings sheet + full-width center), and the once-per-data-landing staggered reveal (reduced-motion honored). Added `nuqs`; deleted the old root redirect (`(app)` owns `/`); fixed the fixture so the reconciled account is the dashboard farm (39 reconciled / 7 needs_review, no badge); excluded the BMAD artifacts from Tailwind's source scan. KPI/table/drawer/chart/map/calendar/findings remain honest slots for later stories. lint + tsc + 300 tests + clean build green; browser-verified desktop + mobile. Status -> review.
- 2026-06-09: Code review (3-layer adversarial: Blind Hunter + Edge Case Hunter + Acceptance Auditor, parallel subagents). Acceptance Auditor: all six ACs MET; no correctness bugs; scope (slots-not-contents) correct; clean against DESIGN's Don'ts; the Task-0 fixture fix verified to make the reconciled account the dashboard farm. Fixed 6 (lens-toggle tap target 36px->44px + DESIGN primary-underline active style; `isAgentActive` prefix false-positive -> path-boundary match + new test; `defaultLens` honest fallback; sticky rails `overflow-y-auto` before Epic 3 cards; mobile `pb-28`->`pb-32`; corrected the reveal comment + the F1 default-lens spec-attribution). Deferred 5 (test-depth + Epic 3/5 future-scope). lint + tsc + 304 tests + clean build green; re-screenshotted the lens toggle. Status -> done.

## Code Review (2026-06-09)

Adversarial review across three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Acceptance Auditor verdict: **all six ACs MET**, no correctness bugs, scope correctly limited to the shell + toggle + reveal + responsive collapse (KPI/table/drawer/chart/map/calendar/findings are honest slots), clean against DESIGN's Don'ts (no glassmorphism/blur, solid paper chrome), and the Task-0 fixture connection fix verified to make the real reconciled account the dashboard farm. Build/lint/tsc/tests green; the legacy 16 routes still build.

Triage: 6 patches, 5 defer, 0 dismissed.

### Fixed (patches applied this story)

- [Patch] **Lens-toggle tap target + active style** [lens-toggle.tsx] - Acceptance Auditor (the one real a11y/spec miss). Tabs were `h-9` (36px, below the >=44pt floor, AC6 / EXPERIENCE.md) and used a raised pill, not DESIGN.md's "primary underline/weight". Rebuilt as a 44px (`h-11`) underlined tab row; the active tab now carries `border-primary` + `text-primary` + `font-semibold` (verified in a fresh screenshot).
- [Patch] **`isAgentActive` prefix false-positive** [shell/agents.ts] - Edge. `startsWith("/energy")` would light Energy for a future sibling like `/energyXYZ`. Changed to a path-boundary match (`=== href || startsWith(href + "/")`). Added `agents.test.ts` (4 tests) pinning the boundary.
- [Patch] **`defaultLens` returned a knowingly-unavailable lens in an all-unavailable misconfig** [lib/dashboard/lens.ts] - Edge (latent). Dropped the `?? LENSES[1]` middle term; the honest ultimate fallback is `"table"`, never an unavailable lens.
- [Patch] **Sticky rails would clip when Epic 3 finding cards land** [agent-rail.tsx, findings-rail.tsx] - Edge. Both rails were `h-dvh` with no scroll; added `overflow-y-auto` now (the findings rail is the home for Epic 3 cards).
- [Patch] **Mobile center padding sat exactly at the bottom-sheet boundary** [layout.tsx] - Edge. `pb-28` (112px) exactly met the sheet-handle top (112px) with no gap; bumped to `pb-32` for breathing room.
- [Patch] **Doc accuracy** [reveal.tsx, the story interpretation note] - Blind + Auditor. Corrected the reveal comment (it DOES re-stagger on a full Home<->Energy route change since those are separate segments; it does NOT replay on a lens switch) and fixed the F1 spec attribution ("simplest available lens" is the epics.md AC; DESIGN/EXPERIENCE name Chart the default face; the registry converges on Chart when 2.8 ships).

### Deferred (recorded in deferred-work.md)

- [Defer] Integration test that switching the lens preserves `?meter`/`?entity`/`?ranch` (AC4's key-preservation is nuqs-guaranteed + structurally sound, but unproven by a test).
- [Defer] Mobile findings bottom-sheet summary `· ~$X ↑` format - lands with Epic 3 findings cards + the dollar model (today the honest empty summary is correct, AR-15).
- [Defer] Bill-import farm is marked `type:"pge_smd"` (with `externalRef:"bill-import-..."` recording true provenance) - pragmatically correct (the gate `dashboardFarm` checks), but conflates bill-upload with SMD authorization; revisit when the Epic 5 LOA-upgrade flow needs to distinguish connection provenance.
- [Defer] Representative-data badge renders outside the reveal (pops in un-staggered on the demo-seed path only); the findings bottom-sheet has no Escape-to-close (the toggle is always reachable + `aria-expanded`).
- [Defer] A Playwright assertion locking the reveal "fires once, no replay on lens toggle" behavior (rests on nuqs `shallow:true` + React DOM reuse, both framework behaviors).
