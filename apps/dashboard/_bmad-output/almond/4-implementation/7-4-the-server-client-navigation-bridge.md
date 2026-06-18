---
baseline_commit: aa592fdfdd2179f60bfa6692c42d4cf8e86bc523
---

# Story 7.4: The server→client navigation bridge

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Effort: Almond — Terra's Generative Operator (Epics 7-10). Tracked in the per-effort folder
     _bmad-output/almond/4-implementation/ (NOT the global implementation-artifacts/ path), so it
     never collides with the Tool 1 dashboard sprint. See _bmad-output/almond/index.md. -->
<!-- PRODUCT GATE: the heavy Almond build is gated behind FARMER VALIDATION (PRD Open Q4 / D14).
     Writing this story file is the allowed per-story step. 7.1 (surface registry), 7.2 (skill
     factory), and 7.3 (the navigate skill — the SERVER half) already shipped, so Epic 7 is
     in-progress. 7.4 is the FIRST grower-visible piece of navigation: the server→client BRIDGE that
     transports the 7.3 NavigateAction onto the chat stream and applies it to the live dashboard via
     the canonical nuqs setters. Navigation is read-only on data (it only sets URL state), so it ships
     to every actor, public Tour included (ADR-A08). The gate still governs the owner-only export/PDF
     stories (Epic 8+). -->

## Story

As a grower,
I want the screen to actually move when Almond decides to open something,
So that asking Almond is the same as tapping the dashboard myself, with no reload.

(This is the **client + transport half** of navigation. 7.3 shipped the pure `navigate` skill that
turns a request into a typed `NavigateAction` over the five canonical URL keys, but it writes nothing
to the stream and moves nothing on screen. 7.4 closes the loop: on a clean resolve the **server writes
a typed transient `data-navigate` part** onto the existing UI-message stream, and a new client hook
`useAlmondNavigation()` applies that action through the five canonical `useQueryState` setters, so the
dashboard reacts exactly as it does to a manual click — no reload, no parallel navigation UI, applied
exactly once. The offline stub responder learns to emit a deterministic `data-navigate` part for a
navigation turn so e2e/CI prove the URL changed with zero external calls. This is the one piece of
client state-sync the whole feature introduces. The action chip that links back is **Story 7.5**.)

## Acceptance Criteria

1. **Given** a clean `NavigateAction` from the `navigate` skill, **When** the server responds, **Then**
   it writes a **typed, transient `data-navigate` part** onto the UI-message stream via the same
   `createUIMessageStream` writer the stub already uses (`writer.write({ type: "data-navigate", data:
   action, transient: true })`) — no second channel (AR17, ADR-A02). On `clarify` / `none` /
   `unknown-surface`, **no** `data-navigate` part is written (the ambiguity rule and refusal hold; the
   model narrates the result in text).

2. **Given** the already-mounted `AlmondLauncher` (under the `nuqs` adapter), **When** a `data-navigate`
   part arrives, **Then** a new `useAlmondNavigation()` hook applies it through the **five canonical
   `useQueryState` setters** (`lens`, `entity`, `ranch`, `rate`, `meter`, keyed from `surface.ts`), and
   the existing dashboard surfaces react exactly as they do to a manual click — no parallel navigation
   UI, no full reload (NFR4, "feels instant"). A present key is set, a `null` value clears it
   (`setMeter(null)` closes the drawer), an absent key is left untouched.

3. **Given** a conversation that re-renders or replays (reload, scroll, status change), **When**
   `data-navigate` parts are processed, **Then** each action is applied **exactly once** — a re-render
   or a conversation reload never re-navigates. (With the transient transport this holds by
   construction: `onData` is a one-shot delivery callback, never replayed on render or on history
   rehydration; an applied-id guard is kept as belt-and-suspenders. See the transport decision in Dev
   Notes — under the non-transient fallback this becomes an explicit dedupe-by-part-id `Set`.)

4. **Given** the offline stub responder, **When** a navigation turn runs in dev/test/CI, **Then** the
   stub emits a deterministic `data-navigate` part (resolved via the same pure `resolveNavigate` over
   the farm's real meters), with **zero external calls** (NFR3); a deterministic test asserts the part
   is present and carries the resolved action, and (client-side) that applying it changes the URL
   state. The stub's existing text-streaming behavior and its grounded answers are preserved.

5. **Given** the live (Gateway) model responder, **When** the model calls `navigate` and it resolves
   cleanly, **Then** the same transient `data-navigate` part is written onto the stream alongside the
   model's streamed text/tool parts (one stream, AR17) — the live path and the stub path emit the
   **same** part shape, so the client bridge is transport-agnostic.

6. **Given** the read-only / farm-scoped / capability contract, **When** the bridge runs, **Then** it
   changes no data (navigation only sets URL state, FR6), `farmId` still comes only from `deps` (FR7),
   and `navigate` remains in the public-safe set for both actors (ADR-A08). The bridge adds **no new
   dependency, no env var, no Prisma/schema change, and no new query-param name** (every key is a
   canonical `surface.ts` key — ADR-A03).

## Tasks / Subtasks

- [ ] **Task 1 — Server: emit the transient `data-navigate` part (the stub path first — it is the AC4
      surface and the CI/offline default)** (AC: 1, 4, 6)
  - [ ] In `src/lib/almond/responder.ts`, teach the **stub** to route a navigation turn. Add `"navigate"`
        to `classifyIntent` (or a dedicated detector) for open/show/filter/lens language (`open|show|see|
        go to|filter|switch to|map|table|chart|calendar|pump|meter`), **ordered first** so a clear
        navigation request is not swallowed by the existing topic intents. Keep the existing intents and
        their grounded answers intact.
  - [ ] When the turn is a navigation turn, resolve it **offline** with the shipped pure path: load the
        farm's meters via `loadMetersForFarm(deps.prisma, deps.farmId)` and call `resolveNavigate(meters,
        input)` (or call `navigateSkill(deps, input)` — same result). Derive the stub's `input` from the
        user's text deterministically (a small parse: the trailing noun after "open/show" → `{ open:
        "meter", query }`; a lens word → `{ lens }`; a rate/entity/ranch token → the matching filter key).
        Keep it simple and deterministic — the stub is a fixture, not the model.
  - [ ] In `createStubResponder`'s `createUIMessageStream({ execute: ({ writer }) => {...} })`, on a
        `{ kind: "navigate", action }` result, after (or before) the text parts, write:
        `writer.write({ type: "data-navigate", id: "almond-nav-0", data: action, transient: true });`
        (id is for the chip's stable key / belt-and-suspenders dedupe; `transient: true` keeps it out of
        message history — see the transport decision). On `clarify` / `none` / `unknown-surface`, write
        **no** part — only the existing text answer (which the model/stub narrates). Reuse the existing
        `text-start`/`text-delta`/`text-end` plumbing for the accompanying sentence.
  - [ ] Keep the stub fully offline and deterministic: zero external calls, same `data-navigate` `data`
        for the same input. A navigation turn must still stream a short grounded text part too (so an
        assistant bubble renders), but the **part** is the AC4 assertion target.
- [ ] **Task 2 — Server: emit the same part on the live (Gateway) model path** (AC: 1, 5, 6)
  - [ ] In `createModelResponder(model)`, wrap the `streamText` call in `createUIMessageStream({ execute:
        ({ writer }) => {...} })` and `writer.merge(result.toUIMessageStream())` (replacing the bare
        `result.toUIMessageStreamResponse()`), then return `createUIMessageStreamResponse({ stream })`.
        Verify the exact method names against the installed `ai@6.0.205` types (`writer.merge`,
        `result.toUIMessageStream`).
  - [ ] Detect a clean `navigate` tool result during the run (via `streamText`'s `onStepFinish` /
        `onFinish` — inspect the step's tool results for `toolName === "navigate"` and `result.kind ===
        "navigate"`), and on a clean resolve `writer.write({ type: "data-navigate", id, data:
        result.action, transient: true })`. Do **not** change `navigateSkill` / `navigate.ts` — the
        executor still just returns the typed result; the responder lifts the action onto the stream
        (the 7.3 boundary: skill returns, server transports). Watch part ordering relative to the merged
        text stream.
  - [ ] (Alternative the dev agent may choose if `onStepFinish` tool-result access is awkward in the
        installed SDK: hand the `navigate` tool's `execute` the writer via a closure and write the part
        there — the SDK supports writing data parts from a tool's execute. Document whichever is used and
        keep the part shape identical to the stub's.)
- [ ] **Task 3 — Client: the `useAlmondNavigation()` hook (the five canonical setters)** (AC: 2, 6)
  - [ ] New file `src/app/(app)/_components/almond/use-almond-navigation.ts` (`"use client"`). Hold the
        five `useQueryState` setters keyed from the registry, mirroring the dashboard call-sites EXACTLY:
        - `lens`: `useQueryState(SURFACE.lens, lensQueryOptions())` (matches `lens-toggle.tsx:15`).
        - `entity`/`ranch`/`rate`: `useQueryState(SURFACE.entity)` etc. — **bare** (raw nullable strings,
          matching `filter-bar.tsx:65-67`, `chart-lens.tsx:48-50`). No parser, no default.
        - `meter`: `useQueryState(SURFACE.meter)` — bare (matches `meter-drawer.tsx:120`).
        Import `SURFACE` and `lensQueryOptions` from `@/lib/dashboard/surface`. Do **not** invent new
        parsers or keys (ADR-A03).
  - [ ] Return a stable `apply(action: NavigateAction)` callback (`useCallback`) that, for each present
        key, calls its setter: `if (action.lens !== undefined) void setLens(action.lens)`; same for
        `entity`/`ranch`/`rate`/`meter` with `!== undefined` (so `null` clears, a value sets, absence
        leaves untouched). Import the `NavigateAction` type from `@/lib/almond/skills/navigate`.
  - [ ] The hook does **not** read the stream itself — it only exposes `apply`. The launcher (Task 4)
        wires the transport delivery to `apply`. (This keeps the hook reusable by 7.5's chip "link back",
        which calls the same `apply` to re-navigate.)
- [ ] **Task 4 — Client: wire delivery in `AlmondLauncher` (apply exactly once)** (AC: 2, 3)
  - [ ] In `src/app/(app)/_components/almond/almond-launcher.tsx`, call `const nav =
        useAlmondNavigation();` and pass `onData` to `useChat`: `useChat({ transport, onData: (part) => {
        if (part.type === "data-navigate") { /* dedupe by part.id via a useRef<Set<string>> */
        nav.apply(part.data); } } })`. `onData` fires once per received part and is never replayed on
        re-render or reload, so AC3 holds; the id `Set` guard is belt-and-suspenders.
  - [ ] Type the chat with a typed `UIMessage` so `onData`'s `part.data` is `NavigateAction` (define a
        local `AlmondUIMessage = UIMessage<never, { navigate: NavigateAction }>` data-types map, or
        narrow `part.data` defensively). Confirm `@ai-sdk/react@3.0.207` exposes `onData` on `useChat`
        (it does — `ChatInit.onData`).
  - [ ] Do **not** add a chip, an action list, an announce region, or any other UI in 7.4 — those are
        Story 7.5. 7.4's only client behavior is: a `data-navigate` part arrives → the dashboard moves.
  - [ ] `almond-messages.tsx` likely needs **no change** under the transient transport (the part is not
        in `message.parts`). If the non-transient fallback is taken instead, the read site moves to a
        `message.parts` iteration with explicit dedupe — see the transport decision. Document which path
        shipped.
- [ ] **Task 5 — Tests (the AC4 deterministic evidence + the apply contract + the regression net)**
      (AC: 1, 2, 3, 4)
  - [ ] **Server (primary AC4 evidence, offline/deterministic):** extend the stub-responder block in
        `src/lib/almond/tools.db.test.ts` (or a new `responder.db.test.ts`) — drive
        `createStubResponder().toResponse({ uiMessages: [ask("open <a real seeded meter name>")], ... })`,
        read `await res.text()`, and assert the streamed body contains a `"data-navigate"` part whose
        `data` carries the resolved `{ meter: <that meter's id> }`. Add a negative case: an ambiguous /
        no-match / lens-typo turn streams **no** `data-navigate` part (only text). This mirrors the
        existing assertion style (body `toContain("text-start")`) and needs a seeded farm → `.db.test.ts`.
  - [ ] **Client (the apply contract):** a focused test of `useAlmondNavigation().apply()` proving each
        present key drives its `useQueryState` setter and the URL/state changes (and `null` clears). If a
        hook test is impractical in the node/vitest env (nuqs needs the adapter + a URL context), assert
        `apply`'s setter dispatch via a thin seam or cover it in the e2e — document the choice. (Vitest is
        node-env, not jsdom — see Testing requirements; prefer a pure assertion of the action→setter
        mapping over a DOM render.)
  - [ ] **e2e / the "URL changed" assertion (AC4):** see Testing requirements for the project's
        deliberate convention (the interactive launcher flow is covered at the `.db.test.ts` layer, not
        Playwright, because it needs an authed session + seeded farm). Either (a) keep the deterministic
        server-part test + the client apply test as the AC4 evidence (recommended, matches convention),
        or (b) extend the e2e harness to mint a session and assert the URL changed after a stubbed
        navigation turn (a real lift — flag it, do not silently skip). Whichever, the existing e2e
        baseline must stay transparent (see baseline note).
  - [ ] **Gate before claiming done:** `npm run typecheck && npm run lint && npm test` (root or `-w
        @lavinia/dashboard`), then `npm run build`, then `npm run test:e2e -w @lavinia/dashboard`. The
        e2e suite has a documented environmental red baseline (3 pass / 5 fail at 7.1–7.3) — a failure is
        a 7.4 regression only if it differs from that baseline AND touches Almond's runtime.

## Dev Notes

### What this story is (and is not)

- **Is:** the **transport + client half** of navigation. (a) The **server** writes a typed transient
  `data-navigate` part onto the existing UI-message stream on a clean `NavigateAction` — in **both** the
  offline stub responder (the AC4/CI surface) and the live Gateway model path (AC5). (b) A **new client
  hook** `useAlmondNavigation()` holds the five canonical `useQueryState` setters and exposes
  `apply(action)`. (c) The **launcher** delivers each `data-navigate` part to `apply` exactly once. The
  result: asking Almond moves the dashboard exactly as a manual click does, no reload.
- **Is NOT:** the action chip, the "link back", the ARIA live-region announce, or the never-hijack
  guarantee — those are **Story 7.5** (`almond-result.tsx` / `almond-messages.tsx` chips + a11y). It is
  NOT a new skill (7.3 shipped `navigate`), NOT a data mutation (URL state only, FR6), and NOT a new
  query param (canonical keys only, ADR-A03). It adds **no new dependency, no env var, no Prisma/schema
  change, no `outputFileTracingIncludes` change.** Copy: 7.4 does not need grower-facing chip copy
  (that is 7.5); if the stub streams a short acknowledgment sentence, prefer a grounded data summary in
  the existing stub style, and put any reusable grower-facing template in `/copy/en.ts` per project law.
- **Risk: medium.** It is the one piece of client state-sync the feature introduces (ADR-A02), and it
  spans server (two responder paths) + a new client hook + the launcher. The single highest-risk
  decision is the **transient-vs-persisted data-part transport** below — get it right first.

### ⚠️ THE LOAD-BEARING DECISION: transient data part transport in AI SDK v6 (read this before coding)

The planning docs contain an **internal contradiction** that you will hit immediately, and resolving it
against the real installed API is this story's most important job. The docs say the part is
**`transient: true`** (ADR-A02, AR5, AR17, AC1) **AND** that the client "reads `data-navigate` parts"
off `message.parts` / `almond-messages.tsx` **AND** "dedupe by part id" (AR5, AC3). In AI SDK v6 those
cannot all be literally true at once. The real semantics (verified against the installed `ai@6.0.205`
type at `node_modules/ai/dist/index.d.ts:2067-2070`, and the AI SDK docs):

> A `{ type: "data-${string}"; data; id?; transient? }` part with **`transient: true` is sent to the
> client but NOT added to message history. It is ONLY accessible via the `useChat` `onData` callback.**
> A **non-transient** data part IS persisted in `message.parts` and can be reconciled by `id`.

So there are two coherent designs, and you must pick one explicitly:

**Design A — RECOMMENDED: transient part + `useChat({ onData })`.**
- Server: `writer.write({ type: "data-navigate", id, data: action, transient: true })`.
- Client: `useChat({ transport, onData: (part) => part.type === "data-navigate" && nav.apply(part.data) })`.
- **Why it wins:** it matches the literal `transient: true` wording (AC1/ADR-A02/AR17); it satisfies AC3
  ("applied exactly once; a re-render never re-navigates") **by construction** — `onData` is a one-shot
  delivery callback, never replayed on a React re-render and never replayed on conversation reload
  (transient parts aren't persisted), which eliminates the exact dedupe footgun AC3 warns about; and it
  sidesteps the known v6 issue where non-transient `data-*` parts can fragment the assistant message
  (vercel/ai#8734). The id is still stamped for 7.5's chip key + a cheap applied-id `useRef<Set>` guard.
- **The one consequence to own:** under Design A the part is **not** in `message.parts`, so
  `almond-messages.tsx` does **not** read it (the launcher's `onData` is the read site). 7.5's chip
  therefore sources its `NavigateAction` from launcher-captured turn state (a small applied-actions
  list), not from `message.parts` — which is necessary anyway since a transient part can't persist for a
  chip to read later. This is the documented variance from the epics build note ("almond-messages.tsx
  (reads data-navigate)"); the read moves to `onData`.

**Design B — DOCUMENTED FALLBACK: non-transient part + `message.parts` + explicit dedupe-by-id.**
- Server: `writer.write({ type: "data-navigate", id, data: action })` (no `transient`).
- Client: iterate `message.parts` for `part.type === "data-navigate"`, apply, and **dedupe with a
  `useRef<Set<string>>` of applied part ids** so a re-render does not re-navigate (this is the AC3
  "dedupe by part id" wording taken literally). This matches the build note's "almond-messages reads
  data-navigate" and lets 7.5's chip read the action from `message.parts`.
- **Cost:** the manual dedupe is the bug AC3 is warning about (miss it and every re-render re-navigates),
  and you risk the v6 message-fragmentation issue (#8734). Take this path only if `onData` proves
  unavailable/unreliable in the pinned `@ai-sdk/react@3.0.207` — but it IS available (`ChatInit.onData`,
  `node_modules/ai/dist/index.d.ts:3877`; `ChatOnDataCallback = (dataPart) => void` at 3821).

**Decision for this story: Design A.** Both designs satisfy the ACs' intent; A is lower-risk, matches the
literal "transient" contract, and makes the exactly-once guarantee structural. Implement A; keep B as the
written fallback if a build-time SDK surprise forces it. **Confirm the chosen path in the Change Log.**
(This is the one item flagged to Jaiyen at hand-off.)

### The exact 7.3 ↔ 7.4 boundary (what is already shipped vs. what you build)

7.3 owns step 1 of the architecture's 4-step bridge; **7.4 owns steps 2 and 3** (step 4, the chip, is
7.5):

1. **(7.3, shipped)** The model calls `navigate`; the pure `resolveNavigate` validates against the
   registry, applies the ambiguity rule, and **returns** a typed `NavigateResult` (`navigate | clarify |
   none | unknown-surface`). The executor `navigateSkill` is a thin loader+delegate. **Do not touch
   `navigate.ts` or `navigateSkill`** — they already return exactly what you transport.
2. **(7.4)** On `{ kind: "navigate", action }`, the **server writes** the transient `data-navigate` part
   onto the stream (stub path = Task 1, live path = Task 2).
3. **(7.4)** The mounted `AlmondLauncher` **applies** the part via `useAlmondNavigation()` (the five
   `useQueryState` setters), exactly once.
4. **(7.5)** The action renders as an **action chip** that links back by re-applying the same action.

The skill's `execute` still **returns** the `NavigateResult` (the value the model sees and you lift onto
the stream). ADR-A02 explicitly rejected "render side-effects from a tool-result part" in favor of the
typed `data-navigate` part — writing that part is this story's job.

### Source-tree components to touch

- **NEW:** `src/app/(app)/_components/almond/use-almond-navigation.ts` — `"use client"`; the five
  `useQueryState` setters keyed from `surface.ts`; exposes `apply(action: NavigateAction)`. Under the
  NuqsAdapter (the launcher is — verified). Reusable by 7.5's chip "link back".
- **EVOLVES:** `src/lib/almond/responder.ts` — the **stub** (`createStubResponder` / `composeStubAnswer`
  / `classifyIntent`) emits a deterministic `data-navigate` part on a navigation turn (Task 1); the
  **live** `createModelResponder` wraps `streamText` in `createUIMessageStream` + `writer.merge` and
  writes the same part on a clean `navigate` result (Task 2). This is the most important file.
- **EVOLVES:** `src/app/(app)/_components/almond/almond-launcher.tsx` — call `useAlmondNavigation()` and
  pass `onData` to `useChat` (Design A). The transport stays `DefaultChatTransport({ api:
  "/api/almond/chat" })`.
- **EVOLVES (likely no change under Design A):** `src/app/(app)/_components/almond/almond-messages.tsx` —
  only changes if Design B (read from `message.parts`) is taken. Under Design A, untouched.
- **EVOLVES:** the stub-responder test (`src/lib/almond/tools.db.test.ts`, or a new `responder.db.test.ts`)
  + a focused client apply test.
- **DO NOT TOUCH:** `src/lib/almond/skills/navigate.ts` (returns the action as-is — 7.3),
  `src/lib/almond/tools.ts` (`navigateSkill` + the `navigate` tool already wired, 7.3),
  `src/lib/dashboard/surface.ts` / `lens.ts` (import from them; do not edit — 7.1), the dashboard
  components and their `useQueryState` call-sites (the hook **replicates** the same setters; it does not
  refactor the call-sites), `src/app/api/almond/chat/route.ts` (resolves actor/farm and calls the
  responder — the transport change is inside the responder, not the route), `persona.ts`,
  `prisma/schema.prisma`, `next.config.ts`.

### Reuse — do not reinvent

- **The resolver and the action shape exist (7.3).** `resolveNavigate(meters, input)` and
  `navigateSkill(deps, input)` already return `{ kind: "navigate", action } | clarify | none |
  unknown-surface`. The stub re-uses the SAME pure path offline (load meters + `resolveNavigate`); do not
  re-derive navigation server-side.
- **`NavigateAction` is the contract** (`src/lib/almond/skills/navigate.ts:38-49`): a closed shape over
  exactly `lens? | entity? | ranch? | rate? | meter?`. `apply()` consumes it; do not widen it.
- **The five setters already exist on the dashboard — replicate them verbatim, do not invent.** The hook
  re-creates the same `useQueryState` calls the dashboard uses so navigation is byte-identical to a
  manual click (see the table below).
- **The stream pattern already exists in the stub.** `createStubResponder` already does
  `createUIMessageStream({ execute: ({ writer }) => { writer.write({ type: "text-start", id }); ... } })`
  then `createUIMessageStreamResponse({ stream })` (`responder.ts:~173-186`). Add the `data-navigate`
  write inside that same `execute`. The live path adopts the same `createUIMessageStream` wrapper +
  `writer.merge(result.toUIMessageStream())`.
- **The registry already re-exports everything the hook needs:** `SURFACE`, `lensQueryOptions` from
  `@/lib/dashboard/surface`; the `NavigateAction` type from `@/lib/almond/skills/navigate`.

### The five canonical `useQueryState` setters — replicate these EXACTLY (verified call-sites)

The hook must mirror each key's existing call-site so an applied action is indistinguishable from a
manual click. Asymmetry is intentional: **only `lens` has a parser/default; the other four are raw
nullable strings.**

| Key | Hook call (replicate) | Verified dashboard call-site | Set semantics |
|-----|------------------------|-------------------------------|----------------|
| `lens` | `useQueryState(SURFACE.lens, lensQueryOptions())` | `lens-toggle.tsx:15`; `lensQueryOptions()` = `{ defaultValue: defaultLens(), clearOnDefault: true }` (`surface.ts:62-64`) | `setLens(action.lens)` where `action.lens` is an already-validated `Lens`; setting the default lens clears the param (same as a manual click to chart) |
| `entity` | `useQueryState(SURFACE.entity)` (bare) | `filter-bar.tsx:65`, `chart-lens.tsx:48`, `kpi-strip.tsx:88` | raw nullable string; `setEntity(value)` sets, `setEntity(null)` clears (matches `clearAll`, `filter-bar.tsx:79-82`) |
| `ranch` | `useQueryState(SURFACE.ranch)` (bare) | `filter-bar.tsx:66`, `chart-lens.tsx:49`, `kpi-strip.tsx:89` | raw nullable string |
| `rate` | `useQueryState(SURFACE.rate)` (bare) | `filter-bar.tsx:67`, `chart-lens.tsx:50`, `kpi-strip.tsx:90` | raw nullable string |
| `meter` | `useQueryState(SURFACE.meter)` (bare) | `meter-drawer.tsx:120`, `kpi-strip.tsx:91`, `finding-card.tsx:35`, `calendar-lens.tsx:48` | raw nullable string = **meter id**; `setMeter(id)` opens the drawer (drawer open = `meterId !== null && meters.some(m => m.id === meterId)`, `meter-drawer.tsx:123`), `setMeter(null)` closes it (`meter-drawer.tsx:134`) |

`apply(action)` must use `!== undefined` per key (not truthiness) so that an explicit `null` clears and an
absent field is left untouched: `if (action.meter !== undefined) void setMeter(action.meter)`, etc. Use
`void` on each setter call to discard the returned promise, exactly as the call-sites do.

### Latest tech information — AI SDK v6 data parts (installed: `ai@6.0.205`, `@ai-sdk/react@3.0.207`)

Verified against `node_modules/ai/dist/index.d.ts` and the AI SDK docs (Streaming Custom Data;
createUIMessageStream reference):

- **Write a custom data part (server):** `writer.write({ type: \`data-${string}\`, data: unknown, id?:
  string, transient?: boolean })` — exact shape at `index.d.ts:2067-2070`. `type` must be
  `"data-navigate"`. `transient: true` ⇒ delivered to the client but **not** persisted in message
  history (only via `onData`). `id` enables reconciliation of a non-transient part and is a useful
  stable key regardless.
- **Read on the client:** `useChat({ onData?: ChatOnDataCallback })` where `ChatOnDataCallback =
  (dataPart) => void` (`index.d.ts:3821, 3877`). `onData` fires once per received data part (transient
  or not). For non-transient parts you may instead iterate `message.parts` and filter
  `part.type === "data-navigate"` (then `part.data`).
- **Combine `streamText` with a custom part (live path):**
  ```ts
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const result = streamText({ model, system, messages, tools: buildAlmondSkills(deps, actor),
        stopWhen: stepCountIs(6),
        onStepFinish: ({ toolResults }) => {
          for (const tr of toolResults ?? []) {
            if (tr.toolName === "navigate" && tr.output?.kind === "navigate") {
              writer.write({ type: "data-navigate", id, data: tr.output.action, transient: true });
            }
          }
        },
      });
      writer.merge(result.toUIMessageStream());
    },
  });
  return createUIMessageStreamResponse({ stream });
  ```
  Verify `writer.merge`, `result.toUIMessageStream`, and the `onStepFinish` tool-result field name
  (`output` vs `result`) against the installed types before relying on them — the v6 step-result shape
  is the one place the docs and minor versions drift. Watch the known merge/finish-step ordering issue
  (vercel/ai#9021). The **stub path is the offline default and the AC4 test target — implement and test
  it first;** the live path is gated and harder to test (needs a mock `LanguageModel`, which
  `createModelResponder` already supports).
- **No new dependency.** `ai ^6.0.198` (resolved 6.0.205), `@ai-sdk/react ^3.0.201` (resolved 3.0.207),
  `nuqs ^2.8.9`, `zod ^4.4.3` are installed and are all this story uses. `exceljs` / `@vercel/blob` /
  `@react-pdf/renderer` are Epic 8/9 deps — keep them absent.

### Architecture compliance (the contract this story honors)

- **AR5 / AR17 / FR1(client) / ADR-A02:** one stream carries text + tool parts + the typed transient
  `data-navigate` part; **no second channel**. The client applies via the five canonical setters; each
  action applied exactly once.
- **FR6 (read-only on data):** the bridge only sets URL state — it writes nothing to a
  Finding/rate/meter/account. Setting a URL key is not a data mutation.
- **FR7 (farm-scoped by inheritance):** the stub resolves navigation against the deps-scoped farm meters;
  `farmId` never comes from the client/model. The meter id in the action is a real id from the resolved
  farm, so the client drawer (same farm) opens correctly.
- **ADR-A03 (single registry):** the hook imports keys from `surface.ts`; no hardcoded param names, no
  new query param. Almond can reach only what the registry lists.
- **ADR-A08 (capability-by-omission):** `navigate` stays in the public-safe set for both actors —
  navigation ships to the Tour. The bridge does not gate it. (The capability flag still threads
  `route → factory`; 7.4 changes only transport, not the gate.)
- **NFR3 / AR18 (offline determinism):** the stub emits a deterministic `data-navigate` part with zero
  external calls; CI/e2e stay offline. The live responder is constructed only when the Gateway key is
  present (unchanged Story 6.1 / `defaultAlmondResponder` selection).
- **NFR4 (feels instant):** applying nuqs setters updates the URL and the existing surfaces react in
  place — no reload, no parallel navigation UI.
- **Governing-doc order on any conflict:** `project-context.md` first, then the Tool 1 architecture, then
  the Almond architecture/ADRs.

### Project guardrails that bite on this story (from project-context.md)

- **No `any`** (`@typescript-eslint/no-explicit-any` is an ESLint **error**). Type the data part and
  `onData`'s `part.data` precisely (a typed `UIMessage` data-types map, or a narrowing guard). Type the
  hook's `apply` parameter as `NavigateAction`.
- **`noUncheckedIndexedAccess` is on.** Guard any array index / optional (e.g. when parsing the stub's
  navigation input from text). Don't `!`-assert.
- **No unused vars** unless `_`-prefixed (e.g. an ignored callback arg).
- **`"use client"`** on `use-almond-navigation.ts` (it uses `useQueryState`/hooks) and it must render
  under the NuqsAdapter — the launcher already is (`(app)/(dashboard)/layout.tsx:35-47`, `AlmondLauncher`
  is a direct child of `<NuqsAdapter>`). The hook must be called from a component inside that adapter
  (the launcher), never server-side.
- **Pure `/lib` stays pure.** `responder.ts` is allowed Prisma/IO (it loads meters for the stub); the
  resolver it calls (`navigate.ts`) stays pure — don't push transport concerns into it.
- **`@/` alias** for cross-module imports (`@/lib/dashboard/surface`, `@/lib/almond/skills/navigate`);
  intra-`almond`/intra-component relative imports match the neighbor file's convention.
- **kebab-case file name; colocated tests.** `use-almond-navigation.ts`.
- **Copy & voice (when text renders):** plain operator English, no exclamation marks, no kW/tariff
  jargon, **no em dashes** (FR20/NFR9). Grower-facing chip copy is 7.5; any reusable stub sentence
  template belongs in `/copy/en.ts`.
- **Vitest is node-env, not jsdom** — logic/DB tests, not component-render tests. Prefer asserting the
  server part (db test) and the action→setter mapping (pure/seam) over a DOM render; reach for the e2e
  layer for true in-browser URL assertions.

### Testing requirements

- **Two unit tiers by filename (project law):** `*.test.ts` = pure (no DB), `*.db.test.ts` = Prisma
  DB-integration. The stub-emits-`data-navigate` test needs a seeded farm (to resolve a real meter), so
  it is a **`.db.test.ts`** (extend `tools.db.test.ts` or add `responder.db.test.ts`). Mirror the
  existing stub assertion style: `const body = await res.text(); expect(body).toContain("data-navigate")`
  and assert the resolved meter id appears in the streamed `data`. Add the negative case (ambiguous /
  none / lens-typo ⇒ no `data-navigate` part).
- **The AC4 "URL changed" assertion + the project's e2e convention.** `e2e/almond.spec.ts` is
  deliberately auth-boundary-only (rejects unauthenticated `/api/almond/chat`; launcher absent on
  `/login`); its header note states the interactive launcher flow (open → tap → streamed grounded
  answer) is covered at the `.db.test.ts` layer because driving it in-browser needs an authed session +
  seeded farm, which this project chooses not to mint in Playwright. **Honor that convention:** the
  deterministic AC4 evidence is the server `data-navigate` part test + a focused `apply()`
  action→setter test. A full in-browser "URL changed after a navigation turn" Playwright test is
  possible but requires extending the harness to mint a session — a real lift; **flag it as a decision,
  do not silently skip it** (this is surfaced to Jaiyen at hand-off).
- **e2e baseline (carry-over from 7.1–7.3):** the suite is a documented **3 pass / 5 fail** baseline — 4
  failures are `net::ERR_CONNECTION_REFUSED` (the sandbox's unstable `next start`) and `almond.spec.ts:14`
  is a static `Expected 401, Received 400` mismatch — none touch Almond's runtime, all proven identical
  on baseline `aa592fd`. A failure is a 7.4 regression only if it differs from that pattern. 7.4 adds a
  client effect + a stream part; if you add an authed e2e it changes the count — document the new
  baseline explicitly.
- **Regression net:** the existing stub test (`tools.db.test.ts`, asserts a grounded text answer +
  `text-start`/`text-delta` in the body) must stay green — the navigation routing must not break the
  topic intents or the offline text answer. The factory key-set tests (seven keys, both actors) are
  untouched by 7.4 and must stay green.
- **Gate:** `npm run typecheck && npm run lint && npm test`, then `npm run build`, then `npm run test:e2e
  -w @lavinia/dashboard`. Match the 7.3 bar: typecheck/lint clean, full unit/db suite green (was 83
  files / 639 tests at 7.3 done; expect new db + client tests), build success.

### Previous story intelligence (7.3 done @ aa592fd; 7.2 @ ada4c80; 7.1 @ 9242ce6)

- **7.3 deliberately drew the line at "the skill returns the action; the server transports it."** Its
  Dev Notes are explicit: "Do not give the tool the stream writer... in this story" and "7.4 consumes
  what 7.3 produces." `navigate.ts` and `navigateSkill` are finished — your job is the transport + apply,
  not the resolver. The `tool()`'s `execute` returns the `NavigateResult` and you lift `result.action`
  onto the stream.
- **7.3 documented the action shape precisely:** `NavigateAction` admits `null` for the bridge's clear
  capability (`setMeter(null)` closes the drawer), but the 7.3 resolver only ever SETS values — it never
  emits a `null` clear. So in practice your `apply()` will mostly set keys; the `null` branch exists for
  correctness and 7.5's "close" affordances.
- **7.1 shipped the registry as a React-free module specifically so both the dashboard and Almond import
  the same keys.** The hook is the dashboard-side consumer: it reuses `SURFACE` + `lensQueryOptions`. All
  four lenses are `available: true` today (`lens.ts:19-24`).
- **All of 7.1/7.2/7.3 passed 3-layer adversarial review (Blind Hunter / Edge Case Hunter / Acceptance
  Auditor) with the bar: scope stays minimal, every AC has code+test evidence, the read-only/farm-scoped/
  capability contract is provably intact, zero leakage into the next story's surface. Expect the same
  review.** For 7.4 the obvious adversarial probes will be: (1) does a re-render or reload re-navigate?
  (the AC3 dedupe/transient guarantee), (2) does an ambiguous/none/typo turn emit a part anyway? (it must
  not), (3) is the part identical on the stub and live paths?, (4) does the hook match the manual-click
  setters exactly (especially `meter` open/close and the lens default-clears behavior)?
- **The e2e baseline is environmental, not a real failure** — carry it forward; do not "fix" the
  connection-refused failures, and do not let them mask a real 7.4 regression.

### Git intelligence

The last commits are the Almond effort in order: 7.1 (`52c92a4` impl, `28576fa` review, `9242ce6` done),
7.2 (`63fdfd7` story, `b1d083e` impl, `ada4c80` done), 7.3 (`aa592fd` — current HEAD / baseline). Shipped
Almond code: `src/lib/almond/{tools.ts, responder.ts, shape.ts, persona.ts, starters.ts, skills/navigate.ts}`
(+ tests), `src/lib/dashboard/surface.ts`, and the client `src/app/(app)/_components/almond/{almond-launcher,
almond-panel,almond-messages,almond-result}.tsx`. Match their conventions exactly: the stub's
`createUIMessageStream` writer pattern (responder.ts), the standalone-executor + `tool()`-wrapper split
(tools.ts), the defensive `m.parts ?? []` part-iteration on the client (almond-messages/result.tsx), and
the `useReducedMotion()` / `aria-live="polite"` patterns already in `almond-panel.tsx` / `almond-messages.tsx`
(for when 7.5 adds the announce).

### Project Structure Notes

- `use-almond-navigation.ts` lands in **`src/app/(app)/_components/almond/`**, exactly where the
  architecture's tree reserves it (architecture.md:513: `use-almond-navigation.ts (new: applies
  data-navigate via nuqs setters)`). No new top-level dir, no env var, no Prisma/schema change, no
  `outputFileTracingIncludes` change.
- **One documented variance from the planning docs, by necessity (see the transport decision):** the
  epics build note says 7.4 "evolves `almond-messages.tsx` (reads `data-navigate`)" and AC3 says "dedupe
  by part id." Under the recommended **transient transport (Design A)**, a transient part is NOT in
  `message.parts`, so the read site is the launcher's `useChat({ onData })` (not `almond-messages.tsx`),
  and exactly-once is structural (no manual dedupe needed). This honors the ACs' intent and the literal
  `transient: true` contract; it deviates only from the build note's file-level expectation.
  `almond-messages.tsx` is therefore likely untouched in 7.4 (chip rendering is 7.5). If the
  non-transient **fallback (Design B)** is taken, `almond-messages.tsx` does read `message.parts` and the
  dedupe-by-id `Set` is required — matching the build note literally. Record which path shipped.
- The route (`api/almond/chat/route.ts`) is untouched: it already resolves the actor/farm and calls
  `defaultAlmondResponder()`; the transport change lives entirely inside `responder.ts`.

### References

- [Source: _bmad-output/almond/3-solutioning/epics.md#Story 7.4: The server→client navigation bridge] (the 4 ACs + build notes; AR5, AR17, FR1 client, ADR-A02)
- [Source: _bmad-output/almond/3-solutioning/epics.md#Story 7.5: Action chips and the never-hijack guarantee] (what 7.4 must NOT build: chips, link-back, announce, never-hijack)
- [Source: _bmad-output/almond/3-solutioning/architecture.md#Navigation — the server→client bridge (FR1–FR4) [the hard part]] (the 4-step bridge; 7.4 owns steps 2-3: server writes data-navigate, client applies via useAlmondNavigation, applied once)
- [Source: _bmad-output/almond/3-solutioning/architecture.md#Frontend Architecture] (the launcher gains useAlmondNavigation; chips/cards render in almond-result/messages — chips are 7.5)
- [Source: _bmad-output/almond/3-solutioning/architecture.md#Navigation actions & the surface registry] (NavigateAction closed over the 5 keys; no new query-param name; apply each action once; non-destructive = undo is back)
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A02] (typed transient data-navigate part on the one stream; render-side-effects-from-tool-result and second-channel both rejected)
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A03] (single canonical surface registry; navigate/dashboard read keys from surface.ts; no hardcoded surface)
- [Source: _bmad-output/almond/4-implementation/7-3-the-navigate-skill-entity-resolver-and-ambiguity-rule.md] (what 7.3 shipped: resolveNavigate, NavigateAction, navigateSkill; the 7.3↔7.4 boundary; the e2e baseline; the review bar)
- [Source: src/lib/almond/skills/navigate.ts:38-62] (NavigateAction closed shape + NavigateResult union — the contract apply() consumes and the responder transports)
- [Source: src/lib/almond/tools.ts:95-98,168-173] (navigateSkill executor + the navigate tool() — already wired, do not touch; the execute returns the NavigateResult)
- [Source: src/lib/almond/responder.ts (createStubResponder ~173-186; createModelResponder ~51-64; defaultAlmondResponder ~190-196; composeStubAnswer/classifyIntent ~)] (the createUIMessageStream writer pattern to extend; the stub is the offline AC4 surface; the live path uses streamText().toUIMessageStreamResponse() today — wrap it)
- [Source: src/app/api/almond/chat/route.ts:24-65] (resolves actor/farm + authedOwner, calls defaultAlmondResponder — untouched by 7.4)
- [Source: src/app/(app)/_components/almond/almond-launcher.tsx:30-31] (useChat({ transport }) with DefaultChatTransport — add onData here, Design A)
- [Source: src/app/(app)/_components/almond/almond-messages.tsx:13-24,58] (defensive m.parts ?? [] iteration; aria-live="polite" log region — the read site only under Design B)
- [Source: src/app/(app)/(dashboard)/layout.tsx:35-47] (NuqsAdapter wraps the dashboard; AlmondLauncher is a direct child — so useQueryState works in the hook)
- [Source: src/lib/dashboard/surface.ts:38-64] (SURFACE_KEYS, SURFACE, lensQueryOptions — the keys/options the hook imports)
- [Source: src/lib/dashboard/lens.ts:7,19-48] (Lens type; LENSES all available; parseLens/defaultLens/isLensAvailable)
- [Source: src/app/(app)/_components/lens-toggle.tsx:15] / [filter-bar.tsx:65-67,79-82] / [chart-lens.tsx:48-50] / [kpi-strip.tsx:88-91] / [meter-drawer.tsx:120,123,134] / [finding-card.tsx:35] / [calendar-lens.tsx:48] (the EXACT five useQueryState setters to replicate; meter open/close semantics)
- [Source: e2e/almond.spec.ts:1-22] (the deliberate convention: interactive flow covered at the .db.test.ts layer, not Playwright; the e2e baseline)
- [Source: node_modules/ai/dist/index.d.ts:2067-2070 (data-part write shape incl. transient), 3821 (ChatOnDataCallback), 3877 (ChatInit.onData)] (the installed AI SDK v6 API the bridge rides — transient parts are onData-only, not in message.parts)
- [Source: _bmad-output/project-context.md#Critical Implementation Rules] (no any, noUncheckedIndexedAccess, @/ alias, use client, pure /lib, colocated tests, kebab-case, copy in /copy, no em dashes)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Change |
|------|--------|
| 2026-06-18 | Story 7.4 drafted (Create Story workflow): scope = the server→client navigation BRIDGE. Server writes a typed transient `data-navigate` part onto the existing UI-message stream on a clean `NavigateAction` — in both the offline stub responder (AC4/CI surface) and the live Gateway model path (AC5) — via the same `createUIMessageStream` writer (no second channel, AR17/ADR-A02). New client hook `src/app/(app)/_components/almond/use-almond-navigation.ts` holds the five canonical `useQueryState` setters (keyed from `surface.ts`, replicating the dashboard call-sites exactly) and exposes `apply(action)`; `almond-launcher.tsx` delivers each part to `apply` exactly once via `useChat({ onData })`. Resolved the planning-doc contradiction (transient vs message.parts/dedupe-by-id) against the installed `ai@6.0.205` API: RECOMMEND Design A (transient part + `onData`, exactly-once by construction); documented Design B (non-transient + `message.parts` + dedupe-by-id `Set`) as the fallback. No new dep, no env var, no Prisma/schema change; `navigate.ts`/`navigateSkill`/`route.ts`/`surface.ts` untouched. Chips/link-back/announce are 7.5. Status -> ready-for-dev. |
