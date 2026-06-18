---
title: "Almond — Terra's Generative Operator"
status: final
created: 2026-06-17
updated: 2026-06-17
---

# PRD: Almond — Terra's Generative Operator

*Almond as an AI power-up to the dashboard today, a wedge as growers grow AI-native: the in-app assistant that stops only answering and starts doing, opening the farm for you and building what you ask for.*

## 0. Document Purpose

This PRD repositions **Almond** from a secondary, read-only chat assistant (shipped in Epic 6) into a **generative operator** — an AI power-up layered on the dashboard. It defines what Almond becomes: a **generative operator** that drives the dashboard on the grower's behalf (opening pages, drawers, filters, the map) and runs **skills** that produce the artifacts growers actually want — spreadsheets and PDF reports — all grounded in the grower's real farm data and all read-only with respect to that data.

It is scoped to a v1 build. Technical mechanism, library choices, and rejected alternatives live in `addendum.md`. The capability-level decisions and their audit trail live in `.decision-log.md`. This PRD assumes the Tool 1 energy dashboard PRD (`prd-Terra-2026-06-07`) as its foundation and does not restate it.

## 1. Vision

Terra's dashboard makes a farm's PG&E account legible — every meter, rate, and billing cycle in one clear place, with the bill-due calendar (the one feature growers explicitly asked for) as the home screen. **Today, the dashboard is what growers want and need.** The grower we build for is plain-spoken, skeptical, low on software and AI literacy, and "learns line by line in Excel." They are not yet AI-native; they will not arrive asking an assistant to do things for them. They want to *see their data, upfront.*

So Almond is **not the wedge today — it is an addition.** It is the in-app operator that, for the grower who is ready, stops only answering and starts doing: it opens the exact meter, filters the table to the mis-rated rates, builds the spreadsheet, drafts the PDF for the lender. The dashboard is the truth; Almond is the hands. Most growers will lean on the dashboard and ignore the assistant at first. That is expected and fine.

**Where Almond goes.** As growers grow more AI-native and discover what an assistant can do for them, Almond becomes a very big wedge — the lowest-friction path to value and the generator of shareable artifacts (a clean spreadsheet, a lender-ready PDF) that pull Terra into the grower's outside relationships. We build that capability now so it is ready when the growers are, not because it carries adoption on day one.

### 1.1 Strategic context — the real wedge (out of scope here)

Terra's actual wedge and moat is **connecting physical farm data (captured with cameras) to numerical data (PG&E billing, meters, rates).** Physical-to-numerical fusion is the thing no incumbent has. This PRD does not build that; it builds Almond inside the dashboard. The framing is here only so this document is honest about Almond's role: a forward-built addition with large latent wedge potential, not the company's wedge. When the camera/physical-data initiative lands, Almond is the natural surface to make that fused data legible and actionable — one more reason to build the operator now.

### 1.2 From answerer to operator (what changes)

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

- **FR1.** Almond can open and navigate any primary dashboard surface on the grower's behalf by setting the application's existing canonical URL state — the meter drawer (`meter`), the lens toggle (`lens`: calendar / table / chart / map), and the filters (`entity`, `ranch`, `rate`). The *surfaces* are reused (no parallel navigation UI), but because Almond runs server-side, a navigation request is emitted as a structured action that the already-mounted client panel applies to the URL state — a **server→client action bridge that is net-new work**, not existing reuse (see addendum). The model never receives a route; it requests a named navigation and the client performs it.
- **FR2.** Every navigation Almond performs is recorded in the conversation as an **action chip** describing what it did ("Opened Pump 17", "Filtered the table to AG-4 meters", "Showed the map"), and the chip is itself a link back to that view. Because navigation changes no data, the grower's "undo" is simply navigating back.
- **FR3.** Almond resolves plain-language references to real entities — a meter by name or SA-ID, a ranch, a legal entity, a rate schedule, a finding — using its grounded tools. **Ambiguity has a defined trigger: when two or more meters in the resolved farm match the requested name/number (or nothing matches), Almond asks the grower to disambiguate (or says it found nothing) rather than opening the wrong one.** Testable consequence: a request matching ≥2 meters never auto-navigates.
- **FR4.** Almond drives the screen **only in response to a grower's request**. It never hijacks navigation unprompted; the grower's manual control of the dashboard is never overridden mid-task.

### 5.2 The skill framework

- **FR5.** Almond's capabilities are organized as discrete, named **skills**, and the model selects the appropriate skill(s) for a request. The set is **extensible**: a new skill (e.g. PPTX, email delivery, a scheduled report) can be added without reworking Almond's core, its persona, or its grounding contract.
- **FR6.** Every skill is **read-only with respect to farm and utility data.** A skill may navigate or generate an artifact; no skill mutates a finding, a rate, a meter, account data, or anything on the utility side. This extends Terra's "display, never execute" law to Almond.
- **FR7.** Every skill is **farm-scoped by inheritance.** A skill operates only on the caller's resolved farm; no skill accepts a farm identifier or any scope from the model or client. Cross-farm action is structurally impossible (the Story 6.1 owner-scoping law).
- **FR8.** Every skill draws its content **only from grounded farm data.** **Artifacts are assembled by deterministic code from the full grounded dataset — the model chooses the *shape* (which rows, columns, or sections), but never authors a cell value, a number, or report prose from its own context.** This is the law that makes a 183-row spreadsheet or a multi-page PDF trustworthy: there are no model-written numbers in a file a grower shares with a lender. Note the chat tools cap/summarize for readability (the meter list limits rows); those caps must NOT feed exports — export skills read a **dedicated full-data, farm-scoped path**. When data isn't present, the skill says so plainly rather than inventing.
- **FR9.** Before producing a heavier artifact (a spreadsheet or PDF), Almond **states what it is about to make** in one short line ("I'll build a PDF of your 14 mis-rated meters and the savings on them") so the grower sees the shape before the file appears. This is a lightweight preview, not a multi-step approval gate — there is nothing destructive to approve.

### 5.3 Export skills — spreadsheet and PDF

- **FR10.** **Spreadsheet skill.** Almond generates a CSV and an Excel (`.xlsx`) of what the grower asked for. It **reuses the pure `metersCsv` string-builder** where the shape matches; the **server-side generation, the `.xlsx` path, the bill-due-schedule exporter, and the file-delivery pipeline are net-new** (today's export is a client-side DOM download of the table shape, and `metersCsv` consumes `MeterRow`, not Almond's tool shapes — see addendum). Reuse the builder; build the server pipeline. Do not silently re-implement a parallel CSV format.
- **FR11.** Spreadsheet content is **request-driven.** "Export my AG-4 meters", "the demand-charge findings as a spreadsheet", "this meter's last twelve bills" — Almond shapes the rows and columns from the request, grounded in real data, Excel-brained: tabular money, whole dollars, plain operator headers (pumps, meters, rates, bills), no kW/interval jargon. **v1 leads with the data growers already trust** — the meter table and the bill-due schedule; exporting findings/recommendations is secondary and deferred pending farmer validation (see §5.6's data-first instinct and Open Q4).
- **FR12.** **PDF report skill.** Almond generates a clean PDF of what the grower asks for (one meter, the mis-rated set, the whole farm, the savings found). To keep "whatever they ask for" buildable and testable, the skill is **generative in *selection* and deterministic in *rendering*:** the model chooses which grounded sections to include and in what order; **each section is a tested, composable template that renders real data** — not free-form, model-authored layout or prose. The library of sections is the bounded, QA-able surface; the model's freedom is which to compose. Branded in the warm palette, plain operator English, money tabular and whole-dollar, never a lone screaming hero number (hero-not-money-loudest holds).
- **FR13.** Artifact generation is correct and legible at Batth scale (183 meters): a full meter spreadsheet is complete (no silent row caps — if anything is bounded, the artifact says what was left out), and a whole-farm PDF stays readable and printable.

### 5.4 Delivery and the Reports area

- **FR14.** Any generated artifact can be **downloaded to the device immediately** — the baseline delivery path, working on a phone.
- **FR15.** Every generated artifact is **saved to a per-grower Reports area** in the account, persisted and re-downloadable later. Each saved report records what it was, when it was made, and the request that produced it, so the grower can find "the spreadsheet I made last week."
- **FR16.** The Reports area is **farm-scoped and private to the grower** (the same owner-scoping law as the rest of the app); a grower never sees another farm's reports, and stored-file access is not guessable.
- **FR17.** **Email delivery is explicitly out of v1** (it is a planned future skill, not built here). Recorded as an FR so the boundary is unambiguous.

### 5.5 Trust, grounding, and safety

- **FR18.** Almond inherits the grower's **authentication and farm scope.** An unauthenticated or farm-less caller gets no Almond action (mirrors the Story 6.1 route gate: 401 / clean 400). **Generate and save skills additionally require an authenticated farm-owner:** the public demo/Tour path (which shares the chat route on the demo farm) gets read + navigate only — no Blob writes, no saved Reports — so an anonymous visitor can never write storage or a DB row. Navigation is safe to allow publicly; persistence is not.
- **FR19.** Every generated artifact carries an **honest coverage / as-of footer.** If the farm's billing data is partial, the export says so (reusing the reconciliation/coverage honesty), so a PDF a grower shares with a lender never overclaims completeness.
- **FR20.** Almond's **voice and persona are unchanged** across all new surfaces (action chips, previews, generated copy): the almond character, plain operator English, no exclamation marks, no kW/tariff jargon on the surface, and **no em dashes in any user-facing generated copy** (the project copy law).

### 5.6 Surfacing Almond (gently)

- **FR21.** Almond is given a clear, discoverable entry as a way to get value without climbing the UI: a persistent entry in the OS-shell rail, a first-run nudge in onboarding ("ask Almond to show you your most expensive meter"), and the existing grounded starters extended to include **action and export** prompts ("export my meters", "make a PDF of my mis-rated pumps", "open my biggest opportunity").
- **FR22.** Surfacing is **gentle and progressive, never overbearing.** The grower we serve is non-AI-native and is easily confused or put off by a pushy assistant on first use. Almond stays out of the way of the dashboard (which is what the grower came for), reveals its powers progressively as the grower engages, and never blocks, interrupts, or nags. The first run must read as calm and optional, not as "go talk to the AI." UX friendliness for a non-AI-native operator is a hard requirement here, not a polish item.

## 6. Non-Goals (Explicit, v1)

- **Data or utility mutations of any kind.** No resolving/dismissing findings, no changing a rate, no enrolling in a DR program, no editing meters or account data. Almond explains and prepares artifacts; it does not act on data. *(Notion's agent does take confirmed write actions; we deliberately do not, to keep Terra's "display, never execute" safety law and avoid the whole confirmation-risk surface for v1.)*
- **PPTX / slide-deck generation.** A planned future skill; not v1.
- **Email (or any outbound send) of artifacts.** Future skill; v1 is download + saved Reports.
- **Scheduled or background "custom agents"** (Notion 3.3 style). Almond is on-demand and grower-directed in v1.
- **A chat-first / dashboard-optional front door.** v1 is dashboard-first; Almond drives the dashboard, it does not replace it.
- **Multi-farm operation.** Almond is scoped to the one resolved farm, as today.
- **Physical (camera) data capture and physical↔numerical fusion.** Terra's real wedge (§1.1) is a separate initiative; this PRD builds only Almond inside the dashboard.

## 7. MVP Scope

### 7.1 In scope
Navigation skills driving existing surfaces (FR1–FR4); the extensible skill framework with the read-only/farm-scoped/grounded contract (FR5–FR9); spreadsheet (CSV + XLSX) and request-driven PDF skills reusing existing export logic (FR10–FR13); download + a farm-scoped Reports area (FR14–FR16); trust/grounding/coverage and unchanged voice (FR18–FR20); the surfacing of Almond as the wedge (FR21–FR22).

### 7.2 Out of scope for MVP
Mutations/write-actions; PPTX; email/outbound send; scheduled agents; chat-first front door; multi-farm. (See Non-Goals.)

### 7.3 Build priority and demo framing

**Gate:** heavy build is gated behind farmer validation (Open Q4 / decision D14) — this sequence is *how* we build once validated, not a greenlight to start before a real grower confirms the thesis.

1. **Navigation skills first** — highest "wow," proves the operator model; the dashboard surfaces are reused, but the **server→client action bridge (FR1) is the net-new piece to land first.**
2. **Spreadsheet skill** — reuses the CSV builder, builds the server-side generation + delivery; the Excel-brained grower's first real artifact.
3. **PDF report skill + Reports area** — the shareable proof of value; the demo's closer.
4. **Surfacing** — gentle onboarding nudge + action-flavored starters so the powers are discoverable without overbearing.
The demo story is UJ-1 → UJ-2: ask, watch Almond drive the screen, walk away with a spreadsheet and a lender-ready PDF.

## 8. Cross-Cutting NFRs

- **Security & isolation.** Farm-scoping is structural (no farmId from the model/client); the Reports area and stored files are farm-private with non-guessable, scoped/expiring access; no grower credentials ever touch the artifact path.
- **Grounding integrity.** Fabrication rate is effectively zero — artifacts and answers are tool-sourced; absence is stated, never filled with a guess.
- **Determinism & testability.** The model boundary stays injected (offline stub default, Vercel AI Gateway when keyed); dev/CI make zero external calls. Export shaping is pure and unit-tested; generated artifact bytes are verified by tests; navigation actions are deterministic.
- **Performance (direction approved; numbers to set).** Navigation feels instant (no full reload). A meter-table spreadsheet generates in a few seconds; a whole-farm PDF in roughly ten seconds or less. Generation is serverless-safe (pure-JS libraries, no headless Chromium — see addendum). Speed is a felt requirement: a slow operator will not be trusted by a skeptical grower.
- **Stays native to a constantly changing dashboard.** The dashboard evolves all the time; Almond's navigation must not drift out of sync. **Today the URL-state keys are bare string literals duplicated across many components and only the lens *values* are centralized (`lens.ts`); this requirement therefore includes *building* a single canonical surface registry** (the closed `lens | entity | ranch | rate | meter` set plus each lens) that both the dashboard and Almond read from, so a dashboard change updates Almond's reach in one place. Almond must never offer to open a surface that no longer exists. (Net-new, not an existing property — see addendum.)
- **Mobile-first.** Download, the Reports area, and generated PDFs all work and read well on a phone; PDFs are printable.
- **Accessibility & motion.** Action chips, previews, and the Reports area are keyboard-navigable with adequate tap targets; streamed actions/answers announce via a live region; Magic UI effects degrade gracefully under `prefers-reduced-motion`.
- **Honest limits.** No silent truncation: if any artifact bounds its content (row caps, page limits), it states what was left out.
- **Voice & localization.** All user-facing copy in `/copy`, localization-ready, plain operator English, no em dashes.

## 9. Success Metrics

- **SM1 — Activation:** % of growers who complete at least one Almond-driven *action* (a navigation or an export) in their first session. Direction approved; numeric target to set. Because Almond is an addition (not the day-one draw), expect this modest early and climbing as growers grow AI-native — track the *trend*, not just the level.
- **SM2 — Value-via-Almond:** share of sessions where the grower reaches value through Almond rather than manual UI navigation; count of artifacts generated per active grower.
- **SM3 — Shareable proof:** count of PDFs/spreadsheets saved or downloaded — the artifact is what leaves the product and pulls Terra into outside relationships.
- **SM4 — Retention proxy:** growers who generate an artifact return at a higher rate than those who don't.

**Counter-metrics (watch these or the value is hollow):**
- **Fabrication / overclaim rate** — must stay ~0; any artifact stating a number not in the data is a critical failure.
- **Wrong-target rate** — Almond opening or exporting the wrong meter/entity; disambiguation should catch this.
- **Stale/overclaimed coverage on shared artifacts** — a PDF that hides partial data.
- **Generation failure & latency** — exports that error or hang.
- **"Almond moved my screen on me" friction** — navigation that felt like a hijack (guards FR4).

## 10. Open Questions

1. **Retention / quota** for saved Reports at Batth scale. *(Storage decided: report files in Vercel Blob, private; DB stays Neon — see addendum.)*
2. **Exact gentle-surfacing treatment** for FR21–FR22 (rail entry, onboarding nudge wording) — design with the non-AI-native first-use constraint front of mind.
3. **Numeric targets** for the activation metric and generation latency — direction approved; set the actual numbers with the team.
4. **Farmer validation (the big one).** The whole Almond-as-addition thesis, the gentle surfacing, and the export cut should be put in front of a real grower before heavy build — only a farmer knows what a farmer wants. Validate specifically that the data-first instinct (show the data, not findings/recs first; Almond stays out of the way) is right.

## 11. Assumptions Index

- **[A1]** *Resolved with user 2026-06-17:* Almond is an **addition** today, a large **latent** wedge as growers grow AI-native; Terra's real wedge is physical↔numerical (camera) data fusion, out of scope here (§1, §1.1).
- **[A2]** FR13: pure-JS server-side generation, no headless Chromium (addendum).
- **[A3]** *Confirmed:* FR21 elevated entry, FR22 gentle/progressive surfacing — must not overbear a non-AI-native grower.
- **[A4]** *Confirmed direction:* NFR performance is a felt requirement; numeric targets to set (§8, §10).
- **[A5]** *Confirmed direction:* success metrics in §9; numeric target to set, track the trend.
- **[A6]** *Decided:* DB stays Neon Postgres; report files in Vercel Blob (private, scoped/expiring URLs). Supabase migration rejected (addendum).
