---
baseline_commit: e16049c
---

# Story 2.1: Design-token system and base UI primitives

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Terra engineer,
I want the DESIGN.md tokens and base components built once in one place,
so that every screen is visually consistent and no component hardcodes a color, font, or spacing.

## Acceptance Criteria

1. **Given** `globals.css`, **When** tokens are defined, **Then** the full DESIGN.md palette (surface tiers, on-surface/variant, outline/variant, `primary #2FA84F` + container, `money-positive #1FBF5A`, `alert #BD4B34` + container, inverse) exists as CSS variables in one file and no component hardcodes a hex.

2. **Given** typography, **When** set up, **Then** Inter loads via `next/font` and the named type roles (money-hero, display-lg + mobile, headline, title, body-lg/md, num-tabular, label-caps, caption) are available, with `tabular-nums` on all numeric/dollar/usage.

3. **Given** spacing and shape, **When** tokenized, **Then** the 8px scale, gutter/margins, agent-rail 240 / findings-rail 320, and the rounded scale (default .375rem, lg .75rem) exist; larger objects use `lg`.

4. **Given** elevation, **When** applied, **Then** depth is tonal warm-paper layering + soft warm shadow (`rgba(26,26,23,0.06)`, 20px+ blur) with hairline 1px `outline-variant` borders before shadows.

5. **Given** base components, **When** built, **Then** button (primary solid / secondary outline, one primary per screen), input (label-caps + hairline -> primary focus), and severity-badge (act=alert, watch=type-only, info=muted) match spec, with three colors max per screen (green, clay, charcoal-on-paper).

### AC interpretation notes (read before coding)

This is the **foundation story for Epic 2**: it lands the DESIGN.md token system in `globals.css` and the three reusable base primitives (`button`, `input`, `severity-badge`). It builds NO data surface, NO shell, NO lens. Stories 2.2-2.9 consume these tokens/primitives; do not pre-build any of their surfaces here.

- **AC1 tokens are additive + DESIGN.md-authoritative.** The current `globals.css` already carries an older partial palette (`--bg`, `--ink`, `--green`, `--green-deep`, `--risk`, `--gold`, `--sky`, `--line`, `--muted`, `--surface`, `--tint`) consumed by the **legacy** `src/app/dashboard/pump-timing/**` tool. ADD the full DESIGN.md palette under DESIGN.md-aligned names; KEEP the legacy tokens (remapped to the nearest DESIGN.md value where it does not break the legacy tool) so the legacy tool still compiles and renders. Net: one file, DESIGN.md is the source of truth for the new tokens, nothing the legacy tool reads disappears. The exact DESIGN.md hex values are in `DESIGN.md` frontmatter `colors:` - copy them verbatim, never approximate.
- **AC2 typography via `next/font` (already wired).** `src/app/layout.tsx` already loads Inter via `next/font/google` as `--font-inter`. Do NOT re-add a font import or a second family. Provide the named type roles as **utility classes in `globals.css`** (e.g. `.type-money-hero`, `.type-display-lg`, `.type-headline`, `.type-title`, `.type-body-lg`, `.type-body-md`, `.type-num`, `.type-label-caps`, `.type-caption`), each setting font-size/weight/line-height/letter-spacing per the DESIGN.md `typography:` block, and `font-variant-numeric: tabular-nums` on `money-hero`, `num-tabular`, and any role that renders figures. `display-lg` carries its mobile size via a `max-width` media query (the `display-lg-mobile` role). There is exactly ONE typeface (Inter); hierarchy is weight + size only. Reuse the existing `.tnum` / `.figure` helpers rather than duplicating them where they already match.
- **AC3 spacing/shape tokens.** 8px scale is satisfied by Tailwind's default spacing on even steps (`p-2`=8px, `p-3`=12px, `gap-6`=24px gutter, `px-5`=20px mobile margin, `px-12`=48px desktop margin); add named layout tokens so rail widths are tokens not magic numbers: `--spacing-agent-rail: 240px` and `--spacing-findings-rail: 320px` in `@theme` (yield `w-agent-rail` / `w-findings-rail`). Radius: register `--radius-control: 0.375rem` (default, buttons/inputs/cards) and `--radius-lg: 0.75rem` (drawer/sheet/map/modal). Larger objects use `lg`.
- **AC4 elevation.** Provide a soft warm shadow token (`--shadow-card` already exists; align it / add a DESIGN.md-spec one at `rgba(26,26,23,0.06)`, 20px+ blur, very low opacity) and a hairline border token (`--outline-variant`, 1px). The depth rule is: tonal warm-paper layering first (step the `surface-container-*` tone), then a 1px `outline-variant` border, then a soft shadow only for the drawer/bottom-sheet. Encode this as tokens + a short comment; do not build the drawer here.
- **AC5 base primitives in `src/components/ui/`** (the architecture's home for cross-agent UI primitives):
  - `button.tsx` - `primary` (solid `primary` fill, `on-primary` text, generous horizontal padding) and `secondary` (1px `outline-variant`, `on-surface` text) variants; a `size` (default/sm) is fine; forwards `ref`, spreads native `<button>` props, disabled state. One primary action per screen is a usage rule (document it; do not enforce in code).
  - `input.tsx` - minimalist: `label-caps` label above, hairline underline/box in `outline-variant` that goes to `primary` on focus; forwards `ref`, spreads native `<input>` props, associates the label with the input (`htmlFor`/`id`) for a11y.
  - `severity-badge.tsx` - takes `severity: "info" | "watch" | "act"` (import the union from `@/lib/recommendations/types`, never re-declare it). `act` = `alert` (clay fill or clay text+token), `watch` = charcoal weight + label only (NO color), `info` = muted. Renders the label text from `/copy` and pairs color with text (color is never the only signal - the accessibility floor).
  - All three reference ONLY tokens (Tailwind classes mapped to the CSS variables) - no hardcoded hex, no ad-hoc font. Use the existing `cn` helper (`@/lib/cn`). Three colors max on any screen: green, clay, charcoal-on-paper.
- **Copy:** any user-facing text the primitives render (the severity-badge labels) lives in `src/copy/en.ts`, not inline. Add a small `ui`/`severity` namespace. Plain operator English; no em dashes, no exclamation marks.

## Tasks / Subtasks

- [x] **Task 1: Land the DESIGN.md token system in `globals.css`** (AC: 1, 3, 4)
  - [x] Added the full DESIGN.md `colors:` palette as CSS variables in `:root` (verbatim hex): surfaces (`--surface`/`--surface-dim`/`--surface-container-lowest..highest`/`--surface-bright`), ink (`--on-surface`/`--on-surface-variant`/`--inverse-surface`/`--inverse-on-surface`), lines (`--outline`/`--outline-variant`), green (`--primary`/`--on-primary`/`--primary-container`/`--on-primary-container`), money (`--money-positive`/`--on-money-positive`), clay (`--alert`/`--on-alert`/`--alert-container`/`--on-alert-container`).
  - [x] Mapped each into `@theme inline` as `--color-*` (utilities `bg-paper`, `bg-surface-container-*`, `text-on-surface`, `text-on-surface-variant`, `border-outline-variant`, `bg-primary`, `text-on-primary`, `bg-primary-container`, `text-money-positive`, `bg-alert`, `text-alert`, `bg-alert-container`, `bg-inverse-surface`).
  - [x] Kept legacy tokens; resolved the ONE collision (`--surface`): it is now the DESIGN paper canvas, the legacy white-card aliases (`--color-surface`/`--color-card`/`--color-accent-ink`) repoint to `--surface-bright` so the legacy pump-timing tool keeps white cards. `npm run build` confirms the legacy tool still compiles (all 16 routes build).
  - [x] Added `--agent-rail: 240px`/`--findings-rail: 320px` (exposed as `--spacing-*` -> `w-agent-rail`/`w-findings-rail`) and `--radius-control: 0.375rem`/`--radius-lg: 0.75rem` (referenced via arbitrary values like `rounded-[var(--radius-control)]` so Tailwind's default rounded scale is left untouched).
  - [x] Added the soft warm elevated shadow `--shadow-elevated: 0 8px 28px rgba(26,26,23,0.06)` and documented the depth order (tone -> hairline -> shadow) in a comment.

- [x] **Task 2: Typography roles as utility classes** (AC: 2)
  - [x] Added `.type-*` classes for every DESIGN.md role (money-hero, display-lg, headline, title, body-lg, body-md, num, label-caps, caption) with verbatim size/weight/line-height/tracking; `tabular-nums` baked into `.type-money-hero` and `.type-num`. Sizes in rem (= the DESIGN px at 16px root) so they scale with dynamic type.
  - [x] `.type-display-lg` carries the mobile size via `@media (max-width: 640px)`. One typeface only (`--font-inter`); reused existing `.tnum`/`.figure`.

- [x] **Task 3: Base primitives in `src/components/ui/`** (AC: 5)
  - [x] `button.tsx` (primary solid / secondary outline, React-19 `ref` prop, native props, disabled, >=44px tap target), `input.tsx` (label-caps label + `useId` label/id association, hairline -> `focus:border-primary`), `severity-badge.tsx` (severity union imported from `@/lib/recommendations/types`; act=alert-container clay, watch=charcoal weight + label only, info=muted; color always paired with the label text).
  - [x] All token-referenced (no hex/font literals), use `cn`. Barrel `src/components/ui/index.ts`.
  - [x] Added the severity labels to `src/copy/en.ts` under a new `ui.severity` namespace.

- [x] **Task 4: Tests + validate** (AC: all)
  - [x] Added `src/app/globals.tokens.test.ts` (node env): asserts every DESIGN.md color token is present with its verbatim hex, the layout/radius tokens, the `@theme` `--color-*` exposure (incl. the `bg-paper` alias + legacy `bg-surface` white), the rail spacing utilities, all 9 type-role classes, and tabular figures on the figure roles.
  - [x] `npm run lint` (clean), `npx tsc --noEmit` (clean), `npm test` (45 files / 293 tests, +7 token tests), `npm run build` (all routes build). `no-raw-source-in-ui.test.ts` stays green (the primitives import no raw source). No DB/schema change -> `db:import-fixture` untouched.
  - [x] Build proves the legacy tool still paints; the real visual proof of the new primitives comes when Story 2.2 mounts the shell (browser check deferred to the renderable shell/table/drawer stories per the Epic 2 plan).

## Dev Notes

### Scope boundary (what is NOT in this story)

- **No shell, no rail, no lens, no KPI, no table, no drawer, no chart, no map.** Those are 2.2-2.9. Build ONLY tokens + typography + button + input + severity-badge.
- **No new dependency.** `nuqs`/`visx`/`maplibre` are later stories. `@base-ui-components/react`, `motion`, `lucide-react`, `clsx`+`tailwind-merge` (`@/lib/cn`) already exist - use them; do not add a UI kit.
- **No data read, no Prisma, no `dashboardFarm`.** This is pure presentation.
- **Do NOT delete/rewrite the legacy `src/app/dashboard/pump-timing/**` tool or its components.** It stays until Epic 5 replaces it. This story must not break its build.
- **No `next/font` re-import** - Inter is already loaded in `src/app/layout.tsx` as `--font-inter`.

### What exists to build on

- **`src/app/layout.tsx`** - already loads `Inter` via `next/font/google` -> `--font-inter`, `<html class="${inter.variable} ...">`, `<body class="bg-bg text-ink ...">`. Type roles read `var(--font-inter)`.
- **`src/app/globals.css`** - Tailwind v4 (`@import "tailwindcss"`), tokens in `:root` + `@theme inline`, existing helpers `.tnum`, `.figure`, `.eyebrow`, `.label-caps`, `.grain`, motion keyframes (`terra-reveal` with the spec easing `cubic-bezier(0.16,1,0.3,1)` + a `prefers-reduced-motion` block). Extend this file; reuse its motion + reduced-motion block (2.2 needs it).
- **`src/lib/cn.ts`** - `cn()` (clsx + tailwind-merge). Use it in every primitive.
- **`src/lib/recommendations/types.ts`** - the canonical `severity: "info" | "watch" | "act"` union (and `CoverageState`, `status`). Import the severity union into `severity-badge.tsx`; never re-declare.
- **`src/copy/en.ts`** - the `en` object of strings/builders. Add the badge labels here.
- **`src/components/`** - currently holds `logo.tsx`, `nav.tsx`, `spark.tsx`, `charts/`. Create the new `src/components/ui/` dir for the primitives (per architecture's `components/ui/ {button, input, severity-badge, drawer}`).
- **DESIGN.md** (`_bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md`) - the frontmatter `colors:`, `typography:`, `rounded:`, `spacing:` blocks are the verbatim source of truth for every value.

### Critical guardrails

1. **No hardcoded hex or font anywhere** (project-context Tailwind rule + AC1). Every color/font is a token referenced via a Tailwind class or `var(--token)`. The token-presence test guards the palette.
2. **One typeface (Inter), hierarchy from weight + size** (DESIGN.md). No second family, no mixing.
3. **Tabular figures on every number** (`tabular-nums`) - bake it into `money-hero`/`num-tabular`/figure roles so downstream stories cannot forget.
4. **Three colors max per screen: green, clay, charcoal-on-paper.** `watch` severity is type-only (no third hue). `money-positive` is a green, not a new color.
5. **Color never the only signal** (a11y floor) - severity-badge pairs the color with a text label.
6. **Additive, non-breaking** - the legacy pump-timing tool must still build. Prefer adding tokens to removing/renaming; reconcile the `--surface` collision deliberately and re-verify the build.
7. **TS strict + no-`any` + `noUncheckedIndexedAccess`** - primitives are typed; no `any`; ref-forwarding typed correctly (React 19).
8. **Honor `prefers-reduced-motion`** - the existing block already does; do not add motion that bypasses it (no motion needed in this story anyway).

### Concrete shapes (recommended)

```css
/* globals.css :root  (verbatim DESIGN.md hex) */
--surface: #faf9f4;            --surface-dim: #ece9e0;
--surface-bright: #ffffff;     --surface-container-lowest: #ffffff;
--surface-container-low: #f6f4ec;  --surface-container: #f1eee4;
--surface-container-high: #ebe8dd; --surface-container-highest: #e5e1d5;
--on-surface: #1a1a17;         --on-surface-variant: #5a554c;
--inverse-surface: #2c2c28;    --inverse-on-surface: #f4f2ec;
--outline: #9a9384;            --outline-variant: #d9d4c6;
--primary: #2fa84f;            --on-primary: #ffffff;
--primary-container: #c9ebd2;  --on-primary-container: #0c3d1c;
--money-positive: #1fbf5a;     --on-money-positive: #ffffff;
--alert: #bd4b34;              --on-alert: #ffffff;
--alert-container: #f7ddd4;    --on-alert-container: #4e1306;

/* @theme inline */
--color-surface: var(--surface); --color-on-surface: var(--on-surface);
--color-on-surface-variant: var(--on-surface-variant);
--color-outline-variant: var(--outline-variant);
--color-primary: var(--primary); --color-on-primary: var(--on-primary);
--color-alert: var(--alert); --color-money-positive: var(--money-positive);
/* ...all of them... */
--spacing-agent-rail: 240px; --spacing-findings-rail: 320px;
--radius-control: 0.375rem;  --radius-lg: 0.75rem;
```

```tsx
// src/components/ui/severity-badge.tsx
import type { Severity } from "@/lib/recommendations/types"; // "info" | "watch" | "act"
import { en } from "@/copy/en";
import { cn } from "@/lib/cn";

export function SeverityBadge({ severity }: { severity: Severity }) {
  // act = alert clay; watch = charcoal weight + label only; info = muted. Color + text always.
  ...
}
```

### Previous story intelligence (Epic 1, done)

- Epic 1 was pure `/lib` + Prisma; it touched NO `/app` UI. This is the first UI story. The patterns to carry forward: TS strict / no-`any` / `noUncheckedIndexedAccess`; colocated `*.test.ts`; `if (!x) throw` narrowing in tests (never vacuous); copy in `/copy`; tokens in `globals.css`.
- The real reconciled Batth account lives in `dev.db` after `npm run db:import-fixture` (run it after any `db:seed`, which clobbers it - a recorded 1.8 deferral). This story does not read the DB, but keep `db:import-fixture` green.
- `no-raw-source-in-ui.test.ts` forbids `@/lib/extract/*` and the raw normalize mappers in `/app`. The `ui` primitives live in `/components`, import no source - trivially compliant; keep the guard green.

### Latest tech notes

- **Tailwind v4** (no config file): tokens are CSS variables; `@theme inline` exposes them as utilities. `--color-foo` -> `bg-foo`/`text-foo`/`border-foo`. `--spacing-foo` -> `w-foo`/`p-foo`. `--radius-foo` -> `rounded-foo`. No `tailwind.config.js`.
- **React 19** ref-forwarding: a function component can take `ref` as a normal prop (no `forwardRef` required in React 19); either is acceptable, type it precisely.
- **`next/font`** is configured once in `layout.tsx`; type roles just reference `var(--font-inter)`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1] - user story + the five ACs verbatim.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md] - frontmatter `colors:`/`typography:`/`rounded:`/`spacing:` (verbatim values), Colors/Typography/Layout/Elevation/Shapes/Components sections, Do's and Don'ts (three-colors-max, one typeface, tabular figures, no glassmorphism).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md#Accessibility Floor] - color never the only signal; severity pairs color with a text badge.
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend Architecture, #Complete Project Directory Structure] - `components/ui/ {button, input, severity-badge, drawer}`; tokens read CSS variables, never literal hex.
- [Source: _bmad-output/project-context.md#Design system] - editorial agrarian-luxury; Inter via next/font; warm paper never pure white; one dominant green + one clay alert; hairline borders; soft shadows; 8px scale; tabular figures; tokens in one file.
- [Source: src/app/globals.css] - the existing token file + helpers + motion block to extend.
- [Source: src/app/layout.tsx] - Inter already loaded via next/font as `--font-inter`.
- [Source: src/lib/recommendations/types.ts] - the `Severity` union for the badge.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context)

### Debug Log References

- `npx tsc --noEmit` -> exit 0; `npm run lint` -> exit 0; `npm test` -> 45 files / 293 tests pass (+7 over 1.8's 286, all in the new `globals.tokens.test.ts`); `npm run build` -> all 16 routes build (the legacy `dashboard/pump-timing/**` tool compiles unchanged).
- `npx vitest run src/app/globals.tokens.test.ts src/lib/normalize/no-raw-source-in-ui.test.ts` -> 10 tests pass (token presence + the UI-boundary guard stays green).
- No DB/schema/migration/seed change -> `db:import-fixture` untouched (Story 1.8's real reconciled account is preserved).

### Completion Notes List

- **DESIGN.md token system landed in the one tokens file (`src/app/globals.css`), additively + DESIGN-authoritative.** The full DESIGN.md `colors:` palette (surfaces incl. container tiers, on-surface/variant, inverse, outline/variant, primary + container, money-positive, alert + container) is in `:root` with verbatim hex, each exposed as a Tailwind utility via `@theme inline`. Layout rail-width tokens (`w-agent-rail`/`w-findings-rail`), the radius scale (`--radius-control`/`--radius-lg`), and a soft warm elevated shadow are added; the depth order (tonal layering -> hairline -> shadow) is documented.
- **One token collision resolved cleanly.** Legacy `--surface` was white (`#ffffff`); DESIGN `surface` is the paper canvas (`#faf9f4`). `--surface` is now the DESIGN paper canvas; the three legacy white-card aliases (`--color-surface`/`--color-card`/`--color-accent-ink`) repoint to a new `--surface-bright` (`#ffffff`), so the legacy pump-timing tool keeps its white cards. New UI uses `bg-paper` for the canvas and `bg-surface-container-*` for tiers. Verified no component reads `var(--surface)` directly (only @theme utilities), so the repoint is invisible to the 17 legacy files using `bg-surface`/`bg-card`.
- **Typography: nine `.type-*` role classes** for the DESIGN.md `typography:` block, one typeface (Inter via the already-wired `--font-inter`), hierarchy from weight + size only, `tabular-nums` baked into the figure-bearing roles (money-hero, num) so no downstream story can forget. Sizes in rem so they scale with dynamic type; `display-lg` carries its mobile size via a media query.
- **Three base primitives** in `src/components/ui/` (`button`, `input`, `severity-badge`), token-only, `cn`-merged, React-19 `ref` prop. The severity-badge pairs color with the label text (`act` clay, `watch` type-only, `info` muted) so color is never the only signal (a11y floor); three colors max per screen held (green, clay, charcoal-on-paper).
- **Testable surface for a CSS-only story:** a token-presence guard test (node-env Vitest can't render components) that fails if any DESIGN.md token is dropped/mistyped or its `@theme` utility exposure is lost. Render correctness is proven at Story 2.2 when the shell mounts these tokens/primitives.
- **Scope held:** no shell, no lens, no KPI, no data read, no new dependency, no Prisma, no edit to the legacy tool. Foundation only.

### File List

- `src/app/globals.css` (modified) - DESIGN.md palette + `@theme` utilities + layout/radius/shadow tokens + nine `.type-*` typography roles; legacy `--surface` reconciled to paper with `--surface-bright` for legacy white cards.
- `src/components/ui/button.tsx` (new) - primary/secondary button.
- `src/components/ui/input.tsx` (new) - labeled input (label-caps + hairline focus).
- `src/components/ui/severity-badge.tsx` (new) - info/watch/act badge (color + text).
- `src/components/ui/index.ts` (new) - barrel.
- `src/copy/en.ts` (modified) - `ui.severity` label strings.
- `src/app/globals.tokens.test.ts` (new) - DESIGN.md token-presence guard (7 tests).

## Change Log

- 2026-06-09: Implemented Story 2.1 - the DESIGN.md design-token system in `src/app/globals.css` (full palette as CSS variables + `@theme` Tailwind utilities, layout/radius/shadow tokens, nine `.type-*` typography roles with tabular figures baked in) and the three base UI primitives (`button`, `input`, `severity-badge`) in `src/components/ui/`, all token-referenced with no hardcoded hex/font. Resolved the one legacy/DESIGN `--surface` collision (paper canvas; legacy white cards via `--surface-bright`) with zero legacy build break. Added a token-presence guard test. lint + tsc + 293 tests + build all green; `no-raw-source-in-ui` green; no DB change. Status -> review.
- 2026-06-09: Code review (3-layer adversarial: Blind Hunter + Edge Case Hunter + Acceptance Auditor, run as parallel subagents). Acceptance Auditor: all five ACs MET with verbatim DESIGN.md fidelity (every palette hex matches frontmatter, nine type roles + mobile variant + rail/radius/shadow tokens + three primitives, token-only, scope correctly limited, no new deps). Fixed 3 (stale duplicate `--color-surface` mapping that all three layers flagged - latent invisible-cards risk; an unbounded/near-vacuous tabular-figures test slice + missing `.type-num` assertion; a `rounded-[var(--radius-*)]` glob in the story prose that tripped Tailwind's markdown scanner into an invalid-CSS build warning). Deferred 2 pre-existing token-hygiene items (not introduced here). lint + tsc + 294 tests + clean build all green. Status -> done.

## Code Review (2026-06-09)

Adversarial review across three parallel layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Acceptance Auditor verdict: **all five ACs MET** with verbatim DESIGN.md fidelity - every `colors:` hex matches the frontmatter exactly; the nine `.type-*` roles, the `display-lg` mobile variant, the rail/radius/shadow tokens, and the three primitives are present, token-only (no hardcoded hex/second typeface), with scope correctly limited to tokens + button/input/severity-badge (no premature shell/lens/data surfaces, no `nuqs`/`visx`/`maplibre`). The legacy `--surface` collision was reconciled without breaking the pump-timing tool (clean build + 294 tests).

Triage: 3 patches, 2 defer, 0 dismissed.

### Fixed (patches applied this story)

- [Patch] **Stale duplicate `--color-surface` mapping** [src/app/globals.css] - flagged by all three layers (Blind + Edge as the top finding, noted by the Auditor's scope check). The reconcile added `--color-surface: var(--surface-bright)` (white, for legacy cards) in the aliases block but left the original `--color-surface: var(--surface)` (now the paper canvas) in the first `@theme` group. CSS last-wins kept `bg-surface` white today (build + test confirmed), but the dead contradicting declaration is a latent invisible-cards bug (a future reorder/delete would flip every legacy card to paper-on-paper). Removed the stale line; the paper canvas is exposed separately as `bg-paper`. New guard test asserts `--color-surface: var(--surface)` is ABSENT so it cannot return.
- [Patch] **Near-vacuous tabular-figures test** [src/app/globals.tokens.test.ts] - Edge + Auditor. The money-hero `tabular-nums` slice ran to EOF, so a later rule's `tabular-nums` could satisfy it, and `.type-num` (the other figure role, per DESIGN.md `num-tabular`) was unasserted. Bounded each slice to its own rule body and added an explicit `.type-num` assertion.
- [Patch] **`rounded-[var(--radius-*)]` glob in the story prose tripped Tailwind's markdown scanner** [the 2.1 story artifact] - Blind. Tailwind v4 scans `_bmad-output/**/*.md`, read the literal `--radius-*` as a class candidate, and emitted an invalid-CSS build warning (`Unexpected token Delim('*')`). Reworded the prose to a concrete `rounded-[var(--radius-control)]`; the build is now warning-free.

### Deferred (pre-existing token-hygiene, recorded in deferred-work.md)

- [Defer] The global `:focus-visible` ring hardcodes the brand green as a literal `rgba(47,163,54,0.35)` instead of a token (the one hardcoded color left in `globals.css`). Pre-existing (not introduced by 2.1); the new primitives use token-based focus. Token-hygiene pass.
- [Defer] The `body` font fallback stack is `system-ui, sans-serif`; DESIGN.md specifies Arial as the system fallback. Pre-existing, trivial; align in a token-hygiene pass.
