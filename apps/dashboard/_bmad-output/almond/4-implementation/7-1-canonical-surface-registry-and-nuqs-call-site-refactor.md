# Story 7.1: Canonical surface registry and nuqs call-site refactor

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Effort: Almond — Terra's Generative Operator (Epics 7-10). Tracked in the per-effort folder
     _bmad-output/almond/4-implementation/ (NOT the global implementation-artifacts/ path), so it
     never collides with the Tool 1 dashboard sprint. See _bmad-output/almond/index.md. -->
<!-- PRODUCT GATE: the heavy Almond build is gated behind FARMER VALIDATION (PRD Open Q4 / decision
     D14). Writing this story file is the allowed per-story step; do NOT begin dev-story until the
     gate clears. This story is the lowest-risk, most-isolated of the set (a behavior-preserving
     refactor with no Almond runtime change), but the gate still governs when implementation starts. -->

## Story

As a grower,
I want Almond to only ever offer to open parts of the dashboard that actually exist,
So that the assistant never sends me to a dead screen as the product changes.

(Foundation story. The grower never sees this work directly; it is the single-source-of-truth seam
that makes the later "Almond drives the screen" stories safe. It unblocks Story 7.3 — the `navigate`
skill — and Story 7.4 — the server -> client navigation bridge.)

## Acceptance Criteria

1. **Given** the dashboard's URL-state keys, **When** the registry is built, **Then**
   `src/lib/dashboard/surface.ts` is the single source of truth for the closed key set
   (`lens | entity | ranch | rate | meter`), each key's parser/validator, and (composing the existing
   `lens.ts`, not replacing it) which lenses are available.

2. **Given** the client components that today inline the key as a bare string literal, **When**
   refactored, **Then** each imports its key name and parser from the registry; **no query-param
   string literal for a canonical key remains outside `surface.ts`** (verified by grep across `src/`).

3. **Given** a key or lens is retired from the registry, **When** the app builds, **Then** there is
   exactly one place that changed and any consumer referencing the removed surface **fails at
   type-check, not silently at runtime** (the keys are `as const` literal types fed to a typed
   accessor, so a stale reference is a compile error).

4. **Given** the existing lens/filter behavior, **When** the refactor lands, **Then** behavior is
   **unchanged** (pure rename-to-constant): the existing unit tests (`lens.test.ts`, `filters.test.ts`,
   and the rest of the `src/lib/dashboard` suite) and the e2e specs (`almond.spec.ts`, `auth.spec.ts`,
   `onboarding.spec.ts`) still pass unchanged, and a **new `src/lib/dashboard/surface.test.ts`** asserts
   the registry exposes exactly the five keys and their parsers/defaults.

5. **Given** the `lens` key specifically, **When** refactored, **Then** its existing nuqs options are
   preserved exactly — `{ defaultValue: defaultLens(), clearOnDefault: true }` and resolution through
   `parseLens` — so a lens deep link, the `clearOnDefault` URL-cleanup, and the stale-value fallback all
   behave identically to today (no behavior change is the law for this story).

6. **Given** the `entity | ranch | rate | meter` keys, **When** refactored, **Then** they remain **raw
   nullable strings** (today they are `useQueryState("entity")` with no parser and no default); the
   registry centralizes the **key name** (and any shared option bag) only — it does **not** add a parser
   that changes nullability, coercion, or default behavior. Centralize the literal; do not "improve" the
   semantics.

## Tasks / Subtasks

- [ ] **Task 1 — Build the canonical surface registry** (AC: 1, 3, 5, 6)
  - [ ] Create `src/lib/dashboard/surface.ts` as the single source of truth for the five canonical
        URL-state keys: `lens`, `entity`, `ranch`, `rate`, `meter`.
  - [ ] Type the key set as `as const` literals so they are a closed union (`SurfaceKey`), and expose a
        typed accessor / option-bag-per-key so a consumer that references a removed key fails at
        type-check (AC 3). Do not export a loose `string`.
  - [ ] Compose (do NOT re-implement) `lens.ts`: re-export / wrap `parseLens`, `defaultLens`, `LENSES`,
        `LENS_KEYS` for the `lens` key. `lens.ts` stays the lens-value authority (AC 1).
  - [ ] Model the `lens` entry to carry its existing nuqs options: `defaultValue: defaultLens()` +
        `clearOnDefault: true` + resolution via `parseLens` (AC 5).
  - [ ] Model the `entity | ranch | rate | meter` entries as raw nullable-string keys (no parser, no
        default) so behavior is identical to today (AC 6). The "parser/validator" for these four is the
        identity/pass-through of the raw `string | null`; document that explicitly in the file.
  - [ ] File-level comment explains the one-source-of-truth intent and that adding/removing a navigable
        surface is a one-edit change here that Almond's `navigate` skill (Story 7.3) reads.
- [ ] **Task 2 — Refactor every canonical-key call-site to read from the registry** (AC: 2)
  - [ ] Refactor all **10** client components that inline a canonical key (verified blast radius — the
        architecture named 9; `map-lens.tsx` is the verified +1, see Dev Notes):
        `lens-toggle.tsx`, `lens-region.tsx`, `kpi-strip.tsx`, `chart-lens.tsx`, `calendar-lens.tsx`,
        `filter-bar.tsx`, `meter-table.tsx`, `meter-drawer.tsx`, `finding-card.tsx`, **`map-lens.tsx`**.
  - [ ] Each `useQueryState("<key>", …)` pulls its key name (and, for `lens`, its options/parser) from
        `surface.ts`. No literal `"lens" | "entity" | "ranch" | "rate" | "meter"` query-param string
        remains in any component.
  - [ ] The two `lens` call-sites (`lens-toggle.tsx`, `lens-region.tsx`) keep `{ defaultValue,
        clearOnDefault }` exactly, sourced from the registry (AC 5).
  - [ ] The filter/meter call-sites stay raw nullable strings, only the key literal moves to the registry
        (AC 6).
- [ ] **Task 3 — Prove no literal escaped and behavior is preserved** (AC: 2, 3, 4)
  - [ ] Grep `src/` for the five key literals used as a nuqs param; confirm the only occurrences are in
        `surface.ts` (and `lens.ts` internals). Both `NuqsAdapter` mount points are unchanged
        (`(dashboard)/layout.tsx`, `tour/layout.tsx`).
  - [ ] Add `src/lib/dashboard/surface.test.ts` (model it on `lens.test.ts`): assert the registry exposes
        **exactly** the five keys, the `lens` parser resolves like `parseLens`, the `lens` default equals
        `defaultLens()`, and the filter/meter keys are pass-through nullable.
  - [ ] Run `npm run typecheck && npm run lint && npm test` and `npm run test:e2e -w @lavinia/dashboard`;
        all existing tests pass unchanged (AC 4). The `noUncheckedIndexedAccess` + no-`any` rules are hard
        errors — type the registry accessors precisely.

## Dev Notes

### What this story is (and is not)

- **Is:** a mechanical, behavior-preserving refactor that introduces one new pure module
  (`src/lib/dashboard/surface.ts`) and rewrites the canonical-key call-sites to import from it. It is
  the genuinely-foundational sweep of Epic 7, sequenced **first** because Stories 7.3 (the `navigate`
  skill) and 7.4 (the server -> client bridge) both read key names + parsers from this registry.
- **Is NOT:** any change to Almond, the chat route, the model boundary, or navigation behavior. No
  `NavigateAction` is emitted here. No new dependency. No DB change. The dashboard must behave byte-for-byte
  the same after this lands.
- **Risk:** low. The only way to break a grower is to change lens/filter/drawer behavior, which AC 4-6
  forbid. Treat any behavior change as a bug in the refactor.

### VERIFIED blast radius — 10 call-sites, not 9 (correction to the architecture)

The architecture (AR3 / ADR-A03) lists **9** components. A full grep of the repo
(`grep -rn "useQueryState" src/`) shows a **10th**: `map-lens.tsx` reads `entity/ranch/rate` and
reads+writes `meter`. It must be refactored too, or AC 2 ("no canonical-key literal remains outside
`surface.ts`") fails. Authoritative list with exact current usage:

| # | File (`src/app/(app)/_components/`) | Line(s) | Key(s) | Current pattern |
|---|---|---|---|---|
| 1 | `lens-toggle.tsx` | 15-18 | `lens` (r/w) | `useQueryState("lens", { defaultValue: defaultLens(), clearOnDefault: true })` -> `parseLens(raw)` |
| 2 | `lens-region.tsx` | 27-30 | `lens` (r) | same option bag, read-only `[raw]` -> `parseLens(raw)` |
| 3 | `kpi-strip.tsx` | 87-90 | `entity`,`ranch`,`rate` (r), `meter` (w) | bare nullable strings |
| 4 | `filter-bar.tsx` | 64-66 | `entity`,`ranch`,`rate` (r/w) | bare nullable strings |
| 5 | `meter-table.tsx` | 128-131 | `entity`,`ranch`,`rate`,`meter` (r/w) | bare nullable strings; also powers the CSV export button (line ~183) |
| 6 | `meter-drawer.tsx` | 119 | `meter` (r/w; `setMeter(null)` closes) | bare nullable string |
| 7 | `chart-lens.tsx` | 47-49 | `entity`,`ranch`,`rate` (r) | bare nullable strings |
| 8 | `calendar-lens.tsx` | 44-47 | `entity`,`ranch`,`rate` (r), `meter` (w) | bare nullable strings |
| 9 | `finding-card.tsx` | 34 | `meter` (w) | bare nullable string; `setMeter(finding.meterId)` traces a finding to its meter |
| **10** | **`map-lens.tsx`** | **101-104** | `entity`,`ranch`,`rate`,`meter` (r/w) | **bare nullable strings — MISSING from the architecture's list** |

Two distinct patterns to preserve:
- **`lens`** (call-sites 1-2): carries `{ defaultValue: defaultLens(), clearOnDefault: true }` and is
  resolved through `parseLens`. Preserve all of it (AC 5).
- **`entity | ranch | rate | meter`** (call-sites 3-10): plain `useQueryState("<key>")` returning
  `string | null`, no parser, no default. Keep them plain (AC 6) — do not add validation.

`NuqsAdapter` is mounted in **two** layouts and neither changes:
`src/app/(app)/(dashboard)/layout.tsx` (lines 35-47) and `src/app/tour/layout.tsx` (lines 29-54).

### Source-tree components to touch

- **NEW:** `src/lib/dashboard/surface.ts` — the registry (pure, no React, no DB).
- **NEW:** `src/lib/dashboard/surface.test.ts` — the registry unit test (model on `lens.test.ts`).
- **EDIT (10):** the 10 components in the table above (key literals -> registry imports only).
- **COMPOSE, do not edit semantics:** `src/lib/dashboard/lens.ts` — stays the lens-value authority
  (`Lens`, `LENSES`, `LENS_KEYS`, `defaultLens`, `isLensAvailable`, `parseLens`). The registry imports
  and re-exposes these for the `lens` key; do not duplicate the lens value list into `surface.ts`.

### `lens.ts` as it stands today (the thing the registry composes)

```ts
// src/lib/dashboard/lens.ts (existing — DO NOT re-implement; compose)
export type Lens = "chart" | "table" | "map" | "calendar";
export const LENSES: readonly LensDef[];      // [{key, available}] — all four available today
export const LENS_KEYS: readonly Lens[];       // ["chart","table","map","calendar"]
export function defaultLens(): Lens;           // first available in priority order (chart), table fallback
export function isLensAvailable(key: Lens): boolean;
export function parseLens(value: string | null | undefined): Lens;  // stale/unknown -> default
```

### Illustrative registry shape (the dev agent owns the final shape; the ACs are the contract)

The hard requirements: a closed `as const` key set, a typed accessor that makes a removed-key reference
a compile error (AC 3), the `lens` option bag + parser preserved (AC 5), and the filter/meter keys left
as raw nullable strings (AC 6). One shape that satisfies all of this:

```ts
// src/lib/dashboard/surface.ts  (illustrative — not prescriptive)
import { defaultLens, parseLens, type Lens } from "@/lib/dashboard/lens";

export const SURFACE_KEYS = ["lens", "entity", "ranch", "rate", "meter"] as const;
export type SurfaceKey = (typeof SURFACE_KEYS)[number];

// The lens key keeps its exact nuqs options + parser (behavior-preserving).
export const lensSurface = {
  key: "lens" satisfies SurfaceKey,
  options: { defaultValue: defaultLens(), clearOnDefault: true } as const,
  parse: parseLens,            // re-exposed from lens.ts, never re-implemented
} as const;

// The four filter/meter keys are raw nullable strings today — keep them that way.
// The registry centralizes the literal (and nothing else) so a rename is one edit.
export const entityKey = "entity" satisfies SurfaceKey;
export const ranchKey  = "ranch"  satisfies SurfaceKey;
export const rateKey   = "rate"   satisfies SurfaceKey;
export const meterKey  = "meter"  satisfies SurfaceKey;
```

Call-site after refactor (lens example, behavior identical):

```ts
// lens-toggle.tsx
const [raw, setLens] = useQueryState(lensSurface.key, lensSurface.options);
const active = lensSurface.parse(raw);   // was: parseLens(raw)
```

```ts
// meter-table.tsx (filter/meter — stays raw nullable string)
const [meterId, setMeter] = useQueryState(meterKey);   // was: useQueryState("meter")
```

Whatever the final shape, **Story 7.3's `navigate` skill validates a requested surface against this
registry** (closed key set + lens availability), so keep the exported surface set and lens-availability
read cleanly importable from server code (`surface.ts` is pure — no `"use client"`, no React import).

### Testing standards summary

- Two unit tiers by filename: `*.test.ts` = pure (no DB), `*.db.test.ts` = Prisma DB-integration. Vitest
  `include` is `src/**/*.test.ts`, node env. Colocate the new test as `src/lib/dashboard/surface.test.ts`.
- Model `surface.test.ts` on the existing `lens.test.ts`: assert the registry carries **exactly** the
  five keys, the lens parser/default agree with `parseLens` / `defaultLens()`, and the filter/meter keys
  pass through `string | null` unchanged.
- The existing `src/lib/dashboard` suite (notably `lens.test.ts`, `filters.test.ts`, `csv.test.ts`,
  `table.test.ts`) is the behavior-preservation net — it must pass **unchanged**.
- e2e: `e2e/{almond,auth,onboarding}.spec.ts`. None exercises the lens/filter URL keys by name (grep
  found no matches), so lens/filter coverage here is unit-level; e2e is the smoke that the app still
  builds and runs. Run e2e single-worker against the throwaway Postgres (`npm run test:e2e`).
- Gate before claiming done: `npm run typecheck && npm run lint && npm test` (from root or
  `-w @lavinia/dashboard`), then `npm run test:e2e -w @lavinia/dashboard`.

### Project guardrails that bite on this story (from project-context.md)

- **No `any`** (`@typescript-eslint/no-explicit-any` is an ESLint *error*). Type the registry; use
  `unknown` + narrow if ever needed. **`noUncheckedIndexedAccess` is on** — `SURFACE_KEYS[i]` is
  `T | undefined`; guard, do not `!`.
- **Imports use the `@/` alias** (`@/lib/dashboard/lens`, `@/lib/dashboard/surface`), not deep relative
  chains.
- **Pure logic stays pure.** `surface.ts` is a `src/lib` module: no React, no Prisma, no I/O, no
  `"use client"`. This is also what lets Story 7.3's server-side `navigate` skill import it.
- **kebab-case file names; colocated `*.test.ts`.** Keep the lens-value authority in `lens.ts`; the
  registry composes it — one source of truth per concept.
- **No user-facing copy changes** in this story (the registry is internal plumbing). If any string moves,
  it is a key constant, not grower-facing text — no `/copy/en.ts` edit expected.

### Previous story intelligence

This is Story 7.1 — the **first** story of Epic 7 (and of the Almond operator effort), so there is no
prior implementation story to inherit notes from. The foundation it extends is the **shipped Epic-6
Almond** (read-only tool-calling chat, `buildAlmondTools`, offline stub default) and the shipped Tool 1
dashboard (the lens/filter/drawer surfaces). This story touches **only** the dashboard's URL-state
plumbing; it does not yet touch any Almond code (that begins in Story 7.2, which extends
`buildAlmondTools` -> `buildAlmondSkills`, and 7.3, which adds the `navigate` skill that reads this
registry).

### Git intelligence

The last five commits are all Almond **planning/BMAD-doc** commits (sprint plan, implementation-readiness
assessment, epic breakdown, architecture + ADRs, mascot identity) — no Almond *code* has landed yet. This
story is the first code change of the effort. Recent dashboard code (the lens/filter/map surfaces this
refactors) is stable and shipped; match its existing conventions (the `lens.ts` registry style is the
local pattern to mirror for `surface.ts`).

### Project Structure Notes

- New module lands in `src/lib/dashboard/` alongside the existing pure dashboard modules
  (`lens.ts`, `filters.ts`, `csv.ts`, `table.ts`, …), each with a colocated `*.test.ts`. No deviation
  from the documented layout.
- No new top-level directory, no new dependency, no env var, no Prisma/schema change, no
  `outputFileTracingIncludes` change (nothing reads a fixture at runtime here).
- `nuqs ^2.8.9` is already installed; the refactor uses the same API, only sourcing the key/options from
  the registry.
- Watch item / no conflict: the architecture text says "~9 call-sites"; the verified count is **10**
  (map-lens included). Refactor all 10. This is the only variance from the planning docs and it widens
  coverage rather than changing intent.

### References

- [Source: _bmad-output/almond/3-solutioning/epics.md#Story 7.1: Canonical surface registry and nuqs call-site refactor]
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A03: A single canonical surface registry; refactor the duplicated nuqs call-sites to read from it]
- [Source: _bmad-output/almond/3-solutioning/epics.md#Additional Requirements] (AR3 — the registry + the named call-sites; NFR5)
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A02] (why 7.3/7.4 depend on this registry: the `navigate` skill validates against it)
- [Source: src/lib/dashboard/lens.ts] (the lens-value authority the registry composes — `Lens`, `LENSES`, `LENS_KEYS`, `defaultLens`, `isLensAvailable`, `parseLens`)
- [Source: src/lib/dashboard/lens.test.ts] (the model for `surface.test.ts`)
- [Source: src/app/(app)/_components/{lens-toggle,lens-region,kpi-strip,filter-bar,meter-table,meter-drawer,chart-lens,calendar-lens,finding-card,map-lens}.tsx] (the 10 verified call-sites)
- [Source: src/app/(app)/(dashboard)/layout.tsx] + [src/app/tour/layout.tsx] (the two NuqsAdapter mount points — unchanged)
- [Source: _bmad-output/project-context.md#Critical Implementation Rules] (no `any`, `noUncheckedIndexedAccess`, `@/` alias, pure `/lib`, colocated tests, kebab-case)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
