---
stepsCompleted: [1, 2, 3, 4, 5, 6]
status: complete
effort: "Almond — Terra's Generative Operator (Epics 7-10)"
assessedBy: "bmad-check-implementation-readiness (Winston, System Architect)"
date: 2026-06-17
documentsUnderReview:
  prd:
    - _bmad-output/planning-artifacts/prds/prd-Almond-2026-06-17/prd.md
    - _bmad-output/planning-artifacts/prds/prd-Almond-2026-06-17/addendum.md
  architecture:
    - _bmad-output/almond/3-solutioning/architecture.md
    - _bmad-output/almond/3-solutioning/architecture-decisions.md
  epics:
    - _bmad-output/almond/3-solutioning/epics.md
  ux:
    - _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/EXPERIENCE.md
    - _bmad-output/planning-artifacts/ux-designs/ux-Terra-2026-06-08/DESIGN.md
  foundationContext:
    - _bmad-output/planning-artifacts/architecture.md
    - _bmad-output/planning-artifacts/epics.md
    - _bmad-output/project-context.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-17
**Project:** Terra
**Effort:** Almond — Terra's Generative Operator (Epics 7-10, extends shipped Epic 6)

> Scope note: this assessment is **scoped to the Almond generative-operator effort**, not Tool 1
> as a whole. The Almond architecture/epics extend the shipped Tool 1 foundation (Epics 1-6,
> the global architecture, project-context.md), which is treated here as ratified context.

---

## Step 1 — Document Inventory

| Type | Document(s) | Status |
|------|-------------|--------|
| PRD | `prds/prd-Almond-2026-06-17/prd.md` (+ `addendum.md`) | ✅ present, single source (no whole/sharded duplicate) |
| Architecture | `almond/3-solutioning/architecture.md` + `architecture-decisions.md` | ✅ present (extends Tool 1 global architecture) |
| Epics & Stories | `almond/3-solutioning/epics.md` (Epics 7-10, 18 stories) | ✅ present |
| UX | `ux-Terra-2026-06-08/EXPERIENCE.md` + `DESIGN.md` | ✅ present (global Terra UX; Almond operator surfaces specced; takes the Almond PRD as input) |
| Foundation (ratified context) | Tool 1 `architecture.md`, Tool 1 `epics.md` (Epics 1-6), `project-context.md` | ✅ treated as ratified |

**Duplicates:** none. **Missing:** none. **Note:** No Almond-only UX file by design — Almond is a launcher over existing surfaces; its UX lives in the global EXPERIENCE.md / DESIGN.md (EXPERIENCE.md is the authoritative UX doc on conflict).

---

## Step 2 — PRD Analysis

Source: `prd-Almond-2026-06-17/prd.md` (read in full) + `addendum.md` (mechanism, decisions, reuse map). FR IDs are stable, carried verbatim from PRD §5.

### Functional Requirements (22)

**Cluster: Navigation skills — operator (§5.1)**
- **FR1** — Almond navigates any primary surface by setting canonical URL state (`meter`, `lens`=calendar/table/chart/map, filters `entity`/`ranch`/`rate`). Surfaces reused; the server→client action bridge is net-new. Model requests a *named* navigation, never a route.
- **FR2** — Every navigation is recorded as an **action chip** ("Opened Pump 17") that links back to that view; undo = navigate back (no data changes).
- **FR3** — Almond resolves plain-language references (meter by name/SA-ID, ranch, entity, rate, finding) via grounded tools. **Ambiguity trigger: ≥2 matches (or none) → ask to disambiguate; a request matching ≥2 meters never auto-navigates.**
- **FR4** — Almond drives the screen **only on request**; never hijacks navigation, never overrides manual control mid-task.

**Cluster: Skill framework (§5.2)**
- **FR5** — Capabilities are discrete named **skills**, model-selected; the set is **extensible** without reworking core/persona/grounding.
- **FR6** — Every skill is **read-only on farm + utility data** (extends "display, never execute").
- **FR7** — Every skill is **farm-scoped by inheritance** (closes over resolved `farmId`; never takes scope from model/client — Story 6.1 law). Cross-farm action structurally impossible.
- **FR8** — Every skill draws content **only from grounded data**; artifacts assembled by **deterministic code from the full grounded dataset** — model picks shape, never authors a cell/number/prose. Export skills use a **dedicated full-data path** (chat-tool caps must NOT feed exports). Absence stated, never invented.
- **FR9** — Before a heavier artifact, Almond **states what it's about to make** in one line (lightweight preview, not an approval gate).

**Cluster: Export skills (§5.3)**
- **FR10** — **Spreadsheet skill**: CSV + `.xlsx`. Reuse the pure `metersCsv` builder where shape matches; server-side generation, `.xlsx` path, bill-due-schedule exporter, file delivery are net-new. No parallel CSV format.
- **FR11** — Spreadsheet content is **request-driven** (AG-4 meters, demand-charge findings, a meter's 12 bills), Excel-brained (tabular money, whole dollars, plain headers, no jargon). **v1 leads with meter table + bill-due schedule; findings/recs export deferred pending farmer validation (Open Q4).**
- **FR12** — **PDF report skill**: generative in *selection*, deterministic in *rendering* — model picks which tested composable sections to include; each section renders real data. Warm palette, plain English, money tabular/whole-dollar, never a lone hero number.
- **FR13** — Generation correct + legible at Batth scale (183 meters): full meter spreadsheet complete (no silent row caps), whole-farm PDF readable + printable.

**Cluster: Delivery + Reports area (§5.4)**
- **FR14** — Any artifact **downloads to device immediately** (baseline, phone-first).
- **FR15** — Every artifact **saved to a per-grower Reports area**, persisted + re-downloadable; records what/when/the request that made it.
- **FR16** — Reports area is **farm-scoped + private**; never see another farm's reports; stored-file access not guessable.
- **FR17** — **Email delivery explicitly OUT of v1** (future skill; recorded so the boundary is unambiguous).

**Cluster: Trust, grounding, safety (§5.5)**
- **FR18** — Almond inherits **auth + farm scope** (unauth/farm-less → 401/clean 400). **Generate + save additionally require an authenticated farm-owner**: public demo/Tour gets read + navigate only (no Blob writes, no saved Reports). Navigation public-safe; persistence is not.
- **FR19** — Every artifact carries an **honest coverage / as-of footer** (reuses reconciliation/coverage honesty); a shared PDF never overclaims completeness.
- **FR20** — **Voice/persona unchanged** across all new surfaces; plain operator English, no exclamation marks, no jargon, **no em dashes in generated copy**.

**Cluster: Surfacing (§5.6)**
- **FR21** — Clear discoverable entry: persistent OS-shell rail entry, a first-run onboarding nudge, and grounded starters extended with **action + export** prompts.
- **FR22** — Surfacing is **gentle + progressive, never overbearing**; calm/optional on first run; never blocks/interrupts/nags. Hard requirement for a non-AI-native operator, not polish.

**Total FRs: 22 (FR1-FR22).**

### Non-Functional Requirements (§8, cross-cutting)

- **NFR1 — Security & isolation:** structural farm-scoping (no farmId from model/client); Reports + files farm-private with non-guessable, scoped/expiring access; no grower credentials on the artifact path.
- **NFR2 — Grounding integrity:** fabrication rate ~0; tool-sourced; absence stated, never guessed.
- **NFR3 — Determinism & testability:** model boundary stays injected (offline stub default, Vercel AI Gateway when keyed); dev/CI zero external calls; export shaping pure + unit-tested; generated bytes verified by tests; navigation actions deterministic.
- **NFR4 — Performance (direction approved, numbers TBD):** navigation feels instant (no full reload); meter-table spreadsheet in a few seconds; whole-farm PDF ~≤10s; serverless-safe pure-JS (no headless Chromium).
- **NFR5 — Stays native to a changing dashboard:** **build a single canonical surface registry** (closed `lens | entity | ranch | rate | meter` set + each lens) that both dashboard + Almond read; Almond never offers a retired surface. (Net-new.)
- **NFR6 — Mobile-first:** download, Reports area, PDFs all work + read well on a phone; PDFs printable.
- **NFR7 — Accessibility & motion:** chips/previews/Reports keyboard-navigable, adequate tap targets; streamed actions/answers announce via live region; Magic UI degrades under `prefers-reduced-motion`.
- **NFR8 — Honest limits:** no silent truncation; any bounded artifact states what was left out.
- **NFR9 — Voice & localization:** all user-facing copy in `/copy`, localization-ready, plain operator English, no em dashes.

**Total NFRs: 9.**

### Additional Requirements / Constraints

- **Non-Goals (v1, §6):** no data/utility mutations; no PPTX; no email/outbound send; no scheduled/background agents; no chat-first front door; no multi-farm; no physical (camera) data fusion. These bound coverage — epics must NOT introduce them.
- **Build gate (§7.3 / Open Q4 / D14):** heavy build is gated behind **farmer validation**. The breakdown is *how* to build once validated, not a greenlight.
- **Ratified decisions (addendum):** D2 dashboard-first (no chat front door); D3 read-only (no write-actions v1); D7 email deferred; D8 generative request-driven PDF (no single rigid template); D13 keep Neon + add private Vercel Blob (Supabase rejected); saved reports are immutable bytes (regenerate-on-download rejected). Greenfield deps: `@vercel/blob`, `exceljs`, `pdfkit`/`@react-pdf/renderer`; new `GeneratedReport` model; full-data export loaders + nav bridge do not exist yet.
- **Reuse map (addendum, honest):** reused = dashboard surfaces, `metersCsv` builder, palette/voice, owner-scoping law, `AlmondResponder`+gateway, coverage honesty. Net-new = server→client nav bridge, canonical key registry, `.xlsx` + bill-due-schedule exporter, full-data export path, composable-section PDF pipeline, `GeneratedReport` + Blob wiring + Reports UI, the demo/Tour generate/save gate.

### PRD Completeness Assessment (initial)

Strong. Requirements are testable, ID-stable, and grouped by capability; non-goals are explicit; NFRs are concrete (with two numeric targets honestly marked TBD — Open Q3). The reuse map and addendum pre-resolve most mechanism risk for the architecture pass. **Open items that are product/build-time, not spec gaps:** Open Q1 (retention/quota — storage decided), Q2 (exact gentle-surfacing wording), Q3 (numeric perf + activation targets), Q4 (farmer validation gate). None block traceability validation.

---

## Step 3 — Epic Coverage Validation

Method: I extracted the epics doc's self-reported FR Coverage Map, then **independently re-traced every PRD FR (Step 2) to the actual Given/When/Then acceptance criteria of the named story** — not just trusting the map. Epics 7-10, 18 stories.

### Coverage Matrix (PRD FR → verified story landing)

| FR | Requirement (abbrev.) | Story coverage | Independently verified | Status |
|----|------------------------|----------------|------------------------|--------|
| FR1 | navigate via canonical URL state + server→client bridge | 7.3 (emit) + 7.4 (apply) | 7.3 returns `NavigateAction`; 7.4 applies via the 5 `useQueryState` setters | ✓ |
| FR2 | action chip records nav + links back | 7.5 | chip renders + re-applies the action; undo = back | ✓ |
| FR3 | resolve refs; ≥2 matches → clarify, no auto-nav | 7.3 | explicit AC: ≥2 / none emits **no** navigation | ✓ |
| FR4 | drive only on request, never hijack | 7.5 | AC: no `data-navigate` without a user turn | ✓ |
| FR5 | discrete, named, extensible skills | 7.2 | factory → `buildAlmondSkills`; extensible | ✓ |
| FR6 | read-only on data (every skill) | 7.2 (+8.5/9.3) | AC: no writes except artifact persistence | ✓ |
| FR7 | farm-scoped by inheritance (no model/client scope) | 7.2 (+8.1/8.5/9.3) | AC: closes over `farmId`; schema carries shape only | ✓ |
| FR8 | grounded full-data path; no model-authored cells | 8.1 (+8.2/8.5/9.1/9.3) | AC: uncapped loader is the sole export read path; deterministic values | ✓ |
| FR9 | one-line "what I'm about to make" preview | 8.5 (+9.3) | AC: states shape before file; not an approval gate | ✓ |
| FR10 | spreadsheet (CSV reuse + XLSX) | 8.2 + 8.5 | AC: reuses `metersCsv`; `exceljs` XLSX | ✓ |
| FR11 | request-driven; meter-table + bill-due first | 8.2, 8.3, 8.5 | AC: shape-driven; bill-due exporter present | ✓ |
| FR12 | PDF generative selection / deterministic render | 9.1 + 9.2 + 9.3 | AC: tested section lib; composer selects | ✓ |
| FR13 | Batth scale (183), no silent caps | 8.2 (sheet) + 9.2 (PDF) | AC: full rows + byte tests + no-truncation | ✓ |
| FR14 | immediate download | 8.5 + 9.3 | AC: `data-report` download card | ✓ |
| FR15 | saved Reports area (what/when/request) | 8.6 + 8.7 (+9.3) | AC: `GeneratedReport` row + Reports UI | ✓ |
| FR16 | Reports farm-scoped, private, non-guessable | 8.6 + 8.7 | AC: private Blob + owner-scoped download (404/401) | ✓ |
| FR17 | email explicitly OUT of v1 | **(boundary — no story)** | PRD mandates it be recorded as a boundary, not built | ✓ intentional |
| FR18 | auth/scope inherited; generate/save owner-only | 7.2 + 8.5 + 8.6 + 9.3 + 10.1 | AC: capability-by-omission (skill not handed to public actor) | ✓ |
| FR19 | honest coverage/as-of footer | 8.4 + 9.2 | AC: shared footer composer on XLSX + PDF | ✓ |
| FR20 | voice/persona unchanged, no em dashes | cross-cutting AC (all user-facing stories) | enforced in each epic's cross-cutting law + e.g. 8.7 empty state, 8.4 footer | ✓ |
| FR21 | rail entry, first-run nudge, action/export starters | 10.1 + 10.2 | AC: starters + rail + nudge | ✓ |
| FR22 | gentle, progressive, never overbearing | 10.2 | AC: dismissible, remembered, never nags | ✓ |

### Reverse check — anything in epics NOT in the PRD?

No phantom requirements. The epics restate FR1-FR22 verbatim and add two **traceable derivation layers**: **AR1-AR18** (net-new technical work derived from the architecture's "build this" columns) and **UX-DR1-UX-DR8** (derived from PRD §5.6 + the a11y/motion/voice NFRs + the architecture's Frontend section). Each AR/UX-DR cites its source FR/ADR. No scope creep at the requirement level.

### Coverage Statistics

- **Total PRD FRs:** 22
- **FRs requiring implementation:** 21 (FR1-FR16, FR18-FR22)
- **FRs covered by ≥1 story:** 21 / 21 = **100%** of implementable FRs
- **FR17:** intentional out-of-v1 boundary, correctly recorded with no story (per PRD §5.4 / Non-Goals)
- **All 22 FRs accounted for: yes.** NFR1-NFR9 each mapped to a home story or cross-cutting AC; AR1-AR18 distributed to the first story that needs each (no front-loaded "install everything" story).

### Missing Requirements

**None.** No critical or high-priority FR is uncovered. The single non-implemented FR (FR17) is a deliberate, PRD-mandated boundary, not a gap.

**Coverage verdict: PASS.**

---

## Step 4 — UX Alignment

### UX Document Status: FOUND

No standalone Almond UX file (by design — Almond is a launcher over existing surfaces, not a new zone). The Almond operator surfaces are specced inside the global Terra UX docs, both updated 2026-06-17:
- `EXPERIENCE.md` — interaction model (launcher→panel, action chips, skill preview, generated-artifact card, Reports, calm coachmark, navigate/generate/ambiguous/failed states, demo read+navigate-only). It **explicitly takes the Almond PRD as an input** (line 6).
- `DESIGN.md` — the new components: `almond-launcher`, `almond-panel`, `action-chip`, `artifact-card`, `reports-list`, `coachmark`, `almond-mascot` (with its expression states).

### A. UX ↔ PRD alignment — ALIGNED

Every Almond UX surface traces to a PRD FR, and every PRD FR with a UI implication has a UX treatment:

| UX surface (EXPERIENCE/DESIGN) | PRD FR | Aligned |
|--------------------------------|--------|---------|
| Launcher → panel, calm corner, never auto-opens | FR21, FR22 | ✓ |
| Action chip ("Opened Pump 21"), links back | FR2 | ✓ |
| Skill preview ("I'll build a PDF…") | FR9 | ✓ |
| Generated-artifact card (kind, coverage note, Download; money tabular) | FR12, FR14, FR19, FR20 | ✓ |
| Reports list (what/when/request, farm-private) | FR15, FR16 | ✓ |
| One-time dismissible coachmark | FR21, FR22 | ✓ |
| "Almond navigates" (view jumps, chip records, mobile panel steps aside) | FR1, FR2 | ✓ |
| Ambiguous reference → asks which, never auto-opens | FR3 | ✓ |
| Generation failed → plain "I couldn't build that", no half-file | error rule / NFR8 honesty | ✓ |
| Demo/Tour (no session) → read + navigate only, generate/save disabled | FR18 | ✓ |
| almond-mascot expressions; no exclamation marks; no em dashes | FR20, NFR9 | ✓ |

No UX requirement sits outside the PRD; no UI-bearing FR is unaddressed by the UX. The UX also reinforces the data-first / hero-not-money-loudest law (money tabular, never a hero number) consistent with the PRD.

### B. UX ↔ Architecture alignment — ALIGNED

The architecture has a dedicated **Frontend Architecture** section (architecture.md §"Frontend Architecture") that supports each surface, and it names the *same component files* DESIGN.md specs:
- Action chips + report download cards → render in `almond-result.tsx` / `almond-messages.tsx`; driven by the `data-navigate` / `data-report` stream parts (ADR-A02, AR17). Supports UX-DR1, UX-DR2.
- Reports area → new `(app)/reports` Server Component over `GeneratedReport`, owner-scoped download, mobile-first. Supports UX-DR3.
- Rail entry + calm dismissible first-run nudge → `almond-launcher.tsx` + onboarding. Supports UX-DR4, UX-DR5.
- Live-region announcements, `prefers-reduced-motion` degrade, ≥44pt keyboard targets → explicit in the architecture's accessibility rules (§"Voice, copy, accessibility"). Supports UX-DR7, UX-DR8.

The architecture's Requirements-Coverage section explicitly checks "mobile-first download/Reports/PDF + a11y/motion (✓); voice/copy law (✓)." Performance for the felt UX (instant navigation, no full reload; seconds-scale generation) is carried as NFR4 with the no-Chromium pure-JS decision (ADR-A05) backing it.

### Alignment Issues / Warnings (both low severity — not blockers)

1. **Reports IA placement nuance.** `EXPERIENCE.md` / `DESIGN.md` describe Reports as living **"in the Account page"** (Account zone); the architecture + epics (UX-DR3, Story 8.7) create a sibling **`(app)/reports` route**. Same security model and farm-scoping either way — but the exact information architecture (a section within `/account` vs a standalone `/reports` route) should be pinned during Story 8.7 so the rail/nav points to the right place. *Severity: low (placement, not contract).*
2. **Launcher vs rail entry slight redundancy.** PRD FR21 calls for "a persistent entry in the OS-shell rail," while the existing/shipped surface is a **corner launcher FAB** (`almond-launcher`); the epics (Story 10.2) add a rail entry **alongside** the launcher. Consistent, but confirm during Story 10.2 that two persistent affordances (corner FAB + rail entry) is intended and not visual noise for the gentle-surfacing goal (FR22). *Severity: low (confirm intent).*

**UX alignment verdict: PASS** (architecture fully supports the UX; two low-severity placement/intent items to confirm at build time, neither blocks story writing).

---

## Step 5 — Epic Quality Review

Rigorous pass against the create-epics-and-stories standards. I challenged every epic for technical-milestone framing, every story for forward dependencies and sizing, and the AC set for testability and error coverage.

### Per-epic best-practices checklist

| Check | Epic 7 | Epic 8 | Epic 9 | Epic 10 |
|-------|:---:|:---:|:---:|:---:|
| Delivers user value (not a technical milestone) | ✓ | ✓ | ✓ | ✓ |
| Functions independently of later epics | ✓ | ✓ (on 7) | ✓ (on 8) | ✓ (surfaces what shipped) |
| Stories appropriately sized (single dev-agent session) | ✓ | ✓ | ✓ | ✓ |
| No forward dependencies | ✓ | ✓ | ✓ | ✓ |
| DB/entities created only when needed | n/a | ✓ (8.6) | ✓ (reuses) | n/a |
| Clear Given/When/Then ACs incl. errors | ✓ | ✓ | ✓ | ✓ |
| FR traceability maintained | ✓ | ✓ | ✓ | ✓ |

### A. User-value focus — PASS

All four epic titles/goals are user-centric (drive the screen / hand you a spreadsheet / build the lender PDF / discover gently), each delivering a complete grower outcome. No "API development" / "infrastructure setup" epic exists.

### B. Epic independence — PASS

Verified Epic N never requires Epic N+1: Epic 7 standalone; 8 builds on 7.2 only; 9 builds on 8's loader/footer/persistence only; 10 surfaces whatever shipped and degrades gracefully (e.g. export starters hidden if no export skill). All dependencies point **backward**.

### C. Forward-dependency / sizing — PASS

Within-epic flows are strictly backward: 7.1→7.2→7.3→7.4→7.5; 8.1→…→8.7; 9.1→9.2→9.3; 10.1→10.2→10.3. The one subtle case — 7.3 emits `NavigateAction`, 7.4 consumes it — is correctly a *backward* dependency (7.4 on 7.3); 7.3's ACs make it pure + unit-testable alone (single/multi/no-match/unknown-surface, stub-driven), so it is not a forward dependency.

### D. Brownfield correctness — PASS

Architecture (ADR-A01) is explicit: extend Epic-6 in place, **no greenfield starter/init story**. Correctly, Story 7.1 is a genuine prerequisite (the surface registry), not project scaffold. `GeneratedReport` is created in 8.6 (first persistence), not upfront; new deps land where first needed (`exceljs` 8.2, `@vercel/blob` 8.6, `@react-pdf/renderer` 9.1). No "create-all-tables / install-everything" anti-pattern.

### E. AC quality — STRONG

Error/edge cases are present throughout: ambiguity (7.3 ≥2/none/unknown-surface), re-render dedupe (7.4), never-hijack (7.5), missing-data coverage label (8.1/8.2), public-Tour capability gate (8.5/9.3), cross-farm 404/401 (8.6), typed generation failure with no partial file (8.5/9.3), reduced-motion + ≥44pt (7.5/8.7/10.2), calm empty state (8.7). Many ACs name the exact assertion ("a db test asserts cross-farm access is impossible", byte/snapshot tests, "a scheduled date is never emitted as billed").

### Findings

#### 🔴 Critical Violations
**None.**

#### 🟠 Major Issues
**None.**

#### 🟡 Minor Concerns (none block story-writing; address during sprint planning / per-story)

1. **FR4 in-flight override race not explicitly covered (most substantive).** Story 7.5 enforces FR4 as "no `data-navigate` part without a corresponding user turn," which catches *unprompted* navigation. It does **not** explicitly handle the race where the grower **manually navigates while an Almond navigation is in flight**, then Almond's async result yanks the screen — which the PRD's "never overridden mid-task" language also covers. *Remediation:* add an AC to Story 7.5 (or 7.4): a `data-navigate` result is dropped/ignored if the user has manually changed the relevant URL state since the turn was issued (stale-action guard). Low-medium severity; cheap to add now, annoying to retrofit.

2. **Foundation stories framed with grower value (accepted, by design).** 7.1 (registry refactor), 7.2 (factory→framework), 8.1 (loader), 8.4 (footer), 9.1 (section lib) are technical-foundation work wearing an "As a grower…" frame. This is the *correct* brownfield pattern (distribute foundations into the value epic that first needs them, no separate "Epic 0"), and the epics doc §4 reasons about it. Flagged only so it's a conscious choice, not an oversight. No action needed.

3. **Story 10.3 is honestly non-user-facing ("As Terra, I want abuse protection").** The one story whose value is operational, not grower-facing. Justified as a pre-wide-Tour security/cost gate and correctly sequenced last; the framing is honest rather than dressed up. Accepted; ensure sprint planning treats it as a launch gate, not optional polish.

4. **Shared-file churn across epics (coordination, not correctness).** `almond-launcher.tsx` is touched by 7.4 / 8.5 / 10.1 / 10.2 and `api/almond/chat/route.ts` by 7.4 / 8.5 / 10.3. The breakdown assessed this (§4) and accepted it as additive (each touch a separate value increment). Concur — but since both founders work `main`, sprint sequencing should **serialize** stories that touch these two files to avoid merge friction. Low severity; a sequencing note for `bmad-sprint-planning`.

5. **Performance ACs reference unset numeric targets.** ACs in 8.2 ("within the few-seconds target") and 9.2 ("~10s target") inherit NFR4, whose numbers are explicitly TBD (PRD Open Q3). Until set, those ACs aren't precisely pass/fail. *Remediation:* set the numeric perf targets with the team before 8.2 / 9.2 enter a sprint. Low severity.

### Quality verdict: PASS

Epic structure, story sizing, dependency direction, AC quality, and brownfield handling all meet the standard with **zero critical and zero major violations**. The minor concerns are refinements (one real AC gap on FR4, four sequencing/clarity notes), not structural defects.

---

## Summary and Recommendations

### Overall Readiness Status

**READY** (with minor, non-blocking refinements).

All four validation dimensions pass: document inventory complete and conflict-free; **100% of implementable FRs (21/21) traced to story acceptance criteria**, FR17 a correctly-recorded boundary; UX fully specced and architecture-supported; epic structure clean with **zero critical and zero major** quality violations. The architecture's own validation and the epics' self-validation both independently agree, and this pass re-derived coverage from the story ACs rather than trusting those claims.

### Critical Issues Requiring Immediate Action

**None.** There are no critical or major defects. Nothing here blocks writing and sequencing stories.

### Issues by Category (all minor)

| # | Category | Issue | Severity | When to fix |
|---|----------|-------|----------|-------------|
| 1 | Epic quality (AC gap) | FR4 in-flight override race not covered — Almond's async navigation can yank a screen the grower manually moved mid-turn | Low-med | Add an AC to Story 7.5/7.4 **before that story is dev'd** |
| 2 | Process / numbers | NFR4 performance ACs (8.2 "few seconds", 9.2 "~10s") reference targets that are still TBD (PRD Open Q3) | Low | Set numbers before 8.2 / 9.2 enter a sprint |
| 3 | UX alignment | Reports IA: UX says "in the Account page"; architecture/epics build a sibling `(app)/reports` route | Low | Pin during Story 8.7 |
| 4 | UX alignment | Corner launcher FAB **and** a rail entry — confirm two persistent affordances suits the gentle-surfacing goal | Low | Confirm during Story 10.2 |
| 5 | Sequencing | Shared-file churn (`almond-launcher.tsx`, `chat/route.ts`) across epics — serialize those stories on `main` | Low | Input to `bmad-sprint-planning` |

### Recommended Next Steps

1. **Clear the product gate first (the real blocker, not a spec gap).** PRD Open Q4 / decision D14: the heavy build is gated behind **farmer validation** of the data-first / gentle-surfacing thesis. This readiness PASS means the plan is sound to build *once a real grower confirms it* — it is not a greenlight to start before that.
2. **Resolve the two genuine pre-dev decisions** that need a human, not more planning: (a) set the numeric performance targets (NFR4) and activation target (SM1); (b) decide the Reports IA placement (`/account` section vs `/reports` route). Both are quick calls with the team.
3. **Add the FR4 stale-action-guard AC to Story 7.5** so the "never overridden mid-task" guarantee is testable, not just asserted.
4. **Proceed to `bmad-sprint-planning`** to sequence the 18 stories (respecting the backward-only dependency chains and the shared-file serialization note), then run the per-story `bmad-create-story` → `bmad-dev-story` → `bmad-code-review` cycle.

### Final Note

This assessment identified **5 minor issues across 3 categories (epic-quality, UX-alignment, process)** and **zero critical or major issues**. The Almond Epics 7-10 breakdown is internally consistent with its PRD, architecture, and UX, and is ready for development once the farmer-validation product gate is cleared. The findings above are refinements to fold in during sprint planning and per-story work; you may also proceed as-is and address them inline.

*Assessed 2026-06-17 by the implementation-readiness workflow (facilitated as Winston, System Architect). Scope: the Almond generative-operator effort (Epics 7-10).*
