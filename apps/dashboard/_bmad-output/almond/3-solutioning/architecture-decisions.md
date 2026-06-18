---
title: Almond (Generative Operator) - Architecture Decision Records
status: draft
created: 2026-06-17
owner: Jaiyen
project: Terra
feature: Almond
---

# Architecture Decision Records: Almond, Terra's Generative Operator

These are the load-bearing decisions behind the [architecture](./architecture.md) for Almond, the
generative-operator extension of the shipped Epic-6 assistant. Each record captures one genuinely
contested choice: the context that forced it, the decision, the alternatives weighed and set aside,
and the consequences we accept. They are the companion to the
[PRD](../../planning-artifacts/prds/prd-Almond-2026-06-17/prd.md) and its
[addendum](../../planning-artifacts/prds/prd-Almond-2026-06-17/addendum.md).

These ADRs are numbered `ADR-A0xx` to stay distinct from Tool 2's `ADR-0xx`. Several PRD-level
decisions (D2 chat-first rejected, D3 read-only, D7 email deferred, D8 no single rigid template,
D13 keep Neon + Blob) are settled upstream in the addendum and are *ratified*, not re-litigated,
here. Plain operator English throughout; no exclamation marks, no em dashes. Figures marked
"(target)" are not yet calibrated.

---

## ADR-A01: Extend Epic-6 Almond in place; skills are AI-SDK tools built by the same farm-scoped factory

### Context

Almond already ships (Epic 6) as a farm-scoped, read-only, AI-SDK-v6 tool-calling chat with an
injected model boundary (offline stub default, Vercel AI Gateway when keyed) and six grounded read
tools built by a factory closed over the resolved `{prisma, farmId, farmName}`. The PRD adds two
new capability classes (navigate, generate) and is explicit that the grounding, scoping, voice, and
injected-boundary core must not change. The question was whether to add capabilities as a new agent
runtime / separate service / different framework, or to extend the existing tool layer.

### Decision

Extend in place. New capabilities are modeled as discrete, named **skills** that are AI-SDK `tool()`
definitions selected by the same `streamText` tool-calling loop. The existing `buildAlmondTools(deps)`
becomes `buildAlmondSkills(deps, actor)`, returning the six read tools plus `navigate` and (when the
actor is an authenticated owner) `exportSpreadsheet` and `generateReport`. Skill execution logic is
pure and unit-tested (mirroring `almond/shape.ts`); the route only wires; every skill is answerable
by the offline stub so CI/e2e make zero external calls.

### Alternatives considered

- **A new agent runtime / separate service.** Maximum freedom, but it discards a working, tested base
  and forces re-deriving its hardest properties (offline determinism, structural farm-scoping), adds
  a network/deploy boundary over the same farm data, and fights the monorepo-move discipline.
- **A different agent framework (e.g. a graph/workflow engine).** Heavier mental model and a second
  way to call models in one repo; the AI-SDK tool loop already does what v1 needs.

### Consequences

- The scoping and voice guarantees hold by reuse, not by re-implementation.
- "Skill" is a thin concept (a tool plus pure logic), which keeps the framework extensible (FR5): a
  future skill (PPTX, email) is a new tool, not a core rework.
- The factory now carries an `actor` capability flag in addition to `deps`; the read tools are
  unaffected.
- A guard discipline: no skill mutates farm/utility data (FR6); the only writes are artifact
  persistence (ADR-A07).

---

## ADR-A02: Server→client navigation via a typed transient data part on the UI-message stream

### Context

Navigation (FR1) must drive the dashboard's existing surfaces, which are client-only `nuqs`
`useQueryState` keys set by `onClick`. Almond runs server-side; a server tool cannot call
`setMeter()`. The addendum explicitly left the architecture to choose the transport and how the
action chip (FR2) links back. Three options were on the table: a typed data part on the chat stream,
rendering side-effects off a tool-result part, or a dedicated out-of-band action channel.

### Decision

The model calls a `navigate` tool that validates the requested surface against the canonical surface
registry (ADR-A03) and applies the ambiguity rule; on a clean resolve the server writes a **typed,
transient `data-navigate` part** onto the UI-message stream via the same `createUIMessageStream`
writer the stub already uses. The already-mounted `AlmondLauncher` reads `data-navigate` parts and
applies them through a `useAlmondNavigation()` hook that holds the five canonical `useQueryState`
setters; the existing surfaces react exactly as to a manual click. Each action is applied once
(deduped by part id) and rendered as an action chip that links back by re-applying the same action.

### Alternatives considered

- **Render side-effects from a tool-result part.** Simpler mental model, but it couples a navigation
  *side effect* to *result rendering*, blurs "the tool ran" with "the screen moved," and complicates
  replay/dedup when a conversation re-renders.
- **A dedicated out-of-band action channel (second SSE/event source).** Most decoupled, but it is the
  most new infrastructure for a non-destructive view change, and it splits the conversation's source
  of truth across two streams for no v1 benefit.

### Consequences

- The model's output stays declarative ("open this named surface"); validation stays server-side
  against the registry; nothing client-trusted decides what is navigable.
- Reuses the exact streaming mechanism Almond already has; no new transport, no second channel.
- The launcher gains a navigation effect and must dedupe applied actions; this is the one piece of
  client state-sync the feature introduces.
- Because navigation is non-destructive and emitted only in response to a turn, "undo" is browser
  back and FR4 (never hijack) holds by construction.

---

## ADR-A03: A single canonical surface registry; refactor the duplicated nuqs call-sites to read from it

### Context

The "stays native to a changing dashboard" NFR requires that Almond's navigable reach never drift
from the dashboard's actual surfaces. Verified in the repo: the URL-state keys (`meter`, `lens`,
`entity`, `ranch`, `rate`) are **bare string literals duplicated across ~9 client components**, and
only the lens *values* are centralized (`lens.ts`). With keys duplicated, a dashboard change could
silently desync Almond, and Almond could offer a surface that no longer exists.

### Decision

Introduce `src/lib/dashboard/surface.ts` as the single source of truth for the closed key set
(`lens | entity | ranch | rate | meter`), each key's parser/validator, and (composing the existing
`lens.ts`) lens availability. Both the dashboard's `useQueryState` call-sites and Almond's `navigate`
skill read key names and parsers from the registry. The ~9 duplicated call-sites are refactored to
import their key from the registry as a mechanical, same-epic sweep, sequenced **first** so it
unblocks the navigation bridge.

### Alternatives considered

- **Hardcode Almond's navigable surfaces in the navigate skill.** Fastest, but it is exactly the
  drift the NFR forbids; the skill would list surfaces the dashboard could remove.
- **Introduce the registry but migrate only the surfaces Almond touches now, sweeping the rest
  later.** Lower immediate blast radius, but it leaves two sources of truth during the gap, which is
  the failure mode the registry exists to kill; the NFR wants one place.

### Consequences

- Retiring a key or lens updates Almond's reach in one edit; Almond can never offer a dead surface.
- A real, if mechanical, refactor with ~9-file blast radius lands before navigation; it is low-risk
  (rename-to-constant) and covered by the existing lens/filter tests plus a new registry test.
- `lens.ts` stays the lens-value authority and is composed by, not replaced by, the registry.

---

## ADR-A04: No model-authored cells; generation reads a dedicated uncapped full-data path

### Context

The trust of a lender-shared spreadsheet or PDF rests on it containing zero model-invented numbers
(FR8, the counter-metric on fabrication). But Almond's chat tools deliberately **cap and summarize**
rows for readability (`listMeters` max 50 / default 25). If an export read those tools, a "full"
meter spreadsheet could silently omit rows, and a model could shape prose around numbers it
half-saw.

### Decision

Split selection from authorship. The model chooses the artifact's **shape** only (a typed selection:
filter + columns/sections + scope) via the skill's Zod input; **deterministic code authors every
value**, reading a dedicated **uncapped, farm-scoped export loader** (`src/lib/almond/export/load.ts`)
built on the existing dashboard loaders without the chat-tool caps. No export ever reads the chat
tools. Absence is stated plainly; no value is invented. Generated bytes are verified by tests
precisely because rendering is deterministic over a fixed column/section library.

### Alternatives considered

- **Let export skills reuse the chat tools directly.** Maximum reuse, but it inherits the row caps and
  the summary shaping, which is exactly what makes an export untrustworthy at Batth scale.
- **Let the model author cells/prose for flexibility.** More expressive reports, but it reintroduces
  fabrication risk into a file a grower shares externally, defeating the product's honesty law.

### Consequences

- A second, uncapped read path exists alongside the chat tools; the discipline "exports never read
  chat tools" is an enforced boundary, not a convention.
- Generated artifacts are deterministic and snapshot-testable; the model's freedom is bounded to a
  small, also-testable selection.
- The PDF stays "whatever the grower asks for" via section *selection*, not free-form authorship
  (ADR-A05).

---

## ADR-A05: PDF via @react-pdf/renderer over a tested section-template library; pure-JS, no Chromium

### Context

FR12 wants a request-driven PDF that is "generative in selection, deterministic in rendering" over a
library of tested section templates, branded in the warm palette, legible at Batth scale. The
addendum locked pure-JS generation (no headless Chromium, to avoid the serverless bundle/cold-start
tax) but left the specific PDF engine (`pdfkit` vs `@react-pdf/renderer`) to the architecture.

### Decision

Use `@react-pdf/renderer`. Each report section is a React component in
`src/lib/almond/report/sections/*`; the model selects which sections and in what order; deterministic
code composes them over real data. Sections snapshot/assertion-test cleanly. The route runtime is
already `nodejs`, which the library requires; no Chromium is involved.

### Alternatives considered

- **pdfkit.** Leaner bundle and full imperative control, more serverless-minimal. But sections become
  draw-functions rather than composable components, which maps less cleanly onto FR12's "library of
  tested section templates," and layout is more manual.
- **Architect both behind a section-render interface, decide at build time.** Hedges the choice, but
  it doubles the section library surface and defers a decision that the composable-component model
  already wins for v1; we can still swap engines later if a section proves awkward.

### Consequences

- The "library of sections" is literally a directory of tested React components; the QA-able surface
  is small and explicit.
- We accept running the React reconciler inside a server function (well within the latency target for
  a whole-farm PDF); we explicitly avoid Chromium and its bundle/cold-start tax.
- If a future skill genuinely needs pixel-faithful HTML→PDF, Chromium can be reconsidered for that
  skill only; v1 does not need it.

---

## ADR-A06: Reuse metersCsv via an adapter; build XLSX and the bill-due exporter net-new

### Context

The spreadsheet skill (FR10–FR11) should not silently re-implement a parallel CSV format. But the
existing `metersCsv` consumes `MeterRow` (from `dashboard/table.ts`), while Almond's data arrives as
`MeterSummary`/`MeterDetail` (`almond/shape.ts`); today's export is also a client-side DOM download of
the table shape, and there is no XLSX path and no bill-due-schedule exporter.

### Decision

Reuse the pure `metersCsv` string-builder through an adapter `MeterSummary[] → MeterRow[]`
(`src/lib/almond/export/rows.ts`); build the XLSX with `exceljs` (pure JS) over the same row model;
build the bill-due-schedule exporter net-new. The bill-due exporter honors the BILLED-vs-SCHEDULED
law (AR-14): a scheduled "may shift" date is marked scheduled, never presented as billed, so a lender
artifact cannot overclaim a date the way FR19 guards against for dollars.

### Alternatives considered

- **A fresh CSV builder for Almond's shapes.** Quicker to write against the tool shapes, but it forks
  the CSV format (escaping, BOM, coverage-label semantics) into two implementations that will drift.
- **Skip XLSX, ship CSV only.** Lighter, but the Excel-brained grower's first real artifact is
  explicitly the spreadsheet they mark up in Excel; XLSX is the point.

### Consequences

- One CSV format, reused; the row adapter is the single mapping point and is unit-tested.
- A new `exceljs` dependency, justified by the Excel-first grower; same row model keeps it honest.
- The bill-due exporter is genuinely net-new and must carry the SCHEDULED marking; a test asserts a
  scheduled date is never emitted as billed.

---

## ADR-A07: Save report bytes (immutable) in private Vercel Blob, with a GeneratedReport row in Neon

### Context

Saved reports (FR15–FR16) need a persisted record and file storage, farm-scoped and private. The
addendum decided to keep Neon and add Vercel Blob (Supabase rejected, D13). The remaining
architecture choices were the row shape, whether to store bytes or regenerate on download, and how
access stays private and non-guessable.

### Decision

Add an additive `GeneratedReport` Prisma model (`id, farmId, createdById?, kind, title, requestText,
blobPathname, byteSize, coverageAsOf?, paramsJson, createdAt`), farm-scoped like the rest of the app.
**Store the bytes** in private Vercel Blob under a non-guessable key; never expose a public URL.
Access is owner-scoped through a single server route `GET /api/reports/[id]/download` that re-checks
the row belongs to the caller's resolved farm before streaming. Saved reports are immutable.

### Alternatives considered

- **Regenerate on download (store only the spec).** Storage-free and always fresh, but a "saved"
  report a grower already shared with a lender would silently change as farm data changes. A shared
  artifact must be immutable; we store bytes. A separate "refresh this report" action can produce a
  new row later.
- **Public/unguessable Blob URL with no route.** Simpler delivery, but a leaked URL is unscoped
  access to a grower's financial artifact; the owner-scoped route is the gate.
- **Migrate the DB to bundle storage (Supabase).** Rejected upstream (D13): the real need is file
  storage, not a DB swap; Vercel Blob adds no new platform.

### Consequences

- One persistence unit (`GeneratedReport` + Blob object + download route) lands in one migration.
- Immutability costs storage (bytes per report) for the guarantee that a shared file never changes;
  trivial at Batth scale.
- The download route is the only read path; a different farm's id is a 404, an anonymous caller a 401.
- Confirm the exact `@vercel/blob` private-read mechanism (stream-via-route vs short-lived scoped URL)
  against the installed SDK at build time.

---

## ADR-A08: Capability-by-tool-inclusion; the public Tour gets read + navigate, never generate/save

### Context

The chat route serves both authenticated growers and the public, unauthenticated Tour (scoped to the
demo farm). Navigation changes no data and is safe to expose publicly; generation writes Blob objects
and DB rows and costs Gateway spend, so it must be owner-only (FR18). A bypassable runtime `if` inside
a tool is a weaker guarantee than not having the capability at all.

### Decision

Gate by **which tools the model is handed.** The route resolves the actor (`sessionUserId` →
`dashboardFarm`, else `demoFarm`) and passes `{ authedOwner }` to `buildAlmondSkills`. The public
Tour actor receives the read tools plus `navigate` only; `exportSpreadsheet`/`generateReport` are
included **only** for an authenticated owner, so the public model cannot call a persistence skill it
was never given. Add per-IP rate-limiting / Vercel BotID on the endpoint and a per-farm generation
throttle before exposing the Tour widely.

### Alternatives considered

- **One full tool set with a runtime owner-check inside each write skill.** Simpler factory, but it
  relies on every skill remembering the check and on the model not being able to route around it;
  capability-by-omission is a structural guarantee instead.
- **A separate public chat endpoint with no write tools.** Clear separation, but it forks the route
  and the responder for what is one capability flag.

### Consequences

- The public/owner boundary is a structural property (the tool literally is not present), not a check
  that can regress.
- The capability flag threads route → factory → skills → starters/UI copy (export starters only show
  for an owner).
- The endpoint is now generative as well as a model-cost surface, so rate-limiting moves from
  "nice-to-have" to required-before-wide-Tour; recorded as a build-time gate.

---

## Decision summary

| ADR | Decision |
|---|---|
| ADR-A01 | Extend Epic-6 Almond in place; skills are AI-SDK tools built by the same farm-scoped factory |
| ADR-A02 | Server→client navigation via a typed transient data part on the UI-message stream |
| ADR-A03 | A single canonical surface registry; refactor the duplicated nuqs call-sites to read from it |
| ADR-A04 | No model-authored cells; generation reads a dedicated uncapped full-data path |
| ADR-A05 | PDF via @react-pdf/renderer over a tested section-template library; pure-JS, no Chromium |
| ADR-A06 | Reuse metersCsv via an adapter; build XLSX and the bill-due exporter net-new |
| ADR-A07 | Save report bytes (immutable) in private Vercel Blob, with a GeneratedReport row in Neon |
| ADR-A08 | Capability-by-tool-inclusion; the public Tour gets read + navigate, never generate/save |

## Ratified upstream (not re-litigated here)

| From | Decision carried forward |
|---|---|
| addendum / D2 | Dashboard-first; Almond drives the dashboard, never a chat-first front door |
| addendum / D3 | Read-only on data in v1; no write-actions (the next wedge, behind a future confirm gate) |
| addendum / D7 | Email/outbound delivery deferred to a future skill; v1 is download + saved Reports |
| addendum / D8 | No single rigid PDF template; request-driven section selection |
| addendum / D13 | Keep Neon Postgres; add Vercel Blob for files; Supabase rejected |
| addendum | Model boundary stays injected (offline stub default, Gateway when keyed); pure-JS, no Chromium |
