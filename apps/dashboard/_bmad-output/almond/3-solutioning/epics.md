---
stepsCompleted: [1, 2, 3, 4]
status: final
completedAt: 2026-06-17
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Almond-2026-06-17/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Almond-2026-06-17/addendum.md
  - _bmad-output/almond/3-solutioning/architecture.md
  - _bmad-output/almond/3-solutioning/architecture-decisions.md
  - _bmad-output/project-context.md
title: "Almond — Terra's Generative Operator — Epic Breakdown"
project: Terra
feature: "Almond — Terra's Generative Operator"
builds_on: "_bmad-output/planning-artifacts/epics.md (Tool 1, Epics 1-6; Epic 6 = shipped read-only Almond)"
numbering: "Epics 7-10 (continues the global Terra epic space; Story 6.1 is the owner-scoping foundation these build on)"
owner: Jaiyen
created: 2026-06-17
---

# Almond — Terra's Generative Operator — Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for **Almond, Terra's Generative
Operator**, decomposing the requirements from the Almond PRD (`prd-Almond-2026-06-17`), its addendum,
and the extension architecture (`almond/3-solutioning/architecture.md` + `architecture-decisions.md`)
into implementable, context-filled stories for the Developer agent.

It is an **extension** breakdown. It builds on the shipped Epic-6 Almond (a farm-scoped, read-only,
AI-SDK-v6 tool-calling chat with an injected model boundary; Stories 6.1-6.3 in the Tool 1
`planning-artifacts/epics.md`) and turns Almond from an *answerer* into an *operator* that can do two
new classes of thing: **navigate** (drive the dashboard on the grower's behalf) and **generate**
(build grounded spreadsheets and PDFs, saved to a Reports area). The grounding, farm-scoping, voice,
and injected-boundary core do not change.

Epics are numbered **7-10** to continue the single Terra epic space; the architecture and ADRs
reference **Story 6.1** (the owner-scoping law) and the shipped tool factory as the foundation these
extend. On any conflict the governing order is: `project-context.md` first, then the Tool 1
architecture, then the Almond architecture/ADRs for the new surfaces.

**Build gate (carry into every epic):** the heavy build is gated behind **farmer validation**
(PRD Open Q4 / decision D14). This breakdown is *how* we build once validated, not a greenlight to
start before a real grower confirms the data-first / gentle-surfacing thesis.

## Requirements Inventory

### Functional Requirements

Restated as testable statements; stable IDs carried verbatim from PRD §5 (FR1-FR22).

**Cluster N — Navigation skills (operator)**

FR1: Almond can open and navigate any primary dashboard surface on the grower's behalf by setting the application's existing canonical URL state — the meter drawer (`meter`), the lens toggle (`lens`: calendar / table / chart / map), and the filters (`entity`, `ranch`, `rate`). Surfaces are reused; because Almond runs server-side, a navigation request is emitted as a structured action that the already-mounted client panel applies to the URL state (the server→client action bridge, net-new). The model never receives a route; it requests a named navigation and the client performs it.

FR2: Every navigation Almond performs is recorded in the conversation as an **action chip** ("Opened Pump 17", "Filtered the table to AG-4 meters", "Showed the map"), and the chip is itself a link back to that view. Undo = navigating back (navigation changes no data).

FR3: Almond resolves plain-language references to real entities (a meter by name or SA-ID, a ranch, a legal entity, a rate schedule, a finding) using its grounded tools. **Ambiguity has a defined trigger:** when two or more meters in the resolved farm match (or nothing matches), Almond asks the grower to disambiguate (or says it found nothing) rather than opening the wrong one. Testable: a request matching >= 2 meters never auto-navigates.

FR4: Almond drives the screen **only in response to a grower's request**. It never hijacks navigation unprompted; the grower's manual control is never overridden mid-task.

**Cluster S — The skill framework**

FR5: Almond's capabilities are organized as discrete, named **skills**, and the model selects the appropriate skill(s) for a request. The set is **extensible**: a new skill (PPTX, email, scheduled report) can be added without reworking Almond's core, persona, or grounding contract.

FR6: Every skill is **read-only with respect to farm and utility data.** A skill may navigate or generate an artifact; no skill mutates a finding, rate, meter, account data, or anything utility-side. (Extends Terra's "display, never execute" law.)

FR7: Every skill is **farm-scoped by inheritance.** A skill operates only on the caller's resolved farm; no skill accepts a farm identifier or any scope from the model or client. Cross-farm action is structurally impossible (the Story 6.1 owner-scoping law).

FR8: Every skill draws its content **only from grounded farm data.** Artifacts are assembled by deterministic code from the full grounded dataset — the model chooses the *shape* (rows, columns, sections), never authors a cell value, a number, or report prose. Chat tools cap/summarize for readability; those caps must NOT feed exports — export skills read a **dedicated full-data, farm-scoped path**. When data isn't present, the skill says so plainly.

FR9: Before producing a heavier artifact (spreadsheet or PDF), Almond **states what it is about to make** in one short line ("I'll build a PDF of your 14 mis-rated meters and the savings on them"). A lightweight preview, not an approval gate.

**Cluster X — Export skills (spreadsheet and PDF)**

FR10: **Spreadsheet skill.** Almond generates a CSV and an Excel (`.xlsx`). It **reuses the pure `metersCsv` string-builder** where the shape matches; the server-side generation, the `.xlsx` path, the bill-due-schedule exporter, and the file-delivery pipeline are net-new. Reuse the builder; build the server pipeline. Do not silently re-implement a parallel CSV format.

FR11: Spreadsheet content is **request-driven** — Almond shapes the rows and columns from the request, grounded in real data, Excel-brained (tabular money, whole dollars, plain operator headers, no kW/interval jargon). **v1 leads with the data growers already trust** — the meter table and the bill-due schedule; exporting findings/recommendations is deferred pending farmer validation (Open Q4).

FR12: **PDF report skill.** Almond generates a clean PDF of what the grower asks for. **Generative in *selection*, deterministic in *rendering*:** the model chooses which grounded sections to include and in what order; each section is a tested, composable template that renders real data — not free-form, model-authored layout or prose. Branded in the warm palette, plain operator English, money tabular and whole-dollar, never a lone screaming hero number.

FR13: Artifact generation is correct and legible at **Batth scale (183 meters)**: a full meter spreadsheet is complete (no silent row caps — if anything is bounded, the artifact says what was left out), and a whole-farm PDF stays readable and printable.

**Cluster R — Delivery and the Reports area**

FR14: Any generated artifact can be **downloaded to the device immediately** — the baseline delivery path, working on a phone.

FR15: Every generated artifact is **saved to a per-grower Reports area** in the account, persisted and re-downloadable later. Each saved report records what it was, when it was made, and the request that produced it.

FR16: The Reports area is **farm-scoped and private to the grower** (the owner-scoping law); a grower never sees another farm's reports, and stored-file access is not guessable.

FR17: **Email delivery is explicitly out of v1** (a planned future skill). Recorded as an FR so the boundary is unambiguous.

**Cluster T — Trust, grounding, and safety**

FR18: Almond inherits the grower's **authentication and farm scope.** An unauthenticated or farm-less caller gets no Almond action (mirrors the Story 6.1 route gate: 401 / clean 400). **Generate and save skills additionally require an authenticated farm-owner:** the public demo/Tour path (which shares the chat route on the demo farm) gets read + navigate only — no Blob writes, no saved Reports.

FR19: Every generated artifact carries an **honest coverage / as-of footer.** If the farm's billing data is partial, the export says so (reusing the reconciliation/coverage honesty), so a PDF a grower shares with a lender never overclaims completeness.

FR20: Almond's **voice and persona are unchanged** across all new surfaces (action chips, previews, generated copy): the almond character, plain operator English, no exclamation marks, no kW/tariff jargon on the surface, and **no em dashes** in any user-facing generated copy.

**Cluster D — Surfacing Almond (gently)**

FR21: Almond is given a clear, discoverable entry: a persistent entry in the OS-shell rail, a first-run nudge in onboarding ("ask Almond to show you your most expensive meter"), and the existing grounded starters extended to include **action and export** prompts ("export my meters", "make a PDF of my mis-rated pumps", "open my biggest opportunity").

FR22: Surfacing is **gentle and progressive, never overbearing.** Almond stays out of the way of the dashboard, reveals its powers progressively, and never blocks, interrupts, or nags. The first run reads as calm and optional. UX friendliness for a non-AI-native operator is a hard requirement, not a polish item.

### NonFunctional Requirements

From PRD §8 (Cross-Cutting NFRs) and the architecture's NFR analysis.

NFR1 — **Security & isolation.** Farm-scoping is structural (the factory closes over the resolved `farmId`; no scope from model/client). The Reports area and stored files are farm-private with non-guessable, scoped/expiring access; no grower credentials ever touch the artifact path.

NFR2 — **Grounding integrity.** Fabrication rate is effectively zero: artifacts and answers are tool-sourced; no model-authored cell values, numbers, or report prose. Absence is stated, never filled with a guess.

NFR3 — **Determinism & testability.** The model boundary stays injected (offline stub default, Vercel AI Gateway when keyed); dev/CI make zero external calls. Export shaping is pure and unit-tested; generated artifact bytes are verified by tests; navigation actions are deterministic. Every new skill is exercisable by the stub responder.

NFR4 — **Performance (felt requirement; numeric targets TBD).** Navigation feels instant (no full reload). A meter-table spreadsheet generates in a few seconds; a whole-farm PDF in roughly ten seconds or less. Generation is serverless-safe (pure-JS libraries, no headless Chromium).

NFR5 — **Stays native to a constantly changing dashboard.** A single **canonical surface registry** is the one place both the dashboard and Almond read selectable surfaces from; Almond never offers a surface that no longer exists. (Requires *building* the registry — net-new; the keys are duplicated string literals today.)

NFR6 — **Mobile-first.** Download, the Reports area, and generated PDFs all work and read well on a phone; PDFs are printable.

NFR7 — **Accessibility & motion.** Action chips, previews, and the Reports area are keyboard-navigable with adequate tap targets (>= 44pt); streamed actions/answers announce via a live region; Magic UI effects degrade gracefully under `prefers-reduced-motion`.

NFR8 — **Honest limits.** No silent truncation: if any artifact bounds its content (row caps, page limits), it states what was left out.

NFR9 — **Voice & localization.** All user-facing copy in `/copy`, localization-ready, plain operator English, no em dashes.

### Additional Requirements

Net-new technical work extracted from the architecture (the "what's net-new (build this)" columns,
the implementation sequence, and the enforcement rules). **There is no greenfield `create-*` /
starter-template story** — the architecture is explicit that this feature *extends* the shipped
Epic-6 base in place (ADR-A01). The brownfield "init" work is: add the three deps, add the
`GeneratedReport` migration, and build the surface registry, then layer skills onto the existing
responder.

- **AR1 — New dependencies (verified NOT installed):** `@vercel/blob`, `exceljs`, `@react-pdf/renderer`. (`pptxgenjs` is a future-skill dep, out of v1.) All pure-JS, Node-safe; the route is already `runtime = "nodejs"`.
- **AR2 — New env var:** `BLOB_READ_WRITE_TOKEN` (Vercel env, never committed); reuse `AI_GATEWAY_API_KEY` / `AUTH_*`.
- **AR3 — Canonical surface registry** `src/lib/dashboard/surface.ts`: single source of truth for the closed key set (`lens | entity | ranch | rate | meter`), each key's parser/validator, and lens availability (composing the existing `lens.ts`). Refactor the **~9 duplicated nuqs call-sites** (`lens-toggle`, `lens-region`, `kpi-strip`, `chart-lens`, `calendar-lens`, `filter-bar`, `meter-table`, `meter-drawer`, `finding-card`) to import their key from the registry (ADR-A03).
- **AR4 — Skill framework / factory extension:** `buildAlmondTools(deps)` becomes `buildAlmondSkills(deps, actor)`; `actor` carries `{ authedOwner: boolean }`. Read tools unaffected; new skills built by the same farm-scoped factory; every new skill stub-answerable (ADR-A01, ADR-A08).
- **AR5 — Server→client navigation bridge:** the model calls `navigate`; the server writes a typed transient `data-navigate` part on the UI-message stream via the existing `createUIMessageStream` writer; the client `useAlmondNavigation()` hook applies it through the five canonical `useQueryState` setters; each action applied exactly once (dedupe by part id) (ADR-A02).
- **AR6 — Entity resolver + ambiguity rule:** `navigate` resolves plain-language references via the grounded resolver (`resolveMeterQuery`) and the registry; >= 2 matches (or none) -> clarify/none, **no navigation emitted** (FR3, enforced as law).
- **AR7 — Uncapped full-data export loader** `src/lib/almond/export/load.ts`: farm-scoped loaders built on the existing dashboard loaders **without** the chat-tool row caps. The single read path for exports; exports never read the chat tools (ADR-A04).
- **AR8 — CSV reuse adapter** `src/lib/almond/export/rows.ts`: `MeterSummary[] -> MeterRow[]` so the pure `metersCsv` is reused (not re-implemented); single mapping point, unit-tested (ADR-A06).
- **AR9 — XLSX builder** `src/lib/almond/export/xlsx.ts` (`exceljs`, pure JS) over the same row model; tabular money / whole-dollar / plain headers (ADR-A06).
- **AR10 — Bill-due-schedule exporter** `src/lib/almond/export/bill-due.ts` (net-new): a serial-code/calendar export that **marks SCHEDULED dates as scheduled** (BILLED-vs-SCHEDULED law, AR-14 in Tool 1) so a lender artifact never presents a "may shift" date as billed (ADR-A06).
- **AR11 — Coverage-footer composer** `src/lib/almond/export/coverage-footer.ts`: one shared composer reads reconciliation/coverage state and stamps an as-of / % complete footer onto every XLSX and PDF (FR19).
- **AR12 — PDF section-template library + composer:** `src/lib/almond/report/sections/*` (farm summary, meter table, mis-rated set, savings, single-meter, coverage footer) as tested `@react-pdf/renderer` components; `src/lib/almond/report/render.ts` composes selected sections in order over the full-data loader; bytes snapshot/assertion-tested (ADR-A05).
- **AR13 — Reports persistence unit:** `GeneratedReport` Prisma model (additive; migration `almond_generated_report`); `src/lib/almond/reports/store.ts` (write `GeneratedReport` + Blob put/read, owner-scoped); `src/lib/storage/blob.ts` (`@vercel/blob` private put/get wrapper, non-guessable key, never a public URL) (ADR-A07).
- **AR14 — Owner-scoped download route:** `GET /api/reports/[id]/download` — loads the `GeneratedReport`, re-checks it belongs to the caller's resolved farm, streams Blob bytes (or a short-lived scoped URL). Different farm -> 404; anonymous -> 401 (ADR-A07).
- **AR15 — Capability flag threading:** `authedOwner` threads route -> factory -> skills -> starters/UI copy. Generate/save skills are **only handed to the model when `authedOwner` is true** (capability-by-omission, not a bypassable runtime check) (ADR-A08).
- **AR16 — Abuse/cost protection:** per-IP rate-limiting / Vercel BotID on `/api/almond/chat` + a per-farm generation throttle; required before exposing the now-generative endpoint to a wide public Tour (ADR-A08).
- **AR17 — Stream parts:** the one chat endpoint carries text, tool calls, the `data-navigate` part, and a `data-report` part (the download/action card after a generation skill persists an artifact). No second channel (ADR-A02).
- **AR18 — Stub-answerability:** every new skill (navigate, exportSpreadsheet, generateReport) must be answerable by the offline stub responder so e2e/CI stay offline and deterministic (NFR3, ADR-A01).

### UX Design Requirements

No standalone Almond UX specification exists; the Tool 1 UX spec (`ux-Terra-2026-06-08`) governs the
OS-shell, rail, and lens surfaces Almond rides in. These UX-DRs are extracted from PRD §5.6
(FR21-FR22), the cross-cutting a11y/motion/voice NFRs, and the architecture's Frontend Architecture
section. Each is specific enough to drive a story with testable acceptance criteria.

- **UX-DR1 — Action chip component.** The in-conversation record of a navigation ("Opened Pump 17"), rendered in `almond-result.tsx` / `almond-messages.tsx`. It is a link that re-applies the same `NavigateAction`. Keyboard-navigable, >= 44pt target, Magic UI styling tinted to the warm palette, degrades under `prefers-reduced-motion`.
- **UX-DR2 — Report download card component.** The in-conversation record of a generated artifact: title, kind (spreadsheet / PDF), the honest coverage note, a **Download** affordance, and (once persistence ships) a "saved to Reports" line. Mobile-first, keyboard-navigable.
- **UX-DR3 — Reports area list view.** A new `(app)/reports` route: a per-farm list of saved reports showing what it was, when it was made, and the request that produced it; each row re-downloadable via the owner-scoped route. Mobile-first; keyboard-navigable; empty state in the Almond voice.
- **UX-DR4 — Rail entry for Almond.** A clear, persistent entry for Almond in the OS-shell rail (alongside the existing launcher plumbing), so the operator is discoverable as a path to value.
- **UX-DR5 — Calm first-run onboarding nudge.** A dismissible, gentle, progressive first-run nudge ("ask Almond to show you your most expensive meter") that never blocks, interrupts, or nags; reads as calm and optional for a non-AI-native grower; dismissal is remembered.
- **UX-DR6 — Action/export-flavored starters.** Extend the existing grounded starters plumbing with action and export prompts ("export my meters", "make a PDF of my mis-rated pumps", "open my biggest opportunity"); export starters shown only to an authed owner (mirrors AR15).
- **UX-DR7 — Live-region announcements.** Streamed actions/answers (and the result of a navigation/generation) announce via an ARIA live region so a screen-reader user knows the screen moved or a file is ready.
- **UX-DR8 — Reduced-motion + a11y across new surfaces.** Magic UI effects on chips, cards, the Reports area, and the nudge degrade gracefully under `prefers-reduced-motion`; all new interactive surfaces are keyboard-operable with adequate targets.

### FR Coverage Map

Every FR maps to at least one epic. Cross-cutting FRs (the read-only/scoped/grounded contract and
the voice law) are enforced in the acceptance criteria of every relevant story; their "home" epic is
where the contract is first established.

| FR | Epic | Where it lands |
|----|------|----------------|
| FR1 — navigate the dashboard via canonical URL state | Epic 7 | Stories 7.3 (skill) + 7.4 (server→client bridge) |
| FR2 — action chip records each navigation, links back | Epic 7 | Story 7.5 |
| FR3 — resolve references + ambiguity rule (>=2 -> clarify) | Epic 7 | Story 7.3 |
| FR4 — drive only on request, never hijack | Epic 7 | Story 7.5 (guarantee surfaced + tested) |
| FR5 — discrete, named, extensible skills | Epic 7 | Story 7.2 (framework established), reused 8.x/9.x |
| FR6 — read-only on data (every skill) | Epic 7 | Story 7.2 (contract), re-asserted in 8.5 / 9.3 |
| FR7 — farm-scoped by inheritance (factory) | Epic 7 | Story 7.2 (factory extension), re-asserted everywhere |
| FR8 — grounded, full-data path; no model-authored cells | Epic 8 | Story 8.1 (full-data loader), enforced in 8.5 / 9.x |
| FR9 — one-line "what I'm about to make" preview | Epic 8 | Story 8.5 (spreadsheet), reused 9.3 (PDF) |
| FR10 — spreadsheet skill (CSV reuse + XLSX) | Epic 8 | Stories 8.2 (CSV adapter + XLSX) + 8.5 (skill) |
| FR11 — request-driven shape; meter-table + bill-due first | Epic 8 | Stories 8.2, 8.3 (bill-due), 8.5 |
| FR12 — PDF: generative selection, deterministic render | Epic 9 | Stories 9.1 (sections) + 9.2 (composer) + 9.3 (skill) |
| FR13 — Batth-scale, no silent caps | Epic 8 + Epic 9 | Story 8.2 (spreadsheet), Story 9.2 (PDF) |
| FR14 — immediate download | Epic 8 | Story 8.5 (spreadsheet), reused 9.3 (PDF) |
| FR15 — saved to a per-grower Reports area (what/when/request) | Epic 8 | Stories 8.6 (model+store) + 8.7 (Reports UI) |
| FR16 — Reports farm-scoped, private, non-guessable | Epic 8 | Story 8.6 (Blob + owner-scoped download route) |
| FR17 — email explicitly out of v1 | (boundary) | No story — recorded boundary; future skill |
| FR18 — auth/scope inherited; generate/save owner-only | Epic 8 | Story 8.5 (capability gate), reused 9.3; foundation in 7.2 |
| FR19 — honest coverage/as-of footer | Epic 8 | Story 8.4 (footer composer), reused 9.2 |
| FR20 — voice/persona unchanged, no em dashes | all epics | Cross-cutting AC on every user-facing story |
| FR21 — rail entry, first-run nudge, action/export starters | Epic 10 | Stories 10.1 (starters) + 10.2 (rail + nudge) |
| FR22 — gentle, progressive, never overbearing | Epic 10 | Story 10.2 |

NFR home: NFR5 (surface registry) -> Story 7.1; NFR1/NFR2 -> Stories 7.2, 8.1, 8.6; NFR3 (offline
stub) -> every skill story (AR18); NFR4 (performance) -> 8.2, 9.2; NFR6/NFR7/NFR8/NFR9 -> cross-cutting
ACs. AR1/AR2 (deps + env) land in the first story that needs each (no upfront "install everything"
story); the surface registry (AR3) is the one genuinely-foundational sweep and is Story 7.1.

## Epic List

Four epics, organized by **user value** and ordered so each is **standalone and enables — but never
requires — later epics**. The order matches the architecture's implementation sequence and PRD §7.3
build priority. Each epic delivers a complete grower-facing outcome; later epics build on earlier
outputs (Epic 8's persistence is reused by Epic 9; Epic 10 surfaces whatever has shipped).

### Epic 7: Almond drives the screen (the navigation operator)
The grower asks in plain language and Almond opens the right meter, filters the table, switches the
lens — never the wrong one, never unprompted. This is the highest-"wow" pillar and proves the
operator model. It establishes the **skill framework** (the extensible, read-only, farm-scoped
factory) and the **canonical surface registry** as its foundation, so every later skill inherits the
contract. Standalone value: Almond becomes hands, not just a voice.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7. **NFRs:** NFR5 (surface registry), NFR1/NFR2/NFR3.

### Epic 8: Almond hands you a spreadsheet (the first artifact and its memory)
"Give me that as a spreadsheet" → an `.xlsx`/`.csv` of exactly what the grower asked for, grounded and
complete at 183 rows, downloaded to the phone and **saved to a Reports area** they can return to. The
Excel-brained grower's first real artifact. This epic establishes the deterministic full-data
generation law, the spreadsheet/bill-due exporters, the coverage footer, the owner gate, and the
**Reports persistence unit** (model + Blob + owner-scoped download) that Epic 9 reuses. Standalone
value: a trustworthy spreadsheet, kept.
**FRs covered:** FR8, FR9, FR10, FR11, FR13, FR14, FR15, FR16, FR18, FR19. **NFRs:** NFR1, NFR2, NFR3, NFR4, NFR6, NFR8, NFR9.

### Epic 9: Almond builds the lender-ready PDF (the shareable proof)
"Make me a PDF of the savings you found" → a clean, palette-branded, honestly-captioned PDF,
generative in *which sections* it includes and deterministic in *how* it renders them, saved to
Reports and downloaded. The demo's closer and the artifact that leaves the product and pulls Terra
into the grower's outside relationships. Builds on Epic 8's full-data loader, coverage footer, and
persistence unit; Epic 8 stands alone without it. Standalone value: a shareable proof of value.
**FRs covered:** FR12, plus FR8/FR9/FR13/FR14/FR15/FR16/FR18/FR19 applied to the PDF artifact. **NFRs:** NFR2, NFR3, NFR4, NFR6, NFR8, NFR9.

### Epic 10: Surfacing Almond, gently (discoverability without overbearing)
The non-AI-native grower discovers Almond's powers calmly — a rail entry, a dismissible first-run
nudge, and action/export-flavored starters — never nagged, never hijacked; and the now-generative
public endpoint is protected from abuse before the Tour is exposed widely. Sequenced last because it
surfaces whatever has shipped; it builds on Epics 7-9 but those stand alone without it. Standalone
value: the powers become reachable for the grower who is ready, safely.
**FRs covered:** FR21, FR22. **NFRs:** NFR1 (abuse/cost protection, AR16), NFR6, NFR7, NFR9.

---

## Epic 7: Almond drives the screen (the navigation operator)

Turn Almond from an answerer into an operator: the grower asks in plain language and Almond opens the
exact meter, filters the table to the mis-rated rates, or switches the lens — by setting the
dashboard's own canonical URL state, never a parallel navigation UI. This epic stands up the two
foundations every later skill inherits: the **canonical surface registry** (the single source of truth
for what is navigable, so Almond never drifts from a changing dashboard) and the **skill framework**
(the extensible, read-only, farm-scoped factory). It is the highest-"wow" pillar and the net-new hard
seam — a server-side model cannot call a client `useQueryState` setter, so the heart of the epic is a
server→client action bridge over the existing chat stream.

Cross-cutting laws enforced in every story below: read-only on data (FR6), farm-scoped by inheritance
(FR7, no `farmId` from the model/client), grounded (FR8), injected model boundary so dev/CI make zero
external calls (NFR3, AR18), and the unchanged Almond voice — plain operator English, no exclamation
marks, no jargon, **no em dashes** (FR20, NFR9), all copy in `/copy`.

### Story 7.1: Canonical surface registry and nuqs call-site refactor

As a grower,
I want Almond to only ever offer to open parts of the dashboard that actually exist,
So that the assistant never sends me to a dead screen as the product changes.

**Acceptance Criteria:**

**Given** the dashboard's URL-state keys, **When** the registry is built, **Then** `src/lib/dashboard/surface.ts` is the single source of truth for the closed key set (`lens | entity | ranch | rate | meter`), each key's parser/validator, and (composing the existing `lens.ts`, not replacing it) which lenses are available.

**Given** the ~9 client components that today inline the key as a bare string literal (`lens-toggle`, `lens-region`, `kpi-strip`, `chart-lens`, `calendar-lens`, `filter-bar`, `meter-table`, `meter-drawer`, `finding-card`), **When** refactored, **Then** each imports its key name and parser from the registry; no query-param string literal for a canonical key remains outside `surface.ts`.

**Given** a key or lens is retired from the registry, **When** the app builds, **Then** there is exactly one place that changed and any consumer referencing the removed surface fails at type-check, not silently at runtime.

**Given** the existing lens/filter behavior, **When** the refactor lands, **Then** the existing lens and filter Playwright/unit tests still pass unchanged (pure rename-to-constant; no behavior change), and a new unit test asserts the registry exposes exactly the five keys and their parsers.

**Build notes.** AR3, ADR-A03, NFR5. New file `src/lib/dashboard/surface.ts`; refactor the 9 call-sites listed in the architecture (verified blast radius). `lens.ts` stays the lens-value authority, composed by the registry. Mechanical, low-risk, sequenced **first** because it unblocks 7.3/7.4. No new deps. No forward dependency. **Covers:** NFR5 (foundation for FR1).

### Story 7.2: Extend the tool factory into the skill framework

As a grower,
I want Almond's new powers to obey the same safety rules as its existing answers,
So that an assistant that can now *do* things still can never touch another farm's data or change mine.

**Acceptance Criteria:**

**Given** the shipped `buildAlmondTools(deps)` factory, **When** extended, **Then** it becomes `buildAlmondSkills(deps, actor)` where `deps` carries `{ prisma, farmId, farmName }` (unchanged) and `actor` carries `{ authedOwner: boolean }`; the six existing read tools are returned unchanged and still pass their existing tests.

**Given** any skill built by the factory, **When** it runs, **Then** it closes over the resolved `farmId` from `deps` and **never** accepts a `farmId` or any scope argument from the model or client (FR7); a skill's input schema (Zod) can carry shape only, never a scope value.

**Given** the read-only contract, **When** any v1 skill executes, **Then** it performs no write to a Finding, rate, meter, account, or anything utility-side (FR6) — the only writes any skill will ever perform are artifact persistence, introduced in Epic 8.

**Given** the offline stub responder, **When** the framework is exercised in dev/test/CI, **Then** every skill the factory returns is answerable by the stub with zero external calls (NFR3, AR18); the live Gateway responder is constructed only when the key is present (unchanged Story 6.1 pattern).

**Given** the `actor.authedOwner` flag, **When** the factory assembles the skill set, **Then** the mechanism to include/omit a skill by capability exists (used by Epic 8 to withhold generate/save from the public Tour); for this story, only read tools + the soon-to-arrive `navigate` are returned regardless, since navigation is read-safe.

**Build notes.** AR4, FR5/FR6/FR7, ADR-A01, ADR-A08 (scaffolding the capability flag). Evolves `src/lib/almond/tools.ts` (factory) and `responder.ts` (skills exercisable by the stub). Pure skill logic stays unit-tested (mirroring `almond/shape.ts`); the route only wires. Depends on: nothing new (extends shipped code). No new deps. **Covers:** FR5, FR6, FR7.

### Story 7.3: The `navigate` skill, entity resolver, and ambiguity rule

As a grower,
I want to say "open Pump 17" or "show me the meters on the wrong rate" and have Almond figure out what I mean,
So that I never scroll 183 meters or learn the filter bar, and I am never sent to the wrong pump.

**Acceptance Criteria:**

**Given** a navigation request, **When** the model calls the `navigate` skill, **Then** the skill input is a structured, registry-validated shape (e.g. `{ open: "meter", query }` or `{ lens, filters: { entity?, ranch?, rate? } }`) over only the canonical keys; an unknown surface is refused, never emitted.

**Given** a plain-language reference, **When** `navigate` resolves it, **Then** it uses the existing grounded resolver (`resolveMeterQuery`) and the registry to map names/SA-IDs/ranch/entity/rate/finding to real entities in the resolved farm only (FR7).

**Given** a request that matches two or more meters in the resolved farm, **When** resolved, **Then** the skill returns a **clarify** result naming the candidates and emits **no** navigation action; a request matching >= 2 meters never auto-navigates (FR3, the testable consequence).

**Given** a request that matches nothing, **When** resolved, **Then** the skill says it found nothing in the Almond voice and emits no navigation action; it never fabricates a target.

**Given** a clean single match, **When** resolved, **Then** the skill returns the typed `NavigateAction` to be emitted by the bridge (Story 7.4), and the skill logic is pure and unit-tested across single-match, multi-match, no-match, and unknown-surface cases; the stub responder can drive it offline (NFR3).

**Build notes.** AR6, FR1 (server side), FR3, ADR-A02 (the skill half), ADR-A03 (validates against the registry). New file `src/lib/almond/skills/navigate.ts`; reuses `resolveMeterQuery` and `surface.ts` (Story 7.1). `NavigateAction` is a closed, typed shape over the five keys. Depends on: 7.1 (registry), 7.2 (factory). No new deps. Note: this story emits the action; the client applies it in 7.4 (backward-only dependency). **Covers:** FR1 (server), FR3.

### Story 7.4: The server→client navigation bridge

As a grower,
I want the screen to actually move when Almond decides to open something,
So that asking Almond is the same as tapping the dashboard myself, with no reload.

**Acceptance Criteria:**

**Given** a clean `NavigateAction` from the `navigate` skill, **When** the server responds, **Then** it writes a **typed, transient `data-navigate` part** onto the UI-message stream via the same `createUIMessageStream` writer the stub already uses (no second channel, AR17).

**Given** the already-mounted `AlmondLauncher` (under the nuqs adapter), **When** a `data-navigate` part arrives, **Then** a new `useAlmondNavigation()` hook applies it through the five canonical `useQueryState` setters, and the existing dashboard surfaces react exactly as they do to a manual click — no parallel navigation UI, no full reload (NFR4, "feels instant").

**Given** a conversation that re-renders or replays, **When** `data-navigate` parts are processed, **Then** each action is applied **exactly once** (deduped by part id); a re-render never re-navigates.

**Given** the offline stub responder, **When** a navigation turn runs in e2e/CI, **Then** the stub emits a deterministic `data-navigate` part and the test asserts the URL state changed, with zero external calls (NFR3).

**Build notes.** AR5, AR17, FR1 (client side), ADR-A02. New file `src/app/(app)/_components/almond/use-almond-navigation.ts`; evolves `almond-launcher.tsx` (adds the navigation effect) and `almond-messages.tsx` (reads `data-navigate`). Depends on: 7.1 (registry keys), 7.3 (emits the action). The one piece of client state-sync the feature introduces. No new deps. **Covers:** FR1 (client).

### Story 7.5: Action chips and the never-hijack guarantee

As a grower,
I want to see exactly what Almond just did and be able to jump back to it, and trust it only moves the screen when I ask,
So that the assistant feels like a helpful operator, not something that grabs my screen.

**Acceptance Criteria:**

**Given** any navigation Almond performs, **When** it completes, **Then** an **action chip** renders in the conversation describing what it did ("Opened Pump 17", "Filtered the table to AG-4 meters", "Showed the map"), in plain operator English (FR2, FR20).

**Given** an action chip, **When** the grower activates it, **Then** it re-applies the same `NavigateAction` (the chip is a link back to that view); because navigation changes no data, "undo" is simply navigating back (FR2, FR4).

**Given** the grower has not made a request, **When** any turn is processed, **Then** Almond emits a navigation action **only in response to that turn** and never spontaneously; the grower's manual control of the dashboard is never overridden mid-task (FR4, testable: no `data-navigate` part without a corresponding user turn).

**Given** a screen-reader user, **When** Almond navigates, **Then** the change is announced via an ARIA live region (UX-DR7), and chips are keyboard-navigable with >= 44pt targets (UX-DR1, NFR7).

**Given** `prefers-reduced-motion`, **When** chips render, **Then** Magic UI effects degrade gracefully and the chip stays fully usable (UX-DR1, NFR7).

**Build notes.** FR2, FR4, UX-DR1, UX-DR7, NFR7. Evolves `almond-result.tsx` / `almond-messages.tsx` to render chips; chip click calls `useAlmondNavigation` (Story 7.4). Copy in `/copy/en.ts`. Depends on: 7.4 (the bridge it links back through). No new deps. **Covers:** FR2, FR4.

---

## Epic 8: Almond hands you a spreadsheet (the first artifact and its memory)

The Excel-brained grower's first real artifact. "Give me that as a spreadsheet" produces a CSV and an
`.xlsx` of exactly what they asked for — grounded in real data, complete at 183 rows, with an honest
coverage footer — downloaded immediately to the phone and saved to a per-grower Reports area they can
return to ("the spreadsheet I made last week"). This epic establishes the laws and the machinery every
generation skill depends on: the **uncapped full-data path** (no model-authored cells), the
spreadsheet and bill-due exporters (reusing the pure CSV builder, never re-implementing it), the shared
coverage footer, the owner-only capability gate, and the **Reports persistence unit** (the
`GeneratedReport` model + private Vercel Blob + an owner-scoped download route) that Epic 9 reuses
wholesale.

Cross-cutting laws (every story): exports read the **uncapped full-data loader**, never the row-capped
chat tools (FR8, ADR-A04); the model selects **shape only**, deterministic code authors every value
(FR8, NFR2); money formats through the shared `formatUsd` (tabular, whole-dollar), never hand-formatted
(carried from Tool 1); no silent truncation (NFR8); voice/no-em-dash unchanged (FR20, NFR9); every skill
is stub-answerable (NFR3, AR18).

### Story 8.1: The uncapped, farm-scoped full-data export loader

As a grower,
I want a spreadsheet Almond makes me to contain every one of my meters, not a sample,
So that a file I mark up in Excel or hand to my CPA is actually complete.

**Acceptance Criteria:**

**Given** an export request, **When** data is loaded, **Then** it comes from a dedicated `src/lib/almond/export/load.ts` farm-scoped loader built on the existing dashboard loaders **without** the chat-tool row caps (`listMeters` max 50 / default 25); the loader is the single read path for exports.

**Given** the chat tools, **When** any export runs, **Then** the export **never** reads a chat tool; a test asserts the loader returns all meters for a farm seeded above the chat cap (e.g. > 50) while the chat tool would have capped them (FR8, FR13).

**Given** a farm with partial billing, **When** the loader runs, **Then** it returns the coverage/as-of state alongside the rows (consumed by the footer composer, Story 8.4) and never invents a value for a missing field; absence is represented explicitly (NFR2).

**Given** the resolved `farmId` from `deps`, **When** the loader runs, **Then** it scopes strictly to that farm and accepts no scope argument from a caller (FR7); a db test asserts it never returns another farm's rows.

**Build notes.** AR7, FR8, FR13, ADR-A04. New file `src/lib/almond/export/load.ts` (+ `.test.ts`). Built on existing `loadMetersForFarm` etc. without caps. Pure read path; no writes. Depends on: nothing new (reuses shipped loaders + the 7.2 factory `deps` shape). No new deps. **Covers:** FR8 (the full-data half), foundation for FR13.

### Story 8.2: Spreadsheet builders — CSV reuse adapter and the XLSX path

As a grower,
I want to ask for "my meters as a spreadsheet" and open a clean Excel file I recognize,
So that I can keep working the way I always have, line by line.

**Acceptance Criteria:**

**Given** Almond's data shape (`MeterSummary`/`MeterDetail`), **When** a CSV is built, **Then** an adapter `src/lib/almond/export/rows.ts` maps `MeterSummary[] -> MeterRow[]` and the **existing pure `metersCsv` string-builder is reused** (same escaping, BOM, and coverage-label semantics); no parallel CSV format is introduced (FR10, ADR-A06).

**Given** the same row model, **When** an `.xlsx` is built, **Then** `src/lib/almond/export/xlsx.ts` uses `exceljs` (pure JS) to produce a workbook with plain operator headers (pumps, meters, rates, bills), tabular whole-dollar money via the shared `formatUsd`, and no kW/interval jargon (FR10, FR11).

**Given** a meter with no reconciled billing, **When** exported, **Then** the cell shows the coverage label (the existing `metersCsv` `moneyCell` rule), never a fabricated or zero dollar figure (NFR2).

**Given** a Batth-scale farm (183 meters), **When** the meter-table spreadsheet is generated, **Then** it contains every meter with no silent row cap, generates within the few-seconds target (NFR4), and the generated bytes are asserted by a unit test (NFR3, FR13).

**Given** anything the export bounds, **When** it is generated, **Then** the artifact states what was left out — no silent truncation (NFR8).

**Build notes.** AR8, AR9, FR10, FR11 (meter table), FR13, ADR-A06. New deps: **`exceljs`** (AR1). New files `export/rows.ts`, `export/xlsx.ts` (+ tests). Reuses `src/lib/dashboard/csv.ts` (`metersCsv`) via the adapter — single mapping point, unit-tested. Depends on: 8.1 (the loader feeds the rows). **Covers:** FR10, FR11 (meter table), FR13 (spreadsheet half).

### Story 8.3: The bill-due-schedule exporter (SCHEDULED never shown as billed)

As a grower,
I want to export my bill-due calendar without it pretending a future date is final,
So that a schedule I hand to my lender never overclaims a date that might still shift.

**Acceptance Criteria:**

**Given** a request to export the bill-due schedule, **When** generated, **Then** `src/lib/almond/export/bill-due.ts` produces a serial-code/calendar export of each meter's billing-cycle close, in the same row/money conventions as the meter spreadsheet (FR11).

**Given** a date that is SCHEDULED (a "may shift" close) versus one that is BILLED, **When** exported, **Then** the SCHEDULED date is explicitly **marked scheduled** and never presented as billed (BILLED-vs-SCHEDULED law, AR-14 in Tool 1, ADR-A06); a unit test asserts a scheduled date is never emitted as billed.

**Given** the export, **When** it is generated as CSV or XLSX, **Then** it flows through the same builders (Story 8.2) and the same full-data loader (Story 8.1), inheriting the no-fabrication and no-silent-cap rules.

**Build notes.** AR10, FR11 (bill-due, the second data set v1 leads with), ADR-A06. New file `export/bill-due.ts` (+ test). Reads the serial-code schedule via the existing `greenbutton/schedule.ts` lookup; renders through 8.2's builders. Depends on: 8.1, 8.2. No new deps beyond 8.2's. **Covers:** FR11 (bill-due schedule).

### Story 8.4: The shared coverage / as-of footer composer

As a grower,
I want every file Almond makes me to say plainly how complete the data behind it is,
So that a PDF or spreadsheet I share never quietly overstates what we actually know.

**Acceptance Criteria:**

**Given** any generated artifact, **When** it is built, **Then** `src/lib/almond/export/coverage-footer.ts` reads the reconciliation/coverage state (from the full-data loader, Story 8.1) and stamps an honest **as-of / % complete** footer (FR19).

**Given** a farm whose billing data is partial (e.g. 82% complete), **When** the footer is composed, **Then** it states the partial coverage plainly, in the Almond voice, no em dashes (FR19, FR20, NFR9).

**Given** both artifact types, **When** they are generated, **Then** the **same** footer composer is used by the XLSX builder and (in Epic 9) the PDF composer — one source of coverage honesty, unit-tested.

**Build notes.** AR11, FR19. New file `export/coverage-footer.ts` (+ test). Shared by 8.2 (XLSX) now and 9.2 (PDF) later. Depends on: 8.1 (coverage state). No new deps. **Covers:** FR19 (the composer; applied to spreadsheets here, to PDFs in Epic 9).

### Story 8.5: The `exportSpreadsheet` skill with preview and immediate download

As a grower,
I want to ask Almond for a spreadsheet, see in one line what it's about to make, and get the file right away,
So that I get exactly the cut I asked for and can use it immediately on my phone.

**Acceptance Criteria:**

**Given** a spreadsheet request, **When** the model calls `exportSpreadsheet`, **Then** the skill input (Zod) carries **shape only** — which filter (entity/ranch/rate), which columns, meter-table vs bill-due — and never a `farmId`, a value, or a file path (FR8, FR7).

**Given** a heavier artifact is about to be produced, **When** Almond responds, **Then** it first states the shape in one short line ("I'll export your 14 meters on legacy rates as a spreadsheet") — a lightweight preview, not an approval gate (FR9).

**Given** a clean request, **When** the skill executes, **Then** it reads the uncapped loader (8.1), builds the file via the builders (8.2/8.3) with the coverage footer (8.4), and the bytes are **downloadable immediately** to the device via a `data-report` part the panel renders as a download card (FR14, AR17, UX-DR2).

**Given** an unauthenticated / public Tour caller, **When** the model is assembled, **Then** `exportSpreadsheet` is **not handed to the model at all** (capability-by-omission); the public actor gets read + navigate only and literally cannot invoke an export (FR18, AR15, ADR-A08).

**Given** the offline stub responder, **When** an export turn runs in e2e/CI, **Then** the stub drives the skill deterministically and the test asserts a download card with non-empty bytes appears, zero external calls (NFR3).

**Given** a generation error (bad shape, loader failure), **When** it occurs, **Then** the skill returns a typed failure the panel renders as an inline error; it never throws raw to the client and never emits a partial file (architecture error rule).

**Build notes.** FR8, FR9, FR10, FR11, FR14, FR18, AR15, AR17, AR18, ADR-A08. New file `src/lib/almond/skills/export-spreadsheet.ts`; evolves the route to thread `authedOwner` into `buildAlmondSkills` and the launcher to render the `data-report` download card. Download-only at this point — the "saved to Reports" line is added in Story 8.6. Depends on: 7.2 (factory + capability flag), 8.1-8.4 (loader/builders/footer). **Covers:** FR9, FR14, FR18 (export gate); wires FR10/FR11 end-to-end.

### Story 8.6: Reports persistence — `GeneratedReport`, private Blob, and the owner-scoped download route

As a grower,
I want every spreadsheet Almond makes me kept safely and privately so I can get it again later,
So that I can find "the spreadsheet I made last week" and trust no one else can reach my files.

**Acceptance Criteria:**

**Given** the schema, **When** the migration runs, **Then** an additive `GeneratedReport` Prisma model exists (`id, farmId, createdById?, kind, title, requestText, blobPathname, byteSize, coverageAsOf?, paramsJson, createdAt`), farm-scoped (`@@index([farmId, createdAt])`), `kind` a `String` mirrored by a TS literal union; no existing model is altered destructively (AR13, ADR-A07).

**Given** a successful generation, **When** the artifact is saved, **Then** `src/lib/almond/reports/store.ts` writes the bytes to **private Vercel Blob** under a non-guessable cuid key via `src/lib/storage/blob.ts` (never a public URL) and inserts the `GeneratedReport` row recording what it was, when, and the request that produced it (FR15, FR16).

**Given** a saved report, **When** farm data later changes, **Then** the stored bytes do **not** change (immutability — bytes stored, not regenerated); a future "refresh" would be a new row, never an in-place rewrite (ADR-A07).

**Given** `GET /api/reports/[id]/download`, **When** called, **Then** it loads the `GeneratedReport`, re-checks it belongs to the caller's resolved farm (the `dashboardFarm` / `Farm.userId` law), and streams the Blob bytes (or a short-lived scoped URL); a different farm's id returns 404 and an anonymous caller returns 401 (FR16, AR14); a db test asserts cross-farm access is impossible.

**Given** the `exportSpreadsheet` skill from Story 8.5, **When** it now runs for an authed owner, **Then** it persists via the store and the download card gains a "saved to Reports" line (FR15); the public Tour path still cannot reach the store (no persistence skill handed to it, FR18).

**Build notes.** AR13, AR14, AR1 (**`@vercel/blob`**), AR2 (**`BLOB_READ_WRITE_TOKEN`**), FR15, FR16, ADR-A07, ADR-A08. New files `src/lib/almond/reports/store.ts`, `src/lib/storage/blob.ts`, `src/app/api/reports/[id]/download/route.ts`; `prisma/schema.prisma` gains `GeneratedReport` + `Farm`/`User` relations; migration `almond_generated_report` then `db:generate`. Confirm the exact `@vercel/blob` private-read mechanism (stream-via-route vs short-lived scoped URL) against the installed SDK at build time. Depends on: 8.5 (the skill it persists). **Covers:** FR15, FR16.

### Story 8.7: The Reports area

As a grower,
I want a place in my account that lists everything Almond has made me,
So that I can come back and re-download the spreadsheet I made last week from my phone.

**Acceptance Criteria:**

**Given** the authed owner, **When** they open `(app)/reports`, **Then** a Server Component lists that farm's `GeneratedReport` rows (most recent first) showing what each was (kind + title), when it was made, and the request that produced it (FR15, UX-DR3).

**Given** each listed report, **When** the grower taps it, **Then** it re-downloads via the owner-scoped route from Story 8.6; a report from another farm is never listed and never reachable (FR16).

**Given** no reports yet, **When** the area is opened, **Then** it shows a calm empty state in the Almond voice (no exclamation marks, no em dashes) inviting the grower to ask Almond for their first artifact (FR20, NFR9).

**Given** a phone, **When** the Reports area renders, **Then** it is mobile-first, keyboard-navigable, with adequate tap targets (NFR6, NFR7).

**Build notes.** FR15, FR16, UX-DR3, NFR6, NFR7. New route `src/app/(app)/reports/page.tsx` (Server Component reading Prisma `GeneratedReport` by `farmId`). Copy in `/copy/en.ts`. Depends on: 8.6 (the model + download route). No new deps. **Covers:** FR15 (the grower-facing memory), reinforces FR16.

---

## Epic 9: Almond builds the lender-ready PDF (the shareable proof)

The demo's closer and the artifact that leaves the product. "Make me a PDF of the savings you found
across the whole farm" produces a clean, warm-palette, honestly-captioned PDF — **generative in which
sections it includes and in what order, deterministic in how each section renders real data.** The
library of sections is the bounded, QA-able surface; the model's only freedom is selection. It reuses
Epic 8 wholesale: the uncapped full-data loader, the coverage footer, and the Reports persistence unit.
Epic 8 stands alone without this epic; this epic builds on it.

Cross-cutting laws (every story): no model-authored prose or numbers — sections render grounded data,
the model only selects (FR8, FR12, NFR2); pure-JS rendering, **no headless Chromium** (NFR4, ADR-A05);
generated bytes asserted by tests (NFR3); never a lone screaming hero number, money tabular/whole-dollar
(FR12, hero-not-money-loudest); voice/no-em-dash unchanged (FR20, NFR9).

### Story 9.1: The tested PDF section-template library

As a grower,
I want the PDF Almond makes to look clean and trustworthy and contain only real numbers,
So that I can hand it to my lender without worrying it invented something.

**Acceptance Criteria:**

**Given** the report surface, **When** the section library is built, **Then** `src/lib/almond/report/sections/*` provides a bounded set of `@react-pdf/renderer` section components — farm summary, meter table, mis-rated set, savings, single-meter, and the coverage footer — each rendering **only** grounded data passed in, in the warm palette and plain operator English (FR12, AR12, ADR-A05).

**Given** any section, **When** it renders, **Then** it contains zero model-authored values — every number and label comes from the grounded data argument; money formats through the shared `formatUsd` (tabular, whole-dollar), never a lone screaming hero number (FR8, NFR2, FR12).

**Given** each section, **When** tested, **Then** its rendered output is asserted by a snapshot/byte test over fixed input data (NFR3); a section with missing data renders the coverage label, never a fabricated figure (NFR2).

**Given** the runtime, **When** sections render, **Then** they run under the existing `runtime = "nodejs"` with pure-JS `@react-pdf/renderer` — no Chromium, no Puppeteer (NFR4, ADR-A05, anti-pattern enforced).

**Build notes.** AR12, FR12 (the render half), ADR-A05. New dep: **`@react-pdf/renderer`** (AR1). New files `src/lib/almond/report/sections/{summary,meter-table,mis-rated,savings,single-meter,footer}.tsx` (+ tests). The footer section composes the coverage-footer composer from Story 8.4. Depends on: 8.4 (footer), 8.1 (data shape). **Covers:** FR12 (deterministic rendering).

### Story 9.2: The PDF composer (generative selection over the full-data path)

As a grower,
I want to ask for a PDF of "whatever I need" and get just those parts, readable even for my whole 183-meter farm,
So that the report is shaped to my request but never overwhelming or cut off silently.

**Acceptance Criteria:**

**Given** a selection of sections (which sections, in what order), **When** the composer runs, **Then** `src/lib/almond/report/render.ts` composes exactly those section components over data from the **uncapped full-data loader** (Story 8.1) and stamps the coverage footer (Story 8.4) on every PDF (FR12, FR13, FR19).

**Given** a whole-farm PDF at Batth scale (183 meters), **When** generated, **Then** it stays readable and printable, generates within the ~10s target (NFR4), and is asserted by a byte/snapshot test (NFR3, FR13).

**Given** anything the PDF bounds (page limits, a capped section), **When** generated, **Then** the artifact states what was left out — no silent truncation (NFR8).

**Given** a phone, **When** the PDF is opened, **Then** it reads well and is printable (NFR6).

**Build notes.** FR12 (selection), FR13, FR19, NFR4, NFR6, NFR8. New file `report/render.ts` (+ test). Composes 9.1 sections; reads 8.1 loader; stamps 8.4 footer. Depends on: 9.1, 8.1, 8.4. No new deps beyond 9.1's. **Covers:** FR12 (generative selection), FR13 (PDF half).

### Story 9.3: The `generateReport` skill with preview, save, and download

As a grower,
I want to ask Almond for a PDF, see what it's about to build, and get a file saved to my Reports and downloaded,
So that I walk away with a shareable proof of the savings and can find it again later.

**Acceptance Criteria:**

**Given** a PDF request, **When** the model calls `generateReport`, **Then** the skill input (Zod) carries **section selection only** (which sections, order, which filter/scope) and never a `farmId`, a value, or report prose (FR8, FR7, FR12).

**Given** a heavier artifact, **When** Almond responds, **Then** it first states the shape in one line ("I'll put together a one or two page summary: your farm's totals, the findings, and the dollars on each") before the file appears (FR9).

**Given** a clean request for an authed owner, **When** the skill executes, **Then** it composes the PDF (9.2), persists bytes to private Blob + a `GeneratedReport` row via the **same store from Story 8.6**, emits a `data-report` card, and the file is **downloadable immediately** and **saved to Reports** (FR12, FR14, FR15, UX-DR2).

**Given** an unauthenticated / public Tour caller, **When** the model is assembled, **Then** `generateReport` is **not handed to the model** (capability-by-omission); the public actor cannot generate or save a PDF (FR18, AR15, ADR-A08).

**Given** the offline stub responder, **When** a PDF turn runs in e2e/CI, **Then** the stub drives the skill deterministically and the test asserts a download card with non-empty PDF bytes, zero external calls (NFR3); a generation error returns a typed inline failure, never a partial file.

**Build notes.** FR9, FR12, FR14, FR15, FR18, AR15, AR18, ADR-A08. New file `src/lib/almond/skills/generate-report.ts`; reuses `reports/store.ts` + the download route (8.6) and the `data-report` card (8.5). Depends on: 9.2 (composer), 8.6 (persistence), 7.2 (factory + capability flag). **Covers:** FR12 end-to-end, FR14/FR15/FR18 for the PDF.

---

## Epic 10: Surfacing Almond, gently (discoverability without overbearing)

The grower we serve is non-AI-native, skeptical, and easily put off by a pushy assistant. This epic
makes Almond's powers discoverable for the grower who is ready — a clear rail entry, a calm dismissible
first-run nudge, and action/export-flavored starters — while it stays out of the way of the dashboard
the grower actually came for. It also closes the security gap the generative endpoint opened: the chat
route is now a model-cost and (for owners) a write surface, so abuse protection lands before the Tour is
exposed widely. Sequenced last because it surfaces whatever has shipped; Epics 7-9 stand alone without it.

Cross-cutting laws (every story): gentle and progressive, never blocks/interrupts/nags (FR22); first
run reads calm and optional; voice/no-em-dash unchanged (FR20, NFR9); reduced-motion and keyboard
access on every new surface (NFR7); copy in `/copy/en.ts`.

### Story 10.1: Action and export-flavored starters

As a grower,
I want Almond to suggest the new things it can do for me, like exporting or opening my biggest opportunity,
So that I discover its powers without being told to go learn an AI.

**Acceptance Criteria:**

**Given** an empty or early chat, **When** opened, **Then** the existing grounded starters plumbing is extended with **action and export** prompts drawn from the farm ("export my meters", "make a PDF of my mis-rated pumps", "open my biggest opportunity"), in the Almond voice (FR21, UX-DR6, FR20).

**Given** a public Tour / unauthenticated visitor, **When** starters render, **Then** **export** starters are not shown (they would fail the owner gate); navigation/read starters are shown (AR15, FR18 consistency).

**Given** a starter is tapped, **When** activated, **Then** it drives the matching skill from Epics 7-9 (open / export / generate) and behaves exactly as a typed request would.

**Build notes.** FR21 (the starters part), UX-DR6, AR15. Evolves the `starters` plumbing in `almond-launcher.tsx` and `/copy/en.ts`. Capability-gated by `authedOwner` (threaded in 7.2/8.5). Depends on: the skills exist (7.3 navigate, 8.5 export, 9.3 generate) — backward dependency on prior epics. No new deps. **Covers:** FR21 (starters).

### Story 10.2: Rail entry and the calm first-run nudge

As a grower,
I want a clear but quiet way to find Almond and a gentle first-time hint about what it can do,
So that I notice it when I'm ready and am never nagged when I just want my dashboard.

**Acceptance Criteria:**

**Given** any `(app)` screen, **When** rendered, **Then** Almond has a clear, persistent entry in the OS-shell rail (alongside the existing launcher), discoverable as a path to value (FR21, UX-DR4).

**Given** a grower's first run, **When** onboarding renders, **Then** a **calm, dismissible** nudge appears ("ask Almond to show you your most expensive meter") that never blocks, interrupts, or nags; it reads as optional, and dismissal is remembered so it does not reappear (FR21, FR22, UX-DR5).

**Given** the grower ignores or dismisses the nudge, **When** they continue, **Then** the dashboard is fully usable and Almond stays out of the way; surfacing is progressive — powers reveal as the grower engages, never up front (FR22).

**Given** `prefers-reduced-motion` and keyboard-only use, **When** the rail entry and nudge render, **Then** Magic UI effects degrade gracefully and both are fully operable by keyboard with adequate targets (NFR7, UX-DR8).

**Build notes.** FR21 (rail + nudge), FR22, UX-DR4, UX-DR5, UX-DR8, NFR7. Evolves the OS-shell rail and the onboarding surface; dismissal state persisted (per-user). Copy in `/copy/en.ts`. The exact gentle-surfacing copy is an open product item (PRD Open Q2) to confirm with the non-AI-native first-use constraint front of mind. Depends on: Almond exists (shipped) + Epic 7 (the launcher it surfaces). No new deps. **Covers:** FR21 (rail + nudge), FR22.

### Story 10.3: Abuse and cost protection on the generative endpoint

As Terra,
I want the now-generative Almond endpoint protected from scripted abuse before the public Tour is exposed widely,
So that a scripted caller cannot drive Gateway spend or, if authed, hammer Blob/DB writes.

**Acceptance Criteria:**

**Given** `/api/almond/chat`, **When** hit repeatedly, **Then** per-IP rate-limiting / Vercel BotID throttles abusive volume; legitimate grower use is unaffected (AR16, NFR1).

**Given** generation skills, **When** invoked, **Then** a per-farm generation throttle bounds how many heavy artifacts one farm can produce in a window, protecting Blob/DB write volume and Gateway cost (AR16).

**Given** the public Tour, **When** it is exposed widely, **Then** this protection is in place first (the documented build-time gate); the protection is documented alongside the existing COST/ABUSE note in the route (ADR-A08).

**Build notes.** AR16, NFR1, ADR-A08. Evolves `src/app/api/almond/chat/route.ts` (rate-limit/BotID middleware) + the generation skills (per-farm throttle). Required-before-wide-Tour, not before first authed use. Depends on: the generative skills exist (Epic 8/9). No new product deps (Vercel BotID is platform). **Covers:** the AR16 abuse/cost gate; reinforces FR18.

---

## Validation Results (Step 4)

### 1. FR coverage — PASS

All 22 FRs are covered by at least one story (FR17 is an intentional out-of-v1 boundary with no story,
as the PRD requires). Verified against the FR Coverage Map above:

- N — FR1 → 7.3 (server) + 7.4 (client); FR2 → 7.5; FR3 → 7.3; FR4 → 7.5.
- S — FR5 → 7.2; FR6 → 7.2 (re-asserted 8.5/9.3); FR7 → 7.2 (re-asserted 8.1/8.5/9.3); FR8 → 8.1/8.2/8.5/9.1/9.3; FR9 → 8.5/9.3.
- X — FR10 → 8.2/8.5; FR11 → 8.2/8.3/8.5; FR12 → 9.1/9.2/9.3; FR13 → 8.2 (spreadsheet) + 9.2 (PDF).
- R — FR14 → 8.5/9.3; FR15 → 8.6/8.7/9.3; FR16 → 8.6/8.7; FR17 → boundary (no story, recorded).
- T — FR18 → 7.2/8.5/8.6/9.3/10.1; FR19 → 8.4/9.2; FR20 → cross-cutting AC on every user-facing story.
- D — FR21 → 10.1/10.2; FR22 → 10.2.

NFRs: NFR5 → 7.1; NFR1/NFR2 → 7.2/8.1/8.6/10.3; NFR3 (offline stub) → every skill story (7.2/7.3/7.4/8.5/9.3); NFR4 → 8.2/9.2; NFR6/NFR7/NFR8/NFR9 → cross-cutting. ARs land in the story that needs each.

### 2. Architecture implementation — PASS

- **Starter template:** none. The architecture (ADR-A01) is explicit that this feature **extends the
  shipped Epic-6 Almond in place** — no `create-*` / greenfield init story. Correctly, Epic 7 Story 1
  is the surface-registry foundation (a real prerequisite), not a project-scaffold story. The
  brownfield "init" work (three deps, the migration, the registry) is distributed to the first story
  that needs each, not front-loaded.
- **Database/entity creation only-when-needed:** the single new model, `GeneratedReport`, is created
  in **Story 8.6** — the first story that persists an artifact — not upfront. New deps land likewise:
  `exceljs` in 8.2, `@vercel/blob` in 8.6, `@react-pdf/renderer` in 9.1. No "install everything / create
  all tables" story exists.

### 3. Story quality — PASS

Every story is sized for a single dev-agent session, uses the As-a/I-want/So-that format, has
Given/When/Then acceptance criteria including edge/error cases (ambiguity, missing data, public-Tour
gate, generation failure, reduced-motion), references the FRs/ARs/ADRs it implements, and carries a
**Build notes** block naming the exact files, dependencies, and prior-story dependencies — so the
Developer agent has the implementation context inline.

### 4. Epic structure — PASS (file-overlap considered and accepted)

Epics are organized by **user value** (drive the screen / spreadsheet / PDF / surfacing), not technical
layers, and match the architecture's validated implementation sequence and PRD §7.3.

**File-churn check.** Two central files are touched across epics: `almond-launcher.tsx`
(7.4 nav effect, 8.5 download card, 10.1 starters, 10.2 rail) and `api/almond/chat/route.ts` (7.4
data-navigate, 8.5 authedOwner threading, 10.3 rate-limit). This overlap was assessed and **accepted,
not consolidated**: each touch is additive and lands with its own user-value increment behind a genuine
feedback boundary (validate navigation before building export before surfacing); collapsing them into a
single "launcher/route" epic would recreate the no-user-value technical-layer anti-pattern the method
forbids. The shared files accrete additively; no epic rewrites another epic's work on them. `tools.ts`
(factory) and `reports/store.ts` are extended/reused, not re-modified.

### 5. Dependency validation — PASS

- **Epic independence:** Epic 7 is standalone. Epic 8 builds on Epic 7's factory (7.2) and delivers
  complete spreadsheet value without Epic 9 or 10. Epic 9 builds on Epic 8's loader/footer/persistence
  and delivers the PDF without Epic 10. Epic 10 surfaces whatever shipped. **No epic requires a later
  epic.**
- **Within-epic story flow (backward-only, verified):** 7.1→7.2→7.3→7.4→7.5; 8.1→8.2→8.3→8.4→8.5→8.6→8.7;
  9.1→9.2→9.3; 10.1→10.2→10.3. Each story builds only on previous stories (and earlier epics); no story
  references a feature implemented in a later story. The one subtlety — Story 7.3 emits a
  `NavigateAction` that Story 7.4 consumes — is a backward dependency (7.4 on 7.3), and 7.3 is fully
  unit-testable alone, so it is not a forward dependency.

### Readiness

**Status: READY for development.** All 22 FRs covered, NFRs mapped, no starter-template or
create-all-tables anti-pattern, stories single-agent-sized with inline build context, epics
user-value-organized and dependency-clean. Open items are not blockers to writing stories: the product
**farmer-validation gate** (PRD Open Q4 / D14) gates *starting* the heavy build; numeric
activation/latency targets and the exact gentle-surfacing copy (Story 10.2) are to be set with the team.

**Suggested next BMAD step:** `bmad-check-implementation-readiness` (validate PRD + architecture + these
epics align), then `bmad-sprint-planning` to sequence the 18 stories, then the
`bmad-create-story` → `bmad-dev-story` → `bmad-code-review` cycle per story.
