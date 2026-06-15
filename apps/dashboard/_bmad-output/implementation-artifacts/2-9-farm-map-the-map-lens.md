---
baseline_commit: d5a22a3
---

# Story 2.9: Farm map - the Map lens

Status: done

## Story

As a grower,
I want a map of my pumps colored by what needs attention,
so that I can see my whole farm spatially and tap the one pin that matters.

## Acceptance Criteria

1. **Given** the Map lens, **When** rendered, **Then** a read-only MapLibre GL map renders with a custom agrarian-luxury style and a pin for every meter with a resolvable location.

2. **Given** geometry, **When** resolved, **Then** pins come from inventory: PLSS Section-Township-Range -> centroid via a committed BLM PLSS lookup, and street addresses via the free US Census geocoder (stubbed boundary); no paid key, no Bayou for geo.

3. **Given** a pin, **When** rendered, **Then** its color encodes $-at-risk / status (green -> clay) with the value/label also available (color never the only signal); tapping it opens the shared drawer.

4. **Given** a meter without resolvable location, **When** processed, **Then** it appears in a "no location yet" tray, never silently dropped or given a fake pin.

5. **Given** partial billing, **When** rendered, **Then** the map still renders fully from inventory on day one.

### AC interpretation notes (read before coding)

This story ships the Map lens (FR-12 / UX-DR13 / AR-8): MapLibre GL, read-only, pins from the canonical inventory, the shared drawer as the tap target, and an honest tray for everything unlocatable.

- **Geo data reality (probed 2026-06-09):** the REAL account has lat/lng NULL and `location` NULL on all 46 meters, and the schema carries NO PLSS/land-description field anywhere (the bills' land descriptions were not extracted in Epic 1). The demo seed has all 183 meters pinned. So on the live surface the map renders zero pins and a 46-meter tray - honest day-one inventory truth (AC5). **AC2's resolution chain is built as the SEAM it can be today:** a pure `resolvePin(meter)` resolver whose order is (1) inventory lat/lng (the only live source), (2) PLSS centroid - marked TODO until a land-description field exists upstream, (3) Census geocode of `location` - the repo already has the deterministic stubbed geocoder boundary (`src/lib/onboarding/geocode.ts`, network forbidden); with both upstream sources empty, committing a BLM PLSS table with nothing to look up would be dead fixture weight. Record this as the licensed partial: the resolver seam + stub boundaries exist and are tested; the PLSS fixture lands with the Epic 1 extraction gap that feeds it (note it in deferred-work.md).
- **MapLibre + zero external calls (AC1, AC2):** `npm install maplibre-gl` (framework-agnostic, no React peer dep - the visx lesson). NO remote tile source in v1: the committed custom style is a minimal MapLibre style object (background = the warm paper token, read at runtime from the CSS variable so no hex lands in code) - the "agrarian-luxury" canvas is the paper itself; a real basemap tile source is a marked-TODO boundary (no paid key, no OSM-tile runtime dependency, the repo's zero-external-calls rule holds). The map stays zoomable/pannable over the pin field; `fitBounds` to the pins when any exist, else a Central Valley default view.
- **Bundle discipline:** `maplibre-gl` is heavy; load it lazily inside the island (dynamic `import("maplibre-gl")` in an effect) so the Chart/Table faces pay nothing. Import its CSS in the component module. Clean up the map instance on unmount.
- **Pins (AC3):** DOM markers (maplibre `Marker` with a custom element) so each pin is a real focusable button: color = the two honest concern signals available today (no $-at-risk model until Epic 3, same law as the 2.4 table): `needs_review` coverage OR `status === "BAD"` -> clay (`--alert`), else green (`--primary`); white hairline ring for contrast. Every pin carries an aria-label with name + state (color never the only signal); click/Enter sets the nuqs `meter` key -> the 2.5 drawer opens. Read-only map: no popups, no editing, scroll/pinch zoom on.
- **Tray (AC4):** below the map, a disclosure ("N meters with no location yet" via `<details>`/`<summary>`) listing every unlocated meter as a button that opens its drawer - present, never dropped, never fake-pinned. With 46 today the collapsed summary keeps the lens calm.
- **Filter contract:** narrows through `filterMeters` (pins AND tray recompute); the empty-after-filter state reuses the clear-affordance pattern.
- **Pure derivation:** `src/lib/dashboard/map.ts`: `toMapPins(meters)` -> `{ pins: MapPin[], unlocated: { meterId, name }[] }` with `MapPin = { meterId, name, latitude, longitude, attention: boolean }` (attention = needs_review or BAD); invalid coordinates (NaN, |lat|>90, |lng|>180) go to the tray, never a fake pin. Tested.
- **Lens wiring:** registry `map` -> `available: true` (chart stays the default - it is first in priority); lens-region branches `map` -> `<MapLens meters={meters} />`; `?lens=map` deep links now resolve instead of falling back.

## Tasks / Subtasks

- [x] **Task 1: Install maplibre-gl** - `npm install maplibre-gl` (no React peer dep; verify install stays clean). (AC1)
- [x] **Task 2: Pure pin derivation** - `src/lib/dashboard/map.ts`: `toMapPins(meters: MeterView[]): { pins: MapPin[]; unlocated: UnlocatedMeter[] }` - lat/lng presence + validity gate, attention flag from needs_review/BAD, tray membership for everything else; resolver seam documented (PLSS TODO, geocode stub boundary referenced). Colocated `map.test.ts`: located vs unlocated split, invalid coordinate rejection (NaN, out-of-range), attention mapping (needs_review, BAD, calm reconciled/GOOD), no meter dropped (pins + unlocated == input length), purity. (AC2, AC3, AC4)
- [x] **Task 3: MapLens island** - `src/app/(app)/_components/map-lens.tsx` (client): lazy-imports maplibre-gl in an effect; minimal committed style (background from the `--surface` CSS variable at runtime); read-only interactions (zoom/pan on, no rotate needed); DOM-element markers as focusable buttons (aria-label name + state, click/Enter -> `setMeter`); `fitBounds` over pins / Central Valley default; tray disclosure listing unlocated meters as drawer-opening buttons; filters via `filterMeters` + the shared empty-state/clear pattern; map instance cleanup on unmount; `id="energy-lens"` on the section. (AC1, AC3, AC4, AC5)
- [x] **Task 4: Wire the lens** - `lens.ts`: map `available: true` (chart remains default); `lens-region.tsx`: `map` branch. Update `lens.test.ts` if it pins map availability. (AC1)
- [x] **Task 5: Copy** - `src/copy/en.ts` `shell.map`: lens caption, tray summary (count-aware), pin aria fn (name + attention/calm state), empty-view + empty-farm lines, attention/calm labels. (AC3, AC4)
- [x] **Task 6: Tests + validate** - map.test.ts green; lint + tsc + full vitest green. Browser-verify: `?lens=map` on the real account renders the map canvas with ZERO pins and the tray reading "46 meters with no location yet"; expanding the tray lists meters; clicking one opens the drawer (`?meter=` set); the lens toggle shows Map as live (no "coming" tag); filters narrow the tray count; chart remains the default face at `/`. Note: pin rendering itself is exercised by unit tests + the demo seed (the live account has no coordinates) - state that honestly in the Dev Agent Record. (AC1-5)

### Review Findings

- [x] [Review][Patch] display:flex on the tray summary removed the native disclosure triangle; an explicit rotating chevron now carries the expand affordance [map-lens.tsx]
- [x] [Review][Patch] Exact (0,0) coordinates (an unfilled-field export artifact) were accepted as pins and would blow the fitBounds camera out to span the Atlantic; (0,0) now reads as no-location (tray), with the test updated to pin the rule [map.ts, map.test.ts]
- [x] [Review][Patch] fitBounds ran only at init; a filter change could strand the new pin set outside the viewport of a landmark-less canvas; the marker re-sync now refits [map-lens.tsx]
- [x] [Review][Patch] The bundle-isolation comment overclaimed (the namespaced CSS and the component module ship statically; only maplibre's JS is lazy) [map-lens.tsx]
- [x] [Review][Patch] aria-label on the bare map container div (invalid on a generic role, duplicated the section label) removed [map-lens.tsx]
- [x] [Review][Patch] The rgb() color-literal fallback violated the tokens-only guardrail letter; falls back to transparent (the page paper shows through) [map-lens.tsx]
- [x] [Review][Defer] Marker rebuild diffing + antimeridian bounds hardening - recorded in deferred-work.md
- [x] [Review][Repair] Pre-existing e2e breakage surfaced: the Playwright webServer health URL pointed at the removed /dashboard route (404 = never ready); fixed to /. The remaining onboarding.spec.ts failure is legacy-flow drift predating this epic - recorded in deferred-work.md [playwright.config.ts]

## Dev Notes

### Scope boundary

- **Read-only map.** No pin dragging (the schema comment about dragging is onboarding scope, Epic 5), no popups, no clustering (revisit at multi-hundred pins), no tile server, no paid key, no Bayou.
- **No $-at-risk shading** - the only honest pin signals today are coverage needs_review + status BAD (Epic 3 brings the $ model; same deliberate restraint as 2.4's table tints).
- **PLSS fixture deferred with its upstream:** no land-description source field exists; record in deferred-work.md rather than committing a dead lookup table.
- **Calendar lens stays "coming"** (3.5).

### What exists to build on

- **`src/lib/dashboard/load.ts`** `MeterView.latitude/longitude` (Float, null on the whole real account; populated on all 183 demo meters), `coverageState`, `status`. **`table.ts`** `filterMeters`. **`coverage-pill.tsx`** labels if needed for pin aria states.
- **`src/lib/onboarding/geocode.ts`** - the existing deterministic stubbed geocoder (network forbidden, marked TODO) - REFERENCE it in the resolver seam docs; do not duplicate it.
- **`lens.ts` registry** - flip `map` to available; priority order already chart-first, so the default does not move. `lens.test.ts` currently asserts `parseLens("map")` falls back - update that expectation.
- **`chart-lens.tsx`** - freshest island patterns: filterMeters memo, empty-state + clear affordance via `isActiveFilterValue`, `id="energy-lens"`, ResizeObserver lifecycle lesson (bind observers/instances against conditional mounts - the SAME trap applies to the map container ref; initialize the map in an effect keyed on the container being mounted, clean up on unmount).
- **`meter-drawer.tsx`** opens off the `meter` key from anywhere - pins and tray buttons just set it.
- **Tokens:** `--surface` (map canvas), `--primary` / `--alert` (pins), `--outline-variant`, `--radius-lg` (map frame), 44px tap floor.
- **2.8 review lessons that apply directly:** conditional-mount observer/instance lifecycle; no `role="img"` wrapping interactive children; SVG/canvas focus visibility (DOM markers dodge the SVG focus problem - they are HTML buttons); honest aria copy; index-suffixed keys for potential duplicates.

### Critical guardrails

1. **Never a fake pin (AC4).** No coordinate -> tray. Invalid coordinate -> tray. No geocoding fabrication; the stub boundary stays a stub.
2. **Canonical keys.** Map reads `entity|ranch|rate`, writes only `meter`. Lens switching keeps filter + open drawer (nuqs law).
3. **Tokens only; no hex in the component** - the style background reads the CSS variable at runtime; pin colors via `var(--primary)` / `var(--alert)` on DOM elements.
4. **Pure derivations tested** (`toMapPins`); the island renders/wires only.
5. **Color never the only signal:** pin aria-labels carry the state word; the tray is text.
6. **A11y:** markers and tray rows are real buttons >= 44px hit area (give the marker element adequate size/padding), keyboard operable.
7. **TS strict + no-`any` + `noUncheckedIndexedAccess`**; maplibre types via its bundled types.
8. **Copy in /copy**; grower language; no jargon.
9. **Zero external calls:** no tile fetch, no geocoder call; the app must run offline exactly as before.

### Previous story intelligence (2.8)

- visx peer-dep lesson: verify `maplibre-gl` installs clean against React 19 (it has no React peer dep) BEFORE writing code against it.
- The empty-to-data observer trap (2.8's High finding): the map container only mounts when the lens is active and data exists - initialize/destroy the map instance inside an effect that depends on that mount state.
- Honest captions for absent data classes beat silent omission (the without-TOU caption pattern -> the tray).
- Gates: lint, tsc, vitest (369 green at 2.8 close), Playwright verification, story records + sprint status.

### Project Structure Notes

- New: `src/lib/dashboard/map.ts` + `map.test.ts`, `src/app/(app)/_components/map-lens.tsx`.
- Modified: `src/lib/dashboard/lens.ts` + `lens.test.ts`, `lens-region.tsx`, `src/copy/en.ts`, `package.json` (+maplibre-gl).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.9] - the five ACs verbatim; FR-12.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-12] - inventory-driven, day-one render, tray, shared drawer.
- [Source: _bmad-output/planning-artifacts/architecture.md#AR-8] - MapLibre GL 5.x read-only, custom style, self-hosted geometry, PLSS/Census boundaries, no paid key.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md#farm-map, EXPERIENCE.md#Map lens] - pins colored by attention green->clay, tap -> drawer, "no location yet" tray, identical behavior across surfaces.
- [Source: src/lib/onboarding/geocode.ts] - the existing stubbed geocode boundary the resolver seam references.
- [Source: src/app/(app)/_components/chart-lens.tsx, meter-drawer.tsx; src/lib/dashboard/lens.ts] - island patterns, the drawer seam, the registry flip.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- tsc exit 0; lint clean (after moving the latest-pins/opener ref writes into effects per react-hooks/refs); npm test -> 55 files / 374 tests green (+5 map.test.ts; lens.test.ts updated for map availability). maplibre-gl ^5.24.0 installed clean against React 19 (no peer conflict - checked before coding, the 2.8 visx lesson). Browser-verified via Playwright on the real account: `?lens=map` renders the MapLibre canvas with ZERO pins and the tray reading "46 meters with no location yet"; expanding lists 46 buttons; a tray click opens the drawer and sets `?meter=`; the Map tab carries no "coming" tag; a rate filter narrows the tray ("1 meter with no location yet" under AGA2); chart remains the default face at `/`; zero page errors. PIN rendering verified end-to-end by temporarily setting coordinates on two real meters (one reconciled, one needs_review) then reverting to null: 2 marker buttons rendered, tray dropped to 44, arias "Open meter 4698006011, Looks calm" / "Open meter P067, Needs attention", dot colors computed to the green/clay tokens (rgb(47,168,79) / rgb(189,75,52)), pin click opened the drawer. Dev DB restored (0 meters with latlng).

### Completion Notes List

- **The Map lens is live and honest about today's geo data.** The real account carries no coordinates, no addresses, and the schema has no PLSS field (an Epic 1 extraction gap), so the live surface is the day-one inventory truth: a calm paper canvas plus the full "no location yet" tray, every meter present and drawer-openable, none dropped or fake-pinned. Pins light up per meter as locations land.
- **AC2 shipped as the seam it can be:** resolution order documented in the pure module (inventory lat/lng live; PLSS centroid TODO with its upstream extraction; Census geocode via the existing stubbed boundary in src/lib/onboarding/geocode.ts). The dead-weight PLSS fixture is deliberately deferred WITH its upstream data source - recorded in deferred-work.md.
- **Pins are real buttons** (DOM-element markers): 44px hit area, aria name + state, click/Enter -> the nuqs `meter` key -> the 2.5 drawer; colors are the two honest concern signals (needs_review coverage / BAD status -> clay; else green), always paired with the state word and a visible legend. No $-at-risk shading until Epic 3 has a $ model.
- **Zero external calls hold:** no tile source (the committed minimal style is the warm-paper token read at runtime - no hex in code), no geocoder call, no paid key. maplibre-gl loads lazily inside the island effect so the Chart/Table faces pay no bundle cost; the map instance and markers are cleaned up on unmount, and the init effect depends on the conditional container mount (the 2.8 observer lesson).
- **Contracts reused:** filterMeters narrows pins AND tray; empty-view + clear affordance pattern shared; lens registry flip left chart as the default; `?lens=map` deep links resolve.

### File List

- `src/lib/dashboard/map.ts` (new) - pure toMapPins (pins vs tray, validity gate, attention flag, resolver-seam docs).
- `src/lib/dashboard/map.test.ts` (new) - 5 derivation tests.
- `src/app/(app)/_components/map-lens.tsx` (new) - the Map lens client island (lazy MapLibre, DOM-button markers, tray).
- `src/lib/dashboard/lens.ts` (modified) - map available: true.
- `src/lib/dashboard/lens.test.ts` (modified) - map passes through; calendar is the remaining fallback case.
- `src/app/(app)/_components/lens-region.tsx` (modified) - map branch.
- `src/copy/en.ts` (modified) - `shell.map` strings.
- `package.json` / `package-lock.json` (modified) - +maplibre-gl.
- `playwright.config.ts` (modified) - e2e health URL repaired to / (the removed /dashboard 404ed; pre-existing breakage surfaced by this story's validation).
- `_bmad-output/implementation-artifacts/deferred-work.md` (modified) - PLSS fixture deferral + review deferrals + the e2e spec-drift record.

## Code Review (2026-06-09)

Adversarial review (Blind Hunter + combined Edge/Acceptance Auditor) against baseline d5a22a3. Verdicts: AC1 MET (read-only MapLibre, token-sourced paper style, a DOM-button pin per valid-coordinate meter), AC2 PARTIAL AS LICENSED (resolution seam documented; PLSS fixture deferred with its upstream extraction gap, recorded), AC3 MET (clay/green from the two honest signals, color never alone, pin tap -> the shared drawer - verified end-to-end with temporary coordinates, reverted), AC4 MET (total partition pins+tray, tested; nothing dropped or fake-pinned), AC5 MET (pure inventory derivation; the zero-coordinate real account renders the full 46-meter tray day one). The reviewers confirmed the async init/cleanup choreography sound (cancelled flags + ref checks close the interleavings, StrictMode included) and the DB genuinely reverted after the pin verification.

Triage: 6 fixes applied (+1 out-of-story repair), 2 deferred with record, 3 dismissed-with-record (marker diffing at current scale; antimeridian bounds for a Central Valley product; sprint-status.yaml File List convention). Post-review validation: tsc exit 0, lint clean, 55 files / 374 tests green; browser re-verified (chevron tray, no container aria-label, canvas + 46 tray rows); `npm run build` compiles the production bundle clean.

## Change Log

- 2026-06-09: Code review - 6 patches (tray affordance, (0,0) artifact rule, refit-on-filter, comment honesty, container ARIA, token fallback) + the e2e health-URL repair; 2 deferred, 3 dismissed with record. lint + tsc + 374 tests + browser re-verification + production build green. Status -> done.
- 2026-06-09: Implemented Story 2.9 - the Map lens (read-only MapLibre on the paper canvas, focusable DOM-button pins colored by the two honest concern signals, the no-location tray with drawer-opening rows, filter contract reused, lazy bundle, zero external calls). PLSS fixture deferred with its upstream extraction gap. lint + tsc + 374 tests + browser verification (incl. a temporary-coordinates pin pass, reverted) green. Status -> review.
