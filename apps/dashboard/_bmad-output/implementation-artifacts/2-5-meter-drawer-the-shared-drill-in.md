---
baseline_commit: 7b9b931
---

# Story 2.5: Meter drawer - the shared drill-in

Status: done

## Story

As a grower,
I want one place that shows a meter's full detail without leaving the screen I am on,
so that I can dig into any pump from the table, chart, or map and come right back.

## Acceptance Criteria

1. **Given** any table row (and later map pin / chart bar), **When** clicked, **Then** a side drawer (desktop) / full-height sheet (mobile) opens with that meter's canonical billing detail (rate, TOU split, demand) + inventory (pump name, ranch, crop, GPM, status), without leaving context.

2. **Given** a solar meter, **When** the drawer opens, **Then** it additionally shows Array linkage, NEM allocation, and True-up.

3. **Given** the nuqs `meter` key, **When** the drawer is open, **Then** it is URL-encoded and survives refresh and lens switches; closing returns to the lens it came from with state intact.

4. **Given** that meter's findings, **When** the drawer opens, **Then** a findings section exists in the drawer (populated by Epic 3), each tracing to data visible there.

### AC interpretation notes (read before coding)

This story builds the single shared drill-in surface (FR-10 / UX-DR12): a client island that reads the nuqs `meter` key (already SET by the 2.4 table row click and the 2.3 mover card) and renders that meter's full detail over the canonical `MeterView`. It is the ONLY meter-detail surface; 2.8 (chart bar) and 2.9 (map pin) open this exact drawer by setting the same key.

- **Open/close is pure URL state (AC1, AC3):** the drawer is a client island receiving `meters: MeterView[]` from the server component; it reads `meter` via `useQueryState("meter")` and renders when the id matches a meter. Closing = `setMeter(null)`. Because lens switching only writes the `lens` key, the open drawer survives lens switches for free; because it is URL state, it survives refresh (deep link). A stale/unknown `meter` id renders NO drawer (no error screen, no fabricated meter); do not auto-clear the key.
- **Billing detail, coverage-gated (AC1):** show the latest period's rate (period `tariff`, falling back to inventory `rateSchedule`), the TOU split (the period's `tou_energy` line items: label, kWh quantity, amount), the demand charge (`demandCents`, with `peakKw` shown in grower terms only - the label is plain, e.g. "Demand charge", never "kW peak" as jargon-first), other line items, and the period printed total. EVERY dollar figure is gated on `coverageState === "reconciled"`: a needs_review / no_bill meter shows its full inventory detail + the one shared coverage treatment (`CoveragePill` + label), NEVER a number, $0, or blank. A reconciled meter with no demand line shows a neutral "None" (honest absence, same convention as the 2.4 table). The one negative NEM-credit total on the real account (P002, -$149.11) renders "-$149.11", never clamped.
- **Period history:** below the latest-period detail, list prior periods (close date + printed total, reconciled only) when >=2 periods exist; with one period, no history block (hidden, not faked). Only 2 meters on the real account have >=2 periods and both are needs_review, so the history block will mostly not render today - that is honest.
- **Inventory section (AC1):** pump name (already the drawer title), grower Pump ID, SA ID (`serviceId`), account number, ranch, entity, crop, GPM, status. On the REAL account ranch/entity/crop/status/GPM are null on every meter - render the em-dash/"Not on file" placeholder used by the table, never fabricate. `status === "BAD"` gets the alert tint + label (same two honest concern signals as 2.4). `isLegacy` true shows the legacy flag label.
- **Solar section (AC2):** renders ONLY when `meter.isSolar || meter.nemType != null`. Shows: NEM program (`nemType`), True-up month (`trueUpMonth`, rendered as a month name), paired array nameplate (`solarKw`), and Array linkage (the `benefitingArrays` relation: name + nameplate per array). DATA REALITY: the real 46-meter account has ZERO solar meters, so this section is exercised via unit tests + the demo seed (2 solar pumps: nem2, true-up months 4 and 9, 840/1092 kW); the `SolarArray` table is EMPTY everywhere and NEM monthly allocation rows are not persisted yet, so array linkage renders an honest "Not on file" absence when the relation is empty, and NEM allocation renders as a labeled absence line - NEVER a fabricated allocation. Build the section so it lights up when Epic 1 backfills arrays/NEM rows; do not block on that data.
- **Findings section (AC4):** a section header + a calm empty state ("Nothing needs you on this meter") from `/copy`. Epic 3 (story 3.1) populates it with finding cards. Do NOT build the finding card here; just the labeled section seam.
- **Form factor:** desktop = right-side panel overlay (fixed, right-0, top/bottom-0, width ~26rem / max-w-full), `--radius-lg` on the leading edge, `--shadow-elevated`, hairline `outline-variant` border, scrollable. Mobile (< md) = full-height sheet (inset-0, full width). The drawer is one of only two elements that lift meaningfully (DESIGN.md). A scrim behind it (click closes) on both form factors.
- **Motion:** slide-in from the right (desktop) / up (mobile) with the house easing `cubic-bezier(0.16, 1, 0.3, 1)`, 400-700ms - CSS transition/keyframe like the 2.2 reveal (no `motion` library); `prefers-reduced-motion` renders the final state instantly (the existing global reduced-motion rule already truncates animation durations - verify it covers the drawer's animation).
- **A11y:** `role="dialog"` + `aria-modal` + `aria-label` announcing the meter ("Meter detail: {name}"); focus moves to the close button on open and Escape closes; tap targets >= 44px; color never the only signal (coverage/status always tinted AND labeled); body scroll locked while open.
- **Canonical shape only:** read `MeterView` from `@/lib/dashboard/load`; no raw-source import (`no-raw-source-in-ui.test.ts` stays green). Money via `formatUsd(cents)`, `.type-num`/`tnum`. Copy in `src/copy/en.ts` (`shell.drawer`), grower language, no kW-jargon-first labels, no em dashes, no exclamation marks.

## Tasks / Subtasks

- [x] **Task 1: Extend MeterView for the drawer (load.ts)** - add `cropName: string | null` (via `crop: { select: { name: true } }`), `trueUpMonth: number | null`, `solarKw: number | null`, and `benefitingArrays: { id: string; name: string | null; nameplateKw: number; nemType: string | null; trueUpMonth: number | null }[]` (via the `benefitingArrays` NEMA relation) to `MeterView` + the `loadMetersForFarm` query/projection. Purely additive; existing consumers (kpi/table) untouched. (AC1, AC2)
- [x] **Task 2: Pure drawer derivation** - `src/lib/dashboard/drawer.ts`: `toDrawerDetail(meter: MeterView)` returning the render model: `{ latest: { tariff, touRows, demandCents, peakKw, otherRows, totalCents, close } | null, history: { close, totalCents }[], showSolar, solar: { nemType, trueUpMonth, solarKw, arrays }, isCovered }` - latest period = last of `periods` (start-ascending); `touRows` from `kind === "tou_energy"` line items; `otherRows` = non-tou, non-demand items; figures only when `coverageState === "reconciled"` (gate INSIDE the pure function so the component cannot leak an ungated number); history = prior reconciled periods, newest first. Colocated `drawer.test.ts`: gating (needs_review yields no figures), TOU row projection, demand present/absent/zero distinction, negative total preserved, history ordering + single-period empty, solar flag logic (isSolar OR nemType), empty-arrays honesty, purity. (AC1, AC2)
- [x] **Task 3: Drawer component** - `src/app/(app)/_components/meter-drawer.tsx` (client island): reads `meter` key, finds the meter, renders scrim + panel (desktop right drawer / mobile full-height sheet), slide-in CSS animation honoring reduced motion, `role="dialog"` + `aria-modal` + meter-announcing label, close button (focused on open), Escape + scrim click close via `setMeter(null)`, body scroll lock while open. Sections: header (name, growerPumpId, SA ID, account, CoveragePill, rate schedule, legacy flag) -> billing detail (TOU split rows, demand, other items, total; coverage treatment when withheld) -> inventory (ranch, entity, crop, GPM, status with BAD alert treatment) -> solar (conditional, AC2) -> findings seam (AC4). Money via `formatUsd`, tabular figures, tokens only (no hex). (AC1-4)
- [x] **Task 4: Mount it** - `energy-dashboard.tsx`: render `<MeterDrawer meters={meters} />` after `<LensRegion>` (inside the server component, outside the Reveal stagger so a deep-linked drawer is not delayed by the reveal). (AC1, AC3)
- [x] **Task 5: Copy** - `src/copy/en.ts` `shell.drawer`: section headers (billing/inventory/solar/findings), field labels (rate, demand, total, ranch, entity, crop, GPM, status, account, SA ID, pump ID, NEM program, true-up, array, nameplate), "Not on file", demand "None", findings empty line, close label, dialog label prefix, history header. Grower language, no jargon-first labels. (AC1, AC2, AC4)
- [x] **Task 6: Tests + validate** - `drawer.test.ts` green; `npm run lint`, `npx tsc --noEmit`, `npm test` all green; `no-raw-source-in-ui.test.ts` green. Browser-verify at :3000 on the real account: row click opens the drawer with `?meter=<id>` in the URL; refresh with the key keeps it open; switching lens keeps it open; close returns to the same lens + filter; a needs_review meter shows the coverage treatment and NO dollar figure; the negative-credit meter (P002) reads "-$149.11"; mobile renders the full-height sheet. (AC1-4)

### Review Findings

- [x] [Review][Patch] Billing dates rendered a day early for Pacific users (no timeZone on the formatter; SSR/CSR mismatch risk) [meter-drawer.tsx]
- [x] [Review][Patch] A null bill total would read "None" (demand copy) instead of the no-value dash [meter-drawer.tsx]
- [x] [Review][Patch] aria-modal without a focus trap let Tab walk into the scroll-locked background [meter-drawer.tsx]
- [x] [Review][Patch] Switching meters while open kept stale scroll/focus (dialog not keyed, effect not meter-dependent) [meter-drawer.tsx]
- [x] [Review][Patch] The derived period tariff was never rendered; header always showed the inventory rate [meter-drawer.tsx]
- [x] [Review][Patch] NEM allocation missing as the spec'd labeled absence row in the solar section [meter-drawer.tsx, en.ts]
- [x] [Review][Patch] Hardcoded " to " between period dates moved to /copy (periodRange) [meter-drawer.tsx, en.ts]
- [x] [Review][Patch] Long meter name could not truncate (flex min-width); forces horizontal scroll [meter-drawer.tsx]
- [x] [Review][Patch] Empty-string inventory values rendered blank instead of "Not on file" [meter-drawer.tsx]
- [x] [Review][Patch] Duplicate React key when two history periods share a close date [meter-drawer.tsx]
- [x] [Review][Patch] TOU quantity labeled kWh without checking the line item's unit [drawer.ts, drawer.test.ts]
- [x] [Review][Patch] benefitingArrays loaded with nondeterministic order; now ordered by name [load.ts]
- [x] [Review][Patch] Misleading "stale deep link" comment on the unreachable narrowing guard [meter-drawer.tsx]
- [x] [Review][Patch] Numeric sub-lines (kWh, peak note, GPM) lacked tabular figures [meter-drawer.tsx]

## Dev Notes

### Scope boundary

- **Drawer only.** The finding CARD inside the findings section is Story 3.1 (this story ships the labeled section + calm empty state). The chart-bar open is 2.8, the map-pin open is 2.9 - both just set the same `meter` key; nothing here anticipates them beyond reading that key. Filter controls are 2.6.
- **No new dependency.** CSS-animated overlay; no dialog/drawer/focus-trap library (and do not reach for `@base-ui-components/react` - unused so far; plain JSX + small effects keep the island light). `motion` stays unused (the 2.2 reveal precedent is CSS keyframes).
- **No fabricated figure.** Unreconciled -> coverage treatment, never a number. Empty solar relations -> labeled absence. Null inventory fields -> "Not on file" placeholder.
- **Minimal dialog semantics, deliberately.** Focus-on-open (close button), Escape, scrim click, `aria-modal`, body scroll lock. A full roving focus trap is out of scope; note it in the Dev Agent Record if you skip it.

### What exists to build on

- **`src/lib/dashboard/load.ts`** - `MeterView` (id, name, serviceId, rateSchedule, isLegacy, status, coverageState, accountNumber, ranchName, entityName, latitude, longitude, gpm, isSolar, nemType, growerPumpId, periods[]). `MeterPeriodView` carries start/close (ISO), `printedTotalCents` (null until reconciled), `demandCents` (demand-kind line items summed, else legacy float fallback, else null), `peakKw`, `tariff`, `lineItems[]` (`kind: "tou_energy"|"demand"|"nbc"|"other"`, label, amountCents, quantity, unit, rate). Periods are start-ascending. THIS STORY EXTENDS IT (Task 1) with cropName/trueUpMonth/solarKw/benefitingArrays - additive only.
- **Prisma relations for Task 1:** `Pump.crop` (`Crop?` via `cropId`), `Pump.trueUpMonth Int?`, `Pump.solarKw Float?`, `Pump.benefitingArrays SolarArray[] @relation("NemAllocation")` (schema.prisma ~99-163); `SolarArray` (name?, nameplateKw, nemType?, trueUpMonth?, saId?) at ~281. No schema change needed - the fields all exist.
- **Data reality (probed 2026-06-09):** dashboard serves the REAL farm (`real-4699664587-8`, 46 meters): zero solar/NEM meters, ranch/entity/crop/status/GPM null everywhere, coverage {reconciled: 39, needs_review: 7}, one negative latest total (P002, -14911 cents), 23 meters carry a demand charge, only 2 meters have >=2 periods (both needs_review). Demo seed (isDemo) has the 2 solar pumps (nem2, trueUpMonth 4/9, solarKw 840/1092, gpm set). `SolarArray` table empty in both; no NEM allocation rows persisted.
- **`src/app/(app)/_components/meter-table.tsx`** - the client-island pattern, sets `meter` on row click (the seam this drawer reads); `coverage-pill.tsx` - the ONE coverage render treatment (reuse verbatim; do not invent a second). `kpi-strip.tsx` - `useQueryState("meter")` setter precedent. `lens-toggle.tsx` - only writes `lens` (why the drawer survives lens switches).
- **`energy-dashboard.tsx`** - the server component that loads `meters` and composes the center stack; mount the drawer here (it already has the data; the layout does not).
- **`src/components/ui/severity-badge.tsx`** - badge treatment precedent; `src/lib/format/money.ts` `formatUsd(cents)`; `src/lib/cn` `cn`.
- **`src/app/globals.css`** - tokens: `--radius-lg` (drawer-scale objects), `--shadow-elevated`, `bg-surface`/`bg-surface-container-*`, `border-outline-variant`, `bg-alert-container`/`text-on-alert-container`, `.type-title`/`.type-label-caps`/`.type-num tnum`/`.type-caption`, the global `prefers-reduced-motion` rule (verify it covers the drawer animation; extend it if the drawer uses a transition the rule misses).
- **Copy** - `src/copy/en.ts` `shell.table.coverage` labels exist (comment says "reused by the drawer (2.5)"); add `shell.drawer` alongside.

### Critical guardrails

1. **AR-15 / never invent a number.** Gate every figure on `coverageState === "reconciled"` inside the PURE function (Task 2), not in JSX. Withheld -> CoveragePill + label. Reconciled-no-demand -> "None". Negative credit -> "-$X.XX".
2. **One coverage render treatment.** Reuse `CoveragePill`. Color always paired with the text label.
3. **Canonical nuqs keys only.** The drawer reads/writes `meter` and touches NOTHING else (`lens`/`entity`/`ranch`/`rate` stay intact through open/close - that is AC3's "state intact").
4. **Canonical shape only in /app.** `MeterView` from `@/lib/dashboard/load`; keep `no-raw-source-in-ui` green.
5. **Pure derivations tested.** `toDrawerDetail` in `/lib/dashboard/drawer.ts` (no DB, no UI); the component only renders.
6. **TS strict + no-`any` + `noUncheckedIndexedAccess`** - guard `periods[periods.length - 1]`, line-item access, array relation access.
7. **Copy in /copy, grower language.** Plain labels ("Demand charge", "True-up month"), no kW-first jargon, no em dashes, no exclamation marks. Month names for trueUpMonth, not "4".
8. **Money in one place.** `formatUsd(cents)`; `.type-num`/`tnum` on every figure.
9. **Mobile-first / a11y.** Full-height sheet < md; tap targets >= 44px; `role="dialog"` + label announces the meter; Escape + scrim close; focus to close button on open; body scroll lock; reduced motion instant.
10. **Design system.** Tokens only (no hex); `--radius-lg` + `--shadow-elevated` + hairline border (the drawer is one of the only two lifted elements); three colors max; the house easing for the slide.

### Previous story intelligence (2.4)

- The table row click ALREADY sets `meter` (verified in 2.4's browser pass: `?meter=cmq6is675009pg7spwr1axtqm`); the KPI mover card sets it too. This story is the reader side.
- 2.4 established: pure derivations in `/lib/dashboard/*` with the component render-only; the `CoveragePill` shared treatment built explicitly for reuse here; "Not on file" em-dash placeholder convention for null inventory fields; honest empty-state distinctions; review flagged stacked-duplicate coverage labels (pill + text repeating the same words) - do not repeat that mistake in the drawer (the pill alone carries the state where both would collide).
- 2.4 review deferred component-level render tests as acceptable; same stance here (pure derivation tests + browser verification; no RTL).
- Lint/typecheck/test gates used throughout: `npm run lint`, `npx tsc --noEmit`, `npm test` (334 tests green at 2.4 close).

### Project Structure Notes

- New: `src/lib/dashboard/drawer.ts` + `drawer.test.ts`, `src/app/(app)/_components/meter-drawer.tsx`.
- Modified: `src/lib/dashboard/load.ts` (additive MeterView fields), `src/app/(app)/_components/energy-dashboard.tsx` (mount), `src/copy/en.ts` (`shell.drawer`).
- Architecture's notional `meter-drawer.tsx` location matches the existing flat `_components/` layout (the repo uses `src/app/(app)/_components/`, not the architecture sketch's `energy/` subfolder - follow the repo).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.5] - the four ACs verbatim; FR-10.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-10] - billing detail (rate, TOU split, demand) + inventory (pump name, ranch, crop, GPM, status); solar adds Array linkage, NEM allocation, True-up; findings appear in the drawer.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md#Components (meter-drawer), #Elevation, #Shapes] - right-side desktop / full-height mobile; the drawer + bottom sheet are the only meaningfully lifted elements; `lg` rounding; warm diffuse shadow.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md#Component patterns, #Accessibility] - same content regardless of source lens; closes to the lens it came from, state intact; the drawer announces its meter; reduce-motion instant; tap targets >= 44pt.
- [Source: _bmad-output/planning-artifacts/architecture.md#URL state, #State unions, #Money & Numbers, #Project Structure] - `meter` = open-drawer key, fixed nuqs keys; coverageState one union one treatment; integer cents + `formatUsd`; client-island drawer.
- [Source: _bmad-output/implementation-artifacts/2-4-meter-table-the-p0-lens.md] - the setter seam, CoveragePill reuse contract, honest-placeholder conventions, review learnings.
- [Source: src/lib/dashboard/load.ts, prisma/schema.prisma] - MeterView + the Pump/SolarArray relations Task 1 projects.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` -> 51 files / 345 tests green (+11 drawer.test.ts); `no-raw-source-in-ui.test.ts` green. Browser-verified via Playwright on the real account (46 meters): deep link `?lens=table&meter=<reconciled-id>` opens the dialog (`aria-label` "Meter detail: 4698006011") with This cycle / On the farm / Findings sections and real dollar figures; `?lens=chart&meter=<id>` keeps the drawer open (lens switch never drops `meter`); closing from `?lens=table&rate=AGA2&meter=<id>` lands on `?lens=table&rate=AGA2` (state intact); the needs_review meter P067 shows the withheld note + "Needs review" pill and ZERO dollar figures; the negative NEM credit on P002 renders "-$149.11" with its NEM line items ("Total NEM Charges Before Taxes" -$184.60); row click opens + Escape closes + `meter` clears; a stale `?meter=nope-123` renders no drawer and the table still shows 46 rows; focus lands on the close button on open; mobile (390x844) renders the full-height sheet (dialog box 0,0,390,844); desktop + mobile screenshots captured.

### Completion Notes List

- **The shared drill-in is live.** `MeterDrawer` (client island) reads the nuqs `meter` key the 2.4 table row / 2.3 mover card already set, finds the meter in the canonical `MeterView[]`, and renders header (name + CoveragePill + rate + legacy chip), identity rows (Pump ID / SA / account), coverage-gated billing detail (TOU rows, demand with peak note, other charges, bill total), past cycles (only when >=2 reconciled periods), inventory (ranch/entity/crop/flow/status, nulls read "Not on file"), the conditional solar section, and the findings seam for Epic 3.
- **AR-15 lives in the pure layer:** `toDrawerDetail` (drawer.ts) yields `latest = null` / empty history for any non-reconciled meter, so the component cannot leak an ungated figure. Demand absent (null -> "None") stays distinct from a genuine $0; the negative credit total is preserved; TOU rows come only from `tou_energy` line items.
- **MeterView extended additively** (cropName, trueUpMonth, solarKw, benefitingArrays via the NEMA relation); kpi/table consumers untouched; both existing test fixture builders updated.
- **Solar honesty:** section renders for `isSolar || nemType` only; with the `SolarArray` table empty everywhere today, array linkage reads "Not on file" - it lights up when Epic 1 backfills arrays. The real account has zero solar meters, so the section is covered by unit tests; P002 carries NEM line items in billing (printed verbatim) without an inventory solar flag, which renders honestly as a non-solar meter with NEM charges.
- **Form factor + motion:** desktop right panel (26rem, `--radius-lg` leading edge, `--shadow-elevated`, hairline border) / mobile full-height sheet; slide-in keyframes (`terra-drawer-in`/`terra-sheet-in`, house easing, 450ms) added to globals.css and wired into the reduced-motion block (instant final state).
- **Minimal dialog semantics, as scoped:** `role="dialog"` + `aria-modal` + meter-announcing label, focus to the close button on open, Escape + scrim click close, body scroll lock. A full roving focus trap and focus-return-to-trigger were deliberately skipped (story scope note); the scrim makes the drawer modal, so the lens toggle is not clickable while open - the AC3 invariant (lens switch never drops `meter`) holds at the URL layer and was verified.
- **Date/number rendering** uses local `Intl` formatters (en-US) in the component; all user-facing STRINGS live in `en.shell.drawer` (localization-ready); month names for true-up come from copy, not date math.

### File List

- `src/lib/dashboard/drawer.ts` (new) - pure `toDrawerDetail` render-model derivation (the AR-15 gate).
- `src/lib/dashboard/drawer.test.ts` (new) - 11 derivation tests.
- `src/app/(app)/_components/meter-drawer.tsx` (new) - the drawer client island (desktop panel + mobile sheet).
- `src/lib/dashboard/load.ts` (modified) - additive MeterView fields: cropName, trueUpMonth, solarKw, benefitingArrays (+ query includes).
- `src/lib/dashboard/kpi.test.ts` (modified) - fixture builder gains the new MeterView fields.
- `src/lib/dashboard/table.test.ts` (modified) - fixture builder gains the new MeterView fields.
- `src/app/(app)/_components/energy-dashboard.tsx` (modified) - mounts `<MeterDrawer meters={meters} />` outside the Reveal stagger.
- `src/app/globals.css` (modified) - `terra-drawer-in`/`terra-sheet-in` keyframes + `.drawer-in` + reduced-motion coverage.
- `src/copy/en.ts` (modified) - `shell.drawer` strings.

## Code Review (2026-06-09)

Adversarial review across three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) against baseline 7b9b931. Verdict after patches: AC1 MET (all billing + inventory fields render coverage-gated with honest placeholders; the period tariff now drives the header rate with inventory fallback), AC2 MET (solar section with NEM program, true-up month name, nameplate, array linkage, and the labeled NEM-allocation absence row; renders only for solar meters), AC3 MET (pure `meter` URL state; survives refresh and lens switches; closing preserves lens + filters; stale ids render nothing), AC4 MET (findings seam with calm empty state). The pure derivation layer was found solid; all real defects were in the component layer.

Triage: 14 fixes applied, 0 deferred, 3 dismissed-with-record (sprint-status.yaml in the File List - house convention excludes workflow bookkeeping; the peak-note phrasing matches the EXPERIENCE.md do-column verbatim; per-array nemType/trueUpMonth carried on MeterArrayView but unused by the drawer - a deliberate additive seam).

### Fixed (patches applied this story)

- [Patch] **Cycle dates rendered a day early for Pacific users** [meter-drawer.tsx] - Blind+Edge, High. Period bounds are midnight-UTC instants; the formatter had no timeZone, so en-US viewers west of UTC saw every cycle date (and the whole history list) shifted a day, plus an SSR/CSR hydration text risk on deep links. Now `timeZone: "UTC"`. Browser-verified: P002 reads "Feb 11, 2026 to Mar 12, 2026", matching the stored period exactly.
- [Patch] **Null bill total read "None"** [meter-drawer.tsx] - Blind+Edge+Auditor. MoneyRow reused the demand row's "None" for any null; a missing printed total would have been an affirmative zero-charge claim. Each row now names its own null treatment (total -> the no-value dash). Unreachable on today's data; honest in shared code.
- [Patch] **aria-modal without a focus trap** [meter-drawer.tsx] - Blind+Edge. Tab walked out of the dialog into the scroll-locked background that aria-modal told assistive tech does not exist. A Tab/Shift+Tab cycle now keeps focus inside the dialog (browser-verified).
- [Patch] **Stale scroll/focus when the open drawer switches meter** [meter-drawer.tsx] - Edge. Back/forward (or the KPI mover) can swap `meter` while open; the unkeyed dialog kept meter A's scroll offset on meter B. The dialog is now keyed by meter id (remount resets scroll and re-fires the entrance) and the focus effect depends on meterId.
- [Patch] **Derived period tariff never rendered** [meter-drawer.tsx] - Blind+Edge+Auditor. `toDrawerDetail` computed the printed-tariff-first fallback but the header always showed the inventory rate, hiding exactly the mis-rating signal the product leads with. The header now shows `d.latest?.tariff ?? meter.rateSchedule`.
- [Patch] **NEM allocation absent from the solar section** [meter-drawer.tsx, en.ts] - Auditor (AC2). The spec required a labeled absence line, not omission. Added the "Credit allocation" row reading "Not on file" until Epic 1 persists allocation rows.
- [Patch] **Hardcoded " to " in the period range** [meter-drawer.tsx, en.ts] - Auditor. Moved to `shell.drawer.periodRange` (localization-ready).
- [Patch] **Long meter name overflowed instead of truncating** [meter-drawer.tsx] - Edge. `truncate` on a flex item without min-width constraints never engages; added `min-w-0 max-w-full` (table parity).
- [Patch] **Empty-string inventory values rendered blank** [meter-drawer.tsx] - Edge. FieldRow now treats `""` like null ("Not on file"), matching the header rate guard and the table's TextCell.
- [Patch] **Duplicate React key on shared close dates** [meter-drawer.tsx] - Edge. History keys now carry the index.
- [Patch] **TOU quantity labeled kWh without checking the unit** [drawer.ts] - Edge. A kW/unitless quantity no longer renders under a fabricated kWh unit; covered by a new test (12 drawer tests).
- [Patch] **Nondeterministic array order** [load.ts] - Blind. `benefitingArrays` now ordered by name.
- [Patch] **Misleading dead-code comment** [meter-drawer.tsx] - Blind. The narrowing guard's comment no longer claims to handle the stale-deep-link case (the `open` gate does).
- [Patch] **Numeric sub-lines lacked tabular figures** [meter-drawer.tsx] - Auditor. kWh/peak/GPM/date sub-lines now carry `tnum`.

Post-review validation: `npx tsc --noEmit` exit 0, `npm run lint` clean, `npm test` 51 files / 346 tests green, browser re-verified (UTC dates, focus trap, allocation row only on solar, negative credit intact).

## Change Log

- 2026-06-09: Code review (3 adversarial layers) - 14 patches applied (UTC date rendering, honest null-total treatment, focus trap, meter-switch remount, period-tariff header, NEM-allocation absence row, copy extraction, truncation, empty-string parity, key collision, kWh unit gate, array ordering, comment honesty, tabular sub-lines), 0 deferred, 3 dismissed with record. lint + tsc + 346 tests + browser re-verification green. Status -> done.
- 2026-06-09: Implemented Story 2.5 - the shared meter drawer. Extended the canonical MeterView additively (crop, true-up, nameplate, NEMA array linkage), added the pure tested `toDrawerDetail` derivation with the coverage gate inside it, and built the URL-driven drawer island (desktop right panel / mobile full-height sheet, scrim, Escape, focus-on-open, scroll lock, slide-in with reduced-motion fallback), mounted over the canonical `MeterView[]`. Withheld meters show their state and zero figures; the negative NEM credit renders honestly; solar section renders only for solar meters with honest absences. lint + tsc + 345 tests + browser verification (desktop + mobile) green. Status -> review.
