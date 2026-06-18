---
title: Almond — Terra's Generative Operator (BMAD effort)
status: solutioning
created: 2026-06-17
owner: Jaiyen
project: Terra
---

# Almond — Generative Operator (effort index)

The per-effort BMAD home for **Almond**, the generative-operator extension of the shipped Epic-6
assistant. Set up as its own folder (mirroring `purchasing-agent/`) so its solutioning artifacts
never collide with the Tool 1 dashboard's global `planning-artifacts/architecture.md`.

Almond's **planning artifacts (PRD) currently live in the flat layout** at
[`../planning-artifacts/prds/prd-Almond-2026-06-17/`](../planning-artifacts/prds/prd-Almond-2026-06-17/);
they can be consolidated into this folder later for a fully self-contained tree.

## Contents

- `3-solutioning/`
  - [architecture.md](./3-solutioning/architecture.md) — the architecture decision document
    (extends the Tool 1 architecture; covers the skill framework, the server→client navigation
    bridge, deterministic artifact generation, the Reports area, and surfacing).
  - [architecture-decisions.md](./3-solutioning/architecture-decisions.md) — the load-bearing ADRs
    (ADR-A01 … ADR-A08) plus what is ratified upstream from the PRD addendum.

## Inputs (foundation)

- PRD: [../planning-artifacts/prds/prd-Almond-2026-06-17/prd.md](../planning-artifacts/prds/prd-Almond-2026-06-17/prd.md)
- Addendum: [../planning-artifacts/prds/prd-Almond-2026-06-17/addendum.md](../planning-artifacts/prds/prd-Almond-2026-06-17/addendum.md)
- Tool 1 architecture (foundation): [../planning-artifacts/architecture.md](../planning-artifacts/architecture.md)
- Project rules: [../project-context.md](../project-context.md)

## Decided this pass (2026-06-17, with Jaiyen)

- Navigation transport: a typed transient data part on the UI-message stream (ADR-A02).
- PDF engine: `@react-pdf/renderer` over a tested section library (ADR-A05).
- Storage: keep Neon; report bytes in private Vercel Blob (ADR-A07, ratifies addendum D13).

## Open (build-time, not architectural)

- Farmer validation (PRD Open Q4 / D14) gates *starting* the heavy build.
- Numeric targets for activation + generation latency.
- Surface-registry refactor (~9 call-sites) lands first; confirm `@vercel/blob` private-read
  mechanism; add rate-limiting before wide public-Tour exposure.

## Next BMAD step

Epics + stories for Almond (the `bmad-create-epics-and-stories` skill), reading this architecture as
its solutioning input.
