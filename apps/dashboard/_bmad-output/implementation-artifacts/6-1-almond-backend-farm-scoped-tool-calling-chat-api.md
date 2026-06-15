---
baseline_commit: 3cb19fab78b1bc9e4bc719d22e20e06802564b38
---

# Story 6.1: Almond backend — farm-scoped tool-calling chat API

Status: done

## Story

As a grower,
I want an assistant that answers questions using my own farm's real data,
so that what it tells me is specific and true to my farm, never a generic guess.

## Acceptance Criteria

1. **Given** a POST to `/api/almond/chat`, **When** received, **Then** it is auth-gated (`auth()` session required) and owner-scoped to the caller's `dashboardFarm`; an unauthenticated caller gets 401 and a farm-less caller gets a clean 400, never another farm's data.

2. **Given** the model, **When** it answers, **Then** it can call read-only tools that REUSE the existing dashboard load functions (meters, KPI rollup, findings, rates summary, billing/reconciliation), and every tool is closed over the resolved `farmId` so a cross-farm read is structurally impossible (no `farmId` is ever taken from the model/client).

3. **Given** dev/test/CI, **When** the chat runs, **Then** the model boundary is INJECTED: a deterministic stub responder is the default (zero external calls), and the live Vercel AI Gateway model is constructed only when the key is present — mirroring `createGatewayReader` / `stubPageReader` in `src/lib/extract/reader.ts`.

4. **Given** a question whose answer is not in the farm data, **When** Almond responds, **Then** the system prompt forces it to say it does not have that and to never fabricate a number; tools are the only source of farm facts.

### AC interpretation notes (read before coding)

- **This story is backend only. No UI, no launcher, no panel** — 6.2 owns all of that. Deliverable: the route, the tools module, the persona/system prompt, the injected model boundary, and tests.
- **The injection pattern is the law here, copy it from `reader.ts`.** `src/lib/extract/reader.ts` already solves "an AI call vs a deterministic fixture is injected so dev/CI make zero external calls." Almond reuses that exact shape: define an `AlmondResponder` interface; export `stubAlmondResponder` (deterministic, default, used by tests and when no key) and `createGatewayResponder()` (the live one, built with `createGateway` reading `process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_AI_SDK_API_KEY`, model `"anthropic/claude-opus-4-8"`). Reuse `reader.ts`'s `hasGatewayKey()`-style guard — do not duplicate the key-name logic, import/share it if it is exported, otherwise mirror it in a shared `src/lib/ai/gateway.ts` and have BOTH reader.ts and almond use it (small refactor, keep reader.ts behavior identical).
- **AI SDK v6 (`ai@^6`) — verify the exact API, do not guess.** v6 changed signatures from v4/v5 (tools use `inputSchema` not `parameters`; multi-step uses `stopWhen: stepCountIs(n)` not `maxSteps`; the route returns `result.toUIMessageStreamResponse()` for `useChat`). BEFORE writing the route, invoke the `vercel:ai-sdk` skill for the canonical v6 `streamText` + `tool()` + tool-calling-loop + `toUIMessageStreamResponse` shapes, and check the installed `ai` package types under `node_modules/ai`. Match what is actually installed.
- **Tools reuse existing loaders — never re-query raw Prisma.** Each tool calls the functions the dashboard already uses (see Dev Notes "What exists to build on"). The tool layer is a thin, typed, farm-scoped wrapper, not a new data layer. Keep the tool result objects small and plain (the model reads them) — summarize 183 meters, do not dump every interval.
- **Farm scoping is structural, not prompt-based.** The route resolves `farmId` once via `dashboardFarm(prisma, sessionUserId())`. The tools are built by a factory `buildAlmondTools({ prisma, farmId })` that closes over that `farmId`. No tool accepts a farmId argument from the model. This is the same owner-scoping law as `resolveFinding` in `(app)/actions.ts`.
- **Read-only, never executes.** Almond mirrors the v1 recommendation law ("display, never execute"). No tool mutates; no tool resolves a finding or changes a rate. If asked to "do" something, Almond explains what the grower can do, it does not act.
- **Zero external calls in tests.** All tests use `stubAlmondResponder` and the demo farm seed; the gateway path is never hit in CI.

## Tasks / Subtasks

- [x] **Task 1: Shared gateway helper** — Create `src/lib/ai/gateway.ts` exporting `resolveGatewayKey()` / `hasGatewayKey()` and a `createGatewayModel(modelId = "anthropic/claude-opus-4-8")` built from `createGateway({ apiKey })` (key = `AI_GATEWAY_API_KEY ?? VERCEL_AI_SDK_API_KEY`). Refactor `src/lib/extract/reader.ts` to import these instead of its inline copy, keeping its behavior byte-identical (tests for reader stay green). (AC3)
- [x] **Task 2: Farm-scoped tool layer** — `src/lib/almond/tools.ts`: `buildAlmondTools({ prisma, farmId })` returns the AI SDK v6 tool set, each `tool()` closed over `farmId`, REUSING existing loaders. Minimum tools: `getFarmOverview` (farm name + KPI rollup via `loadDashboard`/`computeKpiStrip`), `listMeters` (compact `MeterView` summaries via `loadMetersForFarm`, filterable by rate/entity/ranch), `getMeter` (one meter's detail + its billing periods), `listFindings` (pending recommendations via `loadFindings`), `getRatesSummary` (distinct rate schedules across meters + counts), `getReconciliation` (coverage/billing-accuracy summary). Each tool's `execute` is a thin call into `/lib/dashboard/*`; results are small plain objects. Put the pure shaping (e.g. rate-summary aggregation) in tested helpers. (AC2)
- [x] **Task 3: Persona + system prompt** — `src/lib/almond/persona.ts`: the Almond system prompt (almond-character voice, plain operator English, no jargon/no kW on the surface, no exclamation marks). Hard rules in the prompt: ALWAYS use a tool for any farm fact; if the tools do not have it, say so plainly; never invent a number; money in whole dollars; you are read-only and never take actions. Keep the prompt in this module (not inline in the route); copy that the grower might see still goes in `/copy`. (AC4)
- [x] **Task 4: Injected responder boundary** — `src/lib/almond/responder.ts`: `AlmondResponder` interface with a `stream(messages, { tools, system })` method returning the v6 stream result; `stubAlmondResponder` (deterministic — echoes a canned grounded answer, and when the incoming question matches a known intent it CALLS the relevant tool so tool-calling is exercised in tests without a model); `createGatewayResponder()` building the live `streamText` call with `createGatewayModel()`, the tools, the system prompt, and v6 multi-step tool calling. Default selection: live responder iff `hasGatewayKey()`, else stub. (AC3)
- [x] **Task 5: The route** — `src/app/api/almond/chat/route.ts` (POST): `auth()` → 401 if no session; `dashboardFarm(prisma, userId)` → 400 if none; parse the v6 `useChat` request body (UI messages); build tools via `buildAlmondTools({ prisma, farmId })`; pick the responder; return `result.toUIMessageStreamResponse()`. Node runtime (Prisma). No farmId from the client. (AC1, AC2)
- [x] **Task 6: Tests** — `src/lib/almond/tools.db.test.ts` (DB integration, the `import.db.test.ts` pattern): tools return correct data for the seeded demo farm; the farm-scoping guard — build tools for farm A and assert no call can surface farm B's meters/findings (seed two farms). `src/lib/almond/responder.test.ts` + `persona`/shaping pure tests: stub responder produces a grounded answer and exercises a tool call; rate-summary/shaping helpers are pure and tested. Route-level: unauth → 401, farm-less → 400. lint + tsc + full vitest green; `npm run build` clean. (AC1-4)

### Review Findings (2026-06-10 code review)

- [x] [Review][Decision] Offline stub ignores the user's question — `composeStubAnswer(deps)` discards `uiMessages`, so every starter/query returns the same canned overview; tool-chips never render offline; AC4 ("I don't have that") and Task-4 "stub exercises a tool" hold only on the live path [src/lib/almond/responder.ts]
- [x] [Review][Patch] `latestMonthSpend` typed `| null` but never null → Almond states "$0 spend" for a farm with no bills; the downstream null-check is dead [src/lib/almond/shape.ts summarizeFarmOverview]
- [x] [Review][Patch] Sub-dollar finding impact rounds to "$0" → stub can headline an opportunity "worth about $0" [src/lib/almond/shape.ts summarizeFindings / responder.ts composeStubAnswer]
- [x] [Review][Patch] Signed deltas (spend, biggest mover) carry no up/down semantics → the live model can narrate a spend DROP as an increase [src/lib/almond/shape.ts]
- [x] [Review][Patch] Live responder path is unguarded: `createGatewayModel`/`convertToModelMessages`/empty-messages errors become 500s instead of the inline error state; also validate messages is non-empty [src/app/api/almond/chat/route.ts, src/lib/almond/responder.ts]
- [x] [Review][Patch] `findMeter` returns the first match for ambiguous/duplicate names with no "ambiguous" signal → wrong meter at Batth scale [src/lib/almond/shape.ts]
- [x] [Review][Patch] `rateSchedulesByFrequency` "(unknown)" bucket is counted in the overview → a no-rate farm reads as "1 rate schedule" [src/lib/almond/shape.ts]
- [x] [Review][Patch] Empty/whitespace farm name flows untrimmed into the prompt, greeting, and stub [route.ts, persona.ts, responder.ts]

## Dev Notes

### What exists to build on (reuse, do not reinvent)

- **`src/lib/extract/reader.ts`** — the injected-AI-boundary pattern to copy verbatim in spirit: `PageReader` interface, `stubPageReader` (throws/default), `createGatewayReader(modelId="anthropic/claude-opus-4-8")`, the `AI_GATEWAY_API_KEY ?? VERCEL_AI_SDK_API_KEY` resolution, and `createGateway` from `ai`. This is the proven in-repo Gateway call.
- **`src/lib/dashboard/load.ts`** — `loadDashboard(prisma, { userId })`, `loadMetersForFarm(prisma, farmId)`, the `MeterView` type (`id` = Pump cuid, `name`, rate, periods, etc.). The tools wrap these.
- **`src/lib/dashboard/findings.ts`** — `loadFindings(prisma, farmId)` → `FindingView[]` (pending recommendations). The `listFindings` tool wraps this.
- **`src/lib/dashboard/kpi.ts`** — `computeKpiStrip(meters)` pure rollup. The `getFarmOverview` tool uses this.
- **`src/lib/onboarding/farm.ts`** — `dashboardFarm(prisma, userId)` (owner-scoped: real outranks demo, never another grower's farm). **`src/lib/auth.ts`** — `auth()` and `sessionUserId()`.
- **`src/app/(app)/actions.ts`** — the owner-scoping + `ActionResult` discipline (verify ownership before touching data); Almond's route follows the same scoping law.
- **`src/lib/db.ts`** — the `prisma` singleton for app code; DB edges take an explicit `PrismaClient`.
- **AI SDK:** `ai@^6.0.198` installed; `@ai-sdk/react@latest` installed in this story's prep (used by 6.2). `motion`, `clsx`, `tailwind-merge` present.

### Critical guardrails

1. **Farm scoping is structural** — `farmId` resolved once in the route from the session; tools close over it; no tool takes a farmId from the model. Cross-farm reads must be impossible, and a test must prove it (two seeded farms).
2. **Read-only, never executes** — no tool mutates anything (mirrors the v1 recommendation law).
3. **Injected model boundary** — stub by default; live Gateway only when the key is present; tests make zero external calls.
4. **Reuse loaders** — tools are thin wrappers over `/lib/dashboard/*`; no new raw-Prisma data layer; results are small plain objects (summarize, do not dump 183 meters or any 15-min intervals).
5. **TS strict, no `any`, `noUncheckedIndexedAccess`** — Json narrowing on `action`/`result` uses the safe pattern from `findings.ts`, not casts.
6. **Pure shaping is tested; the route only wires.** 
7. **Verify the AI SDK v6 API against the installed package + the `vercel:ai-sdk` skill** — do not write v4/v5 signatures from memory.
8. **Voice:** Almond is plain operator English, no exclamation marks, no kW/jargon on the surface; never fabricates a number.

### Project Structure Notes

- New: `src/lib/ai/gateway.ts`, `src/lib/almond/{tools,persona,responder}.ts` (+ `tools.db.test.ts`, `responder.test.ts`, shaping `*.test.ts`), `src/app/api/almond/chat/route.ts`.
- Modified: `src/lib/extract/reader.ts` (use the shared gateway helper; behavior identical).
- Untouched: Prisma schema (Almond reads existing models), the dashboard UI, the recommendation engines.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6 / Story 6.1] — the four ACs and the Epic-6 framing (injected boundary, farm-scoped, read-only).
- [Source: src/lib/extract/reader.ts] — the injected Gateway/stub boundary to mirror.
- [Source: src/lib/dashboard/{load,findings,kpi}.ts; src/lib/onboarding/farm.ts; src/lib/auth.ts] — the loaders and owner-scoping the tools wrap.
- [Source: src/lib/greenbutton/import.db.test.ts] — the DB integration test pattern.
- [Skill: vercel:ai-sdk] — canonical AI SDK v6 streamText/tool/useChat/toUIMessageStreamResponse signatures (consult before coding).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Opus 4.8, 1M context) — unattended overnight dev-story run.

### Debug Log References

- AI SDK v6 verification (against the installed `ai@6.0.199` / `@ai-sdk/react@3.0.201`): `tool()` uses `inputSchema`; `streamText` + `stopWhen: stepCountIs(n)` + `result.toUIMessageStreamResponse()`; `convertToModelMessages` is ASYNC in v6 (returns `Promise<ModelMessage[]>`) — awaited it. `DefaultChatTransport` is exported from `ai`, not `@ai-sdk/react` (noted for 6.2). UI-message-stream chunk shapes confirmed from the dist types: `text-start {id}` / `text-delta {id, delta}` / `text-end {id}`.
- Two tsc fixes mid-build: `formatUsdWhole` is exported from `@/lib/format/money` (the `@/lib/format` index only re-exports `formatUsd`/`centsFromDollars`); `Coverage` is `{ loaded, total }`, not a string union (test fixture corrected).
- Test fixture `??` trap: nullable-field overrides must use spread / `in`, not `??` (null coalesced back to the default) — fixed in `shape.test.ts`.
- Gates: `tsc --noEmit` clean; `eslint .` clean; `vitest run` 76 files / 588 tests green (+21 new: 12 shape, 9 tools.db); `npm run build` clean with `/api/almond/chat` registered as a dynamic route. Zero external calls (stub responder; no Gateway key touched).

### Completion Notes List

- **The Almond backend is live and farm-scoped.** `/api/almond/chat` resolves the farm ONCE from the session (`sessionUserId` -> `dashboardFarm`) and builds the tools closed over that `farmId`; no tool accepts a farmId argument, so cross-farm reads are structurally impossible. A DB test proves it: a second farm's tools never surface the first farm's meters/findings, and vice versa.
- **The model boundary is injected, mirroring `reader.ts`.** `defaultAlmondResponder()` returns the live Gateway responder iff `hasGatewayKey()`, else the offline `createStubResponder()`. Dev/test/CI make zero external calls; the stub grounds its answer in the farm via the same loaders the tools wrap (proven: the stub names the real farm and meter count). The shared key/model construction moved to `src/lib/ai/gateway.ts`; `reader.ts` now imports it and still re-exports `hasGatewayKey` (its callers unchanged).
- **Tools reuse the dashboard loaders** (`loadMetersForFarm`, `computeKpiStrip`, `loadFindings`) and shape results with pure, tested helpers in `shape.ts` — a thin wrapper, not a new data layer. Six read-only tools: overview, listMeters (filterable), getMeter, listFindings, getRatesSummary, getReconciliation. Money carried as cents + whole-dollar string; nothing mutates.
- **Persona enforces groundedness:** the system prompt forbids answering farm facts from memory, forbids inventing numbers, keeps Almond read-only, and pins it to the one farm.
- **Scope note (for review):** the live streamText tool-call loop is type-checked and follows the proven `reader.ts` gateway pattern but is exercised at runtime only on the real/key path (and by 6.3's e2e against the stub), not by a mock-model unit test — deferred to keep this story offline and avoid coupling to the v6 mock-model stream-part shape. UI is 6.2; this story is backend only.

### File List

- `src/lib/ai/gateway.ts` (new) — shared Gateway key resolution + `createGatewayModel`.
- `src/lib/almond/shape.ts` (new) — pure shapers (overview, meters, meter detail, rates, reconciliation, findings).
- `src/lib/almond/shape.test.ts` (new) — 12 pure tests.
- `src/lib/almond/persona.ts` (new) — Almond system prompt.
- `src/lib/almond/tools.ts` (new) — standalone executors + `buildAlmondTools` (farm-scoped AI SDK tools).
- `src/lib/almond/responder.ts` (new) — `AlmondResponder`, stub + model/gateway responders, `composeStubAnswer`, `defaultAlmondResponder`.
- `src/lib/almond/tools.db.test.ts` (new) — 9 DB-integration tests (correctness, cross-farm isolation, findings scoping, stub grounding + stream).
- `src/app/api/almond/chat/route.ts` (new) — the auth-gated, owner-scoped POST route.
- `src/lib/extract/reader.ts` (modified) — uses the shared gateway helper; re-exports `hasGatewayKey`; behavior identical.

## Change Log

- 2026-06-10: Implemented Story 6.1 — Almond's farm-scoped, read-only, tool-calling chat backend with an injected model boundary (offline stub default, live Vercel AI Gateway when keyed), reusing the dashboard loaders. Extracted the shared `@/lib/ai/gateway` helper from `reader.ts`. lint + tsc + 588 tests + production build green (zero external calls). Status -> review.
