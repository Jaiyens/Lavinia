---
baseline_commit: d16e153
---

# Story 2.7: CSV export

Status: done

## Story

As a grower,
I want to export the current meter view to a spreadsheet in one click,
so that I can keep working in Excel, the way I always have.

## Acceptance Criteria

1. **Given** the current meter view, **When** the user clicks export, **Then** a CSV downloads respecting the active entity/ranch/rate filter.

2. **Given** exported figures, **When** the file opens, **Then** they match what is shown on screen; `needs_review` cells export as "needs review", never a fabricated number.

### AC interpretation notes (read before coding)

This story adds one-click CSV export (FR-22) to the Table lens. "The current meter view" = exactly the rows the table is showing: the same `filterMeters` narrowing AND the same sort order the user sees. No server round trip - the rows are already in the client island; build the CSV string and trigger a download via a Blob + anchor.

- **Same rows, same order (AC1):** the export button lives INSIDE `MeterTable` (it already holds the filtered + sorted `rows`); the CSV is built from those `MeterRow[]` verbatim. Filter respected for free; sort order matches the screen.
- **Cell semantics mirror the table exactly (AC2):** nine columns, the table's header labels (`en.shell.table.columns`). Per row: name verbatim; ranch/entity/rate verbatim or EMPTY STRING when null/empty (the on-screen em-dash placeholder is presentation, not data - an empty cell is the honest spreadsheet equivalent; never fabricate); legacy = the legacy label or empty; cost/demand = `formatUsd(cents)` for a reconciled meter (matching the screen, negative NEM credit "-$149.11" included), the coverage LABEL ("Needs review" / "No bill yet" from `coverageLabel`) for an unreconciled meter's money cells, and "None" for a reconciled meter with no demand charge; status verbatim or empty; coverage = the coverage label. Never a fabricated `$0` or blank where the screen shows a state.
- **CSV correctness:** RFC-4180 escaping (quote any field containing `"` `,` `\r` `\n`; double inner quotes), CRLF row endings, and a UTF-8 BOM prefix so Excel opens it cleanly (grower names/rates can carry non-ASCII; Excel is the explicit target persona). Pure builder, unit-tested.
- **One click (AC1):** a secondary-style button ("Export CSV") in the table header row (next to the row count), >= 44px, also reachable on the mobile card list (same handler - the mobile list shows the same filtered rows; the CSV is the full nine columns either way). Filename `terra-meters-YYYY-MM-DD.csv` (local date). Download via `Blob` + temporary `<a download>`; revoke the object URL after click.
- **Empty view:** with zero rows the table renders the empty/no-match panel and no export button (nothing to export; no zero-row file).

## Tasks / Subtasks

- [x] **Task 1: Pure CSV builder** - `src/lib/dashboard/csv.ts`: `metersCsv(rows: readonly MeterRow[]): string` - header row from `en.shell.table.columns` (the nine table columns in table order), one line per row with the cell semantics above (reuse `coverageLabel` and `formatUsd`; null inventory fields -> empty string), RFC-4180 escaping, CRLF, BOM prefix. Colocated `csv.test.ts`: header order, reconciled row figures (incl. negative credit), needs_review money cells read the label (never a number), no_bill likewise, reconciled-no-demand "None", null fields empty, escaping (comma in rate, quote in name), CRLF + BOM present, row order preserved. (AC1, AC2)
- [x] **Task 2: Export button** - `meter-table.tsx`: an "Export CSV" button in the header strip above the table (and visible on mobile), >= 44px, secondary styling; click builds `metersCsv(rows)` and downloads `terra-meters-<date>.csv` via Blob + anchor (URL revoked after). Hidden when `rows.length === 0`. (AC1)
- [x] **Task 3: Copy** - `src/copy/en.ts` `shell.table.export` ("Export CSV") + an aria label. (AC1)
- [x] **Task 4: Tests + validate** - `csv.test.ts` green; lint + tsc + full vitest green. Browser-verify: export on the unfiltered view downloads 46 data rows + header; apply `?rate=B1 Bus Low Use` and the file has 4 rows; a needs_review meter's cost cell reads "Needs review"; the negative credit exports "-$149.11"; file opens with correct columns (spot-check the string). (AC1, AC2)

### Review Findings

- [x] [Review][Patch] Same-task URL.revokeObjectURL after click() can abort the queued download in Safari/older Firefox; anchor now appended to the document, removed, and revocation deferred [meter-table.tsx]
- [x] [Review][Patch] Raw invisible U+FEFF literals in source were strippable by formatters, which would have made the BOM test vacuously pass; now the \uFEFF escape + a charCode assertion [csv.ts, csv.test.ts]
- [x] [Review][Patch] Column placement for ranch/entity/status was never pinned with non-null values, and the reconciled-without-total cost cell was untested; both covered now (8 csv tests) [csv.test.ts]

## Dev Notes

### Scope boundary

- **Table lens only; no SGMA/energy-to-water export** (out of scope per FR-22). No server route, no new dependency.
- **Do not refactor the table.** The button + handler slot into the existing header strip; `rows` already exist.

### What exists to build on

- **`src/lib/dashboard/table.ts`** `MeterRow` (meter, name, ranch, entity, rate, isLegacy, status, coverageState, costCents, demandCents, isFlagged) - the exact projection the screen renders; `sortRows`/`filterMeters` already applied upstream in `MeterTable`.
- **`src/app/(app)/_components/meter-table.tsx`** - `rows` memo (filtered + sorted), the header strip (`t.rowCount(rows.length)` line) where the button mounts, the empty-state early return (button naturally absent).
- **`coverage-pill.tsx`** `coverageLabel(state)` - the one coverage label source ("Loaded" / "Needs review" / "No bill yet"); the 2.4 notes explicitly reserve it for this CSV. **`src/lib/format/money.ts`** `formatUsd`.
- **Copy:** `en.shell.table.columns` (header labels), `coverage` labels, `none`, `legacyFlag`. Add `export`/`exportAria`.
- **Real data checks:** 46 meters; 7 needs_review; one negative latest total (P002 -$149.11); `?rate=B1 Bus Low Use` -> 4 rows (verified in 2.4/2.6).

### Critical guardrails

1. **AR-15 in the file.** An unreconciled meter's cost/demand cells carry the coverage label, never `$0`/blank/a number. The negative credit exports as the screen shows it.
2. **One coverage treatment.** Labels via `coverageLabel` - no second mapping.
3. **Pure builder tested.** `metersCsv` in `/lib/dashboard/csv.ts`, no DOM; the component only triggers the download.
4. **Copy in /copy.** Header labels and button text from `en` (the CSV headers ARE user-facing strings).
5. **Canonical keys untouched.** Export reads state; it writes no nuqs key.
6. **TS strict + no-`any` + `noUncheckedIndexedAccess`.**
7. **A11y:** button labeled, >= 44px.

### Previous story intelligence (2.6)

- `rows` in `MeterTable` are already exactly "the current meter view" (filterMeters + sortRows); 2.6's review hardened filterMeters trim parity - the CSV inherits it by reusing `rows`.
- Review patterns to pre-empt: every user-facing string in /copy (including CSV headers); date formatting needs explicit intent (filename uses LOCAL date - the grower's "today", unlike the UTC billing dates in the drawer); no duplicated label mappings.
- Gates: lint, tsc, vitest (351 green at 2.6 close), Playwright browser verification.

### Project Structure Notes

- New: `src/lib/dashboard/csv.ts` + `csv.test.ts`.
- Modified: `src/app/(app)/_components/meter-table.tsx`, `src/copy/en.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.7] - the two ACs verbatim; FR-22.
- [Source: _bmad-output/planning-artifacts/prds/prd-Terra-2026-06-07/prd.md#FR-22] - one click, respects active filter, figures match the screen, needs_review never a fabricated number.
- [Source: _bmad-output/implementation-artifacts/2-4-meter-table-the-p0-lens.md] - coverageLabel reserved for the CSV; MeterRow semantics; "None" for reconciled-no-demand.
- [Source: src/lib/dashboard/table.ts, src/app/(app)/_components/meter-table.tsx, coverage-pill.tsx] - the projection, the mount point, the label source.

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- tsc exit 0; lint clean; npm test -> 53 files / 357 tests green (+6 csv.test.ts). Browser-verified via Playwright: unfiltered export downloads terra-meters-2026-06-09.csv with 46 data rows + the nine-column header in table order; "Needs review" appears in withheld money cells with no fabricated figure; the negative NEM credit exports "-$149.11"; `?rate=B1 Bus Low Use` export carries exactly 4 data rows, all on that rate; sorting cost-desc before export puts P054 first with quoted thousands figures ("$11,727.33","$2,783.22").

### Completion Notes List

- **One-click export of exactly the current view.** The button lives in the table header strip and serializes the component's own `rows` (already `filterMeters`-narrowed and `sortRows`-ordered), so filter AND sort match the screen by construction. Download is a client-side Blob + temporary anchor (URL revoked); no server route, no new dependency, no nuqs key written.
- **Cell semantics mirror the table (AR-15):** reconciled figures via `formatUsd` (negative credit included); unreconciled money cells carry the one `coverageLabel`; reconciled-no-demand exports "None"; null inventory fields export as empty cells (the em-dash is screen presentation, not data).
- **CSV correctness:** RFC-4180 escaping (quotes doubled, delimiter/quote/newline fields quoted), CRLF endings, UTF-8 BOM for Excel. Pure `metersCsv` builder, 6 colocated tests.
- **Empty view exports nothing:** the zero-rows early return renders the empty/no-match panel without the button.
- The filename stamps the grower's LOCAL date (their "today"), intentionally unlike the drawer's UTC billing dates.

### File List

- `src/lib/dashboard/csv.ts` (new) - pure metersCsv builder.
- `src/lib/dashboard/csv.test.ts` (new) - 6 builder tests.
- `src/app/(app)/_components/meter-table.tsx` (modified) - export button + download handler in the header strip.
- `src/copy/en.ts` (modified) - `shell.table.export` strings.

## Code Review (2026-06-09)

Adversarial review (Blind Hunter + combined Edge/Acceptance Auditor) against baseline d16e153. Verdict: AC1 MET (one click serializes the component's own filtered + sorted rows; Blob download; hidden on the empty view), AC2 MET (cell-for-cell mirror of the table semantics via the same copy strings and formatUsd; unreconciled money cells doubly guarded against leaking a number; negative credit preserved). The builder itself was found correct; the patches hardened the download lifecycle and the test suite's blind spots.

Triage: 3 fixes applied, 0 deferred, 1 dismissed-with-record (CSV formula-injection hardening was declined: prefixing =/+/@ values would alter the grower's own data and break "figures match the screen"; the export carries the grower's own inventory, not untrusted third-party input - revisit if Terra goes multi-tenant).

### Fixed (patches applied this story)

- [Patch] **Download lifecycle race** [meter-table.tsx] - Blind, High. `URL.revokeObjectURL` ran in the same task as `click()`, a known Safari/older-Firefox abort; the anchor was also never attached. Now appended/removed and revocation deferred 1s. Re-verified: download still lands with BOM + 47 lines.
- [Patch] **Strippable raw BOM literals** [csv.ts, csv.test.ts] - Blind. Producer and test both embedded a raw invisible U+FEFF; a project-wide invisible-char cleanup would have broken the feature while the `startsWith("")` test kept passing. Now the explicit `\uFEFF` escape and `charCodeAt(0) === 0xfeff`.
- [Patch] **Test blind spots** [csv.test.ts] - Blind+Auditor. Added a fixture with non-null ranch/entity/status pinning all nine cell positions, and the reconciled-without-total cost case (empty cell, demand still "None"). The naive comma-split parser stays test-side only and is now used exclusively on unquoted rows.

Post-review validation: tsc exit 0, lint clean, 53 files / 359 tests green, download re-verified in the browser.

## Change Log

- 2026-06-09: Code review - 3 patches applied (download lifecycle, BOM escape robustness, test coverage of column placement + null-total), 1 dismissed with record (formula-injection vs data fidelity). lint + tsc + 359 tests + browser re-verification green. Status -> done.
- 2026-06-09: Implemented Story 2.7 - one-click CSV export of the current meter view (filter + sort respected by construction; coverage labels for withheld cells; RFC-4180 + BOM + CRLF; pure tested builder). lint + tsc + 357 tests + browser verification green. Status -> review.
