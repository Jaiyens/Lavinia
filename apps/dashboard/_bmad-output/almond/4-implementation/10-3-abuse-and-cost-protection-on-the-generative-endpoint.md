---
baseline_commit: 485b250f07e5faad9a7b2d8219f3287d7c0ca32a
---

# Story 10.3: Abuse and cost protection on the generative endpoint

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Effort: Almond — Terra's Generative Operator (Epics 7-10). Tracked in the per-effort folder
     _bmad-output/almond/4-implementation/ (NOT the global implementation-artifacts/ path), so it
     never collides with the Tool 1 dashboard sprint. See _bmad-output/almond/index.md. -->
<!-- PRODUCT GATE: the heavy Almond build is gated behind FARMER VALIDATION (PRD Open Q4 / D14).
     Writing this story file is the allowed per-story step. Epics 7, 8, and 9 all shipped to main and
     Stories 10.1 (action/export starters) + 10.2 (rail entry + first-run nudge) are done, so Epic 10
     is in-progress. 10.3 is the THIRD and FINAL story in Epic 10 (and the last story in the whole
     Almond effort): it closes the security gap the generative endpoint opened. Epics 8/9 turned the
     chat route from a read-only assistant into a route that, with a live Gateway key, costs money per
     request AND (for an authed owner) writes Blob objects + DB rows. This story makes that endpoint
     safe to expose to a wide public Tour: per-IP rate-limiting on /api/almond/chat and a per-farm
     generation throttle on the heavy export/PDF skills. This is the documented build-time gate
     (ADR-A08) — required-before-wide-Tour, not before first authed use. -->

## Story

As Terra,
I want the now-generative Almond endpoint protected from scripted abuse before the public Tour is exposed widely,
So that a scripted caller cannot drive Gateway spend or, if authed, hammer Blob/DB writes.

(This is the **third and final story in Epic 10 (Surfacing Almond, gently)** and the last story in the
Almond effort. The chat route [route.ts](../../../src/app/api/almond/chat/route.ts) is a **public,
unauthenticated AI endpoint** when there is no session: it resolves the badged demo farm for the public
Tour and answers read questions. Epics 8/9 added the owner-only `exportSpreadsheet` and `generateReport`
skills, so for an authed owner the same route now WRITES a private Blob object + a `GeneratedReport` row,
and with a live Gateway key EVERY request costs model spend. The route already carries a `COST/ABUSE
NOTE` comment that explicitly defers this protection: _"Add rate-limiting / bot protection (e.g. Vercel
BotID or a per-IP limit) before exposing the Tour widely."_ 10.3 makes good on that note and ONLY that:
(a) a **per-IP fixed-window rate limit** on the chat route that short-circuits abusive request volume
with a `429` + `Retry-After` BEFORE any farm read or model call, and (b) a **per-farm generation
throttle** that bounds how many heavy artifacts (spreadsheet / PDF) one farm can produce in a window,
protecting Blob/DB write volume and build cost. No new product/npm dependency is added — the limiter is a
small, pure, unit-tested in-app module (Vercel BotID is a complementary platform/ops layer, documented as
the deploy-time companion gate, not code). Nothing about the read tools, the skills' output, the
download card, or the persistence path changes; legitimate grower pace is comfortably under both limits.)

## Acceptance Criteria

1. **Given** `/api/almond/chat`, **When** it is hit repeatedly from one source faster than a legitimate
   grower would, **Then** a **per-IP rate limit** throttles the abusive volume: requests over the limit
   in the window get a clean **`429`** response with a **`Retry-After`** header (and a small JSON body),
   returned **before** the farm is resolved or the model is called (so a blocked request costs no DB read
   and no Gateway spend). Legitimate grower use — a human asking questions and making the occasional file
   — stays well under the limit and is unaffected (AR16, NFR1).

2. **Given** the generation skills (`exportSpreadsheet`, `generateReport`), **When** they are invoked,
   **Then** a **per-farm generation throttle** bounds how many heavy artifacts one farm can produce in a
   window. Over the limit, the skill returns a typed, calm "you have made several in a row, try again in a
   moment" outcome (the panel renders it inline, like the existing empty/error outcomes) — **no Blob is
   written, no `GeneratedReport` row is created, no file is built**, and the model is told (via
   `toModelOutput`) that the file was not made. Under the limit, the skill behaves exactly as today
   (AR16).

3. **Given** the public Tour, **When** it is exposed widely, **Then** this protection is in place first
   (the documented build-time gate): the route's existing `COST/ABUSE NOTE` comment is **updated** to
   describe what is now enforced (the per-IP limit + the per-farm generation throttle) and to name **Vercel
   BotID** as the complementary platform layer to enable in the Vercel dashboard at deploy. The
   protection is documented alongside the existing note so the next reader sees the gate is closed
   (ADR-A08).

4. **Given** the offline stub responder (dev/CI/demo, zero external calls), **When** an authed owner asks
   for an export or a PDF, **Then** the **same per-farm throttle** applies on that path too (capability and
   behavior parity with the live model path — the throttle is one chokepoint, honored by both). The public
   Tour never reaches the generation branch (it is not an owner), so the throttle is never the reason a
   Tour request is blocked — only the per-IP limit guards the Tour (NFR3, ADR-A08 parity).

5. **Given** the limiter logic, **When** it is unit-tested, **Then** the window allow/deny boundary, the
   `remaining` and `retryAfter` math, per-key isolation, and the client-IP header parse are covered by
   **pure Vitest tests** with an injected clock (no real timers, no `Date.now()` dependency in the test,
   zero external calls). The limiter exposes a `resetRateLimits()` test hook so suites that drive the
   throttled skills (`tools.test.ts` / `tools.db.test.ts`) stay isolated (NFR3, project test convention:
   node-env Vitest, pure logic).

6. **Given** the voice and brownfield laws, **When** any new copy or comment is added, **Then** the
   throttle line is plain operator English with no em dash and no exclamation mark and lives in
   `/copy/en.ts`; no new npm dependency is introduced (NFR2 brownfield-clean); `prefers-reduced-motion`
   and keyboard access are N/A (no new UI surface — the throttle reuses the existing inline
   answer/error rendering) (FR20, NFR9, NFR2).

## Tasks / Subtasks

- [x] **Task 1 — The pure rate-limit module** (AC: #1, #2, #5)
  - [x] Create `src/lib/almond/rate-limit.ts`. Export a pure fixed-window decision function
        `checkFixedWindow(store, key, nowMs, { limit, windowMs }): RateLimitDecision` where
        `RateLimitDecision = { allowed: boolean; remaining: number; retryAfterSeconds: number }` and the
        store is a `Map<string, { windowStart: number; count: number }>`. Anchor each window at its first
        request (`nowMs`); a call after `nowMs - windowStart >= windowMs` starts a fresh window. Increment
        the count on **every** call (a denied call still counts, so a hammering caller stays blocked
        through the window); `allowed = count <= limit`; `remaining = max(0, limit - count)`;
        `retryAfterSeconds = allowed ? 0 : max(1, ceil((windowStart + windowMs - nowMs) / 1000))`.
  - [x] Export the two tunable configs as named constants with a one-line rationale each:
        `CHAT_RATE_LIMIT` (per-IP request limit on the chat route — pick a generous human ceiling, e.g.
        `{ limit: 30, windowMs: 60_000 }`) and `GENERATION_THROTTLE` (per-farm heavy-artifact limit —
        e.g. `{ limit: 10, windowMs: 60_000 }`). Both must sit comfortably above real grower pace (AC1
        "legitimate use unaffected") while still blocking scripted volume. Document that these are env-
        tunable later but hardcoded sensible defaults for v1.
  - [x] Export `clientIp(headers: Headers): string`: first hop of `x-forwarded-for` (split on `,`, trim),
        then `x-real-ip`, else the literal `"unknown"` (a missing IP is rare on Vercel; keying all
        unknowns together is the safe fail-closed-ish default — document it).
  - [x] Hold two module-level singleton stores (chat, generation) and export thin wrappers with an
        injectable clock defaulting to the real one: `checkChatRateLimit(ip, nowMs = Date.now())` and
        `checkGenerationThrottle(farmId, nowMs = Date.now())`. Export `resetRateLimits()` (clears both
        singletons) for test isolation. Add a lightweight stale-key sweep (or a documented size cap, e.g.
        clear windows that have fully expired once `store.size` exceeds ~10_000) so a long-lived instance
        does not accumulate one entry per distinct IP forever — note the bound in a comment.
  - [x] **Note the honest limitation in the module header**: this in-memory limiter throttles abusive
        bursts **within a Fluid Compute instance** (instances are reused across concurrent requests on
        Vercel, so it is a real first layer), but it is **not shared across instances**. Vercel BotID at
        the platform edge is the complementary durable layer (enabled in the dashboard at deploy); a
        KV/Upstash-backed store is the documented upgrade path if cross-instance limits are later needed.
        This is the AR16 build-time gate, shippable and offline-testable, with no new product dep.

- [x] **Task 2 — Wire the per-IP limit into the chat route** (AC: #1, #3)
  - [x] In `src/app/api/almond/chat/route.ts`, at the **very top of `POST`** (before
        `sessionUserId()`/`dashboardFarm`/`demoFarm` and before reading the body), compute
        `const ip = clientIp(req.headers)` and `const decision = checkChatRateLimit(ip)`. If
        `!decision.allowed`, return a `429`: `Response.json({ error: "rate limited" }, { status: 429,
        headers: { "Retry-After": String(decision.retryAfterSeconds) } })`. This short-circuits before any
        DB read or model construction, so a blocked request is cheap.
  - [x] **Update the `COST/ABUSE NOTE` doc comment** (AC3): state that per-IP rate-limiting is now
        enforced here and a per-farm generation throttle guards the owner-only skills, and that **Vercel
        BotID** should be enabled in the Vercel dashboard as the platform layer before the public Tour is
        widened. Keep the existing accurate facts (the Tour reads demo data only, no grower data leaks).
  - [x] Confirm the `runtime = "nodejs"` export and the existing 400/500 paths are untouched; the 429 is a
        new early return, not a change to the happy path.

- [x] **Task 3 — The per-farm generation throttle (one chokepoint, both paths)** (AC: #2, #4)
  - [x] In `src/lib/almond/tools.ts`, apply the throttle in the **skill call-site wrappers**
        `exportSpreadsheetSkill(deps, input)` and `generateReportSkill(deps, input)` (NOT inside the pure
        `runExportSpreadsheet`/`runGenerateReport` functions — keeping the throttle out of the pure
        functions leaves their existing direct unit tests untouched). Before delegating to the run
        function, call `checkGenerationThrottle(deps.farmId)`; if `!allowed`, return the typed throttled
        outcome `{ kind: "error", message: en.shell.almond.busy }` (shape-compatible with both
        `ExportSpreadsheetResult` and `GenerateReportResult`, so the responder's existing non-file path —
        inline text, no download card — renders it and writes no Blob/row). Otherwise return the run as
        today. Factor the shared check into one tiny helper so the two wrappers do not drift.
  - [x] In `src/lib/almond/responder.ts`, switch the **stub** owner branches (`createStubResponder`) to
        call the throttled wrappers `exportSpreadsheetSkill` / `generateReportSkill` (imported from
        `./tools`) instead of `runExportSpreadsheet` / `runGenerateReport` directly, so the offline path
        honors the same throttle (AC4 parity). The live model path already routes through the factory's
        `execute`, which now calls the throttled wrappers — no change there beyond Task 3's wrapper edit.
        Leave the `exportFile`/`reportFile` normalization and the persist-and-stream path unchanged (a
        throttled `error` outcome already normalizes to `null` → no card, exactly like an empty/error).
  - [x] Verify `toModelOutput` in `tools.ts` already maps a non-`file` result to `output.message`, so the
        model is told the file was not made (the busy line) — no change needed, just confirm.

- [x] **Task 4 — Copy** (AC: #2, #6)
  - [x] Add `en.shell.almond.busy` to `src/copy/en.ts` (shared by both skill wrappers): a calm, plain
        operator line, no em dash, no exclamation mark, e.g. _"You have made several files in a row. Give
        it a minute and ask again."_ Place it near the existing almond skill error/empty copy with a short
        comment that it is the per-farm generation throttle message (Story 10.3). The route's `429` JSON
        body stays a machine string (`"rate limited"`), not user copy — the legitimate UI never renders it
        (only a scripted caller hits it), and the panel already maps transport failures to the generic
        error/retry copy.

- [x] **Task 5 — Tests** (AC: #5)
  - [x] Create `src/lib/almond/rate-limit.test.ts` (pure, node-env Vitest, injected clock — no real timers,
        no `Date.now()` reliance):
    - [x] `checkFixedWindow`: allows up to `limit` within a window; denies the `limit + 1`-th; resets and
          allows again once `nowMs` advances past `windowMs`; a denied call still increments (stays blocked
          for the rest of the window).
    - [x] `remaining` decrements to 0 and clamps; `retryAfterSeconds` is 0 when allowed and a positive
          whole number (≥1) when denied, shrinking as `nowMs` approaches the window end.
    - [x] Per-key isolation: two keys (two IPs / two farmIds) do not share a budget.
    - [x] `clientIp`: first hop of a multi-value `x-forwarded-for`; `x-real-ip` fallback; `"unknown"` when
          both absent; trims whitespace.
    - [x] The generation-throttle wrapper denies after `GENERATION_THROTTLE.limit` invocations for one
          farmId and returns the `busy` message (drive it through `checkGenerationThrottle` with an
          injected `nowMs`, or through `exportSpreadsheetSkill` with a fake `deps`), then allows again
          after the window — calling `resetRateLimits()` in `beforeEach`.
  - [x] Add `beforeEach(resetRateLimits)` to `tools.test.ts` and `tools.db.test.ts` if (and only if) they
        invoke the now-throttled wrappers enough times to risk tripping the limit within one process; read
        those suites first and add the reset where needed so the new throttle never makes an existing test
        flaky.

- [x] **Task 6 — Verify + record** (AC: all)
  - [x] From the monorepo root: `npm run typecheck && npm run lint && npm run build` all green, and
        `npm test -w @lavinia/dashboard` passes (the new rate-limit tests + the untouched skill/tool/
        responder suites). The route is not unit-tested in this project (pure-logic convention) — the
        testable logic is the pure limiter; the route is thin wiring proven by typecheck + build.
  - [x] In the Dev Agent Record, disclose: the chosen `limit`/`windowMs` values and why they clear real
        grower pace; the in-memory-per-instance limitation + the Vercel-BotID/KV upgrade path (so the
        next reader knows the boundary of the guarantee); and that manual in-app 429/throttle verification
        (hammering the live endpoint) is not runnable in the headless dev environment — add it to
        `deferred-work.md` as a manual check, consistent with 10.1/10.2.

### Review Findings

Code review (2026-06-18) ran three adversarial layers (Blind Hunter, Edge Case Hunter, Acceptance
Auditor) over the diff. Acceptance Auditor: **no AC violations** (all six satisfied). Triage: 2 patch, 1
defer, rest dismissed. Both patches were applied this session and re-verified (typecheck + lint + build
green; rate-limit suite 18/18; almond suites 52/52).

- [x] [Review][Patch] **`clientIp` trusted the client-spoofable leftmost `x-forwarded-for` hop** —
  HIGH (blind+edge). An abuser could rotate a fake `x-forwarded-for` per request to mint a fresh per-IP
  budget each time, and a leading comma dumped callers into the shared `unknown` bucket. **Fixed:**
  `clientIp` now prefers Vercel's platform-set `x-real-ip` (the true client IP), and only falls back to
  the first NON-EMPTY `x-forwarded-for` hop when `x-real-ip` is absent. [src/lib/almond/rate-limit.ts]
- [x] [Review][Patch] **`MAX_STORE_KEYS` sweep did not actually bound memory** — MED (blind). The sweep
  only drops fully-expired windows, so a flood of >10k distinct LIVE keys within one window made it a
  no-op and the store grew unbounded on a long-lived instance. **Fixed:** the over-cap path now sweeps
  and, if still over the cap, hard-clears the store as a safety valve (the request's decision is computed
  from the local window state, so the clear never changes the returned answer). [src/lib/almond/rate-limit.ts]
- [x] [Review][Defer] **Per-farm throttle counts `empty`/`error` generations against the budget** — MED
  (edge). A clean owner mis-filtering (a filter matching no meters) consumes a slot even though no file is
  built. **Deferred — design tradeoff, not a defect:** counting every *attempt* is the deliberate cost
  bound (an attempt still does a DB read + partial build; a commit-on-success scheme would let a script
  spam error-inducing heavy renders for free, weakening the protection). Logged to `deferred-work.md` for
  a future refinement if it proves annoying in practice. [src/lib/almond/tools.ts]

Dismissed as noise: "denied calls extend the window" (documented intentional, stricter-is-safer);
"read-modify-write race under Fluid Compute" (both hunters confirmed it is sound — `checkFixedWindow` has
no `await`, so the single-threaded event loop makes each check atomic within an instance).

**Round 2** (re-review of the committed change, including the round-1 patches — the adversarial layers had
not seen the fixes). Acceptance Auditor: still **0 AC violations**; patches match the recorded claims. 3
more patches applied, all re-verified (typecheck + lint + build green; limiter suite 20/20; almond suites
54/54):

- [x] [Review][Patch] **The round-1 `store.clear()` safety valve flushed EVERY client's counter** — MED
  (blind+edge). The full clear re-armed offenders and innocents alike, making the limiter flushable on
  demand under a >10k-key flood. **Fixed:** evict only the OLDEST keys (Map insertion order) down to the
  cap instead of clearing — bounds memory while leaving live counters intact; added a "no flush-everyone"
  test. [src/lib/almond/rate-limit.ts]
- [x] [Review][Patch] **`x-real-ip` trust is platform-conditional** — LOW (blind+edge). **Fixed:**
  `clientIp` now prefers Vercel's non-spoofable `x-vercel-forwarded-for`, then `x-real-ip`, then the first
  non-empty `x-forwarded-for` hop, via a shared `firstHop` helper; added a preference test.
  [src/lib/almond/rate-limit.ts]
- [x] [Review][Patch] **Throttle-wrapper test `kind` assertions passed even if the short-circuit broke**
  — LOW (edge). **Fixed:** the test now injects a `prisma` Proxy that throws on any access, so "built
  nothing" (the wrapper short-circuited before the loader) is provable, not incidental.
  [src/lib/almond/rate-limit.test.ts]
- [x] [Review][Patch] **Stale "13 tests" in the Dev Agent Record prose** — doc nit (auditor). **Fixed:**
  updated to the authoritative count (20 limiter tests as shipped). [this story file]

Round-2 dismissed/deferred: "per-instance scope is weak by construction" (informational — documented
in-code; Vercel BotID is the named durable backstop); the empty/error-attempt throttle counting remains
deferred (no new angle).

## Dev Notes

### What this story changes, file by file (READ THESE BEFORE EDITING)

**NEW — `src/lib/almond/rate-limit.ts`**
- The only net-new module. Pure fixed-window limiter + `clientIp` + the two configs + singleton wrappers
  + `resetRateLimits`. No imports beyond TS/JS built-ins (no Prisma, no AI SDK) — it is pure logic, so it
  lives under `src/lib/almond/` next to the other pure helpers and is unit-testable in isolation. Keep it
  dependency-free: do **not** add `botid`, `@upstash/ratelimit`, `@vercel/kv`, or any package (NFR2).

**UPDATE — `src/app/api/almond/chat/route.ts`** (current state: lines 1-68)
- Today: `POST` resolves the actor (`sessionUserId()` → `dashboardFarm`, else `demoFarm`), validates the
  body (400 on bad/empty messages), builds the system prompt, and delegates to
  `defaultAlmondResponder().toResponse({...})`, catching construction errors as a clean `500`. Lines 8-20
  carry the `COST/ABUSE NOTE` that explicitly defers this work.
- This story changes: add an **early per-IP check at the top of `POST`** returning `429` + `Retry-After`
  before `sessionUserId()`/farm-resolution/body-parse; and **rewrite the `COST/ABUSE NOTE`** to document
  the now-enforced protection + Vercel BotID (AC3). 
- **Must be preserved**: the actor resolution (`userId ? dashboardFarm : demoFarm`), the
  `authedOwner = resolved.dataKind === "real"` capability flag, the `actor: { authedOwner, userId }`
  threading (ADR-A08), the 400 (bad body) and 500 (construction error) paths, and `runtime = "nodejs"`.
  The 429 is a NEW early return only.

**UPDATE — `src/lib/almond/tools.ts`** (current state: lines 124-186)
- Today: `exportSpreadsheetSkill(deps, input)` / `generateReportSkill(deps, input)` are thin wrappers that
  just `return runExportSpreadsheet(deps, input)` / `runGenerateReport(deps, input)`. They are wired into
  `ownerOnlySkills(deps)` (lines 153-186), which is spread into `buildAlmondSkills` **only when
  `actor.authedOwner`** (lines 259-262) — so the public Tour is never handed these skills (ADR-A08
  capability-by-omission). `toModelOutput` (lines 163-168, 178-183) already collapses a non-`file` result
  to `output.message`.
- This story changes: apply `checkGenerationThrottle(deps.farmId)` inside the two wrappers; on deny return
  `{ kind: "error", message: en.shell.almond.busy }` (typed, shape-valid for both result unions). One
  shared helper for the check.
- **Must be preserved**: the capability gate (`ownerOnlySkills` spread only for an authed owner) — the
  throttle is an ADDITIONAL bound on an owner who IS allowed the skill, never a replacement for the
  by-omission gate; `toModelOutput`'s non-file → `message` mapping (the busy line reaches the model
  unchanged); the pure `runExportSpreadsheet`/`runGenerateReport` signatures and behavior (do NOT throttle
  inside them — their direct tests must stay green).

**UPDATE — `src/lib/almond/responder.ts`** (current state: the stub at lines 524-587, imports at 31-40)
- Today: `createStubResponder`'s owner branches call `runGenerateReport(deps, ...)` (line 539) and
  `runExportSpreadsheet(deps, ...)` (line 545) directly, both gated on `actor.authedOwner` (lines 538,
  544). The model path (`createModelResponder`, lines 281-329) calls the skills via the factory's
  `execute`, which Task 3 routes through the throttled wrappers.
- This story changes: point the stub's two owner branches at the throttled wrappers
  `generateReportSkill` / `exportSpreadsheetSkill` (import them from `./tools`) so the offline path honors
  the same throttle (AC4 parity). A throttled outcome is `{ kind: "error", message }`, which the existing
  `reportFile`/`exportFile` (lines 178-206) already normalize to `null` → no download card, and `answer`
  already falls to `result.message` for a non-`file` outcome (lines 543, 549) — so the busy line streams
  as the answer with no file. No other responder change.
- **Must be preserved**: the owner gate on the stub branches (`actor.authedOwner &&`), the report-before-
  export verb ordering, the `persistAndWriteReportPart` path (only ever writes a card for a real file),
  and the navigation/data-answer fallbacks. The responder already imports from `./tools`
  (`buildAlmondSkills`, `AlmondActor`, `AlmondToolDeps`) so adding two more named imports introduces no
  cycle (responder → tools → skills; tools never imports responder).

**UPDATE — `src/copy/en.ts`** (almond block starts line 324; skill error/empty copy ~lines 506-511,
646-649)
- Add `en.shell.almond.busy` once (shared), near the skill error/empty copy. Plain operator English, no em
  dash, no exclamation mark. It is surfaced as the skill's inline text outcome (and to the model via
  `toModelOutput`), so it must read like Almond talking, not a system error.

### Design rationale (the decisions baked into the tasks)

- **Why an in-app pure limiter and not the `botid`/`@upstash/ratelimit` packages.** The build note and
  ADR-A08 say "no new product deps (Vercel BotID is platform)" and the whole effort's hard law is **zero
  external calls in dev/CI** (NFR3). A pure fixed-window limiter is shippable, fully offline-testable, and
  dependency-free. Vercel BotID is the complementary platform/ops layer (enabled in the dashboard, needs
  no code change to the request path), documented as the companion before-wide-Tour gate. This is the
  honest, faithful reading of AR16 for a brownfield repo with no KV/Redis store wired.
- **Why the throttle lives at the skill call-sites, not in the pure run functions.** The pure
  `runExportSpreadsheet`/`runGenerateReport` have direct unit tests (`export-spreadsheet.test.ts`,
  `generate-report.test.ts`, `generate-report.db.test.ts`) that invoke them repeatedly with one farmId;
  throttling inside them would make those suites trip the limit and go flaky. The two factory wrappers
  (plus the stub's two owner branches, pointed at those wrappers) are the **single chokepoint** every real
  invocation passes through, so the throttle is applied exactly once per path with no test collateral.
- **Why `{ kind: "error", message }` and not a new result kind.** The responder narrows export/report
  results on `kind === "file" | "empty" | "error"` (`isExportResult`/`isReportResult`, lines 263-275) and
  `exportFile`/`reportFile` return `null` for anything but `file`. Reusing `error` means **zero ripple**:
  no new narrowing, no new card path, the panel renders it inline exactly like a generation error, and the
  model is told the file was not made. A throttle is a soft, retryable "not now," and the copy says so.
- **Why the per-IP check is the first thing in `POST`.** The point is to make a blocked request **cheap** —
  no Gateway spend, no DB read. Resolving the farm or parsing the body first would defeat that. The 429
  carries `Retry-After` so a well-behaved client backs off.
- **Counting denied calls too.** A hammering script that keeps calling during a window should stay blocked;
  incrementing on every call (not just allowed ones) keeps the window closed until it truly resets, which
  is the stricter, safer choice for abuse protection.

### Project structure notes

- `src/lib/almond/rate-limit.ts` sits with the other pure Almond helpers (`shape.ts`, `nudge.ts`,
  `starters.ts`) — pure logic, no UI/DB coupling, colocated `*.test.ts`, exactly the repo's
  `pure-tested-logic-in-/lib` convention (CLAUDE.md). It is NOT under `skills/` because it is a
  cross-cutting guard, not a model-facing skill.
- No Prisma schema change, no migration, no new route, no new env var (the limiter is process-memory;
  Vercel BotID is enabled in the dashboard, not via env in code). No new npm dependency.
- No new user-facing UI surface, so the reduced-motion / keyboard / Magic UI laws are N/A here — the only
  user-visible artifact is the existing inline answer text carrying the calm `busy` line.

### Testing standards summary

- Pure Vitest, node env, injected clock — the project's convention (no Playwright session, no real
  timers). The route itself is not unit-tested (thin wiring); the **pure limiter + `clientIp`** carry the
  test weight. Run `npm test -w @lavinia/dashboard` for the unit + db suites; `npm run typecheck`,
  `npm run lint`, `npm run build` from root before marking review.
- Keep the new tests deterministic: pass `nowMs` explicitly into `checkFixedWindow` and the throttle
  wrapper so there is no wall-clock flakiness, and `resetRateLimits()` between cases that share a
  singleton.

### References

- [Source: _bmad-output/almond/3-solutioning/epics.md#Story 10.3] — story statement, the three G/W/T
  acceptance criteria, and the Build notes (AR16, NFR1, ADR-A08; evolves `route.ts` + the generation
  skills; required-before-wide-Tour; no new product deps).
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A08] — capability-by-tool-
  inclusion; the public/owner boundary is structural; "Add per-IP rate-limiting / Vercel BotID on the
  endpoint and a per-farm generation throttle before exposing the Tour widely."
- [Source: _bmad-output/almond/3-solutioning/architecture.md#Security] (lines 346-350) — "Abuse/cost
  protection (raised by this feature): ... Add per-IP rate-limiting / Vercel BotID on `/api/almond/chat`,
  and a per-farm generation throttle. (Documented as required-before-wide-Tour, consistent with the
  existing COST/ABUSE note in the route.)"
- [Source: _bmad-output/almond/3-solutioning/architecture.md#Implementation sequence] (line 409) —
  "Surfacing ... + rate-limiting before wide Tour."
- [Source: src/app/api/almond/chat/route.ts#COST/ABUSE NOTE] (lines 8-20) — the deferred note this story
  closes; the actor-resolution + `authedOwner` + `actor` threading to preserve.
- [Source: src/lib/almond/tools.ts#ownerOnlySkills] (lines 124-186, 253-263) — the owner-only skill
  wrappers + the capability-by-omission gate the throttle layers on top of (never replaces).
- [Source: src/lib/almond/responder.ts#createStubResponder] (lines 524-587) — the offline owner branches
  to route through the throttled wrappers; the `error`-outcome → no-card normalization to reuse.
- [Source: src/lib/ai/gateway.ts] — `hasGatewayKey()` selects live-vs-stub; confirms the "no key → zero
  external calls" law the limiter must not break.
- [Source: apps/dashboard/CLAUDE.md] — TS strict no `any`; pure tested logic in `/lib`; copy in `/copy`,
  no em dashes; plain operator English; never a new dep without reason (NFR2).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context) — BMAD dev-story workflow.

### Debug Log References

- `npx vitest run` (full dashboard suite): **862 passed**, 2 failed. The 2 failures are in
  `src/lib/almond/skills/generate-report.db.test.ts` (Story 9.3) and are **PRE-EXISTING on HEAD
  (485b250)** — verified by stashing all of this story's tracked edits and re-running: the same 2 fail
  identically with none of my changes present. They are the "epic 8/9 db tests written-not-run" items
  from project memory. Not caused by, and not in scope for, Story 10.3 (see Completion Notes). No
  regression: every test green on HEAD is still green; my 20 new limiter tests pass (13 at dev-story, +7
  added across the two code-review rounds).
- `npm run typecheck` — green (both apps). `npm run lint` — dashboard 0 errors (the lone web warning is
  pre-existing, unrelated). `npm run build` — green (both apps).
- Targeted: `rate-limit.test.ts` 13/13; `responder.test.ts` + `tools.test.ts` + the export/report pure
  skill suites 66/66; `tools.db.test.ts` 18/18 (includes the owner export turn through the now-throttled
  stub wrapper — confirms the throttle parity change did not break the offline persistence path).

### Completion Notes List

- **AC1 (per-IP rate limit, 429 + Retry-After, before any DB/model work):** `checkChatRateLimit(clientIp(
  req.headers))` is the first statement in `POST` (`route.ts`); over-limit returns
  `Response.json({error:"rate limited"}, {status:429, headers:{"Retry-After": …}})` before `sessionUserId`,
  farm resolution, or body parse. `CHAT_RATE_LIMIT = 30/min/IP` — far above a human asking questions, so
  legitimate use is unaffected; a scripted flood is cut cheaply.
- **AC2 (per-farm generation throttle):** applied in the skill call-site wrappers `exportSpreadsheetSkill`
  / `generateReportSkill` (`tools.ts`) via `checkGenerationThrottle(deps.farmId)`. On deny they return
  `{kind:"error", message: en.shell.almond.busy}` BEFORE the loader/build, so no file is built, no Blob is
  written, no `GeneratedReport` row is created; `toModelOutput` already maps a non-`file` result to its
  message, so the model is told the file was not made. `GENERATION_THROTTLE = 10/min/farm`.
- **AC3 (documented gate):** the route's `COST/ABUSE NOTE` is rewritten to `COST/ABUSE PROTECTION` —
  it now states the per-IP limit + per-farm throttle are enforced and that **Vercel BotID** is the
  complementary platform layer to enable in the Vercel dashboard before widening the public Tour.
- **AC4 (offline parity):** the stub responder's two owner branches now call the throttled wrappers
  (`generateReportSkill`/`exportSpreadsheetSkill`) instead of the pure `run*` functions, so the offline
  path honors the same per-farm throttle. The public Tour never reaches the owner branch (gated on
  `actor.authedOwner`), so only the per-IP limit guards the Tour.
- **AC5 (pure tests, injected clock):** `rate-limit.test.ts` covers the window allow/deny boundary, reset
  after the window, denied-calls-keep-counting, `remaining`/`retryAfterSeconds` math, per-key isolation,
  `clientIp` header parsing, and the singleton wrappers + `resetRateLimits`. All drive an explicit `nowMs`
  — no real timers, zero external calls.
- **AC6 (voice / brownfield):** new copy `en.shell.almond.busy` is plain operator English, no em dash, no
  exclamation mark. No new npm dependency (the limiter is in-app, dependency-free). No new UI surface, so
  reduced-motion/keyboard are N/A.
- **Throttle placement decision (kept the pure functions un-throttled):** the throttle lives only at the
  two skill call-sites (the factory wrappers + the stub's owner branches), the single chokepoint every
  real invocation passes through. This intentionally leaves `runExportSpreadsheet`/`runGenerateReport`
  (and their direct `*.test.ts` suites) untouched, so the new throttle adds no collateral to existing
  tests. Verified: no existing suite needed `resetRateLimits()` (the most generation-heavy suites invoke
  the throttled wrappers ≤2× per file, far under the 10/min budget, and Vitest isolates module state per
  file).
- **Honest limitation (disclosed):** the limiter is in-memory. On Vercel Fluid Compute, instances are
  reused across concurrent requests, so it genuinely throttles a burst within an instance (a real first
  layer) but counters are NOT shared across instances. **Vercel BotID** (platform edge) is the durable
  cross-instance companion to enable at deploy; a KV/Upstash store is the documented upgrade path. This is
  the AR16 build-time gate — shippable and offline-testable with no new product dep, as the architecture
  intends.
- **Pre-existing failures (NOT this story):** `generate-report.db.test.ts` tests 1 & 2 fail on HEAD,
  independent of Story 10.3. Test 1 asserts the body contains the contiguous string "one or two page
  summary", but the stub streams text in 24-char `text-delta` chunks, so that 23-char phrase (starting
  mid-string) is fragmented across chunk boundaries in the serialized stream — a stale test assumption
  about non-chunked streaming (the sibling export test passes only because its asserted substring is short
  enough to fit one chunk). Test 2 asserts a `GeneratedReport` row is persisted, but `storeReport` does
  not persist in that test's setup (the persist is best-effort and silently caught). Both predate this
  story and belong to Story 9.3; logged to `deferred-work.md`. Left unfixed to respect story scope.
- **Manual verification deferred (headless env):** hammering the live `/api/almond/chat` to observe a real
  429 + Retry-After, and driving an owner past the per-farm throttle to see the calm `busy` line, are not
  runnable in this headless dev environment; the logic is proven by the pure unit tests + the build.
  Logged to `deferred-work.md`, consistent with 10.1/10.2.

### File List

- `src/lib/almond/rate-limit.ts` — NEW. Pure fixed-window limiter (`checkFixedWindow`), `clientIp`, the
  `CHAT_RATE_LIMIT` / `GENERATION_THROTTLE` configs, singleton wrappers (`checkChatRateLimit`,
  `checkGenerationThrottle`), and the `resetRateLimits` test hook.
- `src/lib/almond/rate-limit.test.ts` — NEW. 20 pure tests (injected clock, zero external calls).
- `src/app/api/almond/chat/route.ts` — MODIFIED. Per-IP `429` + `Retry-After` as the first statement in
  `POST`; `COST/ABUSE NOTE` rewritten to document the enforced protection + Vercel BotID (AC1, AC3).
- `src/lib/almond/tools.ts` — MODIFIED. Per-farm throttle in `exportSpreadsheetSkill` /
  `generateReportSkill`; explicit return types; imports `en` + `checkGenerationThrottle` + the result
  types (AC2).
- `src/lib/almond/responder.ts` — MODIFIED. Stub owner branches routed through the throttled wrappers for
  offline parity; dropped the now-unused `run*` value imports (kept the type imports) (AC4).
- `src/copy/en.ts` — MODIFIED. Added `en.shell.almond.busy` throttle copy (AC2, AC6).
- `_bmad-output/almond/4-implementation/sprint-status.yaml` — MODIFIED. 10-3 → in-progress → review.
- `_bmad-output/almond/4-implementation/deferred-work.md` — MODIFIED. Logged the manual-verification item
  and the pre-existing 9.3 db-test failures.

## Change Log

| Date | Change |
|------|--------|
| 2026-06-18 | Story 10.3 created (ready-for-dev) — abuse/cost protection on the generative Almond endpoint. |
| 2026-06-18 | Implemented: per-IP rate limit on `/api/almond/chat` (429 + Retry-After) + per-farm generation throttle on the export/PDF skills, with offline-path parity; pure limiter module + 13 tests; copy + route doc updated. typecheck/lint/build green; 862 tests pass (2 pre-existing 9.3 db-test failures unrelated). Status → review. |
| 2026-06-18 | Code review (3 adversarial layers): 0 AC violations. Applied 2 patches — `clientIp` now trusts Vercel `x-real-ip` over the spoofable `x-forwarded-for` hop (HIGH); limiter store hard-clears past the cap to bound memory (MED). Deferred 1 (throttle counts empty/error attempts — documented cost-protection tradeoff). Limiter suite 18/18, almond suites 52/52, typecheck/lint/build green. Status → done. Epic 10 + the Almond effort (Epics 7-10) complete. |
| 2026-06-18 | Code review round 2 (re-review of the committed change incl. round-1 patches): 0 AC violations. Applied 3 patches — eviction-of-oldest instead of `store.clear()` (no flush-everyone, MED); `clientIp` prefers `x-vercel-forwarded-for` then `x-real-ip` (LOW); throwing-Proxy prisma makes the throttle short-circuit test load-bearing (LOW); fixed stale "13 tests" prose. Limiter suite 20/20, almond suites 54/54, typecheck/lint/build green. Status stays done. |
