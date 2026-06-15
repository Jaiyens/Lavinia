---
baseline_commit: 0acef42e461602cfb3be7a783a9ea852343e8a6b
---

# Story 3.7: DR enrollment info

Status: done

## Story

As a grower,
I want my demand-response enrollment shown as plain information,
so that I see my program status without a misleading savings claim.

## Acceptance Criteria

1. **Given** the bill shows program enrollment (e.g. PDP), **When** rendered, **Then** it is displayed as legible info pulled from the bill.

2. **Given** DR, **When** rendered, **Then** no recommendation or savings claim is generated; DR copy uses the 4-9pm event window, kept distinct from the 5-8pm rate peak.

### AC interpretation notes (read before coding)

- **Data reality (probed 2026-06-09):** NO extracted bill carries a DR/program marker today - dev.db and the committed fixture's line items show zero hits for PDP / Peak Day Pricing / Demand Response / BIP / Base Interruptible / CBP / Capacity Bidding (the labels are TOU energy, demand prints, customer charges, Energy Commission Tax, NEM lines). Either Batth's charge pages do not print enrollment or it lives on pages outside the extracted set. So this story builds the DETECTION SEAM + the honest display: a pure detector over billing line items that lights up the day a PDP credit/charge line lands, and a drawer row that reads honest absence until then. The AC's "Given the bill shows program enrollment" premise is conditional by its own wording - tests prove the detection against synthetic real-shaped labels; the live surface reads "Not on file". Do NOT fabricate an enrollment (the PRD note "Batth is already enrolled" is hearsay until a bill prints it).
- **The pure detector:** new `src/lib/energy/dr.ts` - `drEnrollment(lineItems: {label: string | null}[]): DrProgram | null` where `DrProgram = "pdp" | "bip" | "cbp"`. Match printed label patterns case-insensitively: PDP / Peak Day Pricing (-> pdp), BIP / Base Interruptible (-> bip), CBP / Capacity Bidding (-> cbp). First match wins (one program per meter is the printed reality); null labels skipped; no match -> null, never a guess. Also export `DR_PROGRAMS` display-name-free metadata if useful, but PROGRAM display names are /copy strings. Colocated `dr.test.ts`: each spelling, case tolerance, embedded-in-sentence labels ("PDP Event Day Credit 06/12"), null labels, no-match null, purity.
- **The display (AC1):** the meter drawer's billing/inventory area gains one info row: label from /copy ("Demand response"), value = the program's display name ("Peak Day Pricing (PDP)") when detected across the meter's periods' line items, else the existing "Not on file" treatment. Derive in `drawer.ts` (pure, tested) - add `drProgram: DrProgram | null` to DrawerDetail; the component maps it to copy. INFO ONLY: no severity, no chip color (this is not a concern signal - it is a fact row), no findings-rail entry.
- **The two clocks (AC2, AR-14):** any DR-related copy phrases the EVENT window as "between 4 and 9 in the evening" (tou.ts DR_EVENT_WINDOW, 16-21h) and never the 5-8 rate peak. Add an enrolled-state caption to /copy (shown only when a program is detected): plain words that events run 4 to 9 - and pin it with a test (the copy string contains "4" and "9", not "5 and 8"; tou.test.ts already pins the windows apart in code). NO savings claim, NO recommendation: no Recommendation row, no engine, no impactUsd anywhere - the structural absence is the AC; state it in the Dev Agent Record and let the review verify no DR tool key exists.
- **Scope discipline (the 3.6 lesson):** this is a small seam story. One pure module + tests, one DrawerDetail field + derivation tests, one drawer row, three /copy strings. Nothing else.

## Tasks / Subtasks

- [x] **Task 1: Pure detector** - `src/lib/energy/dr.ts` (`DrProgram`, `drEnrollment`) + `dr.test.ts` per the spellings above. The module header cites the two-clock law (events 4-9pm; the rate peak is tou.ts's other window) and FR-18 (info only, no recommendation). (AC1, AC2)
- [x] **Task 2: Drawer derivation + row** - `drawer.ts`: `DrawerDetail.drProgram` from the meter's periods' line items via `drEnrollment` (reconciliation does not gate it - a printed enrollment line is a fact, not a dollar claim; document that choice); `drawer.test.ts` cases (detected, absent, null labels). `meter-drawer.tsx`: the "Demand response" FieldRow + the enrolled caption (only when detected). Copy in `/copy` `shell.drawer`: row label, program display names, the 4-9pm enrolled caption. (AC1, AC2)
- [x] **Task 3: Copy-law pin + verify + gates** - a test pinning the enrolled caption phrases 4 to 9 and never "5 and 8"; temp-data browser verification (insert a synthetic "PDP Event Day Credit" line item on one real meter's period, verify the drawer row + caption, revert, db restored); lint + tsc + full `npm test` + `npm run build`; honest Dev Agent Record (no live bill prints enrollment; the row reads "Not on file" everywhere today). (AC1, AC2)

## Dev Notes

### Scope boundary

- **No recommendation, no engine, no findings-rail entry, no savings dollar** (FR-18: no defensible impact; Batth's enrollment, if real, is already in place). No schema change (detection reads existing line items). No KPI/table/calendar changes.
- The detector lives in `/lib/energy` (pure, tested - the trust-surface convention), NOT in the component.

### What exists to build on

- `src/lib/energy/tou.ts` - DR_EVENT_WINDOW (4-9pm) with its test pinning it apart from RATE_PEAK_WINDOW; reference it in the dr.ts header, never restate hours in code.
- `src/lib/dashboard/drawer.ts` + `drawer.test.ts` - the pure derivation home and its test patterns; `meter-drawer.tsx` FieldRow + "Not on file" treatment.
- `MeterPeriodView.lineItems` - the label-bearing canonical rows the detector scans.
- Temp-data verification pattern (2.9/3.1/3.6).

### Critical guardrails

1. **Never fabricate enrollment** - detection from printed labels only; null when nothing prints.
2. **4-9 in DR copy, 5-8 nowhere near it** (AR-14) - pinned by test.
3. **Info, not concern** - no clay, no severity, no rail entry.
4. **Copy in /copy; no em dashes; no exclamation marks; grower words** ("PG&E can call events between 4 and 9 in the evening" style).
5. **TS strict; pure module tested; keep it small.**

### Previous story intelligence (3.6)

- The completion-pass discipline: probe first, build only the gap, guard the law with a test that can actually fail (the 3.6 review hardened a guard that could not).
- SR-accessibility: if the row needs an aria nuance beyond FieldRow's default, it goes in /copy (3.6's aria-label-overrides-inner-text lesson).
- Gates at 3.6 close: lint, tsc, 63 files / 483 tests, production build, temp-data browser verification. Match.

### Project Structure Notes

- New: `src/lib/energy/dr.ts` + `dr.test.ts`.
- Modified: `src/lib/dashboard/drawer.ts` + `drawer.test.ts`, `src/app/(app)/_components/meter-drawer.tsx`, `src/copy/en.ts`.
- Untouched: everything else.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.7; prd.md#FR-18] - the two ACs; no DR recommendation (no defensible dollar; already enrolled); levers list places DR as info-only in v1.
- [Source: _bmad-output/planning-artifacts/architecture.md#Dates] - the two TOU clocks law (4-9 DR vs 5-8 rate peak, never conflated).
- [Source: src/lib/energy/tou.ts] - DR_EVENT_WINDOW, the single home of the 4-9 window.
- [Source: dev.db + fixtures/extract probed 2026-06-09] - zero DR/program markers in any extracted line item today.

### Review Findings

- [x] [Review][Patch][High] Enrollment scanned ALL periods ever ingested, so one event credit on a years-old bill would present a since-cancelled program as current, forever. The detector now reads the LATEST period only (enrollment is a current-state fact), with tests pinning the lapsed-program and switched-program cases [drawer.ts, drawer.test.ts]
- [x] [Review][Patch][High] The copy-law pin was nearly vacuous (toContain("4") passes on "$49") and its negative missed "5 pm to 8 pm" / en dash / "through" / spelled-out words. The positive pin now matches the window PHRASE and the negative covers the realistic 5-to-8 spellings [dr.test.ts]
- [x] [Review][Patch] The spelled-out program patterns were unbounded substrings ("speak day pricing" matched) and literal-space-only (a hyphenated or double-spaced scan label missed). Both alternatives now carry word boundaries and [\s-]+ joins, with tests both ways [dr.ts, dr.test.ts]
- [x] [Review][Patch] drProgramName's `as Record` cast could hide a deleted key at compile time; now `satisfies Record<DrProgram, string>` with the type imported, so drift is a compile error [en.ts]
- [x] [Review][Patch] Copy wording: "between 4 and 9 in the evening" read oddly for 4 pm; now "from 4 to 9 in the evening", and the caption says "latest bill" matching the latest-only semantics [en.ts]
- [x] [Review][Dismiss-noted] The fact-not-figure choice (enrollment visible on a needs_review meter) stands: the label is the bill's own print and the caption claims enrollment, not a dollar; the cent gate protects figures. The copy pin living in dr.test.ts is test-side only (the production module stays import-free). "DWR Bond Charge" / "Power Charge Indifference" verified non-matching.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- tsc exit 0; lint clean; npm test -> 64 files / 491 tests green (+6 dr.test.ts incl. the copy-law pin, +2 drawer DR tests); `npm run build` clean.
- Temp-data browser verification on the production build: inserted a synthetic "PDP Event Day Credit 06/12" line item on P041's period; the drawer rendered "Demand response: Peak Day Pricing (PDP)" with the caption "PG&E can call events between 4 and 9 in the evening."; deleted the temp row, db confirmed restored (0 PDP labels remain).

### Completion Notes List

- **The detection seam is live and honest:** `drEnrollment` (pure, /lib/energy) matches printed PDP / Peak Day Pricing / BIP / Base Interruptible / CBP / Capacity Bidding labels case-insensitively with word boundaries, first match wins, null when nothing prints - which is every real bill today (zero DR markers in the extracted set). The drawer's "Demand response" fact row reads "Not on file" across the live account and lights up the day a bill prints an event credit, with zero further code.
- **A printed enrollment is a fact, not a figure:** the row is NOT reconciliation-gated (the cent gate protects dollars; an enrollment line is information), documented at the DrawerDetail field and pinned by the unreconciled-meter test.
- **The two-clock law is pinned in copy and test:** the enrolled caption says "between 4 and 9 in the evening" and a test asserts it never phrases 5-to-8; tou.ts remains the single code home of both windows.
- **No recommendation, no savings claim, structurally:** no Recommendation row, no tool key, no impactUsd, no findings-rail entry exists for DR anywhere - the surfaces are one fact row and one caption.

### File List

- `src/lib/energy/dr.ts` (new) - DrProgram + drEnrollment (printed-label detection only).
- `src/lib/energy/dr.test.ts` (new) - 6 tests: spellings, case/null tolerance, no-match null, word boundaries, purity, the 4-to-9 copy pin.
- `src/lib/dashboard/drawer.ts` (modified) - DrawerDetail.drProgram via drEnrollment over all periods' line items.
- `src/lib/dashboard/drawer.test.ts` (modified) - detection across periods, honest null, fact-not-figure visibility when unreconciled.
- `src/app/(app)/_components/meter-drawer.tsx` (modified) - the "Demand response" FieldRow + enrolled caption.
- `src/copy/en.ts` (modified) - drProgram label, program display names, the 4-to-9 enrolled note.

## Code Review (2026-06-09)

Adversarial review (Blind Hunter diff-only + Acceptance Auditor with repo + dev.db access) against baseline 0acef42. The auditor verified both ACs: detection from printed labels only with zero live DR markers (0 of 284 line items), the honest absent state everywhere, no DR tool key / Recommendation row / impactUsd anywhere in src or the db, tou.ts untouched, copy rules clean, and the temp-data verification consistent with a restored db.

Triage of ~10 raw findings: 5 patch groups applied (the headline: latest-bill-only enrollment killing the stale-program-presented-as-current path; the hardened copy-law pin; bounded + scan-tolerant patterns; satisfies-typed program names; the wording fix), the rest dismissed with reason. Post-review validation: tsc exit 0, lint clean, 64 files / 492 tests green, production build clean.

## Change Log

- 2026-06-09: Code review - 5 patch groups (latest-period enrollment semantics + lapsed/switched tests, phrase-level copy-law pin, bounded scan-tolerant patterns, satisfies-typed display names, wording), rest dismissed with reason. lint + tsc + 492 tests + production build green. Status -> done.
- 2026-06-09: Implemented Story 3.7 - the DR enrollment info seam: pure printed-label detection (PDP/BIP/CBP), the drawer fact row with honest absence, the 4-to-9 event-window caption pinned by test against the 5-to-8 rate peak, and structurally no recommendation or savings claim. lint + tsc + 491 tests + production build + temp-data browser verification (reverted) green. Status -> review.
