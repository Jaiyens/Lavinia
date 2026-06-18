---
baseline_commit: 9242ce6bec228274b2b340bdf867053be8f68d6b
---

# Story 7.2: Extend the tool factory into the skill framework

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Effort: Almond — Terra's Generative Operator (Epics 7-10). Tracked in the per-effort folder
     _bmad-output/almond/4-implementation/ (NOT the global implementation-artifacts/ path), so it
     never collides with the Tool 1 dashboard sprint. See _bmad-output/almond/index.md. -->
<!-- PRODUCT GATE: the heavy Almond build is gated behind FARMER VALIDATION (PRD Open Q4 / decision
     D14). Writing this story file is the allowed per-story step. Story 7.1 (the surface registry)
     already shipped, so Epic 7 is in-progress; 7.2 is the second foundation story and, like 7.1,
     is a structural/plumbing change with no new grower-facing capability. The gate still governs
     when later capability stories (exports/PDF) begin dev-story. -->

## Story

As a grower,
I want Almond's new powers to obey the same safety rules as its existing answers,
So that an assistant that can now *do* things still can never touch another farm's data or change mine.

(Foundation story. The grower sees nothing new here. This is the seam every later skill — `navigate`
in 7.3, `exportSpreadsheet` in 8.5, `generateReport` in 9.3 — is built through, so the read-only,
farm-scoped, capability-gated contract is established **once** and inherited by construction. No new
skill is added in this story; it reshapes the factory and threads the capability flag.)

## Acceptance Criteria

1. **Given** the shipped `buildAlmondTools(deps)` factory, **When** extended, **Then** it becomes
   `buildAlmondSkills(deps, actor)` where `deps` carries `{ prisma, farmId, farmName }` (unchanged,
   the existing `AlmondToolDeps`) and `actor` carries `{ authedOwner: boolean }`; the six existing
   read tools (`getFarmOverview`, `listMeters`, `getMeter`, `listFindings`, `getRatesSummary`,
   `getReconciliation`) are returned unchanged and still pass their existing tests.

2. **Given** any skill built by the factory, **When** it runs, **Then** it closes over the resolved
   `farmId` from `deps` and **never** accepts a `farmId` or any scope argument from the model or
   client (FR7); a skill's input schema (Zod) can carry shape only, never a scope value. (Re-asserts
   the Story 6.1 owner-scoping law for the new factory shape.)

3. **Given** the read-only contract, **When** any v1 skill executes, **Then** it performs no write to
   a Finding, rate, meter, account, or anything utility-side (FR6) — the only writes any skill will
   ever perform are artifact persistence, introduced in Epic 8 (Story 8.6).

4. **Given** the offline stub responder, **When** the framework is exercised in dev/test/CI, **Then**
   every skill the factory returns is answerable by the stub with zero external calls (NFR3, AR18);
   the live Gateway responder is constructed only when the key is present (unchanged Story 6.1
   `defaultAlmondResponder` pattern).

5. **Given** the `actor.authedOwner` flag, **When** the factory assembles the skill set, **Then** the
   mechanism to include/omit a skill by capability exists (used by Epic 8 to withhold generate/save
   from the public Tour); **for this story, only the read tools are returned regardless of
   `authedOwner`** (the soon-to-arrive `navigate` is read-safe and lands in 7.3; the owner-only
   export/report skills land in Epic 8). The flag is threaded route -> responder -> factory and is
   provably wired, even though nothing is gated by it yet.

6. **Given** the route's resolved actor, **When** a turn is handled, **Then** `authedOwner` is derived
   server-side from the resolved farm (`dataKind === "real"` = the signed-in owner's own connected
   farm; the public Tour's `representative`/demo farm = `false`) and passed into the responder; it is
   **never** read from the request body or any client-supplied value (capability is a server property,
   AR15/ADR-A08).

## Tasks / Subtasks

- [x] **Task 1 — Reshape the factory: `buildAlmondTools(deps)` -> `buildAlmondSkills(deps, actor)`** (AC: 1, 2, 3, 5)
  - [x] In `src/lib/almond/tools.ts`, add an `AlmondActor` type: `export type AlmondActor = { authedOwner: boolean };`.
  - [x] Rename `buildAlmondTools` to `buildAlmondSkills(deps: AlmondToolDeps, actor: AlmondActor)`.
        Keep `deps`/`AlmondToolDeps` exactly as-is (`{ prisma, farmId, farmName }`); the six read
        `tool()` definitions move verbatim.
  - [x] Build the returned object so the **capability-by-omission seam exists**: assemble the read
        tools as a base object, then leave a clearly-commented extension point where owner-only skills
        will be conditionally spread in Epic 8 (e.g. `...(actor.authedOwner ? ownerSkills : {})`). In
        7.2 there are no owner-only skills yet, so the returned set is the six read tools for **both**
        `authedOwner` values. Do not add a placeholder/no-op skill; scaffold the conditional, not a
        fake capability.
  - [x] Rename the `AlmondTools` type export to `AlmondSkills = ReturnType<typeof buildAlmondSkills>`.
        Update the file-header comment (lines 18-27) so it documents the `actor` capability flag and
        that scope still comes only from `deps`, never the model.
  - [x] Confirm no read tool's Zod `inputSchema` carries a `farmId`/scope field (it does not today —
        keep it that way): `listMeters` takes `rate/entity/ranch/limit`, `getMeter` takes `query`.
        Shape only, never scope (AC2).
- [x] **Task 2 — Thread `actor` through the responder** (AC: 1, 4, 5)
  - [x] In `src/lib/almond/responder.ts`, add `actor: AlmondActor` to the `AlmondRequest` type
        (alongside `uiMessages`, `system`, `deps`).
  - [x] Update `createModelResponder().toResponse` to call `buildAlmondSkills(deps, actor)` instead of
        `buildAlmondTools(deps)` (line ~54); update the import on line 22.
  - [x] The stub path (`createStubResponder`, `composeStubAnswer`) **does not change behavior**: the
        stub grounds directly via the loaders and never reads the tool set, so it answers every
        returned skill with zero external calls (AC4). `composeStubAnswer` keeps its current signature;
        the `actor` is accepted in `AlmondRequest` and simply ignored by the stub for this story.
  - [x] Leave `createGatewayResponder` / `defaultAlmondResponder` selection untouched (live only when
        `hasGatewayKey()`).
- [x] **Task 3 — Derive and pass `authedOwner` in the route** (AC: 6)
  - [x] In `src/app/api/almond/chat/route.ts`, after `resolved` is obtained, derive
        `const authedOwner = resolved.dataKind === "real";` (the signed-in owner's own connected farm;
        the public Tour's `demoFarm` is always `representative` -> `false`). Add a one-line comment
        explaining the derivation and that it is server-only (never from the body).
  - [x] Pass `actor: { authedOwner }` into `responder.toResponse({ uiMessages, system, deps, actor })`.
  - [x] No other route behavior changes: the 400 (no farm) / 500 (responder failure) guards, the
        owner-scoping via `dashboardFarm`/`demoFarm`, and the `runtime = "nodejs"` stay exactly as-is.
- [x] **Task 4 — Update the regressed consumers and prove the contract** (AC: 1, 2, 3, 4, 5)
  - [x] Update `src/lib/almond/tools.db.test.ts`: the import (line 7) and the
        `"buildAlmondTools exposes exactly the read-only tool set"` test (lines 83-95) now call
        `buildAlmondSkills(depsA, { authedOwner: true })`. Add an assertion that
        `buildAlmondSkills(depsA, { authedOwner: false })` returns the **same** six keys (nothing is
        gated yet — locks AC5's "returned regardless" guarantee and guards against a future regression
        once owner-only skills are added).
  - [x] (Optional, lightweight) Add `src/lib/almond/tools.test.ts` (pure, no DB): build the factory
        with a minimal stubbed `deps` (the factory only wraps executors in `tool()`; it does not touch
        Prisma at build time) and assert the returned key set for both `authedOwner` values. This is
        the pure "capability-mechanism" test mirroring `shape.test.ts`; keep executor behavior in the
        db test.
  - [x] The existing cross-farm scoping tests (`tools.db.test.ts` lines 98-133) and the stub-responder
        tests (135-167) must pass **unchanged** — they call the standalone executors and
        `composeStubAnswer`/`createStubResponder`, none of which change semantics.
  - [x] Gate before claiming done: `npm run typecheck && npm run lint && npm test` (from root or
        `-w @lavinia/dashboard`), then `npm run test:e2e -w @lavinia/dashboard`. `e2e/almond.spec.ts`
        runs the offline stub by default; the route change (adding `actor`) must be transparent to it.

## Dev Notes

### What this story is (and is not)

- **Is:** a structural reshape of the Almond tool factory into a **skill factory** that also carries a
  server-resolved capability flag (`actor.authedOwner`), plus the plumbing that threads that flag
  route -> responder -> factory. It establishes — once — the contract every later skill inherits:
  built by the factory, farm-scoped from `deps`, read-only on data, stub-answerable, and gated by
  capability-via-omission.
- **Is NOT:** the addition of any new skill. `navigate` is Story 7.3; `exportSpreadsheet` is 8.5;
  `generateReport` is 9.3. In 7.2 the factory still returns exactly the six shipped read tools. There
  is **no new dependency, no DB/schema change, no new env var, and no `/copy` change.** The grower-facing
  behavior is byte-for-byte identical; only the internal shape changes.
- **Risk:** low, but it has a **rename blast radius** (below) that will fail typecheck if any consumer
  is missed. Treat a green typecheck + the unchanged tests as the proof the rename is complete.

### VERIFIED rename blast radius (every `buildAlmondTools` / `AlmondTools` reference)

A full grep (`grep -rn "buildAlmondTools\|AlmondTools" src/`) shows exactly these references; all must
be updated or the build fails:

| File | Line(s) | Reference | Change |
|---|---|---|---|
| `src/lib/almond/tools.ts` | 72 | `export function buildAlmondTools(deps)` | rename -> `buildAlmondSkills(deps, actor)` |
| `src/lib/almond/tools.ts` | 25, 131 | header comment + `export type AlmondTools = ReturnType<...>` | rename type -> `AlmondSkills`; update comment |
| `src/lib/almond/responder.ts` | 22 | `import { buildAlmondTools, type AlmondToolDeps }` | import `buildAlmondSkills` + `AlmondActor` |
| `src/lib/almond/responder.ts` | 54 | `tools: buildAlmondTools(deps)` | `tools: buildAlmondSkills(deps, actor)` (needs `actor` on `AlmondRequest`) |
| `src/lib/almond/tools.db.test.ts` | 7, 83-95 | imports + the "exact tool set" test | call `buildAlmondSkills(depsA, { authedOwner: true })`; add the `authedOwner:false` parity assertion |

`AlmondToolDeps` is **unchanged** and keeps its name (it is the data scope, not the capability) — do
not rename it. Only the *factory function* and its *return type* are renamed; `deps` stays.

### Source-tree components to touch

- **EVOLVES:** `src/lib/almond/tools.ts` — `buildAlmondSkills(deps, actor)`, new `AlmondActor` type,
  `AlmondSkills` return type, the capability-by-omission seam (commented, no gated skill yet).
- **EVOLVES:** `src/lib/almond/responder.ts` — `AlmondRequest` gains `actor`; `createModelResponder`
  calls the renamed factory. Stub path unchanged in behavior.
- **EVOLVES:** `src/app/api/almond/chat/route.ts` — derive `authedOwner` from `resolved.dataKind` and
  pass `actor` into `toResponse`.
- **EVOLVES:** `src/lib/almond/tools.db.test.ts` — rename + parity assertion.
- **NEW (optional):** `src/lib/almond/tools.test.ts` — pure capability-mechanism test.
- **DO NOT TOUCH (semantics):** `shape.ts`, `persona.ts`, `starters.ts`, the read-tool executors
  (`farmOverview`, `meterList`, `meterDetail`, `findingList`, `ratesSummary`, `reconciliation`) — they
  are read-only and farm-scoped already; the factory just wraps them.

### The `actor` flag — how it is derived (the load-bearing detail)

The route already resolves the farm and a `dataKind` that distinguishes the owner's real account from
the badged demo (read `src/lib/onboarding/farm.ts` lines 1660-1710):

```ts
// route.ts today
const resolved = userId ? await dashboardFarm(prisma, userId) : await demoFarm(prisma);
// resolved.dataKind: "real"           = the signed-in owner's own connected farm (dashboardFarm)
//                    "representative"  = the badged demo seed (public Tour via demoFarm)
```

`dashboardFarm(prisma, userId)` returns `null` for a signed-in user who owns no farm (they route to
onboarding and never reach Almond), and only ever returns `dataKind: "real"` for the owner's own farm.
The public Tour path (no `userId`) uses `demoFarm` directly and is always `representative`. Therefore:

```ts
const authedOwner = resolved.dataKind === "real";   // server-only; never from the request body
```

This is the honest signal for AR15/ADR-A08: **capability is a server property, enforced by which
skills the model is handed**, not a runtime `if` inside a skill the model could route around. In 7.2
nothing is gated, but wiring the *correct* derivation now means Epic 8 only adds the conditional skills,
not the plumbing. (`Boolean(userId)` would be equivalent at this one call-site today, but `dataKind`
is the meaning we want — "this is the owner's own data" — so prefer it.)

### The capability-by-omission seam (scaffold, do not fake)

ADR-A08 is explicit: gate by *which tools the model is handed*, not a bypassable check. Shape
`buildAlmondSkills` so Epic 8 is a one-line addition:

```ts
// src/lib/almond/skills.ts illustrative — final shape is the dev agent's; ACs are the contract
export function buildAlmondSkills(deps: AlmondToolDeps, actor: AlmondActor) {
  const readTools = {
    getFarmOverview: tool({ /* ...unchanged... */ }),
    listMeters:      tool({ /* ...unchanged... */ }),
    getMeter:        tool({ /* ...unchanged... */ }),
    listFindings:    tool({ /* ...unchanged... */ }),
    getRatesSummary: tool({ /* ...unchanged... */ }),
    getReconciliation: tool({ /* ...unchanged... */ }),
  };
  // Capability seam (Epic 8): owner-only skills will be spread in here, e.g.
  //   ...(actor.authedOwner ? { exportSpreadsheet: ..., generateReport: ... } : {})
  // 7.3 adds `navigate` here UNCONDITIONALLY (read-safe). For 7.2 there are none yet,
  // so the read tools are returned regardless of actor.authedOwner.
  return { ...readTools };
}
```

`actor` is consumed (referenced) even though it gates nothing yet — keep the no-`any`/no-unused-var
lint happy by reading it in the comment-marked seam, or accept it and let the seam reference it. Do
not introduce a fake skill just to "use" the flag.

### Stub-answerability (AC4) — why it holds for free here

The offline stub (`composeStubAnswer` in `responder.ts` lines 109-164) does **not** invoke the tool
set — it loads the farm through the same loaders the tools wrap and routes on the user's question via
`classifyIntent`. So every skill the factory returns in 7.2 (the six read tools) is already answerable
offline with zero external calls; the `tools.db.test.ts` "offline stub responder" block proves it. The
discipline this story *establishes* (every new skill must be stub-answerable) bites in 7.3+ when
`navigate`/exports are added — those stories must teach the stub to drive their deterministic result.
For 7.2 there is nothing new for the stub to learn.

### Architecture compliance (the contract this story makes load-bearing)

- **ADR-A01 / FR5:** skills are AI-SDK `tool()`s selected by the same `streamText` loop; extend in
  place, do not introduce a new agent runtime or framework. The factory is the extension point.
- **FR6 (read-only on data):** no skill mutates a Finding, rate, meter, or anything utility-side; the
  only future write is `GeneratedReport` + Blob (Epic 8). 7.2 adds no write.
- **FR7 (farm-scoped by inheritance):** `farmId` comes only from `deps`; a skill's Zod input carries
  shape only. Re-asserted by the unchanged cross-farm scoping db tests.
- **ADR-A08 / AR15 (capability-by-omission):** `authedOwner` threads route -> responder -> factory and
  gates by tool inclusion. 7.2 wires the flag; Epic 8 spends it.
- **NFR3 (determinism):** model boundary stays injected; the stub default keeps dev/CI offline. No
  change to `defaultAlmondResponder`'s selection.
- **Governing-doc order on any conflict:** `project-context.md` first, then the Tool 1 architecture,
  then the Almond architecture/ADRs (epics.md Overview).

### Library / framework requirements (no new deps)

- `ai ^6.0.198` (`tool`, `streamText`, `createUIMessageStream`, `convertToModelMessages`) and
  `zod ^4.4.3` are already installed and are all this story uses — verified in `package.json`. **Add
  no dependency.** `exceljs`, `@vercel/blob`, `@react-pdf/renderer` are Epic 8/9 deps and are correctly
  **absent** today; do not install them in 7.2.
- AI SDK v6 `tool({ inputSchema, execute })` is the shape already in `tools.ts`; keep it. Do not switch
  to `parameters` (v4 naming) — the codebase is on v6 `inputSchema`.

### Testing requirements

- Two unit tiers by filename (project-context law): `*.test.ts` = pure (no DB), `*.db.test.ts` = Prisma
  DB-integration. Vitest `include` is `src/**/*.test.ts`, node env.
- The **regression net** is `src/lib/almond/tools.db.test.ts` — it must pass after the rename with the
  one updated test, plus the new `authedOwner:false` parity assertion. The cross-farm scoping and
  stub-responder blocks must pass unchanged (proof the read path and offline determinism are intact).
- Optional pure `tools.test.ts`: assert the returned key set for both `authedOwner` values without a DB
  (the factory does not call Prisma at build time). Mirrors `shape.test.ts`/`starters.test.ts` as the
  pure tier.
- `e2e/almond.spec.ts` runs the stub offline; the route change must be transparent. Note from 7.1: the
  e2e suite in this sandbox has pre-existing/environmental red (3 pass / 5 fail, proven identical on
  baseline) — run it, but a failure is only a regression if it differs from the baseline (9242ce6)
  pattern and touches Almond. Do not treat the known environmental failures as 7.2 regressions.
- Gate: `npm run typecheck && npm run lint && npm test`, then `npm run test:e2e -w @lavinia/dashboard`.

### Project guardrails that bite on this story (from project-context.md)

- **No `any`** (`@typescript-eslint/no-explicit-any` is an ESLint *error*). Type `AlmondActor`
  precisely. **`noUncheckedIndexedAccess` is on.** **No unused vars** — if `actor` is not yet read in
  a code path, reference it in the seam rather than prefixing with `_` (keep it honest that the flag is
  threaded).
- **Imports use the `@/` alias.** `responder.ts`/`route.ts` already import via `@/lib/almond/...`;
  match that.
- **Pure logic stays pure.** The factory and executors are `src/lib/almond` modules: no `"use client"`,
  no React. The route is the only place that resolves the actor (server boundary).
- **No user-facing copy changes** in this story — the factory and flag are internal plumbing. No
  `/copy/en.ts` edit expected; no persona/system-prompt change (the FR9 preview line and any
  navigate/export copy come with their own stories).
- **kebab-case file names; colocated `*.test.ts`.** If you split the factory into `skills.ts`, keep the
  existing `tools.ts` name unless the rename is clean across all consumers — the architecture's tree
  names the file `tools.ts (evolves: buildAlmondSkills(deps, actor))`, so **keep `tools.ts`** and
  rename only the exports inside it. (Renaming the file too is allowed but widens the blast radius for
  no benefit; the architecture keeps the filename.)

### Previous story intelligence (Story 7.1 — shipped, commit 52c92a4 / marked done 9242ce6)

- 7.1 built `src/lib/dashboard/surface.ts` (the canonical surface registry) and refactored **10** nuqs
  call-sites (the architecture said 9; `map-lens.tsx` was the verified +1). It is a **pure module, no
  `"use client"`, no React** — explicitly so that *this* effort's server-side `navigate` skill (7.3)
  can import it. 7.2 does not touch the registry, but 7.3 (the next story) will; nothing in 7.2 should
  regress `surface.ts` or its call-sites.
- 7.1 exports (for 7.3 to consume, not 7.2): `SURFACE_KEYS`, `SurfaceKey`, `SURFACE` (per-key literal
  map), `lensQueryOptions()`, and the re-exported lens-value authority (`parseLens`, `defaultLens`,
  `LENSES`, `LENS_KEYS`, `isLensAvailable`, `Lens`). 7.2 needs none of these; noted so the dev knows
  the registry is ready when 7.3 starts.
- 7.1's verified gate result (the bar to match): `typecheck` clean, `lint` clean, **623 unit/db tests
  pass** (`npm test`), `build` success; e2e was 3 pass / 5 fail **proven identical on the baseline**
  (an unstable e2e web server in the sandbox + a pre-existing Tour assertion + the almond-401 check —
  none touch Almond's runtime). Expect the same e2e baseline here.
- 7.1 review (3-layer adversarial: Blind Hunter / Edge Case Hunter / Acceptance Auditor) returned 0
  correctness issues and ACCEPT. One non-blocking note was logged and **dismissed (ship as-is)**: AC3's
  "no dead surface" guarantee is call-site-discipline-dependent (a future bare `useQueryState("entity")`
  would reopen the gap); the chosen mitigation was that **7.3's `navigate` skill validates requests
  against `SURFACE_KEYS`**. That is a 7.3 concern, not 7.2 — but it confirms the registry is the
  validation source 7.3 must use.

### Git intelligence

The last eight commits are the Almond effort: 7.1 implementation (`52c92a4`) + its review findings
(`28576fa`) + done-marking (`9242ce6`), preceded by the planning/BMAD-doc commits (sprint plan, epics,
architecture, ADRs, readiness). **7.1 is the only Almond *code* that has landed.** `src/lib/almond/*`
(`tools.ts`, `responder.ts`, `shape.ts`, `persona.ts`, `starters.ts`) is the shipped Epic-6 base this
story reshapes; match its conventions exactly (the `deps`-closure factory style, the injected-responder
boundary, the standalone-executor + `tool()`-wrapper split). The chat route
(`src/app/api/almond/chat/route.ts`) already carries the actor-resolution and the cost/abuse note that
7.2's `authedOwner` derivation plugs into.

### Project Structure Notes

- All changes land in existing files under `src/lib/almond/` and `src/app/api/almond/chat/` — no new
  top-level directory. The architecture's tree (architecture.md lines 519-521) names exactly
  `tools.ts (evolves: buildAlmondSkills(deps, actor))` and `responder.ts (evolves: skills exercisable
  by the stub)` and `api/almond/chat/route.ts (evolves: actor capability flag -> buildAlmondSkills)`.
  This story is precisely those three evolutions plus their tests.
- No new dependency, no env var, no Prisma/schema change, no `outputFileTracingIncludes` change
  (nothing new reads a fixture at runtime).
- The architecture later adds `src/lib/almond/skills/navigate.ts` (7.3) and `skills/export-*` (Epic 8)
  as a `skills/` subdirectory. 7.2 does **not** create `skills/` yet — it only reshapes the factory in
  `tools.ts`. Keep the seam in `tools.ts`; let 7.3 introduce `skills/navigate.ts` and import it into the
  factory. (If you prefer to pre-create `skills/` now, that is allowed but adds an empty-ish surface;
  the minimal, architecture-faithful move is to wait for 7.3.)
- Only variance from the planning docs: none. 7.2's scope is exactly the epics.md Story 7.2 ACs and
  AR4; this story adds the route-side `authedOwner` derivation (AC6) explicitly so the flag is wired
  end to end, which AR15/ADR-A08 require and the epics.md build note implies ("scaffolding the
  capability flag").

### References

- [Source: _bmad-output/almond/3-solutioning/epics.md#Story 7.2: Extend the tool factory into the skill framework] (the 5 ACs + build notes; AR4, FR5/FR6/FR7, ADR-A01, ADR-A08)
- [Source: _bmad-output/almond/3-solutioning/architecture.md#The Skill Framework (FR5–FR9)] (factory + actor flag; capability-by-omission; stub-answerability)
- [Source: _bmad-output/almond/3-solutioning/architecture.md#Implementation Patterns & Consistency Rules] (the skill contract; Enforcement / Anti-patterns)
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A01] (extend in place; skills are factory-built AI-SDK tools)
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A08] (capability-by-tool-inclusion; public Tour gets read + navigate, never generate/save)
- [Source: src/lib/almond/tools.ts] (the shipped `buildAlmondTools(deps)` factory + the six read-tool executors this story wraps; `AlmondToolDeps`, `AlmondTools`)
- [Source: src/lib/almond/responder.ts] (the injected responder boundary; `AlmondRequest`, `createModelResponder` line 54, the offline `composeStubAnswer`/`createStubResponder`)
- [Source: src/app/api/almond/chat/route.ts] (owner-scoped route; `dashboardFarm`/`demoFarm` resolution + the cost/abuse note; where `authedOwner` is derived)
- [Source: src/lib/onboarding/farm.ts:1660-1710] (`DashboardFarm`, `dataKind: "real" | "representative"`, `dashboardFarm`, `demoFarm` — the `authedOwner` derivation source)
- [Source: src/lib/almond/tools.db.test.ts] (the regression net: the exact-tool-set test + cross-farm scoping + stub-responder blocks)
- [Source: _bmad-output/almond/4-implementation/7-1-canonical-surface-registry-and-nuqs-call-site-refactor.md] (previous story; the registry 7.3 will consume; the e2e baseline expectation)
- [Source: _bmad-output/project-context.md#Critical Implementation Rules] (no `any`, `noUncheckedIndexedAccess`, `@/` alias, pure `/lib`, colocated tests, kebab-case, copy in `/copy`)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npm run typecheck -w @lavinia/dashboard` -> clean (after adding `actor` to the one existing `toResponse` test call that constructs an `AlmondRequest`; see Completion Notes #5).
- `npm run lint -w @lavinia/dashboard` -> clean (the capability seam references `actor.authedOwner`, so no unused-var error; no `any`).
- `npx vitest run src/lib/almond` -> 4 files, 34 tests passed (the new pure `tools.test.ts` + the updated `tools.db.test.ts` + `shape.test.ts` + `starters.test.ts`).
- `npm test -w @lavinia/dashboard` (full, incl. db integration) -> 82 files, 625 tests passed (was 81/623 at 7.1; +1 file / +2 tests = the new `tools.test.ts`). No regressions.
- `npm run build -w @lavinia/dashboard` -> success (the route/responder/factory bundle cleanly).
- `npm run test:e2e -w @lavinia/dashboard` -> 3 passed / 5 failed, all 5 PRE-EXISTING and matching Story 7.1's documented baseline: 4 are `net::ERR_CONNECTION_REFUSED` (the sandbox's unstable `next start`), and `almond.spec.ts:14` is a static `Expected 401, Received 400` assertion mismatch (the route returns 400 — "no farm"/"messages required" — for an unauthenticated empty-message POST; it never returned 401). My route change adds `authedOwner` strictly AFTER both 400-returning guards, so it cannot affect any status code on that path. No 7.2 regression.

### Completion Notes List

- **Task 1 — factory reshaped.** `src/lib/almond/tools.ts`: `buildAlmondTools(deps)` -> `buildAlmondSkills(deps, actor)`. Added `AlmondActor = { authedOwner: boolean }`; renamed the return type `AlmondTools` -> `AlmondSkills`. The six read tools (`getFarmOverview`, `listMeters`, `getMeter`, `listFindings`, `getRatesSummary`, `getReconciliation`) are byte-for-byte unchanged, assembled into a `readTools` object and returned via the capability seam `{ ...readTools, ...(actor.authedOwner ? ownerOnlySkills() : {}) }`. `ownerOnlySkills()` returns `{}` for now (a real extension point, not a fake skill) — Epic 8 adds `exportSpreadsheet`/`generateReport` there. `AlmondToolDeps` is unchanged (scope stays in `deps`; capability is the new `actor`).
- **Task 2 — responder threaded.** `responder.ts`: import `buildAlmondSkills` + `AlmondActor`; `AlmondRequest` gains a required `actor: AlmondActor`; `createModelResponder` calls `buildAlmondSkills(deps, actor)`. The stub path (`composeStubAnswer`/`createStubResponder`) is unchanged in behavior — it grounds directly via the loaders and ignores `actor`, so it stays offline and answers the read set with zero external calls (AC4 holds trivially; no new skill for the stub to learn in 7.2).
- **Task 3 — route derives capability.** `src/app/api/almond/chat/route.ts`: `const authedOwner = resolved.dataKind === "real";` (signed-in owner's own farm = owner; the public Tour's demo farm = `representative` = not owner) and passes `actor: { authedOwner }` into `toResponse`. Server-only; never from the request body (AC6, ADR-A08). All other route behavior (400/500 guards, owner-scoping, `runtime = "nodejs"`) is untouched.
- **Task 4 — tests.** Updated `tools.db.test.ts` to call `buildAlmondSkills(depsA, { authedOwner: true })` and added a parity assertion that `{ authedOwner: false }` returns the SAME six keys (locks AC5 + guards the seam against a future regression). Added pure `src/lib/almond/tools.test.ts` (no DB — the factory does not touch Prisma at build time) asserting the key set for both capability levels; it runs in the fast pure tier that does not need local Postgres. The cross-farm scoping + stub-responder blocks pass unchanged.
- **Regression handled (not in the original blast-radius table):** making `actor` REQUIRED on `AlmondRequest` forced a one-field addition to the existing `"toResponse returns a 200 UI-message stream"` stub test (it constructed an `AlmondRequest` without `actor`). Added `actor: { authedOwner: false }` there (the stub ignores it). Required (not optional) is the correct choice: the route always supplies it and the model path needs it, so a caller that omits it is a bug worth catching at compile time.
- **Scope confirmed minimal:** no new dependency, no env var, no Prisma/schema change, no `/copy` change, no persona/system-prompt change, no `skills/` directory yet (it arrives with 7.3's `navigate`). Grower-facing behavior is identical.

### File List

- `src/lib/almond/tools.ts` (modified) — `buildAlmondTools` -> `buildAlmondSkills(deps, actor)`; new `AlmondActor` type; `AlmondTools` -> `AlmondSkills`; capability-by-omission seam (`ownerOnlySkills()` extension point).
- `src/lib/almond/responder.ts` (modified) — `AlmondRequest` gains required `actor`; `createModelResponder` calls `buildAlmondSkills(deps, actor)`; stub path unchanged.
- `src/app/api/almond/chat/route.ts` (modified) — derive `authedOwner = resolved.dataKind === "real"` (server-only); pass `actor` into `toResponse`.
- `src/lib/almond/tools.db.test.ts` (modified) — rename to `buildAlmondSkills`; both-capability key-set parity assertion; `actor` added to the stub `toResponse` call.
- `src/lib/almond/tools.test.ts` (new) — pure capability-mechanism test (no DB): both `authedOwner` levels return exactly the six read tools.

## Change Log

| Date | Change |
|------|--------|
| 2026-06-18 | Story 7.2 drafted (Create Story workflow): scope = reshape `buildAlmondTools(deps)` -> `buildAlmondSkills(deps, actor)`, add the `AlmondActor` capability flag, thread it route -> responder -> factory, and wire `authedOwner = dataKind === "real"`. No new skill, dep, env var, DB change, or copy change. Status -> ready-for-dev. |
| 2026-06-18 | Story 7.2 implemented (Dev Story workflow): factory -> skill factory with `actor` capability flag (read tools unchanged, owner-only seam empty until Epic 8), `actor` threaded route -> responder -> factory, `authedOwner` derived server-side. typecheck + lint + 625 unit/db tests + build green; e2e red proven pre-existing/environmental, identical to the 7.1 baseline. Status -> review. |
