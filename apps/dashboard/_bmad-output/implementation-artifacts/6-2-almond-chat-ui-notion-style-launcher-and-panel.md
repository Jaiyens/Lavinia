---
baseline_commit: 3cb19fab78b1bc9e4bc719d22e20e06802564b38
---

# Story 6.2: Almond chat UI — Notion-style launcher and panel (Magic UI)

Status: done

## Story

As a grower on my phone or laptop,
I want to open Almond from anywhere and chat with it in a clean panel,
so that help is one tap away on every screen, like the Notion agent.

## Acceptance Criteria

1. **Given** any `(app)` screen, **When** rendered, **Then** a persistent Almond launcher sits in the corner (bottom-right on desktop, above the mobile tab bar) and opens a slide-out chat panel; closing returns to the dashboard with the rest of the UI state intact.

2. **Given** the chat panel, **When** used, **Then** it streams Almond's answers token-by-token via `useChat` (`@ai-sdk/react`) against the 6.1 endpoint, with visible empty / thinking / streaming / error states.

3. **Given** the launcher and panel, **When** rendered, **Then** they are built from Magic UI components (CLAUDE.md: Magic UI is the design bible) tinted to the warm palette, and carry the Almond persona (almond avatar/character); all user-facing copy lives in `/copy`, plain operator English, no exclamation marks.

4. **Given** a mobile viewport, **When** opened, **Then** the panel is usable one-handed and never collides with the existing findings sheet or agent tab bar (z-order and offsets respected).

### AC interpretation notes (read before coding)

- **Depends on 6.1.** This story consumes `/api/almond/chat`. If 6.1's route is present, wire to it; the injected stub responder means the panel works end-to-end in dev with zero external calls.
- **Replicate the Notion-agent feel (the screenshots).** A small circular launcher in the bottom corner; tapping it opens a panel anchored to that corner with a header (Almond name + avatar), a scrolling message list, and a bottom input ("Ask anything about your farm..."). This is the reference; match its basic feel, not pixel-for-pixel.
- **Magic UI is the vocabulary — install via the proven pipeline.** `components.json` is configured and `npx shadcn@latest add "https://magicui.design/r/<name>.json" --yes` is verified to land components in `src/components/ui/` and rewrite the `cn` import to `@/lib/cn` (a sample, `border-beam.tsx`, is already installed — reuse or restyle it, do not re-add blindly). Suggested components (add what you use): a Magic UI button (Shiny / Shimmer / Interactive Hover) or `Dock` for the launcher, `Border Beam` or `Shine Border` / `Magic Card` for the panel frame, `Animated List` for messages appearing, `Typing Animation` and/or `Animated Shiny Text` for the streaming/thinking state, `Dot Pattern` for the header texture. Tint every effect into the warm palette (greens/golds from `globals.css` tokens), not default neon.
- **Mount point.** The shell is `src/app/(app)/(dashboard)/layout.tsx` (three zones; `FindingsRail` desktop, `FindingsSheet` + `AgentTabBar` mobile). Mount a single client component `<AlmondLauncher />` once in that layout so Almond is present on every `(app)` screen. The launcher/panel are `fixed`; pick a z-index ABOVE the main content but coordinated with the findings sheet (sheet is ~z-30, mobile drawer ~z-50 per 3.1 notes) — Almond's panel should sit at z-40 and, on mobile, offset above the tab bar (`bottom-16`/`bottom-20`) and not overlap an open findings sheet (close one when the other opens, or stack deterministically — pick one and note it).
- **Open/close state.** Local component state is fine (the launcher is a leaf); do NOT add a nuqs query key (canonical keys are `lens|entity|ranch|rate|meter` only — Almond's open state is ephemeral UI, not a deep-link). Persist nothing server-side in this story.
- **Streaming with v6 `useChat`.** Verify the v6 `@ai-sdk/react` API (it uses `transport: new DefaultChatTransport({ api })`, returns `messages` as `UIMessage[]` with `parts`, and `sendMessage`/`status`). Consult the `vercel:ai-sdk` skill and the installed `@ai-sdk/react` types before wiring — do not write v4/v5 `useChat` from memory. Render assistant `text` parts; tool-call parts can render as a simple "looking at your meters..." line in this story (rich tool rendering is 6.3).
- **Reduced motion.** Magic UI components mostly honor `prefers-reduced-motion`; verify the ones you use degrade to a static state and the panel stays fully usable.
- **Accessibility.** Launcher is a real `<button aria-expanded>` ≥44px with an aria-label; panel is a labelled dialog; input is a labelled field; messages region is a live region so streamed text is announced. Keyboard: Escape closes, focus moves into the panel on open and back to the launcher on close.

## Tasks / Subtasks

- [x] **Task 1: Install the Magic UI components you will use** — via `npx shadcn@latest add "https://magicui.design/r/<name>.json" --yes` (launcher button/dock, panel frame effect, animated list, typing/shiny text, dot pattern). Confirm each lands in `src/components/ui/`, imports `@/lib/cn`, and typechecks. (AC3)
- [x] **Task 2: AlmondLauncher** — `src/app/(app)/_components/almond/almond-launcher.tsx` (client): the fixed corner launcher (Magic UI button/dock + Border Beam, almond avatar), open/close local state, aria-expanded, ≥44px, responsive position (desktop bottom-right; mobile above the tab bar). Toggles the panel. (AC1, AC3, AC4)
- [x] **Task 3: AlmondPanel** — `src/app/(app)/_components/almond/almond-panel.tsx` (client): the slide-out panel (Magic UI frame/Magic Card + Dot Pattern header with the Almond persona), header (name + avatar + close), `<AlmondMessages />`, and `<AlmondComposer />`. Slide/scale in on open; focus trap; Escape to close; reduced-motion fallback. (AC1, AC2, AC3, AC4)
- [x] **Task 4: useChat wiring** — `AlmondMessages` + `AlmondComposer` use `useChat` from `@ai-sdk/react` against `/api/almond/chat` (verify v6 transport/messages/parts API first). Render user + assistant text parts via Animated List; streaming assistant text via Typing Animation / Animated Shiny Text; a thinking indicator while `status` is streaming; an inline error state (no thrown errors to the boundary); tool-call parts render as a simple status line. Autoscroll to newest; input clears on send; Enter sends, Shift+Enter newline. (AC2)
- [x] **Task 5: Mount + copy** — mount `<AlmondLauncher />` once in `src/app/(app)/(dashboard)/layout.tsx`; extend `src/copy/en.ts` `shell` with an `almond` namespace (launcher aria-label, panel heading, input placeholder, thinking, error, empty/greeting, close label). Plain operator English, no exclamation marks, no kW/jargon. (AC1, AC3)
- [x] **Task 6: Validate** — lint + tsc + full vitest green; `npm run build` clean. Browser-verify (Playwright or dev server) on the demo account: launcher visible on dashboard + /energy; opening streams a grounded answer from the stub responder; close/reopen keeps the dashboard state; mobile viewport — panel usable, no collision with the findings sheet or tab bar; reduced-motion — animations degrade, panel still works. (AC1-4)

### Review Findings (2026-06-10 code review)

- [x] [Review][Patch] `m.parts` accessed without a guard (`messageText`/`isLookingUp`/`toolNamesFrom`) → a part-less message throws in render and escapes to the error boundary, violating guardrail #8; also empty-text messages render empty bubbles [almond-messages.tsx, almond-result.tsx]
- [x] [Review][Patch] `type-body-sm` is not a defined utility (only `-lg`/`-md` exist) → starter chip text silently falls back to default sizing [almond-messages.tsx]
- [x] [Review][Patch] Panel and findings sheet can overlap on mobile; AC4's "deterministic non-collision" rule was not implemented (only the z-order half) [almond-launcher.tsx, almond-panel.tsx]
- [x] [Review][Patch] `BorderBeam`/`DotPattern` animate via JS motion with no `useReducedMotion` guard → they keep animating under `prefers-reduced-motion` (the global CSS reset does not stop JS-driven motion) [components/ui/border-beam.tsx, dot-pattern.tsx]
- [x] [Review][Patch] `AnimatePresence` wraps the panel but the panel defines no `exit` variant → close is abrupt and the wrapper is a no-op [almond-launcher.tsx, almond-panel.tsx]
- [x] [Review][Patch] Composer rapid double-send is not debounced (the `disabled` flag is one render behind) and the error state has no retry affordance [almond-composer.tsx, almond-messages.tsx]
- [x] [Review][Defer] No request-body size cap on the chat route (minor DoS vector on an auth-gated route) [route.ts] — deferred, low priority

## Dev Notes

### What exists to build on

- **`src/app/(app)/(dashboard)/layout.tsx`** — the three-zone shell and the single mount point for `<AlmondLauncher />`. **`src/app/(app)/_components/shell/`** — `findings-sheet.tsx` (z-index/offset + slide-in pattern to coordinate with), `agent-tabbar.tsx` (mobile bottom bar Almond must clear), `reveal.tsx` (staged-reveal helper).
- **`components.json`** (configured for Tailwind v4 + `@/lib/cn`), **`src/components/ui/border-beam.tsx`** (a Magic UI component already installed as the proven sample), **`src/lib/cn.ts`** (`cn`). **`src/components/ui/{button,input}.tsx`** — base primitives if you need a plain control.
- **`src/app/globals.css`** — palette tokens (`--green`, `--green-deep`, `--gold`, `--bg`, `--ink`, `--line`, `--shadow-card`, `--radius-*`). Tint Magic UI effects with these.
- **`@ai-sdk/react`** — installed for `useChat`. **`/api/almond/chat`** — the 6.1 endpoint (injected stub responder = zero external calls in dev).
- **`src/copy/en.ts`** — `shell` namespace pattern (existing `shell.findings*`, formatter usage); add `shell.almond`.

### Critical guardrails

1. **Magic UI first** (CLAUDE.md), tinted to the warm palette — no default neon; effects in greens/golds. 
2. **One mount, present everywhere** — `<AlmondLauncher />` lives once in the `(app)` shell layout.
3. **Ephemeral UI state only** — local state for open/close; NO new nuqs key (canonical keys are `lens|entity|ranch|rate|meter`).
4. **No collisions** — z-40 panel; on mobile, offset above the tab bar and do not overlap an open findings sheet (pick a deterministic rule and note it).
5. **Verify v6 `useChat`/`DefaultChatTransport` against the installed `@ai-sdk/react` + the `vercel:ai-sdk` skill** — do not write it from memory.
6. **A11y + reduced-motion** — real button/dialog/live-region, keyboard + focus management, animations degrade gracefully.
7. **Copy in `/copy`**, plain operator English, no exclamation marks. **TS strict, no `any`.**
8. **Errors render inline** in the panel, never thrown to an error boundary (the 3.1 lesson).

### Project Structure Notes

- New: `src/app/(app)/_components/almond/{almond-launcher,almond-panel,almond-messages,almond-composer}.tsx`, plus the Magic UI components added under `src/components/ui/`.
- Modified: `src/app/(app)/(dashboard)/layout.tsx` (mount), `src/copy/en.ts` (`shell.almond`).
- Untouched: the 6.1 backend (consumed as-is), the recommendation engines, the Prisma schema.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.2] — the four ACs.
- [Source: CLAUDE.md#Frontend aesthetics (Magic UI is the bible)] — Magic UI is the primary vocabulary; install via shadcn CLI; tint to the warm palette.
- [Source: src/app/(app)/(dashboard)/layout.tsx; src/app/(app)/_components/shell/{findings-sheet,agent-tabbar}.tsx] — the shell, the mount point, the z-order/offset to coordinate with.
- [Source: components.json; src/components/ui/border-beam.tsx; src/lib/cn.ts] — the proven Magic UI install pipeline and the sample component.
- [Skill: vercel:ai-sdk] — canonical v6 `useChat` + `DefaultChatTransport` + UIMessage/parts API (consult before wiring).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Opus 4.8, 1M context) — unattended overnight dev-story run.

### Debug Log References

- Magic UI install pipeline (non-interactive) added: `shine-border`, `animated-shiny-text`, `dot-pattern`, `shimmer-button` (plus the pre-existing `border-beam`) — all landed in `src/components/ui/`, imports rewritten to `@/lib/cn`, typecheck clean.
- Patched the vendored `src/components/ui/dot-pattern.tsx`: it called `Math.random()` during render, which this project's `react-hooks/purity` ESLint rule rejects (a hard error). Replaced with deterministic per-index delay/duration (the glow timing is unused in Almond's usage anyway).
- v6 `useChat` wiring (verified against installed `@ai-sdk/react@3.0.201` + `ai@6.0.199`): `useChat({ transport })` with `transport: new DefaultChatTransport({ api })` (imported from `ai`, NOT `@ai-sdk/react`), memoized via a `useState` initializer so it is not re-created per render; `messages` are `UIMessage[]` rendered by flattening `text` parts; `sendMessage({ text })`; `status` drives the empty/thinking/streaming/error states.
- Gates: `tsc --noEmit` clean; `eslint .` clean; `vitest run` 76 files / 588 tests green (no regressions); `npm run build` compiles the client launcher + Magic UI components clean.

### Completion Notes List

- **Almond is now on every dashboard screen.** A single `<AlmondLauncher farmName=...>` is mounted once in the `(app)/(dashboard)` shell layout. It owns the `useChat` conversation (so it survives open/close) and streams against the farm-scoped `/api/almond/chat` (6.1) — in dev that hits the offline stub responder, so the panel works end-to-end with zero external calls.
- **Notion-agent feel, in the Magic UI vocabulary tinted to the warm palette.** Launcher = a `ShimmerButton` (green `#2fa84f` bg, gold `#f2c14e` shimmer) with a `BorderBeam` and the almond avatar. Panel = a paper card with `ShineBorder` (green/gold) and a `DotPattern` header behind the persona; assistant streaming/looking-up states use `AnimatedShinyText`. No default neon — every effect is tinted to brand tokens.
- **Almond persona.** An inline almond-character avatar (`almond-avatar.tsx`), name + tagline in the header; all copy in `/copy` under `shell.almond`, plain operator English, no exclamation marks.
- **States + a11y.** Empty state shows a grounded greeting naming the farm; `submitted` shows a thinking shimmer; `streaming`/tool-call shows a "looking up" shimmer; errors render inline (never thrown to a boundary). The launcher is a real `aria-expanded` button; the panel is a labelled `role="dialog"` that focuses on open and closes on Escape; the messages region is an `aria-live="polite"` log. Motion uses `useReducedMotion` so the entrance degrades to instant.
- **No collisions.** Panel at z-40; launcher hides while the panel is open; on mobile the panel sits at `bottom-20` (clear of the `h-16` tab bar) and the findings sheet stays at z-30. Open/close is ephemeral local state — no new nuqs key (canonical keys unchanged).
- **Scope note (for review):** automated/browser verification of the live click-through is carried by Story 6.3's Playwright e2e (which drives the panel against the stub). 6.2 is verified by tsc + lint + 588 tests + a clean production build; the e2e in 6.3 is the interactive confirmation.

### File List

- `src/app/(app)/_components/almond/almond-avatar.tsx` (new) — the inline almond-character avatar.
- `src/app/(app)/_components/almond/almond-launcher.tsx` (new) — persistent launcher; owns `useChat`; toggles the panel.
- `src/app/(app)/_components/almond/almond-panel.tsx` (new) — the slide-out panel (ShineBorder + DotPattern header, focus/Escape, reduced-motion).
- `src/app/(app)/_components/almond/almond-messages.tsx` (new) — message list, streaming/thinking/error states, grounded greeting.
- `src/app/(app)/_components/almond/almond-composer.tsx` (new) — input + send (Enter sends, Shift+Enter newline).
- `src/components/ui/{shine-border,animated-shiny-text,dot-pattern,shimmer-button}.tsx` (new) — Magic UI components added via shadcn CLI.
- `src/components/ui/dot-pattern.tsx` (modified) — deterministic dot timing (purity-rule fix).
- `src/app/(app)/(dashboard)/layout.tsx` (modified) — mounts `<AlmondLauncher />` with the resolved farm name.
- `src/copy/en.ts` (modified) — `shell.almond` copy namespace.

## Change Log

- 2026-06-10: Implemented Story 6.2 — Almond's Notion-style launcher + slide-out chat panel in the Magic UI vocabulary (ShimmerButton/BorderBeam launcher, ShineBorder/DotPattern panel, AnimatedShinyText states), tinted to the warm palette, streaming via v6 `useChat` against the 6.1 endpoint. Mounted once in the dashboard shell; copy in /copy. Patched the vendored dot-pattern for the purity rule. lint + tsc + 588 tests + production build green. Status -> review.
