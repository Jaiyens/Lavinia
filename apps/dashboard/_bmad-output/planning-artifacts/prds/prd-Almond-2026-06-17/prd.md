---
title: "Almond — Terra's Generative Operator (the wedge)"
status: draft
created: 2026-06-17
updated: 2026-06-17
---

# PRD: Almond — Terra's Generative Operator

*Almond as a main wedge: the in-app assistant that stops only answering and starts doing — opening the farm for you and building what you ask for.*

## 0. Document Purpose

This PRD repositions **Almond** from a secondary, read-only chat assistant (shipped in Epic 6) into a **main wedge** for Terra Tool 1. It defines what Almond becomes: a **generative operator** that drives the dashboard on the grower's behalf (opening pages, drawers, filters, the map) and runs **skills** that produce the artifacts growers actually want — spreadsheets and PDF reports — all grounded in the grower's real farm data and all read-only with respect to that data.

It is scoped to a v1 build. Technical mechanism, library choices, and rejected alternatives live in `addendum.md`. The capability-level decisions and their audit trail live in `.decision-log.md`. This PRD assumes the Tool 1 energy dashboard PRD (`prd-Terra-2026-06-07`) as its foundation and does not restate it.

## 1. Vision

Terra's dashboard makes a farm's PG&E account legible — every meter, rate, billing cycle, and finding in one clear place. But the grower we build for is plain-spoken, skeptical, low on software and AI literacy, and "learns line by line in Excel." That grower will not climb a 183-meter UI to get the value. **Almond is how they get it without climbing.** They ask in plain operator English, and Almond does the work: it opens the exact meter, filters the table to the mis-rated rates, builds the spreadsheet, drafts the PDF for the lender. The dashboard is the truth; Almond is the hands.

That is the wedge. A dashboard is something a grower has to learn. **An operator that builds what you ask for is something a grower wants on day one** — and the artifact it produces (a clean spreadsheet, a shareable PDF of the savings found) is the proof of value the grower carries out of the product and shows to their partners, their lender, their CPA. Legibility earns trust; the operator earns the habit.

**[ASSUMPTION] Wedge thesis (confirm):** the dashboard is the moat, but Almond-the-operator is the wedge — the lowest-friction path to first value for a low-software grower, and the generator of shareable artifacts that pull Terra into the grower's outside relationships. Correct this if the wedge you have in mind is different.

### 1.1 From answerer to operator (what changes)

Almond today (Epic 6): a farm-scoped, read-only, tool-calling chat in a Notion-style launcher/panel. Six grounded read tools (overview, meters, meter detail, findings, rates, reconciliation). It explains; it never acts. The model boundary is injected (offline stub by default, Vercel AI Gateway when keyed), so dev/CI make zero external calls.

Almond next (this PRD): the same grounded, farm-scoped, injected-boundary core — **plus the ability to *do two new classes of thing***:

1. **Navigate** — drive the grower's screen to any surface by reusing the app's existing URL state. "The Notion 'open things.'"
2. **Generate** — run skills that build artifacts (CSV/Excel, PDF reports) from the grower's request, grounded in real data, delivered as a download and saved to a Reports area.

What does **not** change: Almond stays **read-only on data** (it never resolves a finding, changes a rate, or touches the utility side), stays **farm-scoped by inheritance**, stays **grounded** (every farm fact comes from a tool; it never fabricates), and keeps its **voice** (the almond character, plain operator English, no exclamation marks, no jargon on the surface).

## 2. Target User

The same user as Tool 1 — this PRD adds no new persona, it serves the existing one better.

- **Primary:** the farm owner / decision-maker. Plain-spoken, skeptical, low software/AI literacy, Excel-brained, on a phone in a truck. The two real growers who demanded "an insanely simple home screen, depth one tap away" are the same growers who will ask Almond to "just show me my most expensive meter" rather than learn the filter bar.
- **Scale to build for:** Batth Farms — ~183 meters, ~57 account numbers, 6 legal entities, mixed legacy/current rates. Almond's navigation must resolve a meter by name at this scale (and disambiguate duplicates); its exports must stay legible at 183 rows.

### 2.1 Jobs To Be Done

- *"Show me the meters that are on the wrong rate"* — without me learning the rate filter.
- *"Give me that as a spreadsheet"* — so I can mark it up in Excel like I always do.
- *"Make me a PDF of the savings you found"* — so I can send it to my lender / landlord / partner / CPA.
- *"Open Pump 17"* — take me straight there, don't make me scroll 183 meters.
- *"What did you make me last week?"* — find the report I generated before.

### 2.2 Non-Users (v1)

- A grower who wants Almond to *change* their rate or *enroll* them in a program. v1 explains and prepares the artifact; it does not act on data or the utility (see Non-Goals).
- A power user who wants a chat-first, dashboard-optional experience. v1 is dashboard-first; Almond drives the dashboard, it does not replace it.

## 3. Glossary

- **Operator** — Almond's new mode: it acts on the grower's behalf (navigates, generates) instead of only answering.
- **Skill** — a discrete, named capability Almond can choose to run (e.g. `navigate`, `export-spreadsheet`, `generate-report`). The skill set is extensible.
- **Navigation action** — Almond moving the grower's main view by setting the app's canonical URL state. Non-destructive.
- **Action chip** — the in-conversation record of what Almond just did ("Opened Pump 17", "Filtered to AG-4 meters"), itself a link back to that view.
- **Artifact / export** — a file Almond generates (`.csv`, `.xlsx`, `.pdf`) from a grounded request.
- **Reports area** — the per-grower, farm-scoped place in the account where generated artifacts are saved and re-downloadable.
- **Grounded** — sourced from the grower's real farm data via Almond's tools; never invented.
- **Coverage / as-of** — the honest statement of how complete the underlying billing data is, carried onto every artifact.

## 4. User Journeys

**UJ-1 — Manjit finds his mis-rated meters and walks out with a spreadsheet.**
Manjit owns a 180-meter almond operation across six entities and "learns line by line in Excel." He opens Terra on his phone, taps Almond, and types *"which of my meters look like they're on the wrong rate?"* Almond calls its tools, names the count and the dollars at stake, and **drives the screen**: the table lens opens, filtered to the suspect rates, with an action chip "Filtered to 14 meters on legacy rates." Manjit says *"give me that as a spreadsheet."* Almond states it'll export those 14 meters, then an `.xlsx` downloads and a copy lands in his Reports. He never touched a filter.

**UJ-2 — Manjit builds a PDF for his lender.**
His lender wants to see the farm's energy picture. Manjit asks *"make me a PDF of the savings you've found across the whole farm."* Almond replies with the shape first — *"I'll put together a one or two page summary: your farm's totals, the findings, and the dollars on each"* — then generates a clean, palette-branded PDF with an honest coverage footer (billing data is 82% complete, and the PDF says so). It saves to Reports and downloads. Manjit emails it himself. *(Almond-sent email is a v2 skill.)*

**UJ-3 — Manjit jumps straight to a pump.**
Mid-conversation he says *"open Pump 17."* Almond opens the meter drawer for Pump 17 (reusing `?meter=`), chip: "Opened Pump 17." If two meters are named "Pump 17," Almond asks which entity rather than guessing.

## 5. Features and Functional Requirements

FRs are globally numbered with stable IDs and grouped by capability. "Capabilities, not implementation" — mechanism is in `addendum.md`.

### 5.1 Almond as operator — navigation skills

- **FR1.** Almond can open and navigate any primary dashboard surface on the grower's behalf by setting the application's existing canonical URL state — the meter drawer (`meter`), the lens toggle (`lens`: calendar / table / chart / map), and the filters (`entity`, `ranch`, `rate`). It reuses these surfaces and adds no parallel navigation layer.
- **FR2.** Every navigation Almond performs is recorded in the conversation as an **action chip** describing what it did ("Opened Pump 17", "Filtered the table to AG-4 meters", "Showed the map"), and the chip is itself a link back to that view. Because navigation changes no data, the grower's "undo" is simply navigating back.
- **FR3.** Almond resolves plain-language references to real entities — a meter by name or SA-ID, a ranch, a legal entity, a rate schedule, a finding — using its grounded tools. When a reference is ambiguous at Batth scale (duplicate meter names across entities), Almond asks the grower to disambiguate rather than silently opening the wrong one.
- **FR4.** Almond drives the screen **only in response to a grower's request**. It never hijacks navigation unprompted; the grower's manual control of the dashboard is never overridden mid-task.

### 5.2 The skill framework

- **FR5.** Almond's capabilities are organized as discrete, named **skills**, and the model selects the appropriate skill(s) for a request. The set is **extensible**: a new skill (e.g. PPTX, email delivery, a scheduled report) can be added without reworking Almond's core, its persona, or its grounding contract.
- **FR6.** Every skill is **read-only with respect to farm and utility data.** A skill may navigate or generate an artifact; no skill mutates a finding, a rate, a meter, account data, or anything on the utility side. This extends Terra's "display, never execute" law to Almond.
- **FR7.** Every skill is **farm-scoped by inheritance.** A skill operates only on the caller's resolved farm; no skill accepts a farm identifier or any scope from the model or client. Cross-farm action is structurally impossible (the Story 6.1 owner-scoping law).
- **FR8.** Every skill draws its content **only from grounded farm data** via Almond's tool layer. No skill fabricates a number, a meter, a rate, or a dollar figure; when the data isn't present, the skill (and Almond) says so plainly rather than inventing.
- **FR9.** Before producing a heavier artifact (a spreadsheet or PDF), Almond **states what it is about to make** in one short line ("I'll build a PDF of your 14 mis-rated meters and the savings on them") so the grower sees the shape before the file appears. This is a lightweight preview, not a multi-step approval gate — there is nothing destructive to approve.

### 5.3 Export skills — spreadsheet and PDF

- **FR10.** **Spreadsheet skill.** Almond generates a CSV and an Excel (`.xlsx`) of what the grower asked for, **reusing the existing export logic** (`src/lib/dashboard/csv.ts` `metersCsv` and the meter-table CSV export) rather than building a parallel exporter; the `.xlsx` path extends, it does not replace.
- **FR11.** Spreadsheet content is **request-driven.** "Export my AG-4 meters", "the demand-charge findings as a spreadsheet", "this meter's last twelve bills" — Almond shapes the rows and columns from the request, grounded in real data, Excel-brained: tabular money, whole dollars, plain operator headers (pumps, meters, rates, bills), no kW/interval jargon.
- **FR12.** **PDF report skill.** Almond generates a clean PDF whose **content is whatever the grower asks for** (one meter, the mis-rated set, the whole farm, the savings found) — composed from grounded data, with sensible structure and defaults rather than one rigid template. The PDF is branded in the warm agricultural palette, written in plain operator English, money tabular and whole-dollar, and never leads with a lone screaming hero number (the hero-not-money-loudest law holds).
- **FR13.** Artifact generation is correct and legible at Batth scale (183 meters): a full meter spreadsheet is complete (no silent row caps — if anything is bounded, the artifact says what was left out), and a whole-farm PDF stays readable and printable.

### 5.4 Delivery and the Reports area

- **FR14.** Any generated artifact can be **downloaded to the device immediately** — the baseline delivery path, working on a phone.
- **FR15.** Every generated artifact is **saved to a per-grower Reports area** in the account, persisted and re-downloadable later. Each saved report records what it was, when it was made, and the request that produced it, so the grower can find "the spreadsheet I made last week."
- **FR16.** The Reports area is **farm-scoped and private to the grower** (the same owner-scoping law as the rest of the app); a grower never sees another farm's reports, and stored-file access is not guessable.
- **FR17.** **Email delivery is explicitly out of v1** (it is a planned future skill, not built here). Recorded as an FR so the boundary is unambiguous.

### 5.5 Trust, grounding, and safety

- **FR18.** Almond inherits the grower's **authentication and farm scope.** An unauthenticated or farm-less caller gets no Almond action at all (mirrors the Story 6.1 route gate: 401 / clean 400).
- **FR19.** Every generated artifact carries an **honest coverage / as-of footer.** If the farm's billing data is partial, the export says so (reusing the reconciliation/coverage honesty), so a PDF a grower shares with a lender never overclaims completeness.
- **FR20.** Almond's **voice and persona are unchanged** across all new surfaces (action chips, previews, generated copy): the almond character, plain operator English, no exclamation marks, no kW/tariff jargon on the surface, and **no em dashes in any user-facing generated copy** (the project copy law).

### 5.6 Surfacing the wedge

- **FR21.** **[ASSUMPTION]** Because Almond is now the wedge, it is given **elevated prominence** as the way to get value without climbing the UI: a persistent, obvious entry in the OS-shell rail; a first-run nudge in onboarding ("ask Almond to show you your most expensive meter"); and the existing grounded starters extended to include **action and export** prompts ("export my meters", "make a PDF of my mis-rated pumps", "open my biggest opportunity").
- **FR22.** **[ASSUMPTION]** The starter suggestions and empty state **teach the new powers** — they make a grower discover that Almond can now *do* (navigate, build a spreadsheet, draft a PDF), not just answer, so the capability isn't hidden behind knowing to ask.

## 6. Non-Goals (Explicit, v1)

- **Data or utility mutations of any kind.** No resolving/dismissing findings, no changing a rate, no enrolling in a DR program, no editing meters or account data. Almond explains and prepares artifacts; it does not act on data. *(Notion's agent does take confirmed write actions; we deliberately do not, to keep Terra's "display, never execute" safety law and avoid the whole confirmation-risk surface for v1.)*
- **PPTX / slide-deck generation.** A planned future skill; not v1.
- **Email (or any outbound send) of artifacts.** Future skill; v1 is download + saved Reports.
- **Scheduled or background "custom agents"** (Notion 3.3 style). Almond is on-demand and grower-directed in v1.
- **A chat-first / dashboard-optional front door.** v1 is dashboard-first; Almond drives the dashboard, it does not replace it.
- **Multi-farm operation.** Almond is scoped to the one resolved farm, as today.

## 7. MVP Scope

### 7.1 In scope
Navigation skills driving existing surfaces (FR1–FR4); the extensible skill framework with the read-only/farm-scoped/grounded contract (FR5–FR9); spreadsheet (CSV + XLSX) and request-driven PDF skills reusing existing export logic (FR10–FR13); download + a farm-scoped Reports area (FR14–FR16); trust/grounding/coverage and unchanged voice (FR18–FR20); the surfacing of Almond as the wedge (FR21–FR22).

### 7.2 Out of scope for MVP
Mutations/write-actions; PPTX; email/outbound send; scheduled agents; chat-first front door; multi-farm. (See Non-Goals.)

### 7.3 Build priority and demo framing
1. **Navigation skills first** — lowest risk, highest "wow," reuses everything; proves the operator model.
2. **Spreadsheet skill** — extends the shipped CSV export; the Excel-brained grower's first real artifact.
3. **PDF report skill + Reports area** — the shareable proof of value; the demo's closer.
4. **Surfacing** — onboarding nudge + action-flavored starters so the powers are discoverable.
The demo story is UJ-1 → UJ-2: ask, watch Almond drive the screen, walk away with a spreadsheet and a lender-ready PDF.

## 8. Cross-Cutting NFRs

- **Security & isolation.** Farm-scoping is structural (no farmId from the model/client); the Reports area and stored files are farm-private with non-guessable, scoped/expiring access; no grower credentials ever touch the artifact path.
- **Grounding integrity.** Fabrication rate is effectively zero — artifacts and answers are tool-sourced; absence is stated, never filled with a guess.
- **Determinism & testability.** The model boundary stays injected (offline stub default, Vercel AI Gateway when keyed); dev/CI make zero external calls. Export shaping is pure and unit-tested; generated artifact bytes are verified by tests; navigation actions are deterministic.
- **Performance.** **[ASSUMPTION]** Navigation feels instant (no full reload). A meter-table spreadsheet generates in a few seconds; a whole-farm PDF in roughly ten seconds or less. Generation is serverless-safe (pure-JS libraries, no headless Chromium — see addendum). *(Confirm targets.)*
- **Mobile-first.** Download, the Reports area, and generated PDFs all work and read well on a phone; PDFs are printable.
- **Accessibility & motion.** Action chips, previews, and the Reports area are keyboard-navigable with adequate tap targets; streamed actions/answers announce via a live region; Magic UI effects degrade gracefully under `prefers-reduced-motion`.
- **Honest limits.** No silent truncation: if any artifact bounds its content (row caps, page limits), it states what was left out.
- **Voice & localization.** All user-facing copy in `/copy`, localization-ready, plain operator English, no em dashes.

## 9. Success Metrics

- **Activation (the wedge metric):** % of growers who complete at least one Almond-driven *action* (a navigation or an export) in their first session. **[ASSUMPTION]** target to set.
- **Value-via-Almond:** share of sessions where the grower reaches value through Almond rather than manual UI navigation; count of artifacts generated per active grower.
- **Shareable proof:** count of PDFs/spreadsheets saved or downloaded — the artifact is the thing that leaves the product and pulls Terra into outside relationships.
- **Retention proxy:** growers who generate an artifact return at a higher rate than those who don't.

**Counter-metrics (watch these or the wedge is hollow):**
- **Fabrication / overclaim rate** — must stay ~0; any artifact stating a number not in the data is a critical failure.
- **Wrong-target rate** — Almond opening or exporting the wrong meter/entity; disambiguation should catch this.
- **Stale/overclaimed coverage on shared artifacts** — a PDF that hides partial data.
- **Generation failure & latency** — exports that error or hang.
- **"Almond moved my screen on me" friction** — navigation that felt like a hijack (guards FR4).

## 10. Open Questions

1. Reports-area persistence and storage choice (Vercel Blob assumed) — confirm at the architecture handoff.
2. Do saved Reports expire / have a retention or quota policy at Batth scale?
3. Exact prominence treatment for FR21 (rail entry, onboarding nudge wording) — confirm with design.
4. Success-metric and latency targets (FR/NFR `[ASSUMPTION]`s) — set with the team.
5. Should the spreadsheet skill also export findings and billing breakdowns in v1, or meters only first? (FR11 implies broader; confirm the v1 cut.)

## 11. Assumptions Index

- **[A1]** Wedge thesis as stated in §1.1 (operator is the wedge, dashboard is the moat).
- **[A2]** FR13: pure-JS server-side generation, no headless Chromium (addendum).
- **[A3]** FR21–FR22: elevated surfacing via rail prominence, onboarding nudge, action-flavored starters.
- **[A4]** NFR performance/latency targets in §8.
- **[A5]** Success-metric targets in §9.
- **[A6]** Reports stored via blob storage with scoped, expiring URLs (addendum).
