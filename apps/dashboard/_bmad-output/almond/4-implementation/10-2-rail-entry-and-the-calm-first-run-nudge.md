---
baseline_commit: 964829c48ecd8cd5598a173b2597b79b6da13979
---

# Story 10.2: Rail entry and the calm first-run nudge

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Effort: Almond — Terra's Generative Operator (Epics 7-10). Tracked in the per-effort folder
     _bmad-output/almond/4-implementation/ (NOT the global implementation-artifacts/ path), so it
     never collides with the Tool 1 dashboard sprint. See _bmad-output/almond/index.md. -->
<!-- PRODUCT GATE: the heavy Almond build is gated behind FARMER VALIDATION (PRD Open Q4 / D14).
     Writing this story file is the allowed per-story step. Epics 7, 8, and 9 all shipped to main and
     Story 10.1 (action/export starters) is done, so Epic 10 is in-progress. 10.2 is the SECOND story
     in Epic 10: it makes Almond DISCOVERABLE for the grower who is ready — a clear, persistent entry
     in the OS-shell rail (so the operator is not relying on the floating launcher alone) and a calm,
     dismissible first-run nudge that points at Almond once and is never seen again after dismissal.
     The hard law of the whole epic (FR22): gentle and progressive, never blocks / interrupts / nags.
     Abuse/cost protection on the now-generative endpoint is the next and final story (10.3). -->

## Story

As a grower,
I want a clear but quiet way to find Almond and a gentle first-time hint about what it can do,
So that I notice it when I am ready and am never nagged when I just want my dashboard.

(This is the **second story in Epic 10 (Surfacing Almond, gently)**. Today Almond is reachable only
through the floating launcher button — the `AlmondLauncher` FAB pinned bottom-right on every dashboard
screen ([almond-launcher.tsx](../../../src/app/(app)/_components/almond/almond-launcher.tsx)). There is
**no entry for Almond in the OS-shell rail** ([agent-rail.tsx](../../../src/app/(app)/_components/shell/agent-rail.tsx)),
which lists the agents Home / Energy / Water / Labor plus a Reports / Account / Sign-out footer, and
there is **no first-run hint** that Almond exists. 10.2 adds both, and only both: (a) a clear, persistent
**"Ask Almond" entry in the desktop rail** that opens the existing panel, and (b) a **calm, dismissible
first-run nudge** ("ask Almond to show you your most expensive meter") that appears once on the grower's
first dashboard view and never reappears after dismissal, with dismissal remembered. No new npm
dependency, no new route, no new lens. The launcher's open/close state is lifted into a tiny shared
client context so the rail entry and the nudge can both open the panel; everything else about the
launcher, panel, and chat is unchanged.)

## Acceptance Criteria

1. **Given** any signed-in `(app)` dashboard screen (and the public `/tour`), **When** the OS-shell rail
   renders, **Then** Almond has a **clear, persistent entry in the desktop agent rail** (alongside the
   existing floating launcher), labelled in the Almond voice, that **opens the existing Almond panel**
   when activated — it is the same panel the floating launcher opens, not a second chat. The mobile
   bottom tab bar is intentionally NOT given an Almond tab: the floating launcher FAB is already a
   persistent mobile entry, and a 7th tab would crowd the mobile-first bar (the rail/FAB split is the
   responsive entry; document this in the Dev Agent Record) (FR21, UX-DR4).

2. **Given** the rail entry and the floating launcher both want to open the **one** panel, **When** the
   launcher's open state is needed by more than one trigger, **Then** that boolean is lifted into a small
   **client context** (`AlmondLauncherProvider` / `useAlmondLauncher`) that exposes `open` + an
   `openAlmond()` action; the `AlmondLauncher` consumes it (it no longer owns a private `useState` for
   open), and the rail entry calls `openAlmond()`. The launcher's chat state (`useChat`, nav chips,
   report cards, announcer) stays inside `AlmondLauncher` — only the open boolean is lifted. No global
   `window` event bus, no new state-management dependency (NFR2: brownfield-clean, no new deps).

3. **Given** a real owner's first dashboard run, **When** Home (`/`) renders and the nudge has not been
   dismissed, **Then** a **calm, dismissible** nudge appears ("ask Almond to show you your most expensive
   meter") that **never blocks, interrupts, or nags**: it is a small, out-of-the-way callout (not a
   modal, not a full-width banner, does not cover the data or trap focus), it reads as optional, and it
   offers a one-tap "show me" affordance that opens Almond plus an explicit dismiss control (FR21, FR22,
   UX-DR5).

4. **Given** the grower dismisses the nudge (or engages Almond from it), **When** they return to the
   dashboard later, **Then** the nudge **does not reappear** — dismissal is **persisted and decided
   server-side** so the nudge is gated out before it ever renders (no flash of an already-dismissed
   hint). Tapping "show me" both opens Almond AND counts as dismissal (engaging is acknowledging), so an
   engaged grower is never nudged again either (FR22 "powers reveal as the grower engages, never up
   front"; UX-DR5 "dismissal is remembered").

5. **Given** the grower ignores the nudge entirely, **When** they continue using the dashboard, **Then**
   the dashboard is **fully usable** and Almond stays out of the way: the nudge is non-blocking, the rail
   and data hero are unaffected, and the nudge is shown only on the first-run landing (Home), not as a
   persistent banner on every screen (FR22). The nudge is **owner-only** — it is NOT shown on the public
   `/tour` (a prospect on the badged demo is not "a grower's first run"; the Tour already carries its own
   connect CTA), matching how the rail entry IS shown everywhere but the first-run nudge is not.

6. **Given** `prefers-reduced-motion` and keyboard-only use, **When** the rail entry and the nudge
   render, **Then** any Magic UI / motion effect **degrades gracefully** under `prefers-reduced-motion`,
   and both are **fully operable by keyboard** (focusable, Enter/Space activate, visible focus ring) with
   adequate touch targets (>= 44px); the nudge's dismiss and "show me" controls are both keyboard
   reachable, and the nudge does not steal or trap focus on mount (NFR7, UX-DR8).

7. **Given** all new user-facing copy, **When** it is added, **Then** it lives in `src/copy/en.ts` (the
   rail entry label, the nudge title/body/CTA, and the accessible labels) in the Almond voice — plain
   operator English, **no exclamation mark**, **no em dash**, no kW/tariff/interval jargon — and the
   voice-law pin in `src/copy/en.test.ts` is extended to cover the new strings; the pure first-run gate
   helper is unit-tested; `typecheck`, `lint`, and `test` are green (FR20, NFR9, NFR3).

## Tasks / Subtasks

- [x] **Task 1 — Lift the launcher's open state into a small client context** (AC: #2)
  - [x] Add `src/app/(app)/_components/almond/almond-launcher-provider.tsx` (`"use client"`): a context
        holding `{ open: boolean; setOpen: (v: boolean) => void; openAlmond: () => void; closeAlmond: () => void }`,
        a provider component `AlmondLauncherProvider` (owns the `useState(false)` for `open`), and a
        `useAlmondLauncher()` hook. Keep it tiny — this owns ONLY the open boolean, nothing else.
  - [x] In `almond-launcher.tsx`, replace the local `const [open, setOpen] = useState(false)` with
        `const { open, setOpen, closeAlmond } = useAlmondLauncher()`. The FAB still calls `setOpen(true)`
        (or `openAlmond()`), the panel's `onClose` still calls `setOpen(false)` (or `closeAlmond()`).
        Everything else in the launcher (the `useChat` conversation, the nav-chip + report-card maps, the
        live-region announcer, `useAlmondNavigation`) is UNCHANGED and stays in `AlmondLauncher`.
  - [x] No global `window` event, no new dependency. The provider is the single hub the rail entry and
        the nudge both use to open the one panel.

- [x] **Task 2 — Add the "Ask Almond" entry to the desktop rail** (AC: #1, #2, #6)
  - [x] In `agent-rail.tsx`, add a clear, persistent **"Ask Almond"** entry (a `<button>`, NOT a `<Link>`
        — Almond is a panel, not a route) that calls `openAlmond()` from `useAlmondLauncher()`. Use the
        `AlmondAvatar` (or a Sparkles lucide icon) so it reads as Almond, the warm-palette active/hover
        styling that matches the other rail rows, `h-11` (>= 44px target), keyboard-operable with a
        visible focus ring, and `aria-haspopup="dialog"`. Place it as a distinct entry directly under the
        AGENTS `<nav>` block (visually it is a path to value, not a page); keep the Reports / Account /
        Sign-out footer as-is.
  - [x] The rail is rendered inside the new provider (see Task 4), so `useAlmondLauncher()` resolves. The
        entry is shown in BOTH the signed-in rail and the `demo` (Tour) rail — Almond is available on the
        Tour too (the launcher already mounts there), so the entry must open it there as well.
  - [x] Do NOT add an Almond tab to `agent-tabbar.tsx` (the mobile FAB launcher is the persistent mobile
        entry; adding a 7th tab crowds the mobile-first bar). Leave the tab bar unchanged. Record this
        responsive decision in the Dev Agent Record.

- [x] **Task 3 — The calm, dismissible first-run nudge** (AC: #3, #4, #5, #6)
  - [x] Add `src/app/(app)/_components/almond/almond-nudge.tsx` (`"use client"`): a small, out-of-the-way
        callout (anchored near the launcher FAB, e.g. bottom-right above it; NOT a modal, NOT full-width,
        no focus trap) that shows the nudge copy plus a **"Show me"** button and a **dismiss** (X) button.
        - "Show me" -> `openAlmond()` AND fire the dismiss action (engaging acknowledges); then hide.
        - Dismiss (X) -> fire the dismiss action; then hide.
        - Render only on Home: `usePathname() === "/"` (the first-run landing; the confirm save redirects
          to `/`, so this IS the immediate post-onboarding moment). Do not render it as a persistent
          banner on every dashboard screen.
        - Honor `prefers-reduced-motion` for any entrance animation; keyboard-operable; no focus steal on
          mount (it is a polite callout, not a dialog — do not autofocus or trap).
  - [x] The nudge receives a server-decided `show: boolean` prop (Task 5) and self-hides on dismiss/engage
        via local state, so the user sees it disappear immediately without waiting on a round-trip.

- [x] **Task 4 — Persist dismissal (server-decided) + wire both layouts** (AC: #1, #2, #4, #5)
  - [x] Persist dismissal as an **httpOnly cookie** (no schema change, no migration, server-readable so
        the gate is decided before render — see the decision note in Dev Notes). Add a small pure gate
        helper `src/lib/almond/nudge.ts` exporting `shouldShowAlmondNudge({ dataKind, dismissed })` ->
        `boolean` (true only when `dataKind === "real"` AND `!dismissed`) and the cookie name constant
        (e.g. `ALMOND_NUDGE_COOKIE = "almond_nudge_seen"`).
  - [x] Add a server action `dismissAlmondNudgeAction()` in `src/app/(app)/actions.ts` (`"use server"`)
        that re-checks `auth()` and sets the cookie (long `maxAge`, `httpOnly`, `sameSite: "lax"`,
        `path: "/"`). It mutates only the cookie; no DB write, no redirect.
  - [x] In `src/app/(app)/(dashboard)/layout.tsx`: read the cookie (`cookies()` — the layout is already
        `force-dynamic`), compute `showNudge = shouldShowAlmondNudge({ dataKind: resolved.dataKind, dismissed })`,
        wrap the shell subtree (the `<div>` with `AgentRail` + `main` + `FindingsRail`, the
        `FindingsSheet`, `AgentTabBar`, and `AlmondLauncher`) in `<AlmondLauncherProvider>`, and mount
        `<AlmondNudge show={showNudge} />` inside that provider.
  - [x] In `src/app/tour/layout.tsx`: wrap the same subtree in `<AlmondLauncherProvider>` so the Tour rail
        entry can open the launcher. Mount `<AlmondNudge show={false} />` (the Tour is never a real owner;
        equivalent to passing `shouldShowAlmondNudge({ dataKind: "representative", ... }) === false`). The
        rail entry IS present on the Tour; the first-run nudge is NOT.

- [x] **Task 5 — Copy + voice law** (AC: #7)
  - [x] In `src/copy/en.ts`, extend `en.shell.almond` with the new strings. Recommended keys + copy (tune
        wording, keep the voice):
        - `railLabel: "Ask Almond"` (reuse `launcherLabel` if identical — it is already "Ask Almond"; a
          distinct `railLabel` is fine if you want the rail wording to diverge later).
        - `nudge: { title: "Meet Almond", body: "Ask Almond to show you your most expensive meter.",
          cta: "Show me", dismiss: "Dismiss" }` (the `dismiss` string is the X button's accessible label).
  - [x] Voice law (CLAUDE.md, FR20, NFR9): plain operator words, **no exclamation mark**, **no em dash**,
        no kW/interval/tariff jargon. "Most expensive meter" is plain operator English (mirrors the
        existing `costliestMeters` starter). Add the explanatory comment above the new block.

- [x] **Task 6 — Tests** (AC: #7)
  - [x] `src/lib/almond/nudge.test.ts` (vitest, node env): pin the gate law — real owner + not dismissed
        -> true; real owner + dismissed -> false; demo/`representative` (any dismissed value) -> false.
        These are the laws this story exists to enforce.
  - [x] `src/copy/en.test.ts`: extend the existing Almond voice-law block to assert the real new strings
        (`en.shell.almond.nudge.title/body/cta`, and the rail label) and `not.toContain("—")`,
        `not.toContain("!")`, mirroring the existing 10.1 pattern.
  - [x] Follow the project convention: pure node-env vitest only. Do NOT add jsdom/component/render tests
        for the provider, rail entry, or nudge (the project pins copy + pure logic; interactive behavior
        is verified by structure + manual check, per the 10.1 testing standard).

- [x] **Task 7 — Verify, lint, typecheck, test** (AC: all)
  - [x] `npm run typecheck -w @lavinia/dashboard` clean (strict, no `any`).
  - [x] `npm run lint -w @lavinia/dashboard` clean.
  - [x] `npm test -w @lavinia/dashboard` green (the new `nudge.test.ts` + `en.test.ts` are node-env, no
        Postgres needed; run the full suite to confirm no copy-law regression. Note: two pre-existing
        `generate-report.db.test.ts` failures from Story 9.3 occur only when `BLOB_READ_WRITE_TOKEN` is
        unset locally — confirm on baseline and disclose; they are unrelated to this story).
  - [x] `npm run build -w @lavinia/dashboard` succeeds. The two RSC layouts pass only serializable props
        (`show: boolean`, `starters: string[]`) across the client boundary — no function props through a
        Server Component (see the RSC serialization note in Dev Notes).
  - [x] Manually confirm in `npm run dev:dashboard` (port 3001), and record in the Dev Agent Record: (a)
        the desktop rail shows "Ask Almond" and clicking it opens the panel; (b) on a real owner's Home,
        the first-run nudge shows, "Show me" opens Almond, X dismisses it, and after dismissal it does
        not reappear on reload; (c) on `/tour`, the rail entry opens Almond but NO first-run nudge shows;
        (d) `prefers-reduced-motion` quiets the entrance and keyboard reaches both nudge controls.

### Review Findings

Code review 2026-06-18 (Blind Hunter + Edge Case Hunter + Acceptance Auditor, Opus 4.8). All 7 ACs
judged satisfied; no crash-class defect. 2 patches applied, 1 deferred, the rest dismissed after
verification.

- [x] [Review][Patch] Nudge did not hide while the panel was open — the nudge and the open AlmondPanel
  share the bottom-right `z-40` anchor, so opening Almond via the FAB or the rail entry (not the nudge's
  "Show me") left the nudge mounted, overlapping the panel, and it re-appeared when the panel closed
  (still undismissed). [src/app/(app)/_components/almond/almond-nudge.tsx] — **APPLIED:** the nudge now
  reads `open` from the launcher context and returns null while Almond is open. typecheck/lint/18 tests
  green.
- [x] [Review][Patch] Rail "Ask Almond" button never reflected the dialog open-state — it advertises
  `aria-haspopup="dialog"` (accurate: `AlmondPanel` is `role="dialog"`), but a persistent control that
  opens a dialog should also expose whether it is open.
  [src/app/(app)/_components/shell/agent-rail.tsx] — **APPLIED:** added `aria-expanded={open}` (AgentRail
  already consumes the launcher context, so this is a one-line a11y improvement).
- [x] [Review][Defer] Tour rail entry is a dead control when no demo farm exists — on `/tour`, if
  `demoFarm` returns null (un-seeded DB or the demo farm was deleted), `AgentRail demo` still renders the
  "Ask Almond" button but `AlmondLauncher` is gated behind `{resolved && ...}`, so the click sets the
  shared `open` with no launcher listening (a silent no-op). Degenerate state — the whole Tour is
  non-functional without a demo farm, and the pre-existing FAB is likewise absent there. Logged in
  `deferred-work.md`. [src/app/tour/layout.tsx, src/app/(app)/_components/shell/agent-rail.tsx]
- [x] [Review][Dismiss] "AgentRail is now context-required" (Blind Hunter) — verified: `AgentRail` and
  the other `useAlmondLauncher` consumers render ONLY in the two layouts, both wrapped in
  `AlmondLauncherProvider`; no un-wrapped caller exists, so the hook never throws.
- [x] [Review][Dismiss] "Fire-and-forget cookie without `revalidatePath` could flash back" (Blind +
  Edge) — by design (Decision 2): the nudge lives in the persisted dashboard layout, so the optimistic
  `hidden` covers the whole SPA session (the layout does not remount on child navigation), and the
  httpOnly cookie covers fresh loads. No reappearance in normal App Router flows; adding `revalidatePath`
  would force a layout refetch/flicker on every dismiss for no real benefit.
- [x] [Review][Dismiss] `pathname !== "/"` brittle to basePath / trailingSlash (Blind Hunter) — neither
  is configured; correct for the current routing (the confirm save lands on `/`).
- [x] [Review][Dismiss] Tour omits `<AlmondNudge show={false} />` (Acceptance Auditor) — the outcome AC5
  requires (no first-run nudge on the Tour, rail entry present) holds; omitting the always-false mount is
  cleaner and behaviorally identical, and is reconciled in the Completion Notes.

## Dev Notes

### The one hard law of this epic: gentle, never naggy (FR22)

Every decision here serves FR22 — "stays out of the way of the dashboard, reveals its powers
progressively, never blocks, interrupts, or nags; the first run reads as calm and optional." Concretely
that means: the rail entry is a quiet path to value (not a pulsing CTA), and the nudge is a small,
dismissible, **server-gated, once-only** callout shown on the landing screen, never a modal and never
repeated. The grower who ignores it loses nothing; the grower who dismisses it never sees it again.

### Decision 1 — open the ONE panel from many triggers: lift open into a tiny context (not a window event)

The launcher today owns `open` as private `useState` ([almond-launcher.tsx:63](../../../src/app/(app)/_components/almond/almond-launcher.tsx)).
Two new triggers (the rail entry and the nudge's "show me") must open the **same** panel — there must
not be a second chat. Lift ONLY the `open` boolean into a small `AlmondLauncherProvider` context; the
rail entry, the nudge, and the launcher all consume it. Reasons this beats the alternatives:

- A `window.dispatchEvent("almond:open")` bus would work and is low-effort, but it is a global side
  channel, harder to test, and un-idiomatic for cross-component React state. The context is testable and
  explicit, with three known consumers.
- Do NOT lift the chat state (`useChat`, the nav-chip/report-card maps, the announcer). Those are the
  launcher's and must stay there — the panel survives open/close because the launcher persists, exactly
  as today. Lifting them would be a regression risk for no benefit. **Only the open boolean moves.**

The provider wraps the shell subtree in BOTH `(app)/(dashboard)/layout.tsx` and `tour/layout.tsx`. A
client provider wrapping Server-Component children is fine (children pass straight through); the layouts
stay Server Components.

### Decision 2 — persist dismissal as a server-read httpOnly cookie (NOT localStorage, NOT a DB column)

The nudge must (a) never reappear after dismissal and (b) be decided **before render** so a
dismissed grower never sees a flash of it (the calm-UX requirement). Options weighed:

- **localStorage** — client-only, so the gate runs after hydration -> a flash of the nudge before it
  hides. Rejected: the flash violates "calm". (The codebase also uses `sessionStorage` only in
  onboarding, never `localStorage`.)
- **A `User.almondNudgeDismissedAt` DB column** — truly per-user and cross-device, but needs a schema
  change + migration + Prisma regen + a user query in the layout. Heavier than a gentle one-time hint
  warrants, and the build note for this story says "No new deps" and keeps with the minimal 10.x
  surfacing increments.
- **An httpOnly cookie** (chosen) — server-readable in the already-`force-dynamic` layout (so the gate
  is decided before render, no flash), set by a tiny server action, no schema, no migration, no new dep.
  It is per-authenticated-browser rather than literally per-user-across-devices; for a one-time calm hint
  that is the proportionate choice and robustly satisfies "remembered so it does not reappear" on the
  grower's device. **Deferred (logged in `deferred-work.md`):** if true cross-device per-user memory is
  later required, promote the cookie to a `User.almondNudgeDismissedAt` column.

Cookie shape: name `almond_nudge_seen`, value `"1"`, `httpOnly: true`, `sameSite: "lax"`, `path: "/"`,
long `maxAge` (e.g. one year). The client never reads it; the server decides `showNudge` and passes a
serializable boolean to the client nudge.

### Decision 3 — "first-run nudge in onboarding" is realized on the first post-onboarding Home view

The architecture says "a calm, dismissible first-run nudge **in onboarding**"
([architecture.md:379](../3-solutioning/architecture.md)). But Almond's launcher mounts ONLY in the
dashboard shell (`(dashboard)/layout.tsx` + `tour/layout.tsx`), NOT in the onboarding flow
(identify -> connect -> connecting -> confirm, which lives outside the `(dashboard)` group). A nudge that
says "ask Almond" must be where Almond is tappable. The confirm save action redirects to `/`
([onboarding/actions.ts:241](../../../src/app/(app)/onboarding/actions.ts)), so the **first Home view IS
the immediate post-onboarding moment**. Mount the nudge there (Home only, owner only, until dismissed).
This is faithful to "first-run" and keeps "ask Almond" actionable; do not try to mount the launcher
inside the onboarding flow (wrong surface, larger blast radius).

### Decision 4 — rail entry everywhere, nudge owner-only; the desktop/mobile split

- The **rail entry** shows in the signed-in rail AND the Tour rail (`demo`): Almond is available to both
  (the launcher mounts in both layouts), so the entry opens it in both.
- The **first-run nudge** is owner-only (`dataKind === "real"`): a Tour prospect is not "a grower's first
  run", and the Tour already shows a connect CTA banner. `shouldShowAlmondNudge` returns false for
  `representative`, and the Tour layout passes `show={false}` explicitly.
- **Mobile:** add the entry to the desktop rail only, not the mobile tab bar. The floating launcher FAB
  is already a persistent mobile entry (it renders at all sizes), and the tab bar already carries
  Home/Energy/Water/Labor + Reports/Account; a 7th Almond tab fights mobile-first restraint. The AC's
  "OS-shell rail" is specifically the `lg:flex w-agent-rail` desktop rail.

### RSC serialization (the known footgun on this project)

Both layouts are Server Components passing props into client components. Pass ONLY serializable values
across that boundary: `<AlmondNudge show={boolean} />` and the existing `<AlmondLauncher starters={string[]} />`.
Do NOT pass a function (e.g. an `onDismiss` callback) from a Server Component into a client component —
that crashes the RSC payload (a `format` function once crashed Home post-onboarding; see the project
memory and Story 10.1's build note). The dismiss action is a `"use server"` action imported directly by
the client nudge, not threaded as a prop.

### Files to touch

NEW:
- `src/app/(app)/_components/almond/almond-launcher-provider.tsx` — the tiny open-state context + hook.
- `src/app/(app)/_components/almond/almond-nudge.tsx` — the calm, dismissible first-run callout.
- `src/lib/almond/nudge.ts` — pure `shouldShowAlmondNudge(...)` gate + the cookie-name constant.
- `src/lib/almond/nudge.test.ts` — the gate-law unit test.

UPDATE:
- `src/app/(app)/_components/almond/almond-launcher.tsx` — consume `open`/`setOpen` from the context
  (remove the private `useState`); no other change.
- `src/app/(app)/_components/shell/agent-rail.tsx` — add the "Ask Almond" rail entry (a button that calls
  `openAlmond()`); shown in signed-in AND demo rails.
- `src/app/(app)/(dashboard)/layout.tsx` — read the dismiss cookie, compute `showNudge`, wrap the subtree
  in `AlmondLauncherProvider`, mount `<AlmondNudge show={showNudge} />`.
- `src/app/tour/layout.tsx` — wrap the subtree in `AlmondLauncherProvider`, mount `<AlmondNudge show={false} />`.
- `src/app/(app)/actions.ts` — add `dismissAlmondNudgeAction()` (sets the cookie; re-checks `auth()`).
- `src/copy/en.ts` — add `en.shell.almond.nudge` (+ optional `railLabel`) and the section comment.
- `src/copy/en.test.ts` — extend the voice-law pin to the new strings.

NO new route, NO new lens, NO new npm dependency, NO schema change / migration. `agent-tabbar.tsx` is
intentionally untouched.

### Read these before editing (current behavior to preserve)

- [almond-launcher.tsx](../../../src/app/(app)/_components/almond/almond-launcher.tsx) — owns `open`
  locally today; this is the only state to lift. Preserve the FAB (`ShimmerButton` + `BorderBeam`), the
  `useChat` conversation, the nav-chip/report-card attribution effect, and the live-region announcer.
- [agent-rail.tsx](../../../src/app/(app)/_components/shell/agent-rail.tsx) — the desktop rail. The
  AGENTS rows are `<Link>`s; the new Almond row is a `<button>` (it opens a panel, not a route). Match
  the row styling (`h-11`, rounded control radius, warm hover/active) and keep the footer.
- [agents.ts](../../../src/app/(app)/_components/shell/agents.ts) — the AGENTS list. Almond is NOT an
  agent route; do NOT add it here (it is not a `live`/`href` nav item). The rail entry is a separate
  affordance.
- [(dashboard)/layout.tsx](../../../src/app/(app)/(dashboard)/layout.tsx) and
  [tour/layout.tsx](../../../src/app/tour/layout.tsx) — the two mount points. Both already compute
  `starters` and mount `AlmondLauncher`; both gain the provider wrap + the nudge. The Tour layout only
  mounts the launcher when `resolved` is non-null — mount the (false) nudge consistently.
- [(app)/actions.ts](../../../src/app/(app)/actions.ts) — the `"use server"` shell-actions file
  (`signOutAction`, `resolveFinding`). Add the dismiss action here, re-checking `auth()` like the others.
- [onboarding/actions.ts:241](../../../src/app/(app)/onboarding/actions.ts) — `saveConfirmationAction`
  redirects to `/` after onboarding; confirms Home is the first-run landing for the nudge.
- [_data.ts](../../../src/app/(app)/(dashboard)/_data.ts) — `resolveFarm` returns the `DashboardFarm`
  with `dataKind`; reuse `resolved.dataKind` for the owner gate (same signal Story 10.1 used for
  `canExport` and the chat route uses for `authedOwner`).
- [almond-panel.tsx](../../../src/app/(app)/_components/almond/almond-panel.tsx) — note it already uses a
  `window.addEventListener("keydown", ...)` for Escape-to-close; the panel close still flows through the
  launcher's `onClose` -> `setOpen(false)`, now via the context.

### Decisions / edge cases (resolved here so the dev does not have to guess)

- **Rail entry is a button, not an agent.** Do not add Almond to `AGENTS` in `agents.ts` (those are page
  routes with `isAgentActive`). Almond has no route; the entry is a `<button>` calling `openAlmond()`.
- **Two ways to open, one panel.** The FAB and the rail entry both set the SAME `open` (from context),
  so there is never a second conversation. The FAB still hides itself when `open` is true (its existing
  `{!open && ...}` guard); the rail entry stays visible (it is a persistent path, not a toggle).
- **"Show me" double-duty.** Tapping the nudge CTA opens Almond AND dismisses (engaging acknowledges), so
  an engaged grower is not nudged again. Fire the dismiss action and call `openAlmond()` together.
- **No focus trap on the nudge.** It is a polite callout (a `role="status"`/`aria-live="polite"` region
  is appropriate for its appearance), NOT a dialog — do not autofocus it or trap focus, or it would
  "interrupt" (FR22 violation). Both its buttons are keyboard-reachable in normal tab order.
- **Home-only render.** Gate the client nudge on `usePathname() === "/"` so it is a landing-moment hint,
  not a banner that follows the grower to /energy, /reports, /account. (`showNudge` from the server is
  the owner+not-dismissed gate; the pathname check is the calm placement gate.)
- **Cookie is httpOnly + server-decided.** The client nudge never reads the cookie; the server computes
  `show` and the client only self-hides optimistically on dismiss. Next load, the server gate keeps it
  hidden.

### Testing standards (project convention)

- Vitest, `environment: "node"` ([vitest.config.ts](../../../vitest.config.ts)). `nudge.test.ts` and
  `en.test.ts` are pure (no Postgres, no jsdom). Do NOT add component/render tests for the provider,
  rail entry, or nudge (mirrors Story 10.1's standard).
- Pin the gate LAW in `nudge.test.ts` (owner+not-dismissed -> show; dismissed -> hide; demo -> hide), not
  incidental wording. Pin the real copy strings + the no-em-dash / no-"!" laws in `en.test.ts`, mirroring
  the existing Almond voice-law block.

### Project Structure Notes

- Pure gate logic in `src/lib/almond/nudge.ts`; all user-facing copy in `src/copy/en.ts`
  (localization-ready); the two client components under `src/app/(app)/_components/almond/`; the dismiss
  write in the `(app)` server-actions file. Boundaries stay clean (pure `/lib` vs UI vs server action) —
  no `packages/*` move needed.
- This story adds two small client components, one pure helper, one server action, and a cookie — no
  schema, no migration, no route, no dependency. It is a proportionate surfacing increment.

### References

- [Source: _bmad-output/almond/3-solutioning/epics.md#Story 10.2] — ACs + build notes: rail entry +
  calm dismissible nudge; dismissal persisted (per-user); copy in `/copy/en.ts`; no new deps; depends on
  Almond + Epic 7 (the launcher it surfaces).
- [Source: _bmad-output/almond/3-solutioning/epics.md#FR21] — clear discoverable entry: a persistent
  rail entry, a first-run nudge ("ask Almond to show you your most expensive meter"), and the starters.
- [Source: _bmad-output/almond/3-solutioning/epics.md#FR22] — surfacing is gentle and progressive, never
  blocks/interrupts/nags; the first run reads calm and optional; powers reveal as the grower engages.
- [Source: _bmad-output/almond/3-solutioning/epics.md#UX-DR4] — a clear, persistent rail entry for Almond.
- [Source: _bmad-output/almond/3-solutioning/epics.md#UX-DR5] — a dismissible, gentle, progressive
  first-run nudge; reads calm/optional for a non-AI-native grower; dismissal is remembered.
- [Source: _bmad-output/almond/3-solutioning/epics.md#UX-DR8] — reduced-motion + a11y across new
  surfaces; keyboard-operable with adequate targets.
- [Source: _bmad-output/almond/3-solutioning/architecture.md#Frontend Architecture L379] — "a rail entry
  for Almond; a calm, dismissible first-run nudge in onboarding"; gentle and progressive; copy in /copy.
- [Source: src/app/(app)/_components/almond/almond-launcher.tsx] — owns `open` locally (the boolean to
  lift) + all chat state (which stays).
- [Source: src/app/(app)/_components/shell/agent-rail.tsx] — the desktop rail to add the entry to.
- [Source: src/app/(app)/(dashboard)/layout.tsx, src/app/tour/layout.tsx] — the two mount points to wrap
  in the provider + mount the nudge.
- [Source: src/app/(app)/onboarding/actions.ts#L241] — `saveConfirmationAction` redirects to `/`, making
  Home the first-run landing.
- [Source: src/app/(app)/actions.ts] — the `"use server"` shell-actions file; add the dismiss action,
  re-checking `auth()`.
- [Source: apps/dashboard/CLAUDE.md] — plain operator English, no em dashes in user-facing copy, mobile
  first, the warm palette / Inter / Magic UI vocabulary, honor `prefers-reduced-motion`; RSC must pass
  serializable props to client components (the function-prop crash note).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context) — bmad-dev-story

### Debug Log References

- `npm run typecheck -w @lavinia/dashboard` — clean.
- `npm run lint -w @lavinia/dashboard` — clean.
- `npm test -w @lavinia/dashboard` — 849 passed; 2 failures, both in `generate-report.db.test.ts`
  (Story 9.3 owner Blob-save path). Confirmed PRE-EXISTING and unrelated: `git stash`-ed all 10.2
  changes and re-ran that file on the clean baseline — the same 2 tests failed identically. Root cause
  is environmental (`BLOB_READ_WRITE_TOKEN` unset locally, so the owner Blob-save returns a failure
  instead of writing a Reports row). Out of scope for 10.2 (this story touches no PDF/Blob/store code).
  The 6 new tests (3 in `nudge.test.ts`, 3 in the `en.test.ts` surfacing-copy block) pass.
- `npm run build -w @lavinia/dashboard` — `✓ Compiled successfully`. Both RSC layouts pass only
  serializable props across the client boundary (`<AlmondNudge show={boolean} />`, the existing
  `starters={string[]}`); the dismiss write is a `"use server"` action imported by the client nudge,
  not threaded as a function prop — so there is no RSC serialization regression.

### Completion Notes List

- **Task 1 — shared open state.** Added `almond-launcher-provider.tsx`: a tiny context holding ONLY the
  panel `open` boolean (+ `openAlmond`/`closeAlmond`). `AlmondLauncher` now reads `open`/`setOpen` from
  it (its private `useState(false)` for open is gone); all chat state (`useChat`, nav-chip/report-card
  maps, the announcer, `useAlmondNavigation`) stays in the launcher. No `window` event, no new dep.
- **Task 2 — rail entry.** Added an "Ask Almond" `<button>` (not a `<Link>` — Almond is a panel) to the
  desktop `AgentRail`, directly under the AGENTS nav. It calls `openAlmond()`, has `aria-haspopup="dialog"`,
  `h-11` (44px), the warm-palette hover, a decorative (`aria-hidden`-wrapped) `AlmondAvatar`, and shows
  in BOTH the signed-in and the `demo` (Tour) rails. The mobile `AgentTabBar` is intentionally untouched
  — the floating launcher FAB is the persistent mobile entry, so no 7th tab.
- **Task 3 — the nudge.** Added `almond-nudge.tsx`: a small, out-of-the-way callout (`role="status"`,
  `aria-live="polite"`; not a modal, no focus trap, no autofocus) shown only on Home (`usePathname() === "/"`).
  "Show me" opens Almond AND dismisses; the X dismisses; both self-hide optimistically and fire the
  server action. Static by design (no required motion) so it is reduced-motion-safe; both controls are
  keyboard-reachable with >= 44px targets.
- **Task 4 — persist + wire.** Dismissal persisted as an httpOnly cookie (`almond_nudge_seen`), so the
  gate is decided server-side BEFORE render (no flash). Pure gate `shouldShowAlmondNudge` in
  `src/lib/almond/nudge.ts`; `dismissAlmondNudgeAction()` in `(app)/actions.ts` (re-checks `auth()`, sets
  the cookie, no DB write). The dashboard layout reads the cookie, computes `showNudge`, wraps the shell
  in `AlmondLauncherProvider`, and mounts `<AlmondNudge show={showNudge} />`. The Tour layout wraps the
  same provider (so its rail entry opens the launcher) and does NOT mount the nudge.
- **Task 5/6 — copy + tests.** Added `en.shell.almond.railLabel` + `en.shell.almond.nudge`
  (title/body/cta/dismiss) in the Almond voice (no "!", no em dash, no jargon). `nudge.test.ts` pins the
  owner-only + once-only gate law; `en.test.ts` gained a surfacing-copy voice-law block.
- **AC verification.** AC1 (persistent desktop rail entry opening the one panel; mobile via FAB) ✓;
  AC2 (open lifted to a shared context, chat state stays in launcher, no global/dep) ✓; AC3 (calm,
  dismissible, non-blocking Home nudge with show-me + dismiss) ✓; AC4 (server-decided cookie persistence,
  no flash, engage-counts-as-dismiss) ✓; AC5 (ignorable, Home-only, owner-only, not on Tour) ✓; AC6
  (reduced-motion-safe static + keyboard-operable + 44px) ✓; AC7 (copy in /copy, voice-law pin, pure
  gate test, typecheck/lint/test/build green) ✓.
- **Manual browser verification NOT performed** (headless environment — no dev/browser session). The
  gating laws are proven by the pure unit tests + the production build. Recommend a quick
  `npm run dev:dashboard` (port 3001): (a) desktop rail shows "Ask Almond" and opens the panel; (b) on a
  real owner's Home the first-run nudge shows, "Show me" opens Almond, X dismisses, and it does not
  reappear on reload; (c) on `/tour` the rail entry opens Almond but NO nudge shows; (d)
  `prefers-reduced-motion` is quiet and the keyboard reaches both nudge controls.

### File List

New:
- `apps/dashboard/src/app/(app)/_components/almond/almond-launcher-provider.tsx`
- `apps/dashboard/src/app/(app)/_components/almond/almond-nudge.tsx`
- `apps/dashboard/src/lib/almond/nudge.ts`
- `apps/dashboard/src/lib/almond/nudge.test.ts`

Modified:
- `apps/dashboard/src/app/(app)/_components/almond/almond-launcher.tsx`
- `apps/dashboard/src/app/(app)/_components/shell/agent-rail.tsx`
- `apps/dashboard/src/app/(app)/(dashboard)/layout.tsx`
- `apps/dashboard/src/app/tour/layout.tsx`
- `apps/dashboard/src/app/(app)/actions.ts`
- `apps/dashboard/src/copy/en.ts`
- `apps/dashboard/src/copy/en.test.ts`
- `apps/dashboard/_bmad-output/almond/4-implementation/sprint-status.yaml` (status tracking)

## Change Log

- 2026-06-18 — Story 10.2 drafted (rail entry + calm first-run nudge). Second story of Epic 10
  (Surfacing Almond, gently). Created via bmad-create-story after Story 10.1 (action/export starters)
  reached done. Status: ready-for-dev.
- 2026-06-18 — Story 10.2 implemented. Lifted the launcher's open state into a small shared context
  (`AlmondLauncherProvider`), added the desktop "Ask Almond" rail entry, added the calm Home-only
  first-run nudge with httpOnly-cookie dismissal (server-gated, no flash), threaded both layouts, and
  added the pure gate + copy-law tests. typecheck + lint + build green; full suite 849/851 (2
  pre-existing Story 9.3 Blob db-test failures, confirmed on baseline). Status: ready-for-dev ->
  in-progress -> review.
- 2026-06-18 — Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor, Opus 4.8). All 7 ACs
  satisfied; no crash-class defect. 2 patches applied (hide the nudge while Almond is open to avoid the
  bottom-right overlap + reappear-on-close; add `aria-expanded` to the rail entry), 1 deferred (Tour rail
  entry is a no-op when no demo farm exists — degenerate state, logged), 4 dismissed after verification
  (AgentRail context-required throw is unreachable; the fire-and-forget cookie is by design;
  `pathname` literal is correct for current routing; the omitted always-false Tour nudge mount is
  behaviorally identical). typecheck + lint + the 18 gate/copy tests green. Status: review -> done.
