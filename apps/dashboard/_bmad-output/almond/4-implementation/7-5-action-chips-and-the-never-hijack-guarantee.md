---
baseline_commit: 199bb70464839d8ae0d74b6614c6ce2313b2d747
---

# Story 7.5: Action chips and the never-hijack guarantee

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Effort: Almond — Terra's Generative Operator (Epics 7-10). Tracked in the per-effort folder
     _bmad-output/almond/4-implementation/ (NOT the global implementation-artifacts/ path), so it
     never collides with the Tool 1 dashboard sprint. See _bmad-output/almond/index.md. -->
<!-- PRODUCT GATE: the heavy Almond build is gated behind FARMER VALIDATION (PRD Open Q4 / D14).
     Writing this story file is the allowed per-story step. 7.1 (surface registry), 7.2 (skill
     factory), 7.3 (the navigate skill), and 7.4 (the server→client bridge) all shipped, so Epic 7
     is in-progress. 7.5 is the LAST story in Epic 7: it makes each navigation legible (an action
     chip the grower can read and tap to return to that view) and surfaces + tests the never-hijack
     guarantee. Navigation is read-only on data (it only sets URL state), so it ships to every actor,
     public Tour included (ADR-A08). The gate still governs the owner-only export/PDF stories
     (Epic 8+). -->

## Story

As a grower,
I want to see exactly what Almond just did and be able to jump back to it, and to trust it only moves the screen when I ask,
So that the assistant feels like a helpful operator, not something that grabs my screen.

(This is the **last story in Epic 7** and the human-legibility half of navigation. 7.4 shipped the
silent bridge: a clean `navigate` resolve writes a transient `data-navigate` part, and
`useAlmondNavigation()` applies it through the five canonical `useQueryState` setters so the dashboard
moves. The grower sees the screen change but has no record of *what* Almond did or a way *back*. 7.5
closes that: every navigation renders an **action chip** in the conversation in plain operator English
("Opened Pump 17", "Filtered the table to AG-4 meters", "Showed the map"), and the chip is itself a
**link back** — tapping it re-applies the same `NavigateAction` through 7.4's `apply`. Because
navigation changes no data, "undo" is just navigating back. 7.5 also makes the **never-hijack
guarantee** explicit and tested — Almond emits a navigation only in response to a grower's turn, never
spontaneously — and lands the accessibility the surface owes: an ARIA live-region announcement on
navigate, keyboard-navigable chips with ≥44pt targets, and graceful degradation under
`prefers-reduced-motion`. No new dependencies, no new data, no new server endpoint.)

## Acceptance Criteria

1. **Given** any navigation Almond performs (a clean `navigate` resolve), **When** it completes, **Then**
   an **action chip** renders in the conversation describing what it did in plain operator English —
   "Opened Pump 17", "Filtered the table to AG-4 meters", "Showed the map", "Filtered to Westside
   ranch" — composed from `/copy/en.ts`, with no kW/tariff/interval jargon, no exclamation mark, and no
   em dash (FR2, FR20, NFR9).

2. **Given** an action chip, **When** the grower activates it (click, or keyboard Enter/Space), **Then**
   it re-applies the **same `NavigateAction`** through `useAlmondNavigation().apply` (the chip is a link
   back to that view). Because navigation only sets URL state and changes no data, "undo" is simply
   navigating back; the chip never mutates data and is safely re-tappable any number of times (FR2, FR4,
   FR6).

3. **Given** the grower has not made a request, **When** any turn is processed, **Then** Almond emits a
   navigation action **only in response to that turn** and never spontaneously; the grower's manual
   control of the dashboard is never overridden mid-task. Testable invariant: **no `data-navigate` part
   is ever written without a corresponding user turn that drives it**, and the responder contains no
   timer/interval/effect that could emit one (FR4).

4. **Given** a screen-reader user, **When** Almond navigates, **Then** the change is announced via an
   **ARIA live region** (`aria-live="polite"`) carrying the same plain-English label as the chip
   (UX-DR7); and the chips are **keyboard-navigable** real controls (`<button>`) with **≥44pt** touch
   targets (UX-DR1, NFR7).

5. **Given** `prefers-reduced-motion`, **When** chips render, **Then** any Magic UI motion degrades
   gracefully (no entrance/loop animation) and the chip stays **fully usable** — readable, focusable,
   and clickable (UX-DR1, NFR7).

6. **Given** the offline stub responder and the live model path, **When** a navigation turn runs in
   tests/CI, **Then** the emitted `data-navigate` part carries **both** the `NavigateAction` (so 7.4's
   `apply` still works unchanged) **and** the server-composed chip `label`, identically on both paths,
   with zero external calls (NFR3, AR18) — and the existing 7.4 part assertions
   (`body.toContain("data-navigate")`, `body.toContain(meter.id)`) stay green.

## Tasks / Subtasks

- [x] **Task 1 — The pure chip-label composer (`describeNavigation`)** (AC: #1, #6)
  - [x] Add a pure function that maps a resolved navigation to plain operator English. Recommended
        home: a new exported `describeNavigation(action, meterName)` in `/copy/en.ts` under
        `en.shell.almond` (copy is centralized there; localization-ready), OR a tiny pure module
        `src/lib/almond/skills/describe-navigation.ts` that reads strings from `en`. Prefer the copy
        module so the strings live with the other Almond copy and the existing `en.test.ts` voice laws
        can pin them.
  - [x] Cover every `NavigateAction` shape the skill emits: `meter` → `"Opened {meterName}"`;
        `lens` → `"Showed the {lensLabel}"` (map/table/chart/calendar, plain words); `entity`/`ranch`/
        `rate` filters → `"Filtered the table to {value}"` style (rate reads "{value} meters", ranch
        reads "{value} ranch" — keep it natural and operator-plain). A combined lens+filter action
        composes one chip; pick a single clear sentence, do not stack jargon.
  - [x] The meter branch needs the meter NAME, not the id (the action carries `meter: id`). The label
        is composed **server-side** where the name is known (see Task 2). The composer therefore takes
        the resolved name as an argument and never resolves ids itself.
  - [x] No em dash, no exclamation mark, no kW/tariff/interval words. Unit-test the composer
        (`*.test.ts`, node env) and extend `src/copy/en.test.ts` with a voice-law pin mirroring the
        existing FR-19/FR-20 blocks (`not.toContain("—")`, `not.toContain("!")`).

- [x] **Task 2 — Emit the chip label on the `data-navigate` part** (AC: #1, #6)
  - [x] In `src/lib/almond/responder.ts`, change the transient part payload from `data: action` to
        `data: { action, label }` so the chip text travels with the action on the SAME stream (no
        second channel; AR17, ADR-A02). `writeNavigatePart` composes `label` via `describeNavigation`,
        passing the resolved meter name when the action opens a meter.
  - [x] The meter name is available at the resolve site: the live path inspects the `navigate` tool
        result in `onStepFinish`, and the stub calls `navigateSkill` directly. The pure skill returns
        `{ kind: "navigate", action: { meter: id } }` — it does NOT carry the name. Resolve the name
        for the label without re-querying: thread it from where the meter was matched. Simplest correct
        option: have `writeNavigatePart` accept the already-loaded `meters` (the stub loads them; the
        live path can load via the same `deps`) and look up `name` by `action.meter`. Keep the lookup
        pure and farm-scoped (`deps.farmId`); never fabricate a name (fallback to a neutral "the meter"
        only if the id is somehow unresolved — should not happen for a clean resolve).
  - [x] **Identical on both paths (AC6):** `writeNavigatePart` stays the single shared helper used by
        `createModelResponder` (live) and `createStubResponder` (stub), so the emitted shape is the
        same on both. Update both call-sites to provide the name source.
  - [x] Keep the part `transient: true` (the 7.4 "applied exactly once" guarantee is structural and
        must NOT regress — do not make the part persistent).

- [x] **Task 3 — Capture navigations client-side and render action chips** (AC: #1, #2)
  - [x] The part is transient, so it is NOT in `message.parts` and chips cannot be reconstructed from
        history. Capture them in the **launcher** (`almond-launcher.tsx`), which stays mounted across
        panel open/close, so chips survive closing and reopening the panel.
  - [x] In `AlmondLauncher`, change the message type to carry the new payload:
        `UIMessage<unknown, { navigate: { action: NavigateAction; label: string } }>`. In `onData`:
        on `data-navigate`, (a) still apply via `nav.apply(part.data.action)` (one-shot, unchanged from
        7.4), and (b) record `{ messageId, action, label }` into launcher state, associating it with
        the assistant message active at arrival (track `messages` in a ref and read the last assistant
        message id; the assistant turn exists by the time the part is written — text precedes it in the
        stub, `onStepFinish` in the live path).
  - [x] Thread the captured map down: `AlmondLauncher` → `AlmondPanel` → `AlmondMessages` as a prop
        (e.g. `navigations: Map<messageId, {action,label}[]>` or a lookup callback). Add a new
        `AlmondActionChips` component (colocate in `almond-result.tsx` beside `AlmondToolChips`, or a
        new `almond-action-chips.tsx`). Render the action chip(s) inside the assistant message bubble
        (the tool chips already render there via `AlmondToolChips`), so a turn shows "looked at X" and
        "opened Y" together, legibly.
  - [x] Each chip is a `<button type="button">` whose `onClick` calls a passed-down
        `onReplay(action)` → `nav.apply(action)` (keep the `useAlmondNavigation` hook usage in the
        launcher, the single nav owner; pass a stable callback down). Label text = the captured `label`.
  - [x] **Chip key:** key by `${messageId}:${index}` to avoid the constant-part-id collision flagged in
        7.4's review (`NAVIGATE_PART_ID = "almond-nav"` is shared across navigations). This solves the
        React key uniqueness client-side; no server id change is required.

- [x] **Task 4 — ARIA live-region announcement + chip a11y** (AC: #4, #5)
  - [x] Add a visually-hidden `aria-live="polite"` announcer in the **launcher** (always mounted, so it
        announces even with the panel closed) that updates to the latest navigation `label` when a
        navigation is applied (UX-DR7). Use an SR-only utility (a `sr-only`-style class or
        `className="sr-only"`); confirm the project has an sr-only utility (globals.css / Tailwind) and
        reuse it rather than hand-rolling. Do NOT reuse the message-log region for this — the log is
        `role="log"` inside the panel and may be closed; the navigation announcement must fire
        regardless of panel state.
  - [x] Chips are real, keyboard-operable controls (native `<button>` gives Enter/Space + focus for
        free) with a visible focus ring and **≥44px** min target (`min-h-[44px]` and adequate padding;
        the existing starter buttons use `px-3 py-1.5` — bump to meet 44pt). Verify focus-visible
        styling matches the dashboard's controls.
  - [x] **Reduced motion (AC5):** if the chip uses any Magic UI motion (e.g. a subtle Shine/Border
        effect), gate it on `useReducedMotion()` (see `almond-panel.tsx:35`, `almond-avatar.tsx`) so it
        degrades to a static chip; the chip stays readable/focusable/clickable. A plain styled button
        with no entrance animation is an acceptable and safe default — keep restraint here, the chip is
        a utility control, not a hero moment.

- [x] **Task 5 — Surface + test the never-hijack guarantee** (AC: #3, #6)
  - [x] Re-assert structurally: the ONLY writer of a `data-navigate` part is `writeNavigatePart`, called
        ONLY inside `toResponse` in direct response to the incoming turn. Confirm no `setInterval` /
        `setTimeout` / background effect emits navigation; the launcher's `onData` is the only client
        applier and fires only on a received part. Document this invariant in a code comment.
  - [x] Tests (vitest, **node env** — no jsdom/Playwright per project convention; assert on the pure
        composer + the stub stream body, mirroring `tools.db.test.ts`):
        - composer: each action shape → expected plain-English label; voice laws (no em dash / "!").
        - never-hijack: a non-navigation turn writes NO `data-navigate` (the existing
          "writes NO data-navigate part for a data question" test already covers this — extend or
          reference it); add an assertion that an empty/idle `uiMessages` produces no part.
        - AC6: a navigation turn's stream body still contains `data-navigate` AND the resolved meter id
          (existing 7.4 assertions stay green) AND now also the composed `label` substring.
  - [x] If feasible without violating the node-env convention, add the single mock-`LanguageModel` test
        the 7.4 review deferred (AC5/AC3 of 7.4): assert the LIVE path emits one `data-navigate` with
        the resolved action + label. This is OPTIONAL polish for 7.5; if it requires jsdom or a
        Playwright session, leave it deferred and note it.

- [x] **Task 6 — Verify, lint, typecheck, test** (AC: all)
  - [x] `npm run typecheck && npm run lint -w @lavinia/dashboard` clean (strict, no `any`).
  - [x] `npm test -w @lavinia/dashboard` green (the `*.db.test.ts` ones need local Postgres; run them).
  - [x] Manually confirm in `npm run dev:dashboard` (port 3001) that asking Almond "show me the map" /
        "open <a real meter>" renders a chip, the chip re-navigates on click, and a screen reader / the
        DOM shows the live-region text. Record what you verified in the Dev Agent Record.

## Dev Notes

### The core architectural fact: the navigate part is TRANSIENT

7.4 deliberately writes the `data-navigate` part with `transient: true`
([responder.ts:67-69](../../../src/lib/almond/responder.ts)). Transient parts are delivered **once**
via `useChat`'s `onData` and are **NOT** stored in `message.parts` — this is what makes 7.4's
"applied exactly once" guarantee structural (no re-navigation on re-render/reload). Consequence for
7.5: **you cannot rebuild a chip from `message.parts`** the way `AlmondToolChips` rebuilds tool chips
([almond-result.tsx](../../../src/app/(app)/_components/almond/almond-result.tsx)). The chip data must
be **captured in client state as the part arrives** and held somewhere that survives panel close/open.
That place is the **launcher** (`almond-launcher.tsx`) — it stays mounted (`{open && <AlmondPanel/>}`),
owns `useChat`, and already owns the nav bridge. Do NOT move capture into the panel/messages (they
unmount on close and would lose the chips). Do NOT make the part persistent to "fix" this — that
regresses 7.4's exactly-once invariant.

### Why the label is composed server-side (the meter-name problem)

The chip must say "Opened **Pump 17**", but `NavigateAction.meter` is the meter **id**
(`resolveNavigate` returns `{ meter: match.meter.id }`,
[navigate.ts:118](../../../src/lib/almond/skills/navigate.ts)). The launcher/messages have no meter
list (the launcher receives only `farmName` + `starters`), so the client cannot map id→name. The
server can: the stub loads `meters` already, and the live path has `deps`. So compose the chip `label`
**server-side** in `writeNavigatePart` and ship it on the part: `data: { action, label }`. This also
keeps user-facing copy in `/copy/en.ts` (project law) and keeps voice consistent (FR20). The client
just displays `label` and re-applies `action` — it composes nothing.

Lens/entity/ranch/rate values are already plain strings inside the action, so those labels could be
composed client-side — but compose **all** labels in one place (server) so there is a single voice
source and one set of copy-law tests. Don't split label composition across client and server.

### The part-payload change ripples — here is the exact set

Changing `data: action` → `data: { action, label }` touches exactly these:
- `responder.ts`: `writeNavigatePart(writer, action, label)` (compose label, write nested payload).
  Both `createModelResponder` and `createStubResponder` call the SAME helper — keep it that way (AC6).
- `almond-launcher.tsx`: message type `{ navigate: NavigateAction }` →
  `{ navigate: { action: NavigateAction; label: string } }`; `onData` does
  `nav.apply(part.data.action)` (was `part.data`), then records `{action,label}` for the chip.
- `use-almond-navigation.ts`: **unchanged** — `apply(action)` still takes a bare `NavigateAction`.
  Call it with `part.data.action`. Do not change the hook's contract; 7.4's tests
  ([use-almond-navigation.test.ts](../../../src/app/(app)/_components/almond/use-almond-navigation.test.ts))
  must stay green.
- `tools.db.test.ts`: existing assertions `toContain("data-navigate")` and `toContain(meter.id)` stay
  true (the id is now nested under `data.action.meter`, still in the serialized body). ADD a `label`
  substring assertion.

### Files to touch (UPDATE vs NEW)

UPDATE:
- `src/lib/almond/responder.ts` — `writeNavigatePart` composes + emits the label (both paths). Add the
  never-hijack invariant comment.
- `src/app/(app)/_components/almond/almond-launcher.tsx` — capture nav `{messageId,action,label}` in
  state on `onData`; thread down; add the SR-only `aria-live` announcer; pass `onReplay`.
- `src/app/(app)/_components/almond/almond-panel.tsx` — pass the `navigations` prop through to messages.
- `src/app/(app)/_components/almond/almond-messages.tsx` — render `AlmondActionChips` inside the
  assistant bubble alongside `AlmondToolChips`.
- `src/app/(app)/_components/almond/almond-result.tsx` — add `AlmondActionChips` (or new file).
- `src/copy/en.ts` — `describeNavigation` + any lens labels under `en.shell.almond`.
- `src/copy/en.test.ts` — voice-law pin for the new copy.
- `src/lib/almond/tools.db.test.ts` — add the `label` assertion.

NEW (pick one home for each):
- The pure label composer (either in `en.ts` or `src/lib/almond/skills/describe-navigation.ts`) + its
  `*.test.ts`.
- Optionally `almond-action-chips.tsx` (or extend `almond-result.tsx`).

### Read these before editing (current behavior to preserve)

- [almond-launcher.tsx](../../../src/app/(app)/_components/almond/almond-launcher.tsx) — owns `useChat`,
  `onData` applies navigation. Open/close is local state; the launcher persists. Preserve: one transport
  instance, the exactly-once `onData` apply, `regenerate`/`sendMessage` wiring.
- [almond-messages.tsx](../../../src/app/(app)/_components/almond/almond-messages.tsx) — renders the log
  (`role="log" aria-live="polite"`), tool chips via `AlmondToolChips`, autoscroll. Preserve: the
  defensive `partsOf`, the empty/looking-up/error branches, the skip-empty-bubble logic.
- [almond-result.tsx](../../../src/app/(app)/_components/almond/almond-result.tsx) — `AlmondToolChips`
  reads `message.parts` and maps tool names → `en.shell.almond.lookedAt`. The action chip is the same
  visual family but **interactive** (a `<button>`, not a `<span>`) and sourced from captured state, not
  `message.parts`.
- [navigate.ts](../../../src/lib/almond/skills/navigate.ts) — `NavigateAction` shape + `resolveNavigate`
  (meter path returns id; lens validated vs registry; ambiguity → `clarify` emits no action). The chip
  only ever exists for `kind: "navigate"` — `clarify`/`none`/`unknown-surface` emit no part, so no chip.
- [responder.ts](../../../src/lib/almond/responder.ts) — `writeNavigatePart`, the stub's
  `navigationStubText`, and the live `onStepFinish` inspection. This is where the label is composed.

### Decisions / edge cases (resolved here so the dev does not have to guess)

- **Chip key collision (7.4 review deferred item #3):** the part id is the constant `"almond-nav"`.
  Solve the chip key client-side as `${messageId}:${index}`; do NOT churn the server id. (Noted in
  [deferred-work.md](deferred-work.md).)
- **Opening a meter hidden by an active filter (7.4 review deferred item #4):** the drawer open-gate
  no-ops if an active entity/ranch/rate filter excludes the opened meter. **Decision for 7.5: OUT OF
  SCOPE — do not auto-clear filters.** None of 7.5's ACs require it, the skill emits a meter-only action
  (it never combines a meter open with a filter), and clearing filters is a behavior change better made
  deliberately later. Leave the note in `deferred-work.md`. If, during manual verify, the chip's
  promise visibly breaks (chip says "Opened Pump 17" but nothing opens because a filter hides it), STOP
  and raise it rather than silently expanding scope.
- **Combined lens + filter in one action:** compose ONE chip with one clear sentence; do not render two
  chips for one navigation. (The stub never produces this; the live model can.)
- **Multiple navigations in one assistant turn (live path):** the capture is a list per message id;
  render a chip per captured navigation in order. The `${messageId}:${index}` key handles this.
- **Associating a transient part with its message:** `onData` gives the part, not a message id. Read the
  last assistant message id from a ref tracking `messages` at arrival time. If somehow undefined, it is
  acceptable to attach to the most recent message or skip the chip — but it should not be undefined for
  a real turn (text/tool parts precede the navigate write).

### Testing standards (project convention)

- Vitest, **`environment: "node"`** ([vitest.config.ts](../../../vitest.config.ts)). No jsdom; do not
  add React-render/component tests. Test the **pure composer** and the **stub stream body** (read
  `await res.text()` and assert substrings), exactly as `tools.db.test.ts` does. `*.db.test.ts` needs a
  local Postgres (CI runs typecheck+lint+build, not db tests; run them locally).
- Copy laws live in `src/copy/en.test.ts` — phrase-level pins, not vacuous single-char checks (see the
  FR-19/FR-20 blocks at lines 9-84). Add a `describeNavigation` block: assert real labels and
  `not.toContain("—")`, `not.toContain("!")`.
- Reuse, do not reinvent: `formatUsd` is not relevant here (no money in chips); the chip is pure UI +
  copy. Lean on the existing `en.shell.almond` block and the `AlmondToolChips` visual pattern.

### Project Structure Notes

- Almond client components live in `src/app/(app)/_components/almond/`; pure Almond logic in
  `src/lib/almond/` (skills under `skills/`). Copy in `src/copy/en.ts`. This story stays entirely
  within those — no schema change, no new route, no new dependency.
- The launcher is mounted under the nuqs adapter (7.1), which is why `useAlmondNavigation` works there.
  Keep the nav hook in the launcher; pass `onReplay` down rather than calling the hook in deep children.

### References

- [Source: _bmad-output/almond/3-solutioning/epics.md#Story 7.5] — ACs, build notes, FR2/FR4/FR20,
  UX-DR1/UX-DR7/NFR7, "depends on 7.4", "no new deps".
- [Source: _bmad-output/almond/3-solutioning/epics.md#FR2] — action chip records each navigation, links
  back; undo = navigate back (navigation changes no data).
- [Source: _bmad-output/almond/3-solutioning/epics.md#FR4] — drive only on request, never hijack;
  manual control never overridden mid-task.
- [Source: _bmad-output/almond/3-solutioning/architecture.md#L82, L383, L472-473] — chips/cards
  keyboard-navigable with ≥44pt targets; streamed actions announce via a live region; Magic UI degrades
  under `prefers-reduced-motion`.
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A02] — server→client
  navigation via a typed transient data part on the UI-message stream (one stream, no second channel).
- [Source: _bmad-output/almond/4-implementation/7-4-the-server-client-navigation-bridge.md] — the bridge
  this story links back through; the transient-transport rationale and the `apply` contract.
- [Source: _bmad-output/almond/4-implementation/deferred-work.md] — 7.4 review items #3 (chip key) and
  #4 (meter hidden by filter) explicitly handed to 7.5; resolved above.
- [Source: src/copy/en.test.ts#L47-50, L80-83] — the voice-law (no em dash / no "!") test pattern to
  mirror.
- [Source: apps/dashboard/CLAUDE.md] — plain operator English, no em dashes in user-facing copy, mobile
  first, Magic UI as the component vocabulary, Inter, warm palette, honor prefers-reduced-motion.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context) — bmad-dev-story

### Debug Log References

- `npm run typecheck -w @lavinia/dashboard` — clean.
- `npm run lint -w @lavinia/dashboard` — clean (fixed two launcher findings: a ref written during
  render → moved to a `useEffect` sync; a `useCallback` dep → destructured the stable `apply`).
- `npm test -w @lavinia/dashboard` — 86 files / 664 tests pass (DB tests included, local Postgres).
- `npm run build -w @lavinia/dashboard` — production build succeeds (no RSC/serialization regressions).

### Completion Notes List

- **Task 1 — composer.** Added pure `describeNavigation(action, meterName?)` in
  `src/lib/almond/skills/describe-navigation.ts`, reading display strings from a new `navigated` block
  in `en.shell.almond`. Lens values are already plain words, so no lens-label map was needed. Covers
  every action shape (meter / lens / each filter / combos / null-clear / empty) + a voice-law sweep.
- **Task 2 — labeled part.** `writeNavigatePart` now emits `data: { action, label }` (was `data:
  action`); the label is composed server-side via `describeNavigation`, resolving the meter NAME from
  the farm-scoped meter list (`meterNameFor`). It stays the single shared helper for the stub and live
  paths, so the shape is identical on both (AC6). The stub now calls the pure `resolveNavigate`
  directly with its already-loaded meters (no double read; `navigateSkill` dropped from the responder
  import). The live path loads meters lazily/cached in `onStepFinish` only when a navigation resolves.
  Part stays `transient: true` — 7.4's exactly-once guarantee is untouched.
- **Task 3 — capture + render.** Because the part is transient (not in `message.parts`), the launcher
  captures `{action,label}` per assistant message id (`navByMessage`, synced via a `messagesRef`
  effect) as `onData` fires, and threads it through panel → messages. New interactive
  `AlmondActionChips` renders inside the assistant bubble beside the read-only tool chips; chips are
  keyed `index` within a message's list (the parent separates by message id), sidestepping the shared
  constant part id. Tapping a chip calls `onReplay` → `apply(action)` (the link back).
- **Task 4 — a11y.** Added a `sr-only` `role="status" aria-live="polite"` announcer in the launcher
  (always mounted, announces with the panel open or closed). Chips are native `<button>`s with
  `min-h-[44px]`, a visible focus ring, and an `aria-label` ("…Tap to return to this view."). Chips
  are intentionally static (no entrance/loop motion), so there is nothing to degrade under
  `prefers-reduced-motion` (AC5 satisfied by construction).
- **Task 5 — never-hijack.** Documented the invariant in `responder.ts` (the one writer, called only
  per-turn in `toResponse`, no timer/interval). Tests: the composer + en voice laws; a new
  "idle turn emits NO data-navigate" DB test; the existing data-question test still asserts no part;
  the 7.4 navigate-part test now also asserts the `Opened <name>` label rides the stream.
- **Deferred 7.4-review items addressed:** chip-key collision resolved client-side (`index` per
  message). The "open a meter hidden by an active filter" item was held OUT of scope per the story
  decision (no AC requires it; the skill emits meter-only actions); it remains in `deferred-work.md`.
- **Optional, not done:** the single mock-`LanguageModel` live-path emission test (7.4-review nit) was
  left deferred to honor the project's node-env / no-Playwright-session convention; the live path's
  label emission is covered by typecheck + the shared `writeNavigatePart` helper, and the stub's by the
  end-to-end DB stream test.
- **Manual browser verification NOT performed** in this headless environment (no live dev/browser/
  screen-reader session). The server half (labeled transient part, end to end) is proven by the DB
  stream test; the client wiring compiles and builds. Recommend a quick `npm run dev:dashboard`
  (port 3001) pass: ask Almond "show me the map" / "open <a real meter>", confirm the chip renders,
  re-navigates on tap, and the live-region text updates.

### File List

New:
- `src/lib/almond/skills/describe-navigation.ts`
- `src/lib/almond/skills/describe-navigation.test.ts`

Modified:
- `src/lib/almond/responder.ts`
- `src/lib/almond/skills/navigate.ts` (review fix: carry resolved meter name on the result)
- `src/lib/almond/skills/navigate.test.ts` (review fix: assert the carried meter name)
- `src/lib/almond/tools.db.test.ts`
- `src/copy/en.ts`
- `src/copy/en.test.ts`
- `src/app/(app)/_components/almond/almond-launcher.tsx`
- `src/app/(app)/_components/almond/almond-panel.tsx`
- `src/app/(app)/_components/almond/almond-messages.tsx`
- `src/app/(app)/_components/almond/almond-result.tsx`
- `_bmad-output/almond/4-implementation/sprint-status.yaml` (status tracking)

## Change Log

- 2026-06-18 — Story 7.5 implemented (action chips + never-hijack guarantee). Labeled transient
  `data-navigate` part, server-composed `describeNavigation`, client capture + interactive chips,
  ARIA live-region announcement, ≥44pt keyboard-navigable chips, never-hijack invariant + tests.
  Status: ready-for-dev → in-progress → review.
- 2026-06-18 — Addressed code-review findings (5 patches). Status: review → done.

## Senior Developer Review (AI)

**Reviewer:** bmad-code-review (Blind Hunter + Edge Case Hunter + Acceptance Auditor, Opus 4.8).
**Date:** 2026-06-18. **Outcome:** Approve (all findings patched + re-verified; ACs 1-6 satisfied).

Acceptance Auditor judged all six acceptance criteria fully satisfied with no blocking violations.
The hunters surfaced five real code issues, all fixed and re-verified (typecheck, lint, 664 tests,
build all green):

### Review Findings

- [x] [Review][Patch] Stale `messagesRef` (effect-synced) read synchronously in `onData` mis-attributes
  or drops the first navigation's chip (and the user-message fallback never renders) — fixed: chips are
  buffered and flushed by an effect that reads the fresh `messages`, with no user-message fallback.
  [src/app/(app)/_components/almond/almond-launcher.tsx]
- [x] [Review][Patch] `regenerate()`/retry orphans chips and `navByMessage` grows unbounded — fixed:
  the flush effect prunes entries whose message id is no longer live each pass.
  [almond-launcher.tsx]
- [x] [Review][Patch] Identical consecutive announcement labels are never re-announced (UX-DR7 repeat
  case) — fixed: a `seq` nonce toggles a trailing zero-width space so the live region's text always
  changes. [almond-launcher.tsx]
- [x] [Review][Patch] `async onStepFinish` risked an unhandled rejection / write-after-close during the
  awaited meter read — fixed: the meter NAME now rides the `navigate` result, so `onStepFinish` is
  synchronous again with no DB read. [src/lib/almond/responder.ts, skills/navigate.ts]
- [x] [Review][Patch] Live path did a double meter-load (the tool loaded meters, then the responder
  loaded them again) — fixed by the same `meterName`-on-result change; a single load per path.
  [responder.ts, skills/navigate.ts]

### Dismissed (no change needed)

- Chip `key={index}` vs the spec's `${messageId}:${index}`: functionally correct — `AlmondActionChips`
  renders once per message, so indices are scoped per message and cannot collide. All three layers agreed.
- The never-hijack test pins the no-navigation path but not the "no timer/interval" half: by design —
  that half is a structural invariant (one writer, called only per-turn in `toResponse`; grep-confirmed
  no `setInterval`/`setTimeout`), as the story's AC3 frames it.
