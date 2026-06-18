---
baseline_commit: ada4c8076a2e3a4e6ee0c58f69dcf73313285a7f
---

# Story 7.3: The `navigate` skill, entity resolver, and ambiguity rule

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Effort: Almond — Terra's Generative Operator (Epics 7-10). Tracked in the per-effort folder
     _bmad-output/almond/4-implementation/ (NOT the global implementation-artifacts/ path), so it
     never collides with the Tool 1 dashboard sprint. See _bmad-output/almond/index.md. -->
<!-- PRODUCT GATE: the heavy Almond build is gated behind FARMER VALIDATION (PRD Open Q4 / decision
     D14). Writing this story file is the allowed per-story step. 7.1 (surface registry) and 7.2
     (skill factory) already shipped, so Epic 7 is in-progress. 7.3 is the third foundation story:
     it adds the FIRST real new capability (navigation), but only the SERVER half — the pure skill
     that resolves a request to a typed action. It writes nothing to the screen and nothing to the
     stream; the client bridge that actually moves the dashboard is Story 7.4. Navigation is
     read-only on data (it sets URL state, never mutates a Finding/rate/meter), so it is the
     read-safe capability that ships to every actor, public Tour included. The gate still governs
     when the owner-only capability stories (exports/PDF, Epic 8+) begin dev-story. -->

## Story

As a grower,
I want to say "open Pump 17" or "show me the meters on the wrong rate" and have Almond figure out what I mean,
So that I never scroll 183 meters or learn the filter bar, and I am never sent to the wrong pump.

(First navigation story, server half only. This story adds the `navigate` skill: a pure resolver that
turns a plain-language request into a typed `NavigateAction` over the dashboard's five canonical URL
keys — or a **clarify** / **nothing-found** result when the request is ambiguous or empty. The skill
**emits** the action as its tool result; it does **not** write it to the stream or move the screen.
The server→client bridge that applies the action through `useQueryState` setters is Story 7.4 — a
backward-only dependency: 7.4 consumes what 7.3 produces. So 7.3 is provable in isolation with pure
unit tests and changes no grower-visible behavior until 7.4 lands.)

## Acceptance Criteria

1. **Given** a navigation request, **When** the model calls the `navigate` skill, **Then** the skill
   input is a structured, registry-validated shape (`{ open: "meter", query }` for a meter, or
   `{ lens?, entity?, ranch?, rate? }` for a lens/filter move) over **only** the canonical keys
   (`lens | entity | ranch | rate | meter`); the input schema (Zod) carries **shape only**, never a
   `farmId` or any scope value (FR7). An unknown surface (a `lens` value not in the registry, or any
   non-canonical key) is **refused** — the skill returns a typed refusal and emits **no**
   `NavigateAction`, never a fabricated one.

2. **Given** a plain-language reference, **When** `navigate` resolves a meter, **Then** it uses the
   existing grounded resolver `resolveMeterQuery` (from `src/lib/almond/shape.ts`) and the registry to
   map names / SA-ids / ids to real meters **in the resolved farm only** (`deps.farmId`, FR7). It does
   not re-implement meter matching; it reuses the shipped resolver.

3. **Given** a request that matches two or more meters in the resolved farm, **When** resolved,
   **Then** the skill returns a **clarify** result that names the candidate meters and emits **no**
   `NavigateAction`; a request matching ≥ 2 meters never auto-navigates (FR3, the testable
   consequence). This is the load-bearing safety rule of the story.

4. **Given** a request that matches nothing, **When** resolved, **Then** the skill returns a typed
   **none** result (so Almond can say it found nothing, in voice) and emits **no** `NavigateAction`;
   it never fabricates a target or "closest guess".

5. **Given** a clean single match (one meter, or a valid lens/filter move), **When** resolved,
   **Then** the skill returns a typed `NavigateAction` — a closed shape over only the five canonical
   keys — to be emitted by the bridge (Story 7.4). The `NavigateAction` for opening a meter carries
   the resolved meter **id** (the value the `meter` URL key holds), not the raw query.

6. **Given** the read-only and farm-scoped contract, **When** `navigate` runs, **Then** it performs
   **no** write to a Finding, rate, meter, account, or anything utility-side (FR6); it reads the farm
   through the existing `loadMetersForFarm` loader exactly as the read tools do, scoped by `deps`.

7. **Given** the skill framework, **When** `buildAlmondSkills(deps, actor)` assembles the set, **Then**
   `navigate` is included **unconditionally** — for both `authedOwner` values — because navigation is
   read-safe (ADR-A08); the public Tour gets read tools **plus** `navigate`, never an owner-only
   skill. The returned set is now the six read tools **+ `navigate`** (seven) for both actors.

8. **Given** the offline stub responder (NFR3, AR18), **When** the framework is exercised in
   dev/test/CI, **Then** the `navigate` skill logic is fully exercisable with **zero external calls**:
   the resolver is a pure function over `MeterView[]` + the typed input, unit-tested across
   single-match, multi-match, no-match, and unknown-surface cases. (The stub does not yet ROUTE a
   navigation turn or emit a `data-navigate` part — that, and the e2e that asserts the URL changed,
   is Story 7.4. 7.3 only guarantees the skill is offline-drivable; it must not break the stub's
   existing offline guarantee.)

## Tasks / Subtasks

- [x] **Task 1 — Create the pure navigate resolver + the `NavigateAction` shape** (AC: 1, 3, 4, 5)
  - [x] New file `src/lib/almond/skills/navigate.ts` (creates the `skills/` directory the architecture
        reserves; 7.2 intentionally did not — see Project Structure Notes).
  - [x] Define `NavigateAction` as a **closed, typed shape over only the five canonical keys**, mirroring
        the five `useQueryState` setters the bridge (7.4) holds:
        ```ts
        export type NavigateAction = {
          lens?: Lens;                    // a real, AVAILABLE lens (validated against the registry)
          entity?: string | null;        // raw filter value (registry: nullable string, no parser)
          ranch?: string | null;
          rate?: string | null;
          meter?: string | null;         // a resolved meter ID (the value the `meter` key holds)
        };
        ```
        Import `Lens` and the lens authority (`LENS_KEYS`, `isLensAvailable`) and `SURFACE_KEYS` from
        `@/lib/dashboard/surface.ts` — do **not** hardcode the key set or lens list (ADR-A03; the whole
        point of 7.1's registry is that `navigate` reads from it).
  - [x] Define the typed result union the skill returns:
        ```ts
        export type NavigateResult =
          | { kind: "navigate"; action: NavigateAction }
          | { kind: "clarify"; candidates: string[] }   // ≥2 meter matches: name them, emit nothing
          | { kind: "none" }                            // matched nothing
          | { kind: "unknown-surface"; requested: string }; // a non-registry lens/surface: refused
        ```
  - [x] Define the Zod input schema (`navigateInputSchema`) for the skill. It is a structured,
        shape-only shape over the canonical keys, e.g. an object with an optional `open` for the meter
        path (`{ open: "meter", query: string }`) and optional `lens` / `entity` / `ranch` / `rate`
        for the lens-and-filter path. Constrain `lens` to the registry's lens key set
        (`z.enum(LENS_KEYS)` or validate-and-refuse in the resolver — see note below). **No `farmId`,
        no scope, no file path on the schema** (FR7, AC1).
  - [x] Implement `resolveNavigate(meters: MeterView[], input: NavigateInput): NavigateResult` as a
        **pure function** (no Prisma, no I/O — mirrors `resolveMeterQuery`):
        - Meter path (`open: "meter"`): call `resolveMeterQuery(meters, query)`. `found` → `{ kind:
          "navigate", action: { meter: meter.id } }`. `ambiguous` → `{ kind: "clarify", candidates:
          names }`. `none` → `{ kind: "none" }`. (Reuse the resolver's exact three-way result; do not
          re-derive matching.)
        - Lens/filter path: build a `NavigateAction` from the present canonical keys. Validate `lens`
          against the registry (`isLensAvailable` / `LENS_KEYS`); an unavailable or unknown lens →
          `{ kind: "unknown-surface", requested: lens }` (refuse, never coerce to default — the
          dashboard's `parseLens` coerces a stale deep link, but `navigate` must REFUSE so Almond never
          claims it opened a surface that does not exist, AC1). `entity`/`ranch`/`rate` are raw filter
          strings (the registry defines them as nullable strings with no parser — a contains-filter,
          exactly as `filter-bar.tsx` treats them), so any non-empty string is a valid filter value.
        - An input that names no actionable key (empty query, no lens, no filters) → `{ kind: "none" }`.
  - [x] **Decide and document** whether `lens` validity is enforced by the Zod enum at the boundary or
        by the resolver returning `unknown-surface`. Prefer the resolver returning `unknown-surface`
        for an out-of-registry lens so the refusal is a typed, testable result (AC1) rather than a
        schema rejection the model cannot narrate; an `z.enum(LENS_KEYS)` is acceptable as a belt-and-
        suspenders boundary. Either way the registry is the single source — no literal lens list in
        `navigate.ts`.

- [x] **Task 2 — Wire `navigate` into the factory (unconditionally, read-safe)** (AC: 2, 6, 7)
  - [x] In `src/lib/almond/tools.ts`, add a `navigateSkill(deps: AlmondToolDeps, input: NavigateInput)`
        executor that loads the farm's meters via `loadMetersForFarm(deps.prisma, deps.farmId)` (the
        same loader the read tools use) and returns `resolveNavigate(meters, input)`. Keep the executor
        thin: load + delegate to the pure resolver. Export it standalone like the other executors
        (`farmOverview`, `meterDetail`, …) so it is unit-/db-testable.
  - [x] Add the `navigate` `tool()` to the **`readTools`** object in `buildAlmondSkills` (the
        public-safe set), NOT to `ownerOnlySkills()`. `navigate` ships to every actor (ADR-A08:
        "read + navigate are public-safe"). The `tool()` shape:
        ```ts
        navigate: tool({
          description: "Drive the dashboard for the grower: open a specific meter, switch the lens
            (chart, table, map, calendar), or filter the table by entity, ranch, or rate. Use this
            when the grower asks to see, open, show, or filter something. If the request matches more
            than one meter, this returns the candidates to ask which one — it never guesses.",
          inputSchema: navigateInputSchema,
          execute: (input) => navigateSkill(deps, input),
        }),
        ```
        Import `navigateInputSchema` / `resolveNavigate` / types from `./skills/navigate`.
  - [x] Update the factory's file-header comment and the capability-seam comment (lines ~86-95, ~155-
        158) so they reflect that `navigate` is now the one new read-safe skill in the public set, and
        `ownerOnlySkills()` is still empty until Epic 8. Do not move `navigate` behind the
        `actor.authedOwner` gate.
  - [x] Confirm `AlmondSkills = ReturnType<typeof buildAlmondSkills>` now includes `navigate` (no
        manual type edit needed — it derives).

- [x] **Task 3 — Update the regressed factory key-set tests** (AC: 7)
  - [x] `src/lib/almond/tools.test.ts`: the `READ_TOOLS` array (lines 19-26) asserts **exactly** the
        six read tools for both actors. Add `"navigate"` to the expected set (now seven), and rename/
        retitle the two `it(...)` cases so they read "six read tools **plus navigate**" (lines 29, 34).
        Both `authedOwner: true` and `authedOwner: false` must return the SAME seven keys (navigate is
        unconditional — this parity is AC7 and guards against navigate accidentally landing behind the
        owner gate).
  - [x] `src/lib/almond/tools.db.test.ts`: the `"buildAlmondSkills exposes exactly the read-only tool
        set for both capability levels"` test (lines 83-100) lists the six keys in `expected`. Add
        `"navigate"` (now seven) and update the inline comment (lines 94-96) — it currently says
        "navigate … arrives in Story 7.3"; now it HAS arrived, so the note becomes that the owner-only
        export/report skills (Epic 8) are still the only future additions. Keep the both-capability
        parity assertion.

- [x] **Task 4 — Pure unit tests for the resolver (the four cases + the ambiguity rule)** (AC: 1, 3, 4, 5, 8)
  - [x] New file `src/lib/almond/skills/navigate.test.ts` (pure, no DB — mirrors `shape.test.ts`).
        Build a small `MeterView[]` fixture (or reuse the shape factory in `shape.test.ts`; check what
        it exposes) with at least: two meters whose names share a token (e.g. "Pump 17" and "Pump 170"
        / "West Pump 17") to force the ambiguity case, one uniquely-named meter, and distinct ids/SA-ids.
        Assert:
        - **Single match** (`{ open: "meter", query: "<unique name|id|SA-id>" }`) → `{ kind:
          "navigate", action: { meter: <that meter's id> } }`. Cover all three lookup keys
          (id, SA-id, exact name) at least once since `resolveMeterQuery` ranks them.
        - **Multi match** (`{ open: "meter", query: "<shared token>" }`) → `{ kind: "clarify",
          candidates: [...names] }`, **and** assert no `action` is present (the ≥2 never-auto-navigate
          rule, FR3).
        - **No match** (`{ open: "meter", query: "nonexistent" }` and empty query) → `{ kind: "none" }`.
        - **Lens move** (`{ lens: "map" }`) → `{ kind: "navigate", action: { lens: "map" } }`;
          **unknown/unavailable lens** (`{ lens: "spreadsheet" }` or a lens with `available:false` if
          one exists) → `{ kind: "unknown-surface", requested: "spreadsheet" }`.
        - **Filter move** (`{ rate: "AG-4" }`) → `{ kind: "navigate", action: { rate: "AG-4" } }`.
        - (Optional) a combined `{ lens: "table", rate: "AG-4" }` → action carries both keys.
  - [x] (Optional, lightweight) Extend `tools.db.test.ts` with one navigate executor case proving
        farm-scoping: `navigateSkill(depsB, { open: "meter", query: "<farm A meter name>" })` →
        `{ kind: "none" }` (farm B cannot navigate to farm A's meter — the cross-farm law, FR7,
        mirroring the existing `meterDetail(depsB, …)` probe at lines 113-116). Keep heavy assertions in
        the pure test; this one guards scope.
  - [x] **Gate before claiming done:** `npm run typecheck && npm run lint && npm test` (from root or
        `-w @lavinia/dashboard`), then `npm run test:e2e -w @lavinia/dashboard`. The e2e suite has a
        documented, environmental red baseline (see Testing requirements) — a failure is a 7.3
        regression only if it differs from that baseline and touches Almond. 7.3 adds no client and no
        route behavior change, so e2e must be transparent to it.

## Review Findings

Adversarial code review (2026-06-18, 3 layers — Blind Hunter, Edge Case Hunter, Acceptance Auditor;
run as isolated subagents over `git diff ada4c80 -- src/`). **Outcome: ACCEPT — 2 patches applied, 0
unresolved.** Acceptance Auditor: ACCEPT, all 8 ACs SATISFIED with code+test evidence (ambiguity rule
AC3 and unknown-surface refusal AC1 both proven; farm-scoping, read-safety, and the unconditional
both-actor wiring hold); scope discipline PASS — zero 7.4/Epic-8 leakage (no `data-navigate` part, no
`useAlmondNavigation`, no client/launcher/chip edits, no stub routing, no `route.ts`/`responder.ts`
change, no new dep, no `/copy` change). Blind Hunter: no provable correctness bug. Edge Case Hunter:
5 findings — 2 patched, 3 dismissed as by-design.

### Patched (applied this review)

- [x] [Review][Patch] Empty-query `open: "meter"` swallowed a co-passed lens/filter — `navigate.ts`.
  Edge Case Hunter (High). The meter-path guard was `input.open === "meter" || query !== ""`, so a
  request like `{ open: "meter", lens: "map" }` (or `{ open: "meter", query: "  ", rate: "AG-4" }`)
  entered the meter path on `open` alone and returned `none`, dropping the valid lens/filter. **Fix:**
  branch on `query !== ""` only (the `open` field is a model-facing hint, not the branch condition);
  an empty query now falls through to the lens/filter path. Added two tests asserting the co-passed
  lens/filter is honored. The existing `{ open: "meter", query: "   " }` -> `none` case still holds.
- [x] [Review][Patch] `NavigateAction` doc overclaimed that the 7.3 resolver emits `null` clears —
  `navigate.ts`. Edge Case Hunter (Medium). The `string | null` type is the correct bridge-setter
  contract, but the comment read as if `navigate` produces `null` clears, which it never does in 7.3.
  **Fix:** comment clarified — the shape admits `null` for the bridge/future clear capability; the 7.3
  resolver only ever SETS values. No type or behavior change.

### Dismissed as by-design (each considered, with rationale)

1. *"A `query` + `lens` together silently drops the lens (e.g. `{ query: "Pump 17", lens: "map" }`
   opens the meter, ignores the lens)"* (Edge, Medium; Auditor, Low) — explicitly spec-sanctioned v1
   intent (Dev Notes / `navigate.ts` comment: "a meter request never combines with a lens/filter move
   in v1 — opening the named meter is the whole intent, and the drawer opens over any lens"). Not a
   defect; the combined case is a documented no-op-on-the-lens by design.
2. *"Filter values (entity/ranch/rate) are never validated against the farm's data, so
   `{ entity: "Nonexistent LLC" }` confidently filters to an empty view"* (Edge, Low) — matches the
   surface registry's contract that entity/ranch/rate are **raw nullable contains-filters with no
   parser** (architecture "Navigation actions & the surface registry"; the Dev Notes state any
   non-empty string is a valid filter value, exactly as `filter-bar.tsx` treats them). The asymmetry
   with `lens` (which IS refused) is intentional: a lens is a closed enum, a filter is free text.
   Grounding filters is a possible future enhancement, not a 7.3 defect.
3. *"Action-shaped input like `{ meter: "m17" }` is silently stripped by Zod to `{}` -> `none`"*
   (Edge, Low) — standard Zod object behavior (non-strict). Returning `none` is the gentle outcome; a
   `.strict()` schema would instead surface a tool error to the model for a near-miss call. Not
   harmful; the tool description steers the model to `{ open: "meter", query }`.

## Dev Notes

### What this story is (and is not)

- **Is:** the **server half** of navigation — a new `navigate` skill that (a) accepts a structured,
  registry-validated request, (b) resolves plain-language meter references through the **existing**
  grounded resolver `resolveMeterQuery`, (c) enforces the **ambiguity rule** (≥2 matches → clarify,
  emit nothing), and (d) returns a closed, typed `NavigateAction` over only the five canonical keys on
  a clean match. It is wired into `buildAlmondSkills` **unconditionally** because navigation is
  read-safe. The resolver is **pure** and unit-tested; the executor is a thin loader+delegate like the
  six read tools.
- **Is NOT:** the bridge. 7.3 writes **nothing** to the UI-message stream and moves **nothing** on the
  screen. It does **not** create the `data-navigate` part, the `useAlmondNavigation()` hook, the
  launcher effect, the dedupe, or the action chip — those are **Story 7.4** (`data-navigate` +
  `use-almond-navigation.ts`) and **Story 7.5** (chips + the never-hijack guarantee). It does **not**
  teach the stub responder to route a navigation turn (also 7.4). It adds **no new dependency, no
  env var, no DB/schema change, and no `/copy/en.ts` change** — the clarify/none/chip *copy* arrives
  with the bridge/chips that render it (7.4/7.5); 7.3 returns structured results the model narrates.
- **Risk:** low. One net-new pure module + a few-line factory addition + three test edits. The only
  cross-file ripple is the factory key-set assertions (Task 3), which fail loudly at test time if
  missed — treat green `tools.test.ts`/`tools.db.test.ts` as the proof navigate is wired and still
  read-safe for both actors.

### The exact 7.3 ↔ 7.4 boundary (read this before coding — it is the one easy mistake)

The architecture's navigation bridge has four numbered steps (architecture.md "Navigation — the
server→client bridge", and ADR-A02). **7.3 owns step 1 only:**

1. **(7.3)** The model calls `navigate`; the skill validates against the registry, applies the
   ambiguity rule, and **returns a typed result** — `{ kind: "navigate", action }` on a clean resolve,
   else clarify/none/unknown-surface. ← *this story.*
2. **(7.4)** On a clean resolve the **server writes a transient `data-navigate` part** onto the stream
   via the `createUIMessageStream` writer.
3. **(7.4)** The mounted `AlmondLauncher` reads `data-navigate` and applies it via
   `useAlmondNavigation()` (the five `useQueryState` setters), deduped by part id.
4. **(7.5)** The action renders as an **action chip** that links back.

So the `navigate` tool's `execute` **returns** the `NavigateResult` (the action is the tool result the
model sees and 7.4 will lift onto the stream). **Do not** give the tool the stream writer, **do not**
write a `data-navigate` part, **do not** add a client hook in this story. Keeping the skill's output a
plain returned value is exactly what makes 7.3 unit-testable offline and lets 7.4 wire the transport
without touching the resolver. ADR-A02 explicitly rejected "render side-effects from a tool-result
part" in favor of a typed `data-navigate` part — that part is 7.4's to write.

### Source-tree components to touch

- **NEW:** `src/lib/almond/skills/navigate.ts` — `NavigateAction` (closed shape over the 5 keys),
  `NavigateResult` union, `navigateInputSchema` (Zod, shape-only), and the pure
  `resolveNavigate(meters, input)`. Creates the `skills/` dir (Epic 8's export/report skills join it).
- **NEW:** `src/lib/almond/skills/navigate.test.ts` — pure resolver tests (the four AC cases).
- **EVOLVES:** `src/lib/almond/tools.ts` — add the standalone `navigateSkill(deps, input)` executor
  (load meters + delegate) and the `navigate` `tool()` inside `readTools` (unconditional). Update the
  header/seam comments. **Do not** move it into `ownerOnlySkills()`.
- **EVOLVES:** `src/lib/almond/tools.test.ts` — add `"navigate"` to `READ_TOOLS`; both-actor parity.
- **EVOLVES:** `src/lib/almond/tools.db.test.ts` — add `"navigate"` to the `expected` key set + update
  the comment; (optional) the cross-farm navigate-scoping case.
- **DO NOT TOUCH:** `responder.ts` (no stub routing in 7.3), `route.ts` (no route change),
  `surface.ts`/`lens.ts` (read them, do not edit — 7.1 already shipped them), the read-tool executors,
  `shape.ts` (reuse `resolveMeterQuery` as-is), any `_components/almond/*` (client is 7.4/7.5),
  `/copy/en.ts`, `persona.ts`.

### Reuse — do not reinvent (the resolver and the registry already exist)

- **`resolveMeterQuery(meters, query)`** in `src/lib/almond/shape.ts:177-189` is the grounded matcher.
  It already returns the exact three-way result this story needs:
  `{ kind: "found"; meter } | { kind: "ambiguous"; names: string[] } | { kind: "none" }`. Map it
  straight through: `found → navigate`, `ambiguous → clarify`, `none → none`. **Do not** write a new
  matcher or a new ambiguity heuristic — the rule (exact id/SA-id/exact-name wins; else case-
  insensitive name-contains; 1 hit = found, >1 = ambiguous) is already implemented and tested in
  `shape.test.ts`. `meterDetail` (tools.ts:58-69) already consumes it the same way; follow that shape.
- **`src/lib/dashboard/surface.ts`** (Story 7.1) is the registry. Import from it:
  `SURFACE_KEYS` (the closed key set `["lens","entity","ranch","rate","meter"]`), `LENS_KEYS`
  (`["chart","table","map","calendar"]`), `isLensAvailable`, `parseLens`, and the `Lens` type — all
  re-exported there for exactly this consumer (see surface.ts:32-35, the comment names "the navigate
  skill, Story 7.3"). **Do not** hardcode the key list or lens list in `navigate.ts` — that is the
  drift ADR-A03 forbids, and a literal would desync the moment a lens is retired.
- The `meter` URL key holds the **meter id** (`m.id`), confirmed at every call-site
  (`meter-drawer.tsx:120` `setMeter`, `kpi-strip.tsx:131` `setMeter(biggestMover.meterId)`,
  `finding-card.tsx:106` `setMeter(finding.meterId)`). So `NavigateAction.meter` must be the resolved
  `meter.id`, never the raw query string. `entity`/`ranch`/`rate` hold raw filter strings
  (case-insensitive contains, `filter-bar.tsx:65-67`); pass them through verbatim. `lens` holds a
  `Lens` value (`lens-toggle.tsx:15`).

### The `NavigateAction` shape — why "closed over only the 5 keys" matters

`NavigateAction` is the contract 7.4's `useAlmondNavigation()` consumes: a partial assignment over the
five canonical `useQueryState` setters. Model it as optional fields keyed exactly by the registry's
keys (`lens?`, `entity?`, `ranch?`, `rate?`, `meter?`), each typed to what that key holds (lens → a
real `Lens`; the rest → `string | null`). A `null` means "clear this key" (the setters accept `null`,
e.g. `setMeter(null)` closes the drawer at `meter-drawer.tsx:134`); an absent field means "leave this
key untouched." Because the field names are the registry keys, a key retired from the registry makes a
stale `NavigateAction` field a type error — the same one-place-to-change guarantee 7.1 bought. Keep the
type **closed** (do not use `Record<string, unknown>` or a free-form `{ key, value }` pair) so an
unknown surface cannot be represented at all (AC1).

### The ambiguity rule is the safety story — test it hard (FR3)

The single most important assertion in this story: **a request matching ≥2 meters returns `clarify` and
carries no `action`.** A grower with 183 meters and repeated names across ranches (the Batth reality —
project-context "Ground truth") must never be silently dropped on the wrong pump. `resolveMeterQuery`
already returns `ambiguous` for >1 name-contains match; the only way to break FR3 here is to (a) not
map `ambiguous → clarify`, or (b) emit an `action` alongside a clarify. The test must assert **both**
`kind === "clarify"` **and** the absence of an `action` field. The exact-match precedence (id / SA-id /
exact name) is the escape hatch: "Pump 17" exactly matches one meter even if "Pump 170" exists, because
exact-name beats contains — keep that behavior by delegating to the resolver, do not pre-lowercase-
contains yourself.

### Architecture compliance (the contract this story honors)

- **AR6 / FR1 (server) / FR3:** navigation is a registry-validated, ambiguity-guarded skill that emits
  a declarative action; the server stays the validator. ADR-A02 (the skill half), ADR-A03 (validate
  against the registry).
- **FR6 (read-only on data):** `navigate` reads meters and sets URL state; it writes nothing to a
  Finding/rate/meter/account. Setting a URL key is not a data mutation.
- **FR7 (farm-scoped by inheritance):** `farmId` comes only from `deps`; the Zod input carries shape
  only (`open`/`query`/`lens`/`entity`/`ranch`/`rate`), never a scope value. Re-asserted by the
  cross-farm navigate test.
- **ADR-A08 (capability-by-omission):** `navigate` is read-safe and goes in the public-safe `readTools`
  set, returned for both `authedOwner` values — it is NOT gated. Only the Epic 8 export/report skills
  use the `ownerOnlySkills()` seam.
- **NFR3 / AR18 (determinism, offline):** the resolver is pure (no model, no I/O); CI/test exercise it
  with zero external calls. The stub default stays offline; 7.3 does not touch responder selection.
- **NFR5 / ADR-A03 (single registry):** `navigate` imports keys/lenses from `surface.ts`; no hardcoded
  surface or param name anywhere (architecture "Anti-patterns": no new query-param name, no hardcoded
  surface outside the registry).
- **Governing-doc order on any conflict:** `project-context.md` first, then the Tool 1 architecture,
  then the Almond architecture/ADRs (epics.md Overview; architecture.md "Implementation Patterns" lead).

### Library / framework requirements (no new deps)

- `ai ^6.0.198` (`tool`) and `zod ^4.4.3` are installed and are all this story uses — verified in 7.2.
  **Add no dependency.** `exceljs`/`@vercel/blob`/`@react-pdf/renderer` are Epic 8/9 deps; keep them
  absent.
- AI SDK **v6** tool shape is `tool({ inputSchema, execute })` — the shape already in `tools.ts`.
  Use `inputSchema`, **not** `parameters` (v4 naming). `execute(input)` receives the parsed Zod object.
- Zod v4: `z.enum([...] as const)` for the lens key set if you choose the boundary-enum approach;
  `z.object({...}).strict()`-style shaping for the input. Match the existing `tools.ts` Zod style
  (`z.object({ query: z.string().describe(...) })`).

### Testing requirements

- Two unit tiers by filename (project-context law): `*.test.ts` = **pure** (no DB), `*.db.test.ts` =
  Prisma DB-integration. Vitest `include` is `src/**/*.test.ts`, node env. The resolver tests are the
  **pure** tier (`skills/navigate.test.ts`) — mirror `shape.test.ts`. Keep any farm-scoping executor
  assertion in `tools.db.test.ts` (it needs a real DB to prove cross-farm isolation).
- The **regression net** for the factory change is the two key-set tests (`tools.test.ts`,
  `tools.db.test.ts`). After adding `navigate` they must assert **seven** keys for **both** actors.
  The cross-farm scoping block and the stub-responder block in `tools.db.test.ts` must pass
  **unchanged** (7.3 changes neither read-path semantics nor the stub).
- **e2e baseline (carry-over from 7.1/7.2):** `e2e/almond.spec.ts` runs the offline stub by default.
  The suite in this sandbox is a documented **3 pass / 5 fail** baseline — 4 failures are
  `net::ERR_CONNECTION_REFUSED` (the sandbox's unstable `next start`) and `almond.spec.ts:14` is a
  static `Expected 401, Received 400` mismatch — **none touch Almond's runtime**, all proven identical
  on baseline `ada4c80`. A failure is a 7.3 regression only if it differs from that pattern. 7.3 adds
  no client and no route change, so e2e must be transparent.
- Gate: `npm run typecheck && npm run lint && npm test`, then `npm run test:e2e -w @lavinia/dashboard`.
  Match 7.2's bar: typecheck/lint clean, full unit/db suite green (it was 82 files / 625 tests at 7.2;
  expect +1 file `navigate.test.ts` and +1 for any added db case), build success.

### Project guardrails that bite on this story (from project-context.md)

- **No `any`** (`@typescript-eslint/no-explicit-any` is an ESLint **error**). Type `NavigateAction`,
  `NavigateResult`, and the Zod-inferred `NavigateInput` precisely. **`noUncheckedIndexedAccess` is
  on** — when you read `contains[0]`/candidate arrays, guard the optional (the resolver already does;
  follow `shape.ts:186`).
- **No unused vars.** If a code path does not consume a field, do not introduce it.
- **Imports use the `@/` alias** for cross-module (`@/lib/dashboard/surface`, `@/lib/almond/shape`);
  intra-`almond` relative (`./skills/navigate`, `./shape`) matches the existing `tools.ts` imports
  (it imports `./shape`). Match the neighbor file's convention.
- **Pure logic stays pure.** `src/lib/almond/skills/navigate.ts` is a `/lib` module: **no
  `"use client"`, no React, no Prisma in the resolver.** Only the `navigateSkill` executor (in
  `tools.ts`) touches Prisma, via the loader, exactly like the other executors.
- **kebab-case file names; colocated `*.test.ts`.** `navigate.ts` + `navigate.test.ts` under
  `skills/`.
- **No user-facing copy in this story.** The skill returns structured results; the model narrates and
  7.4/7.5 render chips/messages with copy from `/copy/en.ts`. Do not add strings to `/copy` here.
  (If you find yourself writing a grower-facing sentence in `navigate.ts`, it belongs in 7.4/7.5.)
- **Voice (when 7.4/7.5 render it):** plain operator English, no exclamation marks, no kW/tariff
  jargon, **no em dashes** (FR20, NFR9). Not exercised in 7.3 since nothing user-facing renders yet,
  but keep any test-fixture meter names realistic and jargon-free.

### Previous story intelligence (Story 7.2 — shipped, done @ ada4c80; 7.1 — done @ 9242ce6)

- **7.2 left the exact seam this story fills.** `tools.ts:91` comment: *"navigation (7.3) is read-safe
  and added unconditionally"*, and `tools.ts:155-158` documents that `navigate` goes in the
  public-safe `readTools` set, not behind the owner gate. `ownerOnlySkills()` (tools.ts:93-95) returns
  `{}` and stays empty — **do not** put `navigate` there. Follow the comments 7.2 wrote for you.
- **7.2's tests assert exactly six keys** (`tools.test.ts` `READ_TOOLS`, `tools.db.test.ts` `expected`)
  and explicitly note "navigate … arrives in Story 7.3." Adding navigate **will** red those two tests
  until you update them — that is the intended tripwire (Task 3), not a surprise regression.
- **7.1 shipped the registry** `src/lib/dashboard/surface.ts` as a pure, React-free module **so this
  story's server-side skill can import it** (surface.ts:7-9, 32-35 call out "the navigate skill, Story
  7.3"). All four lenses are currently `available: true` (`lens.ts:19-24`), so an "unavailable lens"
  test case may need a hypothetical; use an **unknown** lens string (`"spreadsheet"`) for the
  unknown-surface case, which is the realistic refusal path.
- **7.1's dismissed-but-noted gap is now load-bearing here:** 7.1's review flagged that "no dead
  surface" ultimately depends on `navigate` validating against `SURFACE_KEYS`/the lens registry — that
  validation is **this story's** AC1. Honor it: refuse an out-of-registry surface, never coerce.
- **Both 7.1 and 7.2 passed 3-layer adversarial review with 0 actionable findings.** The bar: scope
  stays minimal (no 7.4 client work, no `/copy`, no new dep), every AC has code+test evidence, and the
  read-only/farm-scoped/capability contract is provably intact. Expect the same review (Blind Hunter /
  Edge Case Hunter / Acceptance Auditor) on the diff.

### Git intelligence

The last commits are the Almond effort in order: 7.1 (`52c92a4` impl, `28576fa` review, `9242ce6`
done) then 7.2 (`63fdfd7` story, `b1d083e` impl, `ada4c80` done). Shipped Almond code:
`src/lib/almond/{tools.ts, responder.ts, shape.ts, persona.ts, starters.ts}` (+ tests) and
`src/lib/dashboard/surface.ts`. Match their conventions exactly — the standalone-executor + `tool()`-
wrapper split (tools.ts), the pure-shape module style (shape.ts), the injected-responder boundary
(untouched here). `src/lib/almond/skills/` does not exist yet; this story creates it.

### Project Structure Notes

- `navigate.ts` lands in **`src/lib/almond/skills/`**, which the architecture's tree reserves
  (architecture.md:523-526: `skills/navigate.ts (new: registry-validated NavigateAction)`, alongside
  the future `export-spreadsheet.ts` / `generate-report.ts`). 7.2 deliberately did **not** pre-create
  `skills/`; 7.3 introduces it with its first real occupant. This matches the planned tree exactly — no
  variance.
- No new top-level dir, no env var, no Prisma/schema change, no `outputFileTracingIncludes` change
  (the resolver reads no fixture at runtime; the executor uses the existing loader).
- Only variance from planning docs: **none.** 7.3's scope is exactly epics.md Story 7.3 ACs + AR6 +
  ADR-A02 (skill half) + ADR-A03. The 7.3→7.4 split (this story emits the action; 7.4 transports +
  applies it) is the epics.md build note verbatim ("this story emits the action; the client applies it
  in 7.4 (backward-only dependency)").

### References

- [Source: _bmad-output/almond/3-solutioning/epics.md#Story 7.3: The `navigate` skill, entity resolver, and ambiguity rule] (the 5 ACs + build notes; AR6, FR1 server, FR3, ADR-A02 skill half, ADR-A03)
- [Source: _bmad-output/almond/3-solutioning/epics.md#Epic 7: Almond drives the screen (the navigation operator)] (the cross-cutting laws: read-only, farm-scoped, grounded, offline, voice)
- [Source: _bmad-output/almond/3-solutioning/architecture.md#Navigation — the server→client bridge (FR1–FR4) [the hard part]] (the 4-step bridge; 7.3 owns step 1 — the navigate skill returns the action)
- [Source: _bmad-output/almond/3-solutioning/architecture.md#The Skill Framework (FR5–FR9)] (navigate is always-available/read-safe; built by the factory; stub-answerable)
- [Source: _bmad-output/almond/3-solutioning/architecture.md#Navigation actions & the surface registry] (NavigateAction is closed over the 5 keys; ambiguity rule is law; no new query-param name; validate against the registry)
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A02] (typed transient data-navigate part is 7.4; 7.3's tool returns the declarative action; "render side-effects from a tool-result part" was rejected)
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A03] (single canonical surface registry; navigate reads keys/parsers from surface.ts; do not hardcode surfaces)
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A08] (read + navigate are public-safe; navigate is included for both actors, never gated)
- [Source: src/lib/almond/shape.ts:177-189] (`resolveMeterQuery` — the grounded three-way matcher to reuse: found/ambiguous/none)
- [Source: src/lib/almond/tools.ts:58-69] (`meterDetail` — the pattern for consuming `resolveMeterQuery` in an executor)
- [Source: src/lib/almond/tools.ts:97-163] (`buildAlmondSkills` — the `readTools` set + the `ownerOnlySkills()` seam; add `navigate` to `readTools`, NOT the seam)
- [Source: src/lib/dashboard/surface.ts:32-55] (the registry exports for 7.3: `SURFACE_KEYS`, `SURFACE`, `LENS_KEYS`, `isLensAvailable`, `parseLens`, `Lens`)
- [Source: src/lib/dashboard/lens.ts:7-48] (lens values: chart|table|map|calendar, all available; `isLensAvailable`, `parseLens` coerces — navigate must REFUSE instead)
- [Source: src/lib/almond/tools.test.ts:19-38] (the pure factory key-set test — add `navigate`, seven keys, both actors)
- [Source: src/lib/almond/tools.db.test.ts:83-100] (the db factory key-set test + parity assertion — add `navigate`, update the "arrives in 7.3" comment)
- [Source: src/app/(app)/_components/meter-drawer.tsx:120,134] / [kpi-strip.tsx:131] / [finding-card.tsx:106] (the `meter` key holds a meter ID; `setMeter(null)` clears it — `NavigateAction.meter` is the resolved `meter.id`)
- [Source: _bmad-output/almond/4-implementation/7-2-extend-the-tool-factory-into-the-skill-framework.md] (the seam 7.3 fills; the e2e baseline; the review bar)
- [Source: _bmad-output/project-context.md#Critical Implementation Rules] (no `any`, `noUncheckedIndexedAccess`, `@/` alias, pure `/lib`, colocated tests, kebab-case, copy in `/copy`)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx vitest run src/lib/almond/skills/navigate.test.ts` -> 12 passed (the pure resolver: meter
  single-match by name/SA-id/id, bare-query, the ambiguity rule, no-match, empty query; lens valid /
  unknown-surface; filter; combined lens+filter; whitespace/actionless -> none).
- `npx vitest run src/lib/almond` -> 5 files, 47 tests passed (navigate.test.ts + the updated
  tools.test.ts / tools.db.test.ts + shape.test.ts + starters.test.ts).
- `npm run typecheck -w @lavinia/dashboard` -> clean (`NavigateAction`/`NavigateResult`/`NavigateInput`
  precisely typed; no `any`; `noUncheckedIndexedAccess` guarded — the cross-farm db case asserts
  `aName` truthy before the `as string` cast).
- `npm run lint -w @lavinia/dashboard` -> clean.
- `npm test -w @lavinia/dashboard` (full, incl. db integration) -> 83 files, 638 tests passed (was
  82/625 at 7.2; +1 file `navigate.test.ts` and +13 tests = 12 pure + 1 cross-farm db scoping case).
  No regressions.
- `npm run build -w @lavinia/dashboard` -> success.
- `npm run test:e2e -w @lavinia/dashboard` -> 3 passed / 5 failed, all 5 PRE-EXISTING and matching the
  documented 7.1/7.2 baseline: 4 are `net::ERR_CONNECTION_REFUSED` (the sandbox's unstable `next
  start` on :3210) and `almond.spec.ts:14` is the static `Expected 401, Received 400` assertion. 7.3
  adds no client and no route change, so e2e is transparent to it. No 7.3 regression.

### Completion Notes List

- **Task 1 — pure navigate skill.** New `src/lib/almond/skills/navigate.ts`: the closed `NavigateAction`
  shape (optional fields keyed exactly by the registry's five canonical keys — `lens?` a real `Lens`,
  `entity?`/`ranch?`/`rate?`/`meter?` as `string | null`), the `NavigateResult` discriminated union
  (`navigate | clarify | none | unknown-surface`), the `navigateInputSchema` (Zod, shape-only — no
  `farmId`/scope), and the pure `resolveNavigate(meters, input)`. Keys + lenses are imported from
  `@/lib/dashboard/surface` (the 7.1 registry), never hardcoded (ADR-A03). Meter resolution delegates
  to the shipped `resolveMeterQuery` (no re-implemented matcher): `found -> navigate { meter: id }`,
  `ambiguous -> clarify`, `none -> none`. The meter action carries the resolved `meter.id`, not the
  raw query (the value the `meter` URL key holds, verified at the call-sites).
- **Decision (Task 1 lens-validity).** `lens` is a plain `z.string()` at the schema boundary and
  validated in the resolver via `asAvailableLens` (registry `LENS_KEYS` + `isLensAvailable`); an
  out-of-registry lens returns a typed `{ kind: "unknown-surface", requested }` (refused, NEVER coerced
  to a default the way the dashboard's `parseLens` coerces a stale deep link). Chosen over a
  `z.enum` so the refusal is a narratable result, not an un-narratable schema rejection (AC1). All four
  lenses are currently `available`, so the unknown-surface case is tested with an unknown string
  (`"spreadsheet"`), the realistic refusal path.
- **Task 2 — wired into the factory, unconditionally.** Added the standalone `navigateSkill(deps,
  input)` executor (loads meters via the existing `loadMetersForFarm`, delegates to the pure resolver)
  and the `navigate` `tool()` to the public-safe `readTools` object in `buildAlmondSkills` — NOT
  `ownerOnlySkills()`. Navigation only sets URL state (read-only on data, FR6), so it ships to every
  actor (ADR-A08). Updated the file-header and capability-seam comments to say the public set is now
  the six read tools + `navigate`. `AlmondSkills` derives the new key automatically.
- **Task 3 — regressed factory key-set tests updated.** `tools.test.ts`: `READ_TOOLS` -> `PUBLIC_SKILLS`
  with `"navigate"` (seven), both `it` titles retitled "six read tools plus navigate", both-actor
  parity kept. `tools.db.test.ts`: added `"navigate"` to `expected` (seven), retitled the test, updated
  the stale "navigate … arrives in Story 7.3" comment to note it has arrived and Epic 8's export/report
  skills are the first gated capability. The cross-farm scoping + stub-responder blocks pass unchanged.
- **Task 4 — tests.** Pure `skills/navigate.test.ts` (12 tests) covers all four AC cases; the ambiguity
  test asserts BOTH `kind === "clarify"` AND `"action" in result === false` (the FR3 never-auto-
  navigate guarantee). Added one cross-farm executor case to `tools.db.test.ts` proving `navigateSkill`
  inherits `deps` scope (farm B -> farm A meter = `none`; farm B -> its own pump = `navigate`), FR7.
- **Scope confirmed minimal (the 7.3↔7.4 boundary held):** the skill RETURNS the typed action; it
  writes NOTHING to the stream and moves NOTHING on screen. No `data-navigate` part, no
  `useAlmondNavigation` hook, no launcher/chip edits, no stub navigation routing (all 7.4/7.5). No new
  dependency, no env var, no Prisma/schema change, no `/copy` change, no responder/route change.
  Grower-facing behavior is unchanged until 7.4 lands the bridge.

### File List

- `src/lib/almond/skills/navigate.ts` (new) — the pure navigate skill: `NavigateAction` (closed shape
  over the 5 canonical keys), `NavigateResult` union, `navigateInputSchema` (Zod, shape-only),
  `resolveNavigate` (delegates meter lookup to `resolveMeterQuery`; validates lens against the
  registry; applies the ambiguity rule). Creates the `src/lib/almond/skills/` directory.
- `src/lib/almond/skills/navigate.test.ts` (new) — pure resolver tests (the four AC cases + lens/filter
  paths).
- `src/lib/almond/tools.ts` (modified) — new `navigateSkill(deps, input)` executor; `navigate` `tool()`
  added to the public-safe `readTools` set (unconditional, read-safe); header/seam comments updated;
  import of `navigateInputSchema`/`resolveNavigate`/`NavigateInput` from `./skills/navigate`.
- `src/lib/almond/tools.test.ts` (modified) — `READ_TOOLS` -> `PUBLIC_SKILLS` (+`navigate`, seven keys);
  both-actor parity; retitled cases.
- `src/lib/almond/tools.db.test.ts` (modified) — `expected` key set +`navigate` (seven) + comment
  update; new cross-farm `navigateSkill` scoping case; `navigateSkill` import.

## Change Log

| Date | Change |
|------|--------|
| 2026-06-18 | Story 7.3 drafted (Create Story workflow): scope = the SERVER-half `navigate` skill — new `src/lib/almond/skills/navigate.ts` with the closed `NavigateAction` shape, the `navigateInputSchema`, and the pure `resolveNavigate` resolver (reusing `resolveMeterQuery` + the 7.1 surface registry), the ambiguity rule (≥2 → clarify, emit nothing), unknown-surface refusal, wired UNCONDITIONALLY into `buildAlmondSkills` (read-safe, ADR-A08), plus the two factory key-set test updates. NO bridge/client/stub-routing/copy/dep (those are 7.4/7.5/Epic 8). Status -> ready-for-dev. |
| 2026-06-18 | Story 7.3 implemented (Dev Story workflow): new pure `skills/navigate.ts` (NavigateAction + resolveNavigate, registry-validated, ambiguity rule, unknown-surface refusal) + `skills/navigate.test.ts` (12); `navigateSkill` executor + `navigate` tool added unconditionally to the public-safe set in `tools.ts`; factory key-set tests updated to seven keys for both actors + a cross-farm navigate-scoping db case. typecheck + lint + 638 unit/db tests + build green; e2e 3/5 red proven pre-existing/environmental, identical to the 7.1/7.2 baseline. Boundary held: skill emits the action, no stream/client work (that is 7.4). Status -> review. |
| 2026-06-18 | Code review (3-layer adversarial): ACCEPT. Blind Hunter clean; Acceptance Auditor all 8 ACs satisfied + scope-discipline PASS; Edge Case Hunter 5 findings -> 2 patched (empty-query `open:"meter"` no longer swallows a co-passed lens/filter; `NavigateAction` null-clear comment made honest) + 3 dismissed by-design. Re-gated: typecheck + lint + 639 unit/db tests green (+1 test for the patch). Status -> done. |
