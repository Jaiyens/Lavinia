---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Almond-2026-06-17/prd.md
  - _bmad-output/planning-artifacts/prds/prd-Almond-2026-06-17/addendum.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/project-context.md
  - "Live Epic-6 code: src/app/api/almond/chat/route.ts, src/lib/almond/{responder,tools}.ts, src/app/(app)/_components/almond/*, src/lib/dashboard/{lens,csv}.ts, src/lib/ai/gateway.ts, prisma/schema.prisma (read 2026-06-17)"
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-06-17'
project_name: 'Terra'
feature: 'Almond — Terra''s Generative Operator'
builds_on: '_bmad-output/planning-artifacts/architecture.md (Tool 1 energy dashboard)'
user_name: 'Jaiyen'
date: '2026-06-17'
---

# Architecture Decision Document — Almond, Terra's Generative Operator

_This is an **extension** architecture. It builds on the Tool 1 energy-dashboard architecture
([../../planning-artifacts/architecture.md](../../planning-artifacts/architecture.md)) and the
Almond PRD + addendum, and does not restate the locked stack. It covers only the surfaces this
feature introduces: the skill framework, the server→client navigation bridge, deterministic
artifact generation, the Reports area, and the surfacing of Almond. On any conflict,
`project-context.md` wins, then the Tool 1 architecture, then this document for the new surfaces._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements (22 FRs, six clusters):**

- **Cluster N — Navigation skills (FR1–FR4).** Almond drives the dashboard by setting the app's
  existing canonical URL state (`meter`, `lens`, `entity`, `ranch`, `rate`); every navigation is
  recorded as an **action chip** that links back to the view; plain-language references resolve to
  real entities with a **defined ambiguity trigger** (≥2 matches → ask, never auto-open); Almond
  drives the screen **only on request**, never hijacks it. The *surfaces* are reused; the
  **server→client dispatch is net-new** and is this feature's center of gravity.
- **Cluster S — The skill framework (FR5–FR9).** Capabilities are discrete, named, model-selected
  **skills**, extensible without reworking the core. Every skill is **read-only on data**,
  **farm-scoped by inheritance** (no `farmId` from model/client), and **grounded** (content only
  from tools/loaders). Heavier artifacts get a **one-line "what I'm about to make" preview** (not
  an approval gate).
- **Cluster X — Export skills (FR10–FR13).** A **spreadsheet** skill (CSV + XLSX), **request-driven**
  in shape; a **PDF report** skill, **generative in selection, deterministic in rendering** over a
  library of tested section templates. Correct and legible at **Batth scale (183 meters)** with
  **no silent truncation**. v1 leads with the data growers trust (meter table, bill-due schedule);
  findings/recs export deferred (Open Q4).
- **Cluster R — Delivery & Reports (FR14–FR17).** Immediate **download** (phone-first); a per-grower
  **Reports area**, persisted and re-downloadable, recording what/when/the request; **farm-scoped &
  private**, non-guessable access. **Email is explicitly out of v1.**
- **Cluster T — Trust, grounding, safety (FR18–FR20).** Almond inherits **auth + farm scope**;
  **generate/save additionally require an authenticated farm-owner** (the public Tour gets read +
  navigate only); every artifact carries an **honest coverage/as-of footer**; **voice/persona
  unchanged** (no exclamation marks, no jargon, no em dashes).
- **Cluster D — Discoverability/surfacing (FR21–FR22).** A clear rail entry, a first-run onboarding
  nudge, and action/export starters — **gentle and progressive, never overbearing** for a
  non-AI-native grower.

**Non-Functional Requirements (the bars that govern every skill):**

- **Security & isolation.** Farm-scoping is **structural** (factory closes over the resolved
  `farmId`; no scope from model/client). Reports + stored files are farm-private with
  **non-guessable, scoped/expiring** access; no grower credentials ever touch the artifact path.
- **Grounding integrity.** Fabrication rate ≈ 0: artifacts and answers are tool-sourced; **no
  model-authored cell values, numbers, or report prose**. Absence is stated, never filled.
- **Determinism & testability.** Model boundary stays **injected** (offline stub default, Gateway
  when keyed); dev/CI make **zero external calls**. Export shaping is pure + unit-tested; generated
  **bytes are verified by tests**; navigation actions are deterministic.
- **Performance (felt requirement; numbers TBD).** Navigation feels instant (no reload). Meter
  spreadsheet in a few seconds; whole-farm PDF ≤ ~10s. Generation is **serverless-safe** (pure-JS,
  no headless Chromium).
- **Stays native to a changing dashboard.** A single **canonical surface registry** is the one
  place both the dashboard and Almond read selectable surfaces from; Almond never offers a surface
  that no longer exists.
- **Mobile-first; accessibility & motion.** Download, Reports, and PDFs work and read on a phone;
  PDFs printable. Action chips/previews/Reports keyboard-navigable; streamed actions announce via a
  live region; Magic UI degrades under `prefers-reduced-motion`.
- **Voice & localization.** All user-facing copy in `/copy`, localization-ready, plain operator
  English, **no em dashes**.

### Scale & Complexity

- **Primary domain:** an additive feature on a server-heavy Next.js (App Router) app — a server-side
  AI tool-calling loop plus deterministic file generation, fronted by an existing client chat panel.
- **Complexity level:** moderate, with two genuinely hard, net-new seams: (1) the **server→client
  navigation bridge** (a server tool cannot call client `useQueryState`), and (2) the
  **no-model-authored-cells generation law** (deterministic assembly over a dedicated full-data
  path). Everything else is composition over a shipped, well-factored Epic-6 base.
- **Volume:** structurally modest. One farm at a time; the heaviest artifact is a 183-row
  spreadsheet or a whole-farm PDF — comfortably inside Vercel's Node/Fluid-Compute limits.
- **Brownfield reality (verified against the repo 2026-06-17):** Epic-6 Almond already ships the
  injected model boundary, the farm-scoped tool factory, and the `streamText`→`useChat` spine. This
  feature **extends** it; it scaffolds nothing from scratch.

### Technical Constraints & Dependencies (verified)

- **Stack is locked** by `project-context.md` + Tool 1 architecture: Next.js 16.2.7 (App Router,
  Turbopack, npm), React 19, TypeScript strict + `noUncheckedIndexedAccess` + no-`any`, Prisma 6,
  Tailwind v4 (CSS-variable tokens), Vitest (node) + Playwright, Auth.js v5 (Google + magic link).
  **DB is Neon Postgres** (the project-context note still reads SQLite; CLAUDE.md + the Postgres
  migration supersede it — this feature assumes Postgres/Neon).
- **Already installed (verified):** `ai ^6.0.198`, `@ai-sdk/react ^3.0.201`, `zod ^4.4.3`,
  `nuqs ^2.8.9`, `@prisma/client ^6.19.3`, `next 16.2.7`.
- **NOT installed — genuinely net-new deps:** `@vercel/blob`, `exceljs`, `@react-pdf/renderer`.
  (`pptxgenjs` is a future-skill dep, out of v1.)
- **Model boundary:** `src/lib/ai/gateway.ts` — default `anthropic/claude-opus-4-8`, key
  `AI_GATEWAY_API_KEY ?? VERCEL_AI_SDK_API_KEY`; **stub-by-default** keeps dev/CI offline.
- **Route runtime is already `nodejs`** ([route.ts](../../../src/app/api/almond/chat/route.ts)),
  which is required — `exceljs`, `@react-pdf/renderer`, and `@vercel/blob` need Node, not edge.
- **The URL-state keys are bare string literals duplicated across ~9 client components** (verified:
  `lens-toggle`, `lens-region`, `kpi-strip`, `chart-lens`, `calendar-lens`, `filter-bar`,
  `meter-table`, `meter-drawer`, `finding-card`); only the lens *values* are centralized
  ([lens.ts](../../../src/lib/dashboard/lens.ts)). The canonical surface registry is net-new.
- **`metersCsv` consumes `MeterRow`** (from `dashboard/table.ts`), **not** Almond's tool shapes
  (`MeterSummary`/`MeterDetail` in `almond/shape.ts`) — reuse needs an adapter, not a direct call.
- **Chat tools cap rows** (`listMeters` max 50 / default 25) — exports must read a **separate
  uncapped, farm-scoped path**, never the chat tools.

### Cross-Cutting Concerns Identified

- **The grounding/no-fabrication law** propagating through every new skill (the chat caps must
  never feed exports; the model selects shape, code authors every value).
- **Farm-scoping by inheritance** — extended from read tools to action/generation skills via the
  same factory; cross-farm action stays a structural impossibility.
- **The demo/Tour boundary** — navigation + read are safe to expose publicly; **persistence (Blob
  writes, DB rows) and saved Reports require an authenticated owner**.
- **Coverage/as-of honesty** carried onto every artifact (reuse reconciliation/coverage), so a
  lender-shared PDF never overclaims; the **BILLED-vs-SCHEDULED law** must hold in any bill-due
  export (a "may shift" scheduled date marked as scheduled).
- **The single-source surface registry** so Almond's reach can never drift out of sync with a
  constantly-changing dashboard.
- **Determinism for offline CI** — every new skill must be exercisable by the stub responder.
- **Voice/persona/copy law** unchanged across action chips, previews, and generated copy.
- **The Vercel runtime-fixture trap** — inherited; any new runtime-read fixture uses `process.cwd()`
  and `outputFileTracingIncludes`.

### Resolved Architectural Forks (decided with Jaiyen, 2026-06-17)

1. **Server→client navigation transport → a typed transient data part on the UI-message stream**
   (the model calls a `navigate` tool; the server writes `data-navigate`; the client applies the
   nuqs setters and renders the chip). Reuses the `createUIMessageStream` writer the stub already
   uses. See ADR-A02.
2. **PDF engine → `@react-pdf/renderer`** — sections as React components map cleanly onto FR12's
   "composable, tested section templates" and snapshot well. See ADR-A05.
3. **Working mode → draft-then-review** — the addendum pre-decided most choices; this document
   ratifies them and resolves the open forks with recommendations for redline.

**Open (build-time, not architectural):** farmer validation (PRD Open Q4 / D14) gates *starting*
the heavy build; numeric targets for activation + latency; exact gentle-surfacing copy.

## Brownfield Foundation Evaluation

### Decision: extend Epic-6 Almond in place — no new agent, service, or framework

Almond already exists as a farm-scoped, read-only, AI-SDK-v6 tool-calling chat with an injected
model boundary. The PRD is explicit that the **grounding, scoping, voice, and injected-boundary
core do not change** — only two new capability classes are added. Standing up a new agent runtime,
a separate service, or a different framework would discard a working, tested base and re-derive its
hardest-won properties (offline determinism, structural farm-scoping). The existing Almond IS the
foundation.

### What exists (reuse — verified) vs. what's net-new (build)

| Need | Genuinely reused | Net-new (build this) |
|---|---|---|
| Model boundary | `gateway.ts` (Opus 4.8, stub default), `responder.ts` `streamText` loop | new skills exercisable by the stub |
| Tool/skill layer | farm-scoped factory closed over `{prisma, farmId, farmName}` ([tools.ts](../../../src/lib/almond/tools.ts)) | action + generation **skills** alongside the 6 read tools |
| Open meter / filter / switch lens | the dashboard **surfaces** (`?meter=` drawer, `lens` toggle, `entity/ranch/rate` filters) | **server→client action bridge**; **canonical surface registry** |
| Spreadsheet | the pure `metersCsv` string-builder ([csv.ts](../../../src/lib/dashboard/csv.ts)) | server-side generation, `.xlsx` (`exceljs`), the **bill-due-schedule exporter**, an **adapter** from Almond shapes → `MeterRow`, the **full-data (uncapped) loader**, Blob delivery |
| PDF | the palette/voice/format conventions | the composable-section render pipeline (`@react-pdf/renderer`) |
| Reports area | owner-scoping law (`dashboardFarm`, `Farm.userId`) | `GeneratedReport` model, Vercel Blob wiring, the Reports UI + scoped download route |
| Coverage honesty | reconciliation/coverage (Story 1-7) → FR19 footers | the footer composer (shared by XLSX + PDF) |
| Surfacing | the launcher + starters plumbing ([almond-launcher.tsx](../../../src/app/(app)/_components/almond/almond-launcher.tsx)) | action/export starters; first-run nudge; rail entry |

### Initialization note

No `create-*` step. The brownfield "init story" is **adding the three deps** (`@vercel/blob`,
`exceljs`, `@react-pdf/renderer`), the **`GeneratedReport` migration**, and the **surface registry**,
then layering skills onto the existing responder. No churn beyond what the feature requires.

## Core Architectural Decisions

_Versions verified 2026-06-17: AI SDK v6 (`ai ^6.0.198`) data-parts + tool-calling; `@vercel/blob`
(private access, scoped URLs); `exceljs` (pure JS); `@react-pdf/renderer` (pure JS, no Chromium)._

### Decision Priority Analysis

**Critical (block implementation):**
- The **server→client navigation bridge** (typed data part) and the **canonical surface registry**
  it reads (FR1–FR4, the "stays native" NFR).
- The **skill framework shape** — skills as AI-SDK tools built by the same farm-scoped factory, with
  the read-only/grounded/scoped contract (FR5–FR9).
- The **`GeneratedReport` model + Blob storage** decision and the **owner/demo gate** (FR15–FR18).
- The **full-data export path** + the **no-model-authored-cells** assembly law (FR8, FR13).

**Important (shape architecture):**
- PDF engine (`@react-pdf/renderer`) and the section-template library (FR12).
- XLSX (`exceljs`) + the `metersCsv` reuse adapter + the bill-due-schedule exporter (FR10–FR11).
- The download route + immediate-download path (FR14); the coverage-footer composer (FR19).
- Rate-limiting / abuse protection on the now-also-generative public endpoint.

**Deferred (post-v1):**
- Email/outbound delivery (Resend exists; future skill); PPTX (`pptxgenjs`); scheduled/background
  agents; findings/recs export (Open Q4); a "refresh this report" re-generation action.

### The Skill Framework (FR5–FR9)

**Skills are AI-SDK tools, selected by the same `streamText` tool-calling loop.** A new module
`src/lib/almond/skills/` holds each skill as a pure executor plus an AI-SDK `tool()` wrapper, built
by an **extended factory** that closes over the same `deps` (`{prisma, farmId, farmName}`) plus an
**`actor` capability flag** (`{ authedOwner: boolean }`). `buildAlmondTools(deps)` becomes
`buildAlmondSkills(deps, actor)` and returns the 6 existing read tools **plus**:

- `navigate` — always available (read-safe); validates a requested surface against the registry and
  emits the navigation action (see next section).
- `exportSpreadsheet`, `generateReport` — **only included when `actor.authedOwner` is true.** The
  public Tour path (no session) gets read + `navigate` only; the model literally cannot call a
  persistence skill it was not handed.

**Contract enforced by construction (FR6–FR8):**
- **Read-only on data:** no skill writes a Finding, rate, meter, or anything utility-side. The only
  writes any skill performs are to `GeneratedReport` + Blob (artifact persistence), never to farm
  data.
- **Farm-scoped by inheritance:** a skill never accepts a `farmId` or any scope argument from the
  model; scope comes only from `deps`. (Mirrors the Story-6.1 owner-scoping law.)
- **Grounded, full-data:** generation skills read a **dedicated uncapped export loader**
  (`src/lib/almond/export/load.ts`), never the row-capped chat tools. The model's input schema
  selects **shape only** (which columns/sections, which filter); it never carries a value.
- **Preview (FR9):** the system prompt instructs Almond to state the one-line shape before a heavy
  artifact; this is prompt-level, not a code gate (nothing destructive to approve).

Skill execution logic stays **pure and unit-tested** (mirroring `almond/shape.ts`); the route only
wires. New skills must be answerable by the **stub responder** so CI stays offline.

### Navigation — the server→client bridge (FR1–FR4) [the hard part]

A server-side tool cannot call client `useQueryState`. The bridge:

1. The model calls the `navigate` skill with a **structured, registry-validated** request, e.g.
   `{ open: "meter", query }` or `{ lens, filters: { entity?, ranch?, rate? } }`. The skill resolves
   plain-language references via the existing grounded resolver (`resolveMeterQuery`) and the
   registry, applying the **ambiguity rule** (≥2 matches or none → it returns a clarify/none result
   and emits **no** navigation; testable: a ≥2-match request never auto-navigates — FR3).
2. On a clean resolve, the server **writes a typed transient data part** onto the UI-message stream
   via the `createUIMessageStream` writer:
   `writer.write({ type: "data-navigate", data: NavigateAction, transient: true })`. The action is a
   closed, typed shape (`NavigateAction`) covering only the canonical keys.
3. The already-mounted client (`AlmondLauncher`, under the `nuqs` adapter) **reads `data-navigate`
   parts** and applies them through a small client hook `useAlmondNavigation()` that itself holds
   `useQueryState` setters for all five canonical keys. Setting a key updates the URL; the existing
   dashboard components react exactly as they do to a manual click — **no parallel navigation UI**.
   Each action is applied **exactly once** (deduped by part id).
4. The action is also rendered as an **action chip** (FR2) in the conversation (extending
   `almond-result.tsx`), and the chip is a link that re-applies the same `NavigateAction` (undo =
   browser back, since nothing mutates — FR4 holds because Almond emits a navigate action **only in
   response to a turn**, never spontaneously).

This keeps the model's output declarative ("open this named surface"), keeps validation server-side
against the registry, and rides the stream Almond already uses. See ADR-A02.

**Canonical surface registry (the "stays native" NFR).** A net-new
`src/lib/dashboard/surface.ts` is the single source of truth for the closed key set
(`lens | entity | ranch | rate | meter`), each key's parser/validator, and (composing the existing
`lens.ts`) which lenses are available. Both the dashboard's `useQueryState` call-sites and Almond's
`navigate` skill read key names + parsers from it, so retiring a key or lens updates Almond's reach
in **one place**. The ~9 duplicated string-literal call-sites are refactored to import their key
name from the registry (a mechanical, same-epic sweep — see ADR-A03). Almond can never offer a
surface the registry does not list.

### Generation — deterministic assembly + the full-data path (FR8, FR10–FR13)

**The no-model-authored-cells law.** The model chooses the artifact's **shape** (a typed selection:
filter + columns/sections + scope); deterministic code pulls the **full grounded dataset** and
renders it. There are zero model-written numbers or prose in any file a grower shares.

- **Full-data loader:** `src/lib/almond/export/load.ts` — uncapped, farm-scoped loaders (built on
  the existing `loadMetersForFarm` etc. **without** the chat-tool caps). This is the single read
  path for exports.
- **Spreadsheet (FR10–FR11):**
  - **CSV:** reuse `metersCsv` via an **adapter** `MeterSummary[] → MeterRow[]`
    (`src/lib/almond/export/rows.ts`); do **not** re-implement a parallel CSV format.
  - **XLSX:** `exceljs` (pure JS), same row model, tabular money / whole-dollar / plain headers.
  - **Bill-due schedule exporter (net-new):** a calendar/serial-code export that **marks scheduled
    dates as scheduled** (BILLED-vs-SCHEDULED law, AR-14) so a lender PDF never presents a "may
    shift" date as billed.
- **PDF (FR12):** `@react-pdf/renderer`, **generative in selection, deterministic in rendering** —
  a **library of tested section components** (`src/lib/almond/report/sections/*`: farm summary,
  meter table, mis-rated set, savings, single-meter, coverage footer), each rendering real data in
  the warm palette / plain operator English. The model picks **which sections and order**; the
  library is the bounded, QA-able surface. **Generated bytes are snapshot-/assertion-tested.**
- **Honest limits (FR13):** no silent row caps; if anything is bounded, the artifact states what was
  left out. A 183-row spreadsheet is complete; a whole-farm PDF stays readable and printable.
- **Coverage footer (FR19):** one shared composer reads the reconciliation/coverage state and stamps
  an **as-of / % complete** footer onto every XLSX and PDF.

### Data Architecture — the Reports model (FR15–FR16)

**`GeneratedReport` row in Neon/Prisma + bytes in private Vercel Blob** (immutable saved reports).
Additive Prisma model:

```prisma
model GeneratedReport {
  id           String   @id @default(cuid())
  farmId       String                       // the single scoping root (never from client/model)
  createdById  String?                      // the authed owner who generated it (audit)
  kind         String                       // "spreadsheet_csv" | "spreadsheet_xlsx" | "pdf_report"
  title        String                       // plain operator English, derived from the request
  requestText  String                       // the grower's request that produced it (FR15)
  blobPathname String                       // private Blob object key (NOT a public URL)
  byteSize     Int
  coverageAsOf DateTime?                     // snapshot of coverage honesty at generation (FR19)
  paramsJson   Json                         // the typed selection shape (auditable, reproducible)
  createdAt    DateTime @default(now())

  farm      Farm  @relation(fields: [farmId], references: [id], onDelete: Cascade)
  createdBy User? @relation(fields: [createdById], references: [id], onDelete: SetNull)

  @@index([farmId, createdAt])
}
```

- **Bytes are stored, not regenerated** (immutability: a saved report a grower already shared must
  not silently change as farm data changes — regenerate-on-download rejected, see ADR-A07).
- **Blob is private**, key is **non-guessable** (cuid path), and is **never** exposed as a public
  URL. Access is owner-scoped through a server route (below).
- Union-like `kind` is a `String` mirrored by a TS literal union (project-context v6/SQLite rule,
  carried forward on Postgres for consistency).

### Authentication & Security (FR16, FR18; NFR security)

- **Auth inherited** from Auth.js v5; the route already resolves the actor (`sessionUserId` →
  `dashboardFarm`, else `demoFarm` for the public Tour).
- **Two-tier capability gate:** read + `navigate` are public-safe (the Tour); **`exportSpreadsheet`,
  `generateReport`, and any Blob/DB write require `actor.authedOwner`.** Enforced by *not handing the
  model the persistence skills* when there is no session — defense by construction, not a runtime
  `if` the model could route around.
- **Download route is owner-scoped:** `GET /api/reports/[id]/download` loads the `GeneratedReport`,
  re-checks it belongs to the caller's resolved farm (the same `dashboardFarm`/`Farm.userId` law),
  then streams the bytes from Blob (or issues a short-lived scoped Blob URL). A different grower's id
  → 404; an anonymous caller → 401. Stored-file access is never guessable and never public.
- **Abuse/cost protection (raised by this feature):** the chat route is already a public AI endpoint;
  adding generation makes a scripted caller able to drive Gateway spend **and** (if authed) Blob
  writes. Add per-IP rate-limiting / Vercel BotID on `/api/almond/chat`, and a per-farm
  generation throttle. (Documented as required-before-wide-Tour, consistent with the existing
  COST/ABUSE note in the route.)
- **Credentials/secrets:** unchanged — `AI_GATEWAY_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `AUTH_*` via
  Vercel env, never committed; no grower credential ever touches the artifact path.

### API & Communication Patterns

- **One streaming endpoint** (`/api/almond/chat`, `runtime = "nodejs"`) carries text, tool calls,
  the **`data-navigate`** part, and a **`data-report`** part (the download/action card the client
  renders after a generation skill persists an artifact). No second channel (the dedicated-channel
  option was rejected — ADR-A02).
- **One route handler for download** (`/api/reports/[id]/download`) — owner-scoped, streams Blob.
- **Reads are Server Components; the Reports list is a Server Component** reading Prisma
  (`GeneratedReport` by `farmId`). Mutations (the artifact writes) happen **inside skill executors
  on the server**, returning a typed result the stream surfaces; no client-exposed mutation API.
- **Errors:** a skill failure (generation error, Blob write fail) returns a typed failure the panel
  renders as an inline error (mirroring the route's existing clean-500 pattern); it never throws raw
  to the client or fabricates a partial file.

### Frontend Architecture

- **The launcher gains a navigation effect + a capability prop.** `AlmondLauncher` already owns
  `useChat`; it adds `useAlmondNavigation()` (applies `data-navigate` parts) and receives whether the
  actor is an authed owner (to gate the export starters and the generate affordance in copy).
- **Action chips + report cards** render in the conversation (extend `almond-result.tsx` /
  `almond-messages.tsx`): a chip for navigation (links back), a card for a generated artifact
  (title, kind, coverage note, **Download** + "saved to Reports").
- **Reports area:** a new `(app)/reports` route — a Server Component list of the farm's
  `GeneratedReport` rows (what/when/request), each with an owner-scoped download link. Mobile-first;
  keyboard-navigable.
- **Surfacing (FR21–FR22):** a rail entry for Almond; a **calm, dismissible** first-run nudge in
  onboarding; action/export starters added to the existing `starters` plumbing. **Gentle and
  progressive** — never blocks, interrupts, or nags; copy lives in `/copy/en.ts`.
- **Voice/motion:** persona unchanged; Magic UI effects on chips/cards honor
  `prefers-reduced-motion`; streamed actions/answers announce via a live region.

### Infrastructure & Deployment

- **Vercel (Node runtime, Fluid Compute, 300s ceiling).** Generation runs inside the skill executor
  on the chat request; whole-farm PDF (~10s target) is well within limits — no separate job queue
  in v1.
- **New deps:** `@vercel/blob`, `exceljs`, `@react-pdf/renderer` (all pure JS; **no Chromium** — the
  serverless bundle/cold-start tax is explicitly avoided, ADR-A05/addendum).
- **Env:** add `BLOB_READ_WRITE_TOKEN`; reuse `AI_GATEWAY_API_KEY`/`AUTH_*`. All via Vercel env.
- **Fixtures:** generation reads DB, not fixtures, so the Vercel `outputFileTracingIncludes` trap
  applies only if a new runtime-read fixture is added (none required for v1).
- **CI:** Vitest pure (export shaping, section render bytes, navigation action building, registry) +
  db (`GeneratedReport` scoping, download owner-gate) + Playwright e2e (ask → navigate → export,
  driven by the **stub** so it stays offline).

### Decision Impact Analysis

**Implementation sequence (matches PRD §7.3, gated behind farmer validation / D14):**
1. **Surface registry** + refactor the nuqs call-sites (unblocks navigation; low-risk mechanical
   sweep first).
2. **Navigation bridge** — `navigate` skill + `data-navigate` part + `useAlmondNavigation` + action
   chip. (Highest "wow"; the net-new hard piece.)
3. **Full-data loader + spreadsheet skill** (CSV reuse-adapter + XLSX) + download path.
4. **`GeneratedReport` migration + Blob wiring + Reports area** (the persistence + shareable proof).
5. **PDF report skill** (`@react-pdf/renderer` section library + coverage footer).
6. **Surfacing** (rail entry, gentle nudge, action/export starters) + rate-limiting before wide Tour.

**Cross-component dependencies:**
- The surface registry is read by both the dashboard and the `navigate` skill — change keys in one
  place.
- The full-data loader feeds both spreadsheet and PDF skills — the single grounded export read.
- `GeneratedReport` + Blob + the download route form one persistence unit landing in the same Prisma
  migration discipline (`db:migrate` → `db:generate`).
- The capability flag (`authedOwner`) threads route → factory → skills → starters/UI copy.

## Implementation Patterns & Consistency Rules

_These **extend** `project-context.md` and the Tool 1 architecture; they do not restate them. On
conflict: project-context wins, then Tool 1 architecture, then this section for the new surfaces._

### The skill contract (highest-conflict surface)

- **A skill is built by the factory, never takes scope from the model.** `farmId` lives in `deps`;
  a skill input schema (Zod) carries **shape only** (filter, columns, sections), never a value, a
  `farmId`, or a file path.
- **Read-only on data.** The only persistence a skill may do is write a `GeneratedReport` + its Blob
  object. No skill mutates a Finding, rate, meter, account, or anything utility-side.
- **Grounded, full-data for exports.** Export skills read `almond/export/load.ts` (uncapped), never
  the row-capped chat tools. A value that is not grounded is stated as unknown, never invented.
- **Every skill is stub-answerable.** New skills work under the offline stub responder so CI/e2e make
  zero external calls.
- **Generation skills, on success, persist then surface.** They write the artifact, insert the row,
  and emit a `data-report` part; they return a typed result, never throw raw to the client.

### Navigation actions & the surface registry

- **`NavigateAction` is a closed, typed shape** over only `lens | entity | ranch | rate | meter`.
  The `navigate` skill validates against `src/lib/dashboard/surface.ts`; an unknown surface is
  refused, never emitted.
- **The ambiguity rule is law:** ≥2 matches (or none) → clarify/none, **no navigation emitted**.
  A request matching ≥2 meters never auto-navigates (FR3, testable).
- **No new query-param names.** Every navigation reads/writes the canonical keys via the registry;
  no component or skill invents its own param.
- **Apply each action once** (dedupe by data-part id); navigation is non-destructive (undo = back).

### Money, numbers, coverage (carried from Tool 1)

- **Billed dollars are integer cents; money formats through the shared formatter** (`formatUsd`,
  tabular figures) in CSV/XLSX/PDF alike. Never hand-format money in a section or a cell.
- **Never render a fabricated/zero number** where billing is missing — export the coverage label
  (the existing `metersCsv` `moneyCell` rule), and stamp the **coverage/as-of footer** on every
  artifact.
- **BILLED vs SCHEDULED** stays distinct in any bill-due export: a scheduled "may shift" date is
  labeled scheduled, never presented as billed.

### Persistence & access

- **Reports are immutable once saved** (store bytes, not a spec). A future "refresh" is a *new* row,
  not an in-place rewrite.
- **Blob is private; access is owner-scoped through the download route.** No public URL, no guessable
  key. The DB row and the file both inherit the `farmId` scope.

### Voice, copy, accessibility

- **Persona unchanged** across chips, previews, generated copy: the almond character, plain operator
  English, **no exclamation marks, no kW/tariff jargon, no em dashes**. All user-facing strings in
  `/copy/en.ts`.
- **Surfacing is gentle:** never blocks/nags; first-run nudge is dismissible; degrade under
  `prefers-reduced-motion`; chips/cards/Reports are keyboard-navigable with ≥44pt targets; streamed
  actions announce via a live region.

### Enforcement

**All agents MUST:**
- Build skills through the factory; never accept `farmId`/scope from the model; read the uncapped
  export loader for artifacts.
- Validate every navigation against the surface registry; honor the ambiguity rule; use only the
  canonical keys.
- Gate generate/save behind `authedOwner`; serve downloads only through the owner-scoped route.
- Stamp the coverage footer; format money through the shared formatter; keep copy in `/copy`.
- Ship new skill logic + section templates with colocated tests; assert generated bytes.

**Anti-patterns (do not):**
- Let the model author a cell value, a number, or report prose; feed the row-capped chat tools into
  an export; or silently truncate an artifact.
- Add a parallel navigation UI, a new query-param name, or a hardcoded route/surface outside the
  registry.
- Expose a public Blob URL, a guessable file path, or a download not re-checked for owner scope.
- Hand the persistence skills to the public Tour actor; reach a write skill without `authedOwner`.
- Reach for headless Chromium / Puppeteer for PDF.

## Project Structure & Boundaries

### Almond-relevant additions/changes (the base tree is in the Tool 1 architecture)

_Legend: (existing) keep · (evolves) reshaped · **(new)** added by Almond._

```
src/
├── app/
│   ├── api/
│   │   ├── almond/chat/route.ts        (evolves: actor capability flag → buildAlmondSkills)
│   │   └── reports/[id]/download/route.ts          (new: owner-scoped Blob stream)
│   └── (app)/
│       ├── reports/page.tsx                        (new: per-farm Reports list, Server Component)
│       └── _components/almond/
│           ├── almond-launcher.tsx     (evolves: useAlmondNavigation + authedOwner prop)
│           ├── almond-result.tsx       (evolves: action chips + report download cards)
│           ├── almond-messages.tsx     (evolves: render data-navigate chips / data-report cards)
│           └── use-almond-navigation.ts            (new: applies data-navigate via nuqs setters)
├── lib/
│   ├── dashboard/
│   │   ├── surface.ts                              (new: canonical key/surface registry)
│   │   ├── lens.ts                     (existing: composed by surface.ts)
│   │   └── csv.ts                      (existing: reused via the rows adapter)
│   └── almond/
│       ├── tools.ts                    (evolves: buildAlmondSkills(deps, actor))
│       ├── responder.ts                (evolves: skills exercisable by the stub)
│       ├── shape.ts · persona.ts       (existing)
│       ├── skills/
│       │   ├── navigate.ts                         (new: registry-validated NavigateAction)
│       │   ├── export-spreadsheet.ts               (new: CSV reuse + XLSX, authedOwner-only)
│       │   └── generate-report.ts                  (new: PDF, authedOwner-only)
│       ├── export/
│       │   ├── load.ts                             (new: uncapped, farm-scoped export loaders)
│       │   ├── rows.ts                             (new: MeterSummary[] → MeterRow[] adapter)
│       │   ├── xlsx.ts                             (new: exceljs workbook builder)
│       │   ├── bill-due.ts                         (new: serial-code schedule export, SCHEDULED-marked)
│       │   ├── coverage-footer.ts                  (new: shared as-of/% footer composer)
│       │   └── *.test.ts                           (new)
│       ├── report/
│       │   ├── render.ts                           (new: @react-pdf section composition)
│       │   ├── sections/{summary,meter-table,mis-rated,savings,single-meter,footer}.tsx (new)
│       │   └── *.test.ts                           (new: byte/snapshot assertions)
│       └── reports/
│           └── store.ts                            (new: GeneratedReport + Blob put/read, owner-scoped)
├── lib/storage/blob.ts                             (new: @vercel/blob private put/get wrapper)
└── copy/en.ts                          (evolves: action/export starters, nudge, chip/card strings)

prisma/schema.prisma                    (evolves: + GeneratedReport model + Farm/User relations)
```

### Architectural Boundaries

- **Skill boundary:** every skill is built by `buildAlmondSkills(deps, actor)`; scope and capability
  come only from the server-resolved actor, never the model/client.
- **Surface boundary:** `lib/dashboard/surface.ts` is the single registry; the dashboard call-sites
  and the `navigate` skill both import keys/parsers from it. No hardcoded surface anywhere.
- **Generation boundary:** the model selects shape; `lib/almond/{export,report}` author every value
  from the uncapped loader. `/app` renders results; it never authors artifact content.
- **Persistence boundary:** `lib/almond/reports/store.ts` + `lib/storage/blob.ts` own all writes;
  the download route is the only read path, owner-scoped. Bytes are immutable once saved.
- **Capability boundary:** read + navigate are public-safe; generate/save require `authedOwner`,
  enforced by tool inclusion, not a bypassable runtime check.

### Requirements → Structure Mapping

| FR cluster | Lands in |
|---|---|
| N — Navigation (FR1–4) | `lib/dashboard/surface.ts`, `lib/almond/skills/navigate.ts`, `use-almond-navigation.ts`, `almond-result/messages.tsx` |
| S — Skill framework (FR5–9) | `lib/almond/tools.ts` (factory), `lib/almond/skills/*`, `responder.ts`, system prompt (`persona.ts`) |
| X — Export skills (FR10–13) | `lib/almond/export/*`, `lib/almond/report/*`, `lib/dashboard/csv.ts` (reused) |
| R — Delivery & Reports (FR14–17) | `lib/almond/reports/store.ts`, `lib/storage/blob.ts`, `app/(app)/reports/*`, `api/reports/[id]/download` |
| T — Trust/safety (FR18–20) | route actor gate, `export/coverage-footer.ts`, `persona.ts`, `/copy/en.ts` |
| D — Surfacing (FR21–22) | `almond-launcher.tsx`, onboarding nudge, `starters`, `/copy/en.ts` |

### Integration Points & Data Flow

- **Navigate:** turn → model calls `navigate` → skill resolves + validates against the registry →
  server writes `data-navigate` → `useAlmondNavigation` applies nuqs setters → existing surfaces
  react → action chip renders (links back).
- **Generate:** turn → model calls `exportSpreadsheet`/`generateReport` (authed owner) → uncapped
  loader pulls grounded data → deterministic builder renders bytes → `reports/store.ts` writes Blob
  + `GeneratedReport` → server writes `data-report` → client renders a download card → bytes also
  downloadable immediately.
- **Reports:** `(app)/reports` Server Component reads `GeneratedReport` by `farmId`; each row
  downloads via the owner-scoped route.
- **Offline path:** no Gateway key → the stub responder still answers and (in tests) exercises the
  skills deterministically; zero external calls in dev/CI.

### Development Workflow Integration

- **Dev:** `npm run dev:dashboard` (:3001); stub responder by default (no key) so Almond runs
  offline. Seed farms provide grounded data for export/PDF tests.
- **DB:** `db:migrate -- --name almond_generated_report` → `db:generate` after the schema edit.
- **Test:** Vitest pure (export rows/XLSX bytes, PDF section snapshots, navigation action building,
  surface registry, coverage footer) + db (`GeneratedReport` scoping, download owner-gate) +
  Playwright e2e (ask → navigate → export, stub-driven, single-worker).
- **Deploy:** Vercel Node runtime; add `BLOB_READ_WRITE_TOKEN`; rate-limit/BotID before exposing the
  Tour widely.

## Architecture Validation Results

### Coherence Validation ✅

**Decision compatibility:** all choices interoperate on the shipped Epic-6 base — the typed
data-part bridge rides the same `createUIMessageStream` the stub uses; `exceljs`,
`@react-pdf/renderer`, and `@vercel/blob` are pure-JS and Node-safe (the route is already
`runtime="nodejs"`); the surface registry composes the existing `lens.ts`; Prisma stays v6 on Neon
(`GeneratedReport` is purely additive). No version or pattern conflict found.

**Pattern consistency:** patterns reinforce decisions — factory-built farm-scoped skills ↔ the
no-scope-from-model law; full-data loader ↔ the no-model-authored-cells law; capability-by-tool-
inclusion ↔ the demo/Tour gate; canonical keys ↔ the surface registry ↔ the nav bridge; coverage
footer ↔ the FR19 honesty rule.

**Structure alignment:** the skill/export/report/reports modules, the registry, and the
route/download/Reports surfaces all map onto the directory tree; the capability flag threads cleanly
route → factory → skill → UI.

### Requirements Coverage Validation ✅

**Functional (22/22 supported):**
- N — FR1 `navigate` + `data-navigate` bridge · FR2 action chip (links back) · FR3 resolver +
  ambiguity rule (≥2 → clarify) · FR4 navigate-on-turn-only.
- S — FR5 skills-as-tools, extensible · FR6 read-only-on-data · FR7 farm-scoped factory · FR8
  uncapped full-data loader + shape-only model input · FR9 prompt-level preview line.
- X — FR10 CSV reuse + XLSX (`exceljs`) · FR11 request-driven shape, meter-table + bill-due first ·
  FR12 `@react-pdf` section library (generative selection, deterministic render) · FR13 no silent
  caps, Batth-scale legible.
- R — FR14 immediate download · FR15 `GeneratedReport` (what/when/request) · FR16 farm-scoped,
  non-guessable Blob + owner-scoped route · FR17 email out (recorded).
- T — FR18 auth/scope inherited + generate/save owner-gated, Tour read+navigate only · FR19 coverage
  footer · FR20 voice/persona/no-em-dash unchanged.
- D — FR21 rail entry + nudge + action/export starters · FR22 gentle/progressive surfacing.

**Non-functional:** structural farm-scoping + owner/demo gate + private Blob (✓); grounding/no-
fabrication via full-data path + deterministic assembly (✓); offline determinism via the stub (✓);
serverless-safe pure-JS generation, no Chromium (✓); single-source surface registry (✓);
mobile-first download/Reports/PDF + a11y/motion (✓); voice/copy law (✓).

### Implementation Readiness Validation ✅

**Decision completeness:** all critical decisions documented with verified versions and the three
open forks resolved (bridge transport, PDF engine, working mode). **Structure completeness:**
annotated tree, boundaries, FR→location map, data-flow. **Pattern completeness:** skill contract,
navigation/registry, generation law, money/coverage, persistence, voice/a11y, enforcement +
anti-patterns.

### Gap Analysis Results

**Critical (block implementation):** none.

**Important (build-time, not architectural holes):**
- **Farmer validation (PRD Open Q4 / D14)** gates *starting* the heavy build — a product gate, not a
  missing decision.
- **Surface-registry refactor blast radius:** ~9 client call-sites move to the registry; mechanical
  but real, must land before/with navigation (sequenced first).
- **`@vercel/blob` private-access detail:** confirm the exact private-read mechanism (stream via the
  route vs. short-lived scoped URL) against the installed SDK version at build time.
- **Rate-limiting:** required before wide public-Tour exposure now that the endpoint is generative.

**Nice-to-have:** numeric activation/latency targets; a "refresh this report" action; email skill;
PPTX skill; a dedicated generation job queue if artifacts ever exceed the request budget.

### Architecture Completeness Checklist

- [x] Project context analyzed; scale/complexity assessed; constraints + cross-cutting concerns
      mapped (verified against the repo).
- [x] Critical decisions documented with versions; open forks resolved.
- [x] Skill/navigation/generation/persistence patterns + enforcement + anti-patterns defined.
- [x] Annotated structure, boundaries, FR→structure map, integration/data-flow complete.

### Architecture Readiness Assessment

**Overall status:** READY — coherent, covers all 22 FRs and the NFRs; open items are one product
gate (farmer validation), one sequenced refactor, and build-time confirmations, not architectural
holes.

**Confidence:** high. The feature is composition over a shipped, well-factored base; the two genuinely
hard seams (the typed-data-part navigation bridge, the deterministic full-data generation law) have
explicit, testable designs.

**Key strengths:**
- Reuses Almond's hardest-won properties (offline determinism, structural farm-scoping) instead of
  re-deriving them.
- The no-model-authored-cells law + uncapped full-data path make a lender-shared artifact trustworthy
  by construction.
- A single surface registry keeps the operator from drifting as the dashboard changes.
- Capability-by-tool-inclusion makes the public-Tour gate a structural property, not a bypassable check.

**Future enhancement:** email/PPTX skills, write-actions (the next wedge expansion, behind a confirm
gate), a generation queue, and Almond as the surface for the physical↔numerical fused data when that
initiative lands.

### Implementation Handoff

**First implementation priority:**
1. `lib/dashboard/surface.ts` + refactor the nuqs call-sites (unblocks navigation).
2. The navigation bridge: `navigate` skill + `data-navigate` part + `useAlmondNavigation` + chip.
3. Full-data loader + spreadsheet skill (CSV reuse-adapter + XLSX) + owner-scoped download.
Then: `GeneratedReport` migration + Blob + Reports area → PDF skill → surfacing + rate-limiting.

**AI agent guidelines:** build skills through the factory; never take scope from the model; read the
uncapped export loader; validate navigation against the registry; gate generate/save behind
`authedOwner`; stamp the coverage footer; keep copy in `/copy`; ship tests with every skill and
section. The decisions behind this document live in
[architecture-decisions.md](./architecture-decisions.md).
