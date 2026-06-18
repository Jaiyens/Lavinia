---
baseline_commit: e54c0aece4b2d9126f3c15392abe996dbd1e0cd6
---

# Story 10.1: Action and export-flavored starters

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Effort: Almond — Terra's Generative Operator (Epics 7-10). Tracked in the per-effort folder
     _bmad-output/almond/4-implementation/ (NOT the global implementation-artifacts/ path), so it
     never collides with the Tool 1 dashboard sprint. See _bmad-output/almond/index.md. -->
<!-- PRODUCT GATE: the heavy Almond build is gated behind FARMER VALIDATION (PRD Open Q4 / D14).
     Writing this story file is the allowed per-story step. Epics 7, 8, and 9 all shipped to main
     (the navigate skill, the exportSpreadsheet skill, and the generateReport skill all exist and
     are capability-gated), so Epic 10 is now in-progress. 10.1 is the FIRST story in Epic 10 and
     the gentlest surfacing move: it extends the starter prompts the grower already sees on Almond's
     empty chat to ADVERTISE the new powers (open / export / make a PDF), without adding any
     up-front UI, nag, or new dependency. The rail entry + first-run nudge are 10.2; abuse/cost
     protection is 10.3. -->

## Story

As a grower,
I want Almond to suggest the new things it can do for me, like exporting my meters or opening my biggest opportunity,
So that I discover its powers without being told to go learn an AI.

(This is the **first story in Epic 10 (Surfacing Almond, gently)** and the lowest-risk surfacing move.
Almond already shows four grounded starter prompts on its empty chat
([starters.ts](../../../src/lib/almond/starters.ts)) — today all four are *read questions* ("Which
meters cost me the most?"). Epics 7-9 gave Almond three new powers the grower has no reason to know
exist: it can **open/filter** the dashboard (the `navigate` skill, 7.3), **export** a spreadsheet (the
`exportSpreadsheet` skill, 8.5), and **make a PDF** (the `generateReport` skill, 9.3). 10.1 extends the
same grounded-starters plumbing to include **action and export** prompts ("Open my biggest
opportunity", "Export my meters as a spreadsheet", "Make a PDF of my mis-rated pumps") so the operator
discovers them naturally. The one hard rule: **export and PDF starters are owner-only** — they would
fail the owner gate on the public Tour, so a Tour visitor must never see them (it would suggest a power
they cannot use). No new dependency, no schema change, no new route, no UI component — this is copy +
the pure `almondStarters` selector + threading one capability flag from the two layouts that mount the
launcher.)

## Acceptance Criteria

1. **Given** an empty or early chat, **When** it opens, **Then** the existing grounded starters plumbing
   (`almondStarters` + `en.shell.almond.starters`) is extended with **action and export** prompts drawn
   from the farm — an **open/navigate** prompt ("Open my biggest opportunity"), an **export** prompt
   ("Export my meters as a spreadsheet"), and a **PDF** prompt ("Make a PDF of my mis-rated pumps") —
   each in the Almond voice: plain operator English, no exclamation mark, no em dash, no kW/tariff/
   interval jargon (FR21, UX-DR6, FR20, NFR9).

2. **Given** a public Tour / unauthenticated visitor (the badged demo farm, `dataKind !== "real"`),
   **When** the starters render, **Then** the **export** and **PDF** prompts are **not shown** (they
   would fail the owner-only capability gate that withholds `exportSpreadsheet`/`generateReport` from
   the public actor); the open/navigate and read prompts ARE shown (navigate is read-safe and handed to
   every actor). Testable: with the no-export capability, the returned list contains no export/PDF
   starter (AR15, FR18 consistency, ADR-A08).

3. **Given** a starter is tapped, **When** it activates, **Then** it is sent as an ordinary user message
   (the panel wires every starter through `onStarter` -> `onSend(text)` -> `sendMessage({ text })`), so
   the model selects the matching skill from Epics 7-9 (navigate / exportSpreadsheet / generateReport)
   and the turn **behaves exactly as if the grower had typed that request** — there is no starter->skill
   dispatch table and none is added; routing is the model's job, as it already is for a typed message.

4. **Given** the owner signal each layout already holds (`resolved.dataKind === "real"`, the SAME signal
   the chat route uses for `authedOwner`), **When** the two launcher mount points render
   (`(app)/(dashboard)/layout.tsx` for the signed-in owner and `tour/layout.tsx` for the public demo),
   **Then** each passes the capability into `almondStarters` so the owner gets the export/PDF starters
   and the Tour does not; the starter gate is **identical** to the skill gate (`dataKind === "real"`),
   so a starter is never shown that the model would refuse to fulfil (FR18, AR15).

5. **Given** the grounded selection rules, **When** `almondStarters` runs, **Then** a starter that points
   at a specific situation only appears when the farm actually has it: the **open biggest opportunity**
   and **mis-rated PDF** prompts appear only when there is at least one open finding to point at (reusing
   the existing `findingCount > 0` gate), and the **export meters** prompt is offered to any owner
   (every farm has meters). The function never returns more than four starters and every returned
   starter is a non-empty string (FR21, "drawn from the farm").

6. **Given** the change to `almondStarters` and its copy, **When** the suite runs, **Then** the existing
   `starters.test.ts` is updated (not left stale) to pin the new behavior across the cases — owner with
   findings, owner with no findings, and a non-owner (Tour) — and `en.test.ts` gains a voice-law pin for
   the new starter strings (no em dash, no "!"); `typecheck`, `lint`, and `test` are green (NFR3, FR20).

## Tasks / Subtasks

- [x] **Task 1 — Add the new starter copy** (AC: #1, #6)
  - [x] In `src/copy/en.ts`, extend the `en.shell.almond.starters` block (currently
        `biggestOpportunity`, `costliestMeters`, `wrongRate`, `dataCompleteness`) with the new prompts.
        Recommended keys + copy (tune wording, keep the voice):
        - `openBiggestOpportunity: "Open my biggest opportunity"` — an **action** (navigate), distinct
          from the existing read question `biggestOpportunity: "What is my biggest opportunity to save
          money?"`. Keep BOTH; they drive different skills (open vs answer).
        - `exportMeters: "Export my meters as a spreadsheet"` — drives `exportSpreadsheet`.
        - `misRatedPdf: "Make a PDF of my mis-rated pumps"` — drives `generateReport`.
  - [x] Voice law (CLAUDE.md, FR20, NFR9): plain operator words, no exclamation mark, no em dash, no
        kW/interval/tariff jargon. "Mis-rated pumps" is plain operator English and consistent with the
        rate-finding language already used in findings copy; prefer "pumps"/"meters" over "SAs".
  - [x] Update the explanatory comment above `starters:` in `en.ts` to note that export/PDF starters are
        owner-only and the open/biggest-opportunity prompt needs a finding.

- [x] **Task 2 — Extend `almondStarters` with a capability flag + grounded selection** (AC: #1, #2, #5)
  - [x] In `src/lib/almond/starters.ts`, extend `StarterContext` with the owner capability, e.g.
        `canExport: boolean` (the export/PDF capability). Keep `findingCount` as-is.
  - [x] Selection rules (pure, deterministic, the function stays pure + tested):
        - Always include the read questions (`costliestMeters`, `wrongRate`, `dataCompleteness`) as the
          safe fallback set, exactly as today.
        - When `findingCount > 0`: include `openBiggestOpportunity` (navigate, read-safe) and — when
          `canExport` — `misRatedPdf` (these point at a finding, so they need one to exist).
        - When `canExport`: include `exportMeters` (valid for any owner — every farm has meters).
        - Order so the NEW powers surface without burying the trusted read questions, then cap at four.
          Recommended priority for an owner with findings: `openBiggestOpportunity`, `exportMeters`,
          `misRatedPdf`, `wrongRate`. For an owner with no findings: `exportMeters`, `costliestMeters`,
          `wrongRate`, `dataCompleteness`. For a Tour visitor with findings: `openBiggestOpportunity`,
          `costliestMeters`, `wrongRate`, `dataCompleteness` (no export/PDF). Keep the existing
          `.slice(0, 4)` cap; do not raise it (mobile-first restraint).
  - [x] Keep it a single pure function returning `string[]`; the gating is by capability + findings only,
        never by anything from the model or client.

- [x] **Task 3 — Thread the capability from BOTH launcher mount points** (AC: #2, #4)
  - [x] `src/app/(app)/(dashboard)/layout.tsx`: the layout already resolves `resolved` (a
        `DashboardFarm`); pass `canExport: resolved.dataKind === "real"` into `almondStarters(...)`.
        This is the SAME expression the chat route uses for `authedOwner`
        ([route.ts:52](../../../src/app/api/almond/chat/route.ts)) — a signed-in grower on the badged
        demo fallback (`dataKind` "representative") is NOT an owner and must not get export starters,
        because the route would withhold the export/PDF skills from them too. Do NOT gate on "is there a
        userId" — gate on `dataKind === "real"`.
  - [x] `src/app/tour/layout.tsx`: pass `canExport: false` explicitly (the Tour is always the demo farm;
        `resolved.dataKind` is "representative"). Equivalent to `resolved.dataKind === "real"` there, but
        passing `false` directly is clearest and avoids a misread. Do NOT try to detect a session in the
        tour layout to "restore" export starters for an owner who happens to be on `/tour`: the Tour
        renders demo data, so hiding the export power there is the correct, conservative behavior (and it
        is never a broken gate — it only hides a capability, never shows one that fails).
  - [x] Both call sites compute starters server-side and pass the resulting `string[]` to
        `<AlmondLauncher starters={...} />`; the launcher/panel are unchanged.

- [x] **Task 4 — Update + extend the tests** (AC: #6)
  - [x] `src/lib/almond/starters.test.ts` (vitest, node env): the existing assertions pin the OLD
        behavior and WILL break — update them, do not leave them stale. Cover:
        - Owner with findings (`{ findingCount: 3, canExport: true }`): list includes
          `openBiggestOpportunity` and at least one export/PDF starter; length <= 4; all non-empty.
        - Owner with no findings (`{ findingCount: 0, canExport: true }`): includes `exportMeters`, and
          does NOT include `openBiggestOpportunity` or `misRatedPdf` (no finding to point at).
        - Non-owner / Tour (`{ findingCount: 3, canExport: false }`): includes NO export/PDF starter
          (`exportMeters`, `misRatedPdf` absent); open/navigate + read prompts may show.
        - Invariant retained: never more than four; every entry non-empty.
  - [x] `src/copy/en.test.ts`: add a voice-law pin for the new starter strings mirroring the existing
        FR-19/FR-20 blocks — assert the real strings and `not.toContain("—")`, `not.toContain("!")`.

- [x] **Task 5 — Verify, lint, typecheck, test** (AC: all)
  - [x] `npm run typecheck -w @lavinia/dashboard` clean (strict, no `any`).
  - [x] `npm run lint -w @lavinia/dashboard` clean.
  - [x] `npm test -w @lavinia/dashboard` green (the pure `starters.test.ts` + `en.test.ts` are node-env,
        no Postgres needed; run the full suite to confirm no copy-law regression).
  - [x] Manually confirm in `npm run dev:dashboard` (port 3001): on the signed-in app, open Almond on an
        empty chat and confirm an export/PDF starter shows and, when tapped, produces the expected file/
        action (drives the real skill). On `/tour`, confirm NO export/PDF starter shows. Record what you
        verified in the Dev Agent Record. (If a finding-gated starter does not appear, confirm the demo/
        owner farm actually has open findings.)

### Review Findings

Code review 2026-06-18 (Blind Hunter + Edge Case Hunter + Acceptance Auditor, Opus 4.8). All six ACs
judged satisfied; no crash-class defect. Findings below.

- [x] [Review][Decision] "Open my biggest opportunity" has no direct `navigate` target — the shipped
  `navigate` skill resolves only meter / lens / entity / ranch / rate (verified in
  `src/lib/almond/skills/navigate.ts`), not a finding or "opportunity". The starter is spec-faithful
  (FR21's exact example) and AC3 still holds (it behaves as a typed request would: the model lists
  findings then navigates to that meter, or answers as a read), but it is the only starter not backed
  1:1 by a skill, and it is lexically close to the retained read question. Decide: keep the copy (and
  defer navigate finding-resolution to an Epic 7 enhancement) vs reword to a guaranteed-navigable target
  (e.g. "Open my costliest meter"). [src/copy/en.ts, src/lib/almond/starters.ts] — **RESOLVED
  2026-06-18: keep the copy** (spec-faithful FR21 example; AC3 still holds). The navigate
  finding-resolution gap is logged as a deferred Epic 7 enhancement in `deferred-work.md`.
- [x] [Review][Patch] 4-cap drops the wrong-rate read question for owners-with-findings — for
  `canExport && findingCount>0`, `.slice(0,4)` keeps `[open, export, pdf, costliestMeters]` and drops
  `wrongRate` (the product's #1 lever) and `dataCompleteness`. Reorder the read tail to
  `wrongRate, costliestMeters, dataCompleteness` so the wrong-rate question survives the cap for the
  highest-value users; this also makes the owner-with-findings set exactly match the spec's recommended
  4-tuple. No test change needed (order beyond position 0 is not pinned). [src/lib/almond/starters.ts:39]
  — **APPLIED 2026-06-18:** read tail reordered to `wrongRate, costliestMeters, dataCompleteness`; lint
  clean and 18 starter/copy tests green.
- [x] [Review][Defer] Manual in-app verification not performed (headless env) — confirm an export
  starter shows and drives the skill on the signed-in app, and is absent on `/tour`. Disclosed in the
  Dev Agent Record; the gating laws are proven by the unit tests + production build. Pre-existing
  (environment limitation, not a code defect). [story Task 5]

## Dev Notes

### The core architectural fact: a starter is a typed request, NOT a wired skill call

Do not build a starter -> skill dispatch map, and do not special-case any starter string. The panel
renders each starter as a button and wires it straight to `onSend`: in
[almond-panel.tsx](../../../src/app/(app)/_components/almond/almond-panel.tsx) the empty-state passes
`onStarter={onSend}`, and the launcher's `onSend` is `(text) => sendMessage({ text })`
([almond-launcher.tsx:206](../../../src/app/(app)/_components/almond/almond-launcher.tsx)). So tapping
"Export my meters as a spreadsheet" sends exactly that text as a normal user turn to `/api/almond/chat`,
and the model picks `exportSpreadsheet` the same way it would for a typed request. **AC3 ("behaves
exactly as a typed request") is satisfied structurally** — the only work to make a starter drive the
right skill is writing copy the model routes reliably. This story therefore adds zero client wiring; it
is copy + the pure selector + the capability flag.

### The capability gate already exists — reuse the exact signal, do not invent one

`authedOwner` is a SERVER property: in the chat route it is `resolved.dataKind === "real"`
([route.ts:48-52](../../../src/app/api/almond/chat/route.ts)), and the skill factory hands the
owner-only skills (`exportSpreadsheet`, `generateReport`) to the model **only when** `actor.authedOwner`
is true ([tools.ts:253-261](../../../src/lib/almond/tools.ts), the capability-by-omission seam,
ADR-A08). `navigate` is added unconditionally (it only sets URL state, so it is read-safe). The starter
gate must MATCH this exactly so a shown starter never fails the gate:

- Export/PDF starters: shown only when `dataKind === "real"` (the owner). This is what both layouts must
  pass as `canExport`.
- Open/navigate + read starters: shown to every actor (navigate is read-safe; reads are public).

`DashboardFarm.dataKind` is `"real" | "representative"`
([farm.ts:1664](../../../src/lib/onboarding/farm.ts)); `dashboardFarm` returns `"real"` for a connected
owner and `demoFarm` returns `"representative"` for the Tour
([farm.ts:1689,1701](../../../src/lib/onboarding/farm.ts)). Gate on `=== "real"`, NOT on `userId != null`
— a signed-in user with no connected farm resolves the demo fallback and is not an owner, and the route
would withhold the export skills from them, so their starters must withhold them too.

### Files to touch (UPDATE — no NEW files, no new deps, no schema, no route)

UPDATE:
- `src/lib/almond/starters.ts` — extend `StarterContext` with the capability flag; add the grounded,
  capability-gated selection of the new starters; keep it pure and `.slice(0, 4)`.
- `src/lib/almond/starters.test.ts` — replace the stale pins with the owner-with-findings /
  owner-no-findings / Tour cases above.
- `src/copy/en.ts` — add `openBiggestOpportunity`, `exportMeters`, `misRatedPdf` to
  `en.shell.almond.starters`; update the section comment.
- `src/copy/en.test.ts` — voice-law pin for the new strings (no em dash, no "!").
- `src/app/(app)/(dashboard)/layout.tsx` — pass `canExport: resolved.dataKind === "real"`.
- `src/app/tour/layout.tsx` — pass `canExport: false`.

There is intentionally no client component change: the launcher and panel already render whatever
`string[]` they are given and already send a tapped starter as a plain message.

### Read these before editing (current behavior to preserve)

- [starters.ts](../../../src/lib/almond/starters.ts) — the pure selector. Preserve: the always-safe
  fallback set, the `findingCount > 0` gate on `biggestOpportunity`, the `.slice(0, 4)` cap, and "copy
  lives in /copy". You are extending this function's signature and selection, not rewriting it.
- [almond-launcher.tsx](../../../src/app/(app)/_components/almond/almond-launcher.tsx) — takes
  `starters: string[]`; `onSend` sends a starter as a normal turn. Do NOT change its props or wiring.
- [almond-panel.tsx](../../../src/app/(app)/_components/almond/almond-panel.tsx) — renders the starters
  via the empty-state with `onStarter={onSend}`. Unchanged.
- [(dashboard)/layout.tsx](../../../src/app/(app)/(dashboard)/layout.tsx) and
  [tour/layout.tsx](../../../src/app/tour/layout.tsx) — the two mount points. Both already hold
  `resolved` (a `DashboardFarm`) and call `almondStarters({ findingCount: findings.length })`; add the
  capability arg. Note the Tour layout only mounts the launcher when `resolved` is non-null.
- [route.ts](../../../src/app/api/almond/chat/route.ts) — the canonical capability definition
  (`authedOwner = resolved.dataKind === "real"`). Mirror it; do not diverge.
- [tools.ts](../../../src/lib/almond/tools.ts) — the capability seam; confirm `exportSpreadsheet` +
  `generateReport` are the owner-only skills and `navigate` is unconditional, so the starter mapping is
  open=navigate (all actors), export/pdf=owner-only.

### Decisions / edge cases (resolved here so the dev does not have to guess)

- **Two "biggest opportunity" starters.** Keep the existing read question
  (`biggestOpportunity` -> answer) AND add the new action (`openBiggestOpportunity` -> navigate/open).
  They are different powers; with the four-cap and recommended ordering, both will not usually appear at
  once (the action is prioritized for owners-with-findings). If you find both showing and it reads
  redundant, prefer the **action** in the owner-with-findings case and let the read question fall to the
  no-findings/Tour fallback. Do not delete the read question.
- **Grounding the mis-rated-PDF starter.** `StarterContext` carries only `findingCount` (total open
  findings), not a mis-rated count specifically. Gate `misRatedPdf` on `findingCount > 0` — a mis-rated
  meter is a finding, and the PDF skill grounds itself on the real data regardless. Do NOT add a
  mis-rated-specific count to the context for this story (out of scope; the existing signal is enough).
  If a farm has findings but none are mis-rated, the generated PDF still renders honestly from real data
  (Epic 9 handles absence), so the starter is safe.
- **Capability flag shape.** `canExport: boolean` is the clearest name (it is exactly "may use the
  export/PDF skills"). If you prefer to mirror the route's vocabulary, `authedOwner: boolean` is
  acceptable — but name it consistently and document that it equals `dataKind === "real"`.
- **The four-cap with more candidates.** Keep `.slice(0, 4)`. The selection order is what decides which
  four show; pin that order in the test so it does not silently drift. Do not raise the cap to fit more
  starters — surfacing is meant to be gentle (FR22), and four is the established density.
- **A11y / motion (NFR7, UX-DR8).** The starter buttons are existing UI; new starters are just more
  strings, so keyboard-navigability and reduced-motion behavior are inherited unchanged. No new
  component, so no new a11y work — but during manual verify, confirm the new (longer) strings do not
  break the empty-state layout on a phone.

### Testing standards (project convention)

- Vitest, `environment: "node"` ([vitest.config.ts](../../../vitest.config.ts)). `starters.test.ts` and
  `en.test.ts` are pure (no Postgres, no jsdom). Do not add component/render tests.
- Pin real strings via `en.shell.almond.starters.*`, not vacuous single-char checks; the voice-law block
  in `en.test.ts` asserts phrase-level copy plus `not.toContain("—")` / `not.toContain("!")` — mirror
  that exact pattern for the new starters.
- The starter selector is pure and deterministic — assert the membership/exclusion laws (export starters
  present iff `canExport`; finding-gated starters present iff `findingCount > 0`; length <= 4) rather
  than over-pinning the exact four (so reasonable copy/order tweaks do not churn the test), but DO pin
  the capability gate and the finding gate, which are the laws this story exists to enforce.

### Project Structure Notes

- Pure Almond selection logic stays in `src/lib/almond/starters.ts`; all user-facing copy in
  `src/copy/en.ts` (localization-ready). The two layouts are the only consumers and the only place the
  server-resolved capability is known. No `packages/*` move needed; boundaries are already clean.
- This story stays entirely within those files — no schema change, no migration, no new route, no new
  dependency, no client component. It is the smallest possible surfacing increment, by design.

### References

- [Source: _bmad-output/almond/3-solutioning/epics.md#Story 10.1] — ACs, build notes: extend the
  `starters` plumbing in the launcher + `/copy/en.ts`, capability-gated by `authedOwner`, "No new deps",
  depends on the skills existing (7.3 navigate, 8.5 export, 9.3 generate).
- [Source: _bmad-output/almond/3-solutioning/epics.md#FR21] — rail entry, first-run nudge, and the
  existing grounded starters extended to include action and export prompts.
- [Source: _bmad-output/almond/3-solutioning/epics.md#FR22] — surfacing is gentle and progressive, never
  overbearing; the first run reads calm and optional.
- [Source: _bmad-output/almond/3-solutioning/epics.md#UX-DR6] — action/export-flavored starters; export
  starters shown only to an authed owner (mirrors AR15).
- [Source: _bmad-output/almond/3-solutioning/epics.md#AR15] — capability flag threading; generate/save
  (and the starters that drive them) gated by `authedOwner` = `dataKind === "real"`.
- [Source: _bmad-output/almond/3-solutioning/architecture-decisions.md#ADR-A08] — capability-by-omission:
  owner-only skills are not handed to the public actor at all; the starter gate must match the skill gate.
- [Source: src/lib/almond/tools.ts#L253-261] — the capability seam: `exportSpreadsheet` + `generateReport`
  spread in only when `actor.authedOwner`; `navigate` unconditional.
- [Source: src/app/api/almond/chat/route.ts#L48-52] — `authedOwner = resolved.dataKind === "real"`, the
  canonical capability definition to mirror.
- [Source: src/lib/almond/starters.ts] — the pure selector being extended; existing finding gate + cap.
- [Source: src/app/(app)/(dashboard)/layout.tsx#L43-46, src/app/tour/layout.tsx#L48-53] — the two
  launcher mount points that compute and pass `starters`.
- [Source: src/copy/en.test.ts] — the voice-law (no em dash / no "!") test pattern to mirror.
- [Source: apps/dashboard/CLAUDE.md] — plain operator English, no em dashes in user-facing copy, mobile
  first, the warm palette/Inter/Magic UI vocabulary, honor prefers-reduced-motion.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Opus 4.8, 1M context) — bmad-dev-story

### Debug Log References

- `npm run typecheck -w @lavinia/dashboard` — clean.
- `npm run lint -w @lavinia/dashboard` — clean.
- `npm test -w @lavinia/dashboard` — 843 passed; 2 failures, both in `generate-report.db.test.ts`
  (Story 9.3 owner-save path). Confirmed PRE-EXISTING and unrelated: `git stash`-ed all six 10.1 files
  and re-ran that file on the clean baseline — the same 2 tests failed identically. Root cause is
  environmental (`BLOB_READ_WRITE_TOKEN` unset locally, so the owner Blob-save path returns a failure
  instead of saving a Reports row). Out of scope for 10.1 (this story touches no PDF/Blob/store code).
- `npm run build -w @lavinia/dashboard` — production build succeeds. The two RSC layouts pass a
  serializable `string[]` starters prop (no function props), so there is no RSC serialization regression.

### Completion Notes List

- **Task 1 — copy.** Added `openBiggestOpportunity` (action -> navigate), `exportMeters` and
  `misRatedPdf` (owner-only -> export/PDF) to `en.shell.almond.starters`. Kept the read
  `biggestOpportunity` string: the empty-chat selection now prefers the `openBiggestOpportunity` action
  when a finding exists, but the read phrasing is retained for reuse (not deleted), per the story
  decision.
- **Task 2 — selector.** Extended `StarterContext` with `canExport`. `almondStarters` now leads with the
  grounded new powers (open needs a finding; export needs an owner; mis-rated PDF needs both), then
  falls back to the three always-safe read questions, de-dupes, and caps at four. Stays pure +
  deterministic (no model/client input).
- **Task 3 — threading.** `(app)/(dashboard)/layout.tsx` passes `canExport: resolved.dataKind === "real"`
  (the exact `authedOwner` signal the chat route uses); `tour/layout.tsx` passes `canExport: false`. No
  launcher/panel change — a tapped starter is still sent as a plain user message via `onSend`, so the
  model routes it to the matching skill (AC3 satisfied structurally; no starter->skill dispatch map).
- **Task 4 — tests.** Rewrote `starters.test.ts` (the old pins asserted the pre-10.1 behavior) to cover
  owner-with-findings, owner-no-findings, and non-owner/Tour, plus the export gate, the finding gate,
  the cap, and uniqueness. Added an `en.test.ts` voice-law block for the new starter copy (no
  kW/tariff/interval jargon, no em dash, no "!").
- **AC verification.** AC1 (new action/export starters) ✓; AC2 (no export/PDF for `canExport: false`,
  tested both finding states) ✓; AC3 (plain-message routing, no dispatch map) ✓; AC4 (`dataKind === "real"`
  gate in both layouts, identical to the route) ✓; AC5 (finding gate + <=4 cap + non-empty, tested) ✓;
  AC6 (tests updated, voice-law pin, typecheck/lint/test green) ✓.
- **Manual browser verification NOT performed** (headless environment — no dev/browser session). The
  gating laws are proven by the pure unit tests and the production build. Recommend a quick
  `npm run dev:dashboard` (port 3001): on the signed-in app, open Almond's empty chat and confirm an
  export/PDF starter shows and drives the real skill when tapped; on `/tour`, confirm NO export/PDF
  starter shows. (If a finding-gated starter does not appear, confirm the farm actually has open
  findings.)

### File List

Modified:
- `apps/dashboard/src/copy/en.ts`
- `apps/dashboard/src/copy/en.test.ts`
- `apps/dashboard/src/lib/almond/starters.ts`
- `apps/dashboard/src/lib/almond/starters.test.ts`
- `apps/dashboard/src/app/(app)/(dashboard)/layout.tsx`
- `apps/dashboard/src/app/tour/layout.tsx`
- `apps/dashboard/_bmad-output/almond/4-implementation/sprint-status.yaml` (status tracking)

## Change Log

- 2026-06-18 — Story 10.1 drafted (action and export-flavored starters). First story of Epic 10
  (Surfacing Almond, gently). Created via bmad-create-story after reconciling Epic 8 + 9 to done (their
  code shipped to main ahead of the tracker). Status: ready-for-dev.
- 2026-06-18 — Story 10.1 implemented (action/export starters). Added the open/export/PDF starter copy,
  extended `almondStarters` with the owner `canExport` gate + grounded selection, threaded the
  capability from both launcher mount points, and updated the starter + copy-law tests. typecheck +
  lint + build green; full suite 843/845 (2 pre-existing Story 9.3 Blob db-test failures, confirmed on
  baseline). Status: ready-for-dev -> in-progress -> review.
- 2026-06-18 — Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor, Opus 4.8). All 6 ACs
  satisfied; no crash-class defect. 1 decision (resolved: keep the spec-faithful "Open my biggest
  opportunity" copy, defer navigate finding-resolution to Epic 7), 1 patch applied (reorder the read
  tail so wrong-rate survives the 4-cap for owners-with-findings), 1 deferred (manual in-app verify),
  5 dismissed. Status: review -> done.
