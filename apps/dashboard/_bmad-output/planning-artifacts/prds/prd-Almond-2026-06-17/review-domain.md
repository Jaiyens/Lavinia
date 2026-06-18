# Domain + Product-Realism Review — Almond Generative-Operator PRD

Reviewer lens: will this work for the **real Batth-scale farmer** and the **real `apps/dashboard` codebase**, not whether it reads well.
Scope reviewed: `prd.md`, `addendum.md`, grounded against the shipped Almond (`src/lib/almond/*`, `src/app/(app)/_components/almond/*`) and the dashboard surfaces the PRD claims to reuse.

**Verdict:** Strategically sound and largely reuse-honest, but it ships with **one architectural hole that blocks the whole "navigate" pillar** (server tool-calls cannot set the dashboard's client-only URL state) and **one reuse claim that is materially wrong** (the "reuse the existing CSV export" map). Both are fixable in the addendum; neither is fixed today. Fix those two and resolve the demo/Tour write-path question before architecture.

Severity legend: **[BLOCKER]** stops the next phase / will ship broken · **[MAJOR]** wrong or optimistic, needs a real answer before build · **[MINOR]** tighten-up.

---

## 1. Domain realism (the real grower, PG&E lag, the calendar, Batth scale)

### 1.1 [MINOR] The "data-first, defer findings exports" cut is the right call — and the PRD earns it
FR11 / §5.6 / addendum "Data-first export scope" lead exports with the meter table and bill-due schedule and defer findings/recs exports to Open Q4. This matches the product law (`CLAUDE.md` "Legible first… not advice"; the hero-not-money-loudest memory) and the Excel-brained user. No change needed; this is the strongest domain instinct in the document. Keep it.

### 1.2 [BLOCKER] "Bill-due schedule" export is presented as data-first *reuse* but no such exporter exists, and it collides with the BILLED-vs-SCHEDULED law
FR11 and the addendum "Data-first export scope" name the **bill-due schedule (the calendar)** as a co-equal v1 export alongside the meter table, framed as leading "with the data growers already trust." But:
- The only CSV builder in the repo is `metersCsv` (`src/lib/dashboard/csv.ts:27`). There is **no calendar/schedule exporter** (confirmed: no `scheduleCsv`/`calendarCsv`/`billDue` symbol anywhere in `src/`). So one of the two flagship v1 exports is **net-new build, not reuse** — the PRD's "reuse the existing export logic" (FR10) covers the meter table only.
- Worse, the calendar carries a hard domain law the PRD's export FRs never mention: `calendar-lens.tsx:20-23` distinguishes a **BILLED close (fact from the posted bill)** from a **SCHEDULED read (from the serial letter via the 2026 PG&E table, "may shift")** and says they must "never be conflated (AR-14)." A bill-due spreadsheet a grower forwards to a lender or CPA that silently merges "this date is billed" with "this date is our best guess" is exactly the overclaim FR19 is meant to prevent — but FR19 only covers a coverage *footer*, not per-row BILLED/SCHEDULED provenance.
- **Fix:** Either (a) demote the bill-due-schedule export to v2 and make the meter table the sole v1 export (cleanest, fully reuse), or (b) keep it but add an FR requiring every schedule row to carry its mark kind (BILLED vs SCHEDULED) as an explicit column, and state in the addendum that this is a net-new pure exporter modeled on `metersCsv`, not reuse. Pick one before architecture.

### 1.3 [MAJOR] PG&E ~1-day data lag and "as-of" date are under-specified for a shared artifact
`CLAUDE.md` is explicit: "Planner, not live meter. PG&E data lags ~1 day." FR19 requires a "coverage / as-of footer," and the Glossary defines "Coverage / as-of." But the footer is described only as completeness ("82% complete"). A lender-facing PDF (UJ-2) needs the **as-of date of the newest posted bill**, not just a percent — "82% complete" with no date lets a grower hand over a document that looks current but is six weeks stale. The reconciliation/coverage source (`summarizeReconciliation` in `shape.ts:266` → coverage *states*, counts only) does **not** today expose a max-bill-date, so this is a small but real addition, not pure reuse of "Story 1-7 coverage."
- **Fix:** Make FR19 require both (a) completeness and (b) the as-of date of the latest posted billing period on every artifact; note in the addendum that the as-of date is net-new (the loaders carry `period.close` but no farm-level "latest posted" rollup is shaped yet).

### 1.4 [MINOR] Batth-scale duplicate-meter disambiguation is real and already half-built — say so
FR3 (disambiguate duplicate meter names) is correct and matches `CLAUDE.md` ("duplicate meter names" at Batth scale). The shipped `resolveMeterQuery` (`shape.ts:177`) already returns `{kind:"ambiguous", names[]}` and `getMeter` (`tools.ts:44`) already surfaces it — so FR3 is largely *done*, not net-new. But the existing ambiguity signal returns only **names**, and at Batth scale the duplicates ARE the names (same "Pump 17" across two of the 6 entities). Asking "which entity?" (UJ-3) requires the candidate list to carry **entity/ranch alongside the name**, which the current `ambiguous` branch does not.
- **Fix:** Note in the addendum that `resolveMeterQuery`'s `ambiguous` candidates must be enriched with entity+ranch (the `MeterView` already has both) so the disambiguation question is answerable; FR3 reuses the existing seam but extends its payload.

### 1.5 [MINOR] "183 rows, no silent caps" contradicts the shipped tool's hard limit — name the export path explicitly
FR13 correctly demands no silent row caps at 183 meters. But the shipped meter-list tool caps at **50** (`tools.ts:91`, `z.number().max(50)`) and defaults to 25 (`shape.ts:144`). If the spreadsheet skill sources rows "through the read tools" (addendum "rides the existing tool layer," FR8), it inherits that cap and silently drops 133 meters — the exact failure FR13 forbids. The export must source from `loadMetersForFarm` directly (uncapped), not via `listMeters`.
- **Fix:** In the addendum, state that export skills read the **uncapped loader** (`loadMetersForFarm`), while the conversational read tools keep their model-context cap; FR8's "through the tool layer" should mean "through the same farm-scoped loaders," not "through the capped model-facing tools."

---

## 2. Codebase realism — does "reuse, don't rebuild" hold?

### 2.1 [BLOCKER] Navigation reuse assumes a server→client bridge that does not exist
This is the load-bearing claim of the whole "navigate" pillar (FR1–FR4, addendum "Navigation skills reuse existing URL state," reuse map "Open a meter / Switch view / Filter"). The claim is that Almond's `navigate` skill "sets these keys; the existing surfaces react." But the architecture is split:
- The dashboard's URL state is **client-only**: `meter|lens|entity|ranch|rate` are all `useQueryState` hooks driven by `onClick` inside `"use client"` components (`meter-table.tsx:128-131`, `filter-bar.tsx:64-66`, `lens-toggle.tsx:15`, `calendar-lens.tsx:44-47`). There is **no `nuqs/server` adapter, no `createSearchParamsCache`** anywhere (confirmed). Nothing server-side sets these keys.
- Almond runs **server-side**: the chat streams from `/api/almond/chat` (`route.ts`), tools execute on the server (`tools.ts`), and the client (`almond-launcher.tsx`) only renders the message stream via `useChat`. A server tool **cannot call `setMeter()`** — that hook lives in a different component tree in the browser.
- So a `navigate` skill cannot "just set the keys." It needs a **new client-side action channel**: the server emits a navigation *intent* as part of the stream (a tool-result part or a custom data part), and a new client effect in the Almond UI reads it and calls the nuqs setters (`router.push`/`useQueryStates`). That channel is **net-new and is the single hardest piece of this PRD** — and neither prd.md nor addendum.md mentions it. The "reuse, don't rebuild, no parallel navigation layer" framing is misleading: the *surfaces* are reused, but the *plumbing to drive them from a server conversation* is entirely new.
- **Fix (addendum, before architecture):** Add a "Navigation transport" mechanism note: server `navigate` skill returns a structured intent `{lens?, meter?, entity?, ranch?, rate?}`; a new client subscriber in `almond-launcher`/`almond-messages` applies it through nuqs `useQueryStates`. This is also where the action chip (FR2) and "never hijack mid-task" guard (FR4) actually live. Without this note a UX designer and architect will each assume the other half exists.

### 2.2 [BLOCKER] "Reuse the existing CSV export (`metersCsv`)" is wrong about what `metersCsv` consumes and where it runs
FR10 and the reuse map ("CSV → `csv.ts metersCsv` + `meter-table.tsx` export") claim the spreadsheet skill reuses the shipped export. Two mismatches make this not a drop-in reuse:
1. **`metersCsv` takes `MeterRow[]`, not the Almond tool shapes.** `metersCsv(rows: readonly MeterRow[])` (`csv.ts:27`) consumes the **table-row** type built by `toMeterRow` (the coverage-gated, `costCents`/`demandCents` shape from `src/lib/dashboard/table.ts`). Almond's tools/shape layer produces a **different** shape — `MeterSummary` (`shape.ts:82`, `latestBill` only) and `MeterDetail`. So a server-side export skill must build `MeterRow[]` from `MeterView[]` via `toMeterRow` (fine — that's pure), but it is **not** reusing the Almond tool output. The reuse is of `csv.ts` + `table.ts`, *not* the "6.1 tool layer" the addendum says the skill "rides."
2. **The shipped export is client-side, DOM-bound.** The only caller (`meter-table.tsx:179-193`) wraps `metersCsv` in `new Blob` + `document.createElement("a")` + `.click()` — browser-only. The PRD wants **server-side generation** (NFR "Generation is serverless-safe," addendum "Generate artifacts server-side"). The *builder* `metersCsv` is pure and serverless-safe (good — nothing blocks server use), but the **delivery path is not reused at all**; it's net-new (server route → Blob → signed download). The reuse map should say "reuse the pure `metersCsv` *string builder*; the download/delivery path is net-new server-side."
- **Fix:** Reword FR10 and the reuse-map CSV row to: "reuse the pure `metersCsv`/`table.ts` *shapers* (consume `MeterView[]` → `toMeterRow` → `metersCsv`); the export *skill* and *delivery* are net-new server-side (no DOM, no `meter-table.tsx` reuse)." And correct the addendum's "skill framework rides the existing tool layer" to clarify exports source the **loaders**, not the capped read tools (see 1.5).

### 2.3 [MAJOR] XLSX is claimed as "extends, does not replace" the CSV path — but it shares almost nothing with it
FR10 says the `.xlsx` path "extends, it does not replace" the CSV. In practice `exceljs` (addendum) builds a workbook object graph; the only thing it shares with `metersCsv` is the *row data* (`MeterRow[]`) and the *headers* (`en.shell.table.columns`). The CSV's load-bearing logic — RFC-4180 escaping, CRLF, the UTF-8 BOM, the coverage-label-instead-of-number gating in `moneyCell` (`csv.ts:21-25`) — is CSV-specific and mostly irrelevant to XLSX. The honest framing is "CSV and XLSX both consume the same shaped rows; the serializers are independent." Calling XLSX an "extension" of the CSV path will mislead the story-writer into thinking it's a small add.
- **Fix:** Reframe FR10/addendum: a shared **row-shaping** function (pure, `MeterView[]` → labeled rows, with the coverage gating preserved) feeds **two independent serializers** (CSV = existing `metersCsv`; XLSX = new `exceljs`). The shared piece is the rows + the coverage-gating rule, not the serializer.

### 2.4 [MINOR] The injected-responder reuse is real, but the tool-loop step cap will bite multi-step skills
The addendum's "Model boundary stays injected" claim holds exactly: `AlmondResponder` with `createStubResponder` (offline) / `createGatewayResponder` (keyed) is real (`responder.ts:167-192`) and the route just selects (`route.ts:48`). Good reuse. **But** the shipped tool loop is `stopWhen: stepCountIs(6)` (`responder.ts:55`). A "find mis-rated meters → filter the table → export those 14 as a spreadsheet" flow (UJ-1) is read-tool + navigate + generate in one turn, which can exceed 6 steps once you add the new skills. And the **stub** (`composeStubAnswer`, `responder.ts:109`) is a hand-written intent classifier with **no notion of navigate/generate** — so to keep "new skills must be exercisable by the stub… so e2e/CI stay offline" (addendum) true, the stub needs net-new branches that emit navigation intents and generate (small) artifacts deterministically. That's real work the PRD waves at in one clause.
- **Fix:** Add an NFR/assumption: raise/parameterize the step cap to cover the worst-case multi-skill turn, and explicitly scope the stub extension (deterministic navigate + tiny artifact) as in-scope work, since CI offline determinism (NFR) depends on it.

### 2.5 [MINOR] Lens-registry "single source of truth" reuse is sound and matches the code
NFR "Stays native to a changing dashboard" / addendum single-source-of-truth: `lens.ts` (`LENSES`, `LENS_KEYS`, `parseLens`, `isLensAvailable`) is exactly the closed registry the PRD wants Almond to read, and all four lenses are currently `available: true` (`lens.ts:19-24`). The "Almond must never offer a surface that no longer exists" requirement is directly satisfiable by reading `LENS_KEYS`/`isLensAvailable`. No issue — this reuse claim is accurate. One nit: the filter/meter keys have **no** equivalent registry (they're string literals scattered across `filter-bar.tsx`, `meter-table.tsx`, etc.); the "closed key set" is enforced only by convention/comments, not by an exported constant. If Almond is to read the canonical key set as one source of truth, that constant must be **created** (net-new, tiny).
- **Fix:** Note that the `lens` registry exists and is reusable, but the `entity|ranch|rate|meter` key set is not yet a single exported constant — create one so the navigate skill and the dashboard share it.

### 2.6 [MAJOR] Owner-scoping reuse is real, but the demo/Tour public path makes the Reports area write surface ambiguous
FR16/FR18 and the reuse map ("Owner-scoping → `dashboardFarm` + `(app)/actions.ts`") are well-grounded: `resolveFinding` (`actions.ts:35`) re-checks `auth()` and owner-scopes via `dashboardFarm`, and the chat route resolves the farm server-side (`route.ts:26-30`). **But** the same route is, by design, a **public unauthenticated endpoint for the Tour** — `userId ? dashboardFarm(...) : demoFarm(...)` (`route.ts:27`), with a standing cost/abuse warning in its own header comment. The new **generate** skills WRITE files (Blob) and rows (`GeneratedReport`). The PRD never says whether an unauthenticated Tour visitor can trigger generation. If yes: anonymous visitors can write Blob objects and DB rows (abuse/cost surface, and "farm-scoped Reports per grower" is meaningless without a grower). If no: that's a new gate the PRD must state. FR18 ("unauthenticated caller gets no Almond action") *implies* no — but it contradicts the shipped route, which DOES give unauthenticated Tour callers a (read) Almond action.
- **Fix:** Add an explicit FR: **generate/export skills require an authenticated, farm-owning caller** (the Tour gets navigate + read answers only, never artifact writes). This reconciles FR18 with the real route and closes the anon-write hole. The architect needs this decided.

### 2.7 [MINOR] `GeneratedReport` model, Blob, and the libs are all net-new — the addendum is honest, the reuse map oversells
Confirmed: there is **no** `GeneratedReport`/report model in `prisma/schema.prisma`, **no** `@vercel/blob`, and **no** `exceljs`/`pdfkit`/`@react-pdf` in `package.json`. The addendum's storage decision section is appropriately labeled "net-new / DECIDED," which is honest. The PRD-body and reuse map, however, lean hard on "reuse, don't rebuild" without a counter-list of what is genuinely new (the report model, Blob wiring, XLSX/PDF libs, the navigation transport, the schedule exporter). That imbalance is what makes the reuse claim *feel* stronger than it is.
- **Fix:** Add a short "Net-new (not reuse)" companion to the reuse map listing: navigation server→client transport (2.1), report Prisma model + migration, Vercel Blob wiring, `exceljs` + PDF lib, the bill-due-schedule exporter (if kept), the as-of-date rollup, the canonical key-set constant.

---

## 3. Downstream readiness (can UX / architect / story-writer each build without inventing the missing half?)

### 3.1 [BLOCKER] Single biggest gap: the navigation transport (server skill → client URL state) is the missing half, and three roles all need it
This is the one gap that blocks the next phase for everyone:
- **The architect** can't design `navigate` without deciding the server→client channel (stream data-part vs tool-result vs a separate client effect) — see 2.1. It does not exist and is not specified.
- **The UX designer** can't spec the action chip (FR2), the "Almond moved my screen" friction guard (FR4 / counter-metric), or how a chip "links back to that view," because all three are properties of a transport that isn't described.
- **The story-writer** can't slice "navigate" into stories without knowing whether the chip, the URL apply, and the live-region announcement (NFR accessibility) are one story or three.
- **Fix:** Before the solution-design pass, the addendum must add the navigation-transport mechanism note (2.1). This is the highest-leverage single edit in the review.

### 3.2 [MAJOR] PDF skill is "whatever the farmer asks for" with no compositional contract — under-specified for an architect
FR12 rejects a rigid template ("content is whatever the grower asks for… sensible structure and defaults rather than one rigid template"). Strategically right, but for a pure-JS drawn PDF (`pdfkit`/`@react-pdf`, addendum) "whatever the farmer asks for" is **not buildable as stated** — `@react-pdf` needs concrete, bounded section components; "generative layout" with a non-LLM-driven layout engine means the model can only pick from a **fixed set of composable blocks** (cover, farm totals, meter table, findings list, coverage footer), not invent arbitrary layouts. The PRD's "generative, not one template" promise and the "pure-JS, we draw the layout" mechanism are in tension and a downstream architect will have to invent the resolution.
- **Fix:** Reframe FR12 as "a **library of composable, grounded PDF sections** the skill selects and orders per request" — generative in *selection/ordering*, deterministic in *rendering*. That is buildable with `@react-pdf` and still honors "not one rigid template."

### 3.3 [MINOR] "Reports area" UI surface is named but never located in the OS shell
FR15/FR16 define a per-grower Reports area, and Open Q1 covers retention, but nothing says **where** it lives (a new route under `(app)/(dashboard)/`? a new rail entry alongside the lens toggle / Almond launcher? a panel?). The OS-shell rail is referenced for the Almond entry (FR21) but not for Reports. A UX designer has to invent the placement and the navigation to it.
- **Fix:** Add one sentence locating the Reports area in the shell (most likely a new `(app)` route reachable from the shell rail), so UX has an anchor.

### 3.4 [MINOR] Stub determinism for the new skills is asserted but not scoped as work
NFR "Determinism & testability" and the addendum require new skills to be stub-exercisable so CI stays offline. As noted in 2.4, the current stub has zero navigate/generate awareness. For the story-writer this is a hidden story ("teach the offline stub to emit deterministic navigation intents and a tiny deterministic artifact") that the FRs don't surface. Without it, the e2e/CI-offline NFR is aspirational.
- **Fix:** Surface the stub extension as an explicit in-scope item under MVP 7.1 or the determinism NFR.

---

## Severity counts
- **BLOCKER:** 4 — 1.2 (bill-due export reuse + BILLED/SCHEDULED conflation), 2.1 (navigation server→client bridge missing), 2.2 (`metersCsv` reuse claim wrong), 3.1 (navigation transport is the gating downstream gap; same root as 2.1, called out for downstream impact)
- **MAJOR:** 5 — 1.3 (as-of date), 2.3 (XLSX "extends" overstated), 2.6 (demo/Tour write path), 3.2 (PDF compositional contract)
- **MINOR:** 7 — 1.1 (data-first cut, positive), 1.4 (disambiguation payload), 1.5 (50-row cap), 2.4 (step cap + stub), 2.5 (key-set constant), 2.7 (net-new list), 3.3 (Reports location), 3.4 (stub work)

*(Counts: 4 BLOCKER, 4 MAJOR, 8 MINOR; 1.1 is a positive confirmation, not a defect.)*

## The two edits that unblock everything
1. **Add a "Navigation transport" mechanism note to the addendum** (server skill emits a navigation intent into the stream; a new client subscriber applies it via nuqs `useQueryStates`; the action chip and FR4 hijack-guard live here). Resolves 2.1 and 3.1.
2. **Correct the CSV reuse claim** (reuse the pure `metersCsv`/`table.ts` *row shapers* over `MeterView[]`; the delivery path and XLSX serializer are net-new server-side; exports read the **uncapped loader**, not the capped read tools). Resolves 2.2, 2.3, 1.5.

Then decide the demo/Tour write gate (2.6) and the bill-due-export keep-or-defer (1.2) before the architecture pass.
