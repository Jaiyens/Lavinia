---
baseline_commit: 297d6d099f90fb52359a27120f1fc54837aa5c35
---

# Story 3.6: Pump health flag

Status: done

## Story

As a grower,
I want my BAD-status pumps flagged in the table and drawer,
so that I can see equipment health without the tool inventing an efficiency number it cannot know.

## Acceptance Criteria

1. **Given** a meter's Status (GOOD / BAD / NEW WELL / OLD), **When** rendered, **Then** it is shown in the table and the drawer, and BAD is flagged as a health signal.

2. **Given** GPM is present but runtime/volume are not, **When** rendered, **Then** no kWh-per-gallon or efficiency figure is computed or shown.

### AC interpretation notes (read before coding)

This story is mostly ALREADY BUILT - it lands as a small completion + hardening pass, not a feature build. Probed 2026-06-09:

- **Already shipped (verify, do not rebuild):** the desktop table has the `status` column with `StatusCell` (BAD gets the clay alert-container chip, color never the only signal - the word renders) and status sorting (`table.ts`, `isFlagged: m.status === "BAD"`, pinned by `table.test.ts` "flags status === BAD"); the drawer's inventory section renders `FieldRow label={t.status} flagged={meter.status === "BAD"}` with the same chip treatment (2.5). `PumpStatus` union exists in `recommendations/types.ts`; `MeterView.status` is read verbatim from the master sheet, null when unknown.
- **The REAL GAP (AC1): the mobile card list shows no health signal.** `meter-table.tsx`'s `md:hidden` card list renders name / rate / cost / coverage pill only. The grower is mobile-first (project law). Add the BAD chip to the card (next to the coverage pill, same clay alert-container + verbatim word treatment as the desktop StatusCell). Deliberately BAD-only on the card: the card is the calm summary and BAD is the one concern signal; GOOD/NEW WELL/OLD stay on the desktop column and the drawer (one tap away). Do not invent a new color or chip style - reuse the exact flagged treatment.
- **The second gap (AC2): the never-an-efficiency-figure law has no regression guard.** Today no efficiency math exists anywhere (grep: only the FR-17 comment in types.ts mentions it) - the AC is satisfied by absence, which a future story could silently break. Pin it the way `no-raw-source-in-ui.test.ts` pins the source boundary: a small pure test asserting the meter-facing view models (`MeterView` built from a GPM-bearing meter, `toMeterRow`'s `MeterRow`, `toDrawerDetail`'s `DrawerDetail`) contain NO key matching /effic|gallon|kwhPer/i recursively, with a comment citing FR-17's reason (GPM exists; runtime and pumped volume do not; any efficiency number would be invented).
- **Data reality:** every meter's `status` is NULL today on BOTH farms (the real account's extraction has no status field - it comes from the master spreadsheet, whose import onto the real farm has not run; the synthetic demo seed never set it). So the live surfaces honestly read "Not on file" / empty cell. The flag lights up when the master sheet lands on the real farm - record that honestly in the Dev Agent Record; do NOT fabricate statuses to demo the chip. Browser-verify the chip with the 2.9/3.1 temp-data pattern (set one real pump's status to "BAD", verify table desktop + mobile card + drawer, revert, confirm restored).
- **Status values render verbatim** (stored from the sheet's Status column via `toPumpStatus`, which fails to null on unrecognized values - never fabricated). No new copy strings should be needed beyond what exists (`t.status`, the chip is the verbatim word); if the mobile card needs an aria string, it goes in `/copy` `shell.table`.

## Tasks / Subtasks

- [x] **Task 1: Mobile card BAD chip** - `meter-table.tsx` mobile list: when `row.isFlagged`, render the BAD chip (clay alert-container, verbatim status word, same classes as the desktop StatusCell - extract a tiny shared element if cleaner) beside the coverage pill; aria carries the health state in words. No chip for non-BAD statuses on the card. (AC1)
- [x] **Task 2: The no-efficiency guard** - new `src/lib/dashboard/no-efficiency-figure.test.ts` (or colocated in table.test.ts/drawer.test.ts if cleaner): build a meter with `gpm: 450`, project through `toMeterRow` + `toDrawerDetail` + the raw MeterView shape, recursively assert no key matches /effic|gallon|kwhper/i; comment cites FR-17 (runtime/volume absent; a figure would be invented). (AC2)
- [x] **Task 3: Verify + gates** - temp-data browser verification (one real pump -> "BAD" -> desktop cell + mobile card chip + drawer row all flag -> revert, db restored); lint + tsc + full `npm test` + `npm run build` green; honest Dev Agent Record (all live statuses null; the flag lights when the sheet import lands). (AC1, AC2)

## Dev Notes

### Scope boundary

- **No schema change, no new copy namespace, no engine work, no recommendation.** FR-17 explicitly scopes efficiency math OUT (runtime/volume data does not exist); BAD is a display flag, not a finding (no Recommendation row - the findings rail stays unchanged).
- **Do not restyle the existing StatusCell/drawer flag** - reuse the exact treatment (three colors max per screen; the clay chip is the established concern signal).

### What exists to build on

- `src/lib/dashboard/table.ts` - `MeterRow.isFlagged` (tested); `meter-table.tsx` StatusCell (the chip classes to reuse: alert-container/on-alert-container, type-label-caps, radius-control) and the mobile card list at the `md:hidden` block.
- `src/app/(app)/_components/meter-drawer.tsx` - the drawer's flagged FieldRow (already correct; verify only).
- `src/lib/normalize/no-raw-source-in-ui.test.ts` - the guard-test pattern (here the simpler view-model-keys variant suffices).
- Temp-data verification pattern: 2.9 (coordinates), 3.1 (recommendation) - set, verify, revert, confirm restored, record honestly.

### Critical guardrails

1. **Never fabricate a status** - null renders as honest absence everywhere.
2. **Color never the only signal** - the chip carries the verbatim word; mobile aria says it in words.
3. **TS strict; copy in /copy if any new string is needed; no em dashes.**
4. **Keep it small.** This is a completion pass; resist scope growth (the table column, drawer row, sorting, and union all exist).

### Previous story intelligence (3.5)

- The lens/table components follow the canonical nuqs keys; nothing here touches URL state.
- Gates at 3.5 close: lint, tsc, 62 files / 480 tests, production build, browser verification. Match.

### Project Structure Notes

- Modified: `src/app/(app)/_components/meter-table.tsx` (+ `src/copy/en.ts` only if an aria string is needed).
- New: the no-efficiency guard test.
- Untouched: everything else.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.6; prd.md#FR-17] - the two ACs; efficiency math out of scope until runtime/volume data exists.
- [Source: src/lib/dashboard/table.ts, table.test.ts; src/app/(app)/_components/meter-table.tsx; meter-drawer.tsx] - the shipped surfaces this story completes.
- [Source: dev.db probed 2026-06-09] - all statuses NULL on both farms; gpm NULL on all real meters.

### Review Findings

- [x] [Review][Patch] The mobile card's BAD chip was invisible to screen readers: the card button's aria-label overrides inner text, so "BAD" was never announced (Task 1's aria clause unimplemented). A flagged card now uses openMeterFlagged(name, status) so the health state rides in the accessible name [meter-table.tsx, en.ts]
- [x] [Review][Patch] The guard was key-name-only and too narrow: a kwPerGpm field (the most plausible first offender given gpm + peakKw both exist), a wireToWater score, or a "0.42 kWh per gallon" phrase in a label/note all passed. The scanner now also matches kw/kwh-per spellings, wireToWater, specificEnergy in KEYS and per-gallon/per-acre phrasings in STRING VALUES, with cycle safety, clean paths, and self-tests proving it catches violations at depth (a guard that cannot fail is not a guard) [no-efficiency-figure.test.ts]
- [x] [Review][Patch] The fixture was a sparse happy path and the second test was tautological (asserted the literal against itself): the meter is now rich (solar + NEM months + arrays + serial + full line items, exercising the projections' conditional branches), row.meter.gpm is asserted through the projection, and the BAD-only law is pinned negatively (GOOD / NEW WELL / OLD / null never flag) [no-efficiency-figure.test.ts]
- [x] [Review][Dismiss-noted] Maps/prototype getters escaping Object.entries: view models are RSC props, plain JSON by construction - stated in the guard's scope comment. StatusCell renders a span (valid inside the card button). The guard's breadth (findings/chart/map models unscanned) is a stated limit, not a silent one.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- tsc exit 0; lint clean; npm test -> 63 files / 482 tests green (+2 no-efficiency-figure guard tests); `npm run build` clean.
- Temp-data browser verification on the production build: set P041 (real farm) status to "BAD"; the table page rendered the BAD word twice (desktop StatusCell + the new mobile card chip, both clay alert-container with the verbatim word) and the drawer's status row flagged; reverted, db confirmed restored (0 non-null statuses on the real farm).

### Completion Notes List

- **The mobile card now carries the one concern signal (the real AC1 gap):** a flagged-BAD pump shows the same clay chip as the desktop status column, beside the coverage pill; healthy statuses stay calm on the card (full status one tap away in the drawer and on the desktop column). The desktop column, sorting, drawer row, and the tested isFlagged law were already shipped in 2.4/2.5 and are reused untouched.
- **The FR-17 honesty law is now a regression guard:** `no-efficiency-figure.test.ts` recursively asserts the meter-facing view models (MeterView with GPM + billing, MeterRow, DrawerDetail) carry no key matching /effic|gallon|kwhper/i - the absence the AC depends on can no longer be broken silently.
- **Honest data note:** every meter's status is null on both farms today (the real account's bills do not print pump health; status comes from the master spreadsheet, whose import onto the real farm has not run; the synthetic seed never set it). The surfaces read "Not on file" / empty - the flag lights up the day the sheet lands, with zero further code.

### File List

- `src/app/(app)/_components/meter-table.tsx` (modified) - mobile card renders the flagged StatusCell when isFlagged.
- `src/lib/dashboard/no-efficiency-figure.test.ts` (new) - the FR-17 guard (2 tests).

## Code Review (2026-06-09)

Adversarial review (Blind Hunter diff-only + Acceptance Auditor with repo access; the diff was 105 lines, two layers sufficed) against baseline 297d6d0. The auditor verified all three AC1 surfaces in code (desktop column, new mobile chip, drawer row - the verbatim word everywhere, zero new styles), executed the guard's recursion standalone against planted violations, grepped src for efficiency math (absence confirmed), confirmed dev.db statuses all NULL and the temp-data verification reverted. Both ACs PASS.

Triage of ~12 raw findings: 3 patch groups applied (the SR-inaudible chip - a real miss of the story's own task clause; the value-blind/narrow guard hardened with self-tests; the tautological fixture enriched and the BAD-only law pinned negatively), the rest dismissed with reason (plain-JSON view models make the Maps/getter gap unreachable; StatusCell is a span; guard breadth is a documented scope limit; cropCoefficient matching /effic/ lives outside the scanned models).

Post-review validation: tsc exit 0, lint clean, 63 files / 483 tests green, production build clean, browser re-verified ("Its status is BAD" in the flagged card's accessible name; temp data reverted, 0 non-null statuses).

## Change Log

- 2026-06-09: Code review - 3 patch groups (SR-audible flagged card label, value-aware hardened guard with self-tests, enriched fixture + negative BAD-only pins), rest dismissed with reason. lint + tsc + 483 tests + production build + browser re-verification green. Status -> done.
- 2026-06-09: Implemented Story 3.6 - completed the already-shipped health-flag surfaces with the missing mobile-card BAD chip (same clay treatment, BAD-only on the calm card) and pinned the never-an-efficiency-figure law as a recursive view-model guard test. lint + tsc + 482 tests + production build + temp-data browser verification (reverted) green. Status -> review.
