---
title: Terra Purchasing Agent - Package Index
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Terra Purchasing Agent - Package Index

This is the index for the full BMAD output behind Terra Tool 2, the Purchasing Agent: an AI-native, farmer-side input-procurement agent for California specialty and permanent-crop growers, beachhead almonds and tree nuts. It sits next to the PG&E energy tool (Tool 1) on the same shared data model and the same Recommendation grammar. v1 makes input spend legible and audits the grower-side rebate and prepay paperwork. It does not negotiate and does not buy; live scouting, negotiation, and auto-PO are marked POST-MVP throughout.

Every artifact under `_bmad-output/purchasing-agent` is listed below, grouped by phase, with a one-line description. Read the "Reading order" section first if you are new to this package.

## Artifacts by phase

### Phase 0 - Research

- [Clone Target and AI Thesis](./0-research/clone-target-and-ai-thesis.md) - The decision to copy Farmers Business Network's input-procurement transparency wedge and beat it with a farmer-side, AI-native, non-seller purchasing agent.
- [Competitor Landscape and Incumbent Teardown](./0-research/competitor-landscape-and-teardown.md) - Maps the players (FBN, GROWERS, Growers Edge, Bushel and more), tears down the clone target, and pulls portable mechanics from Ramp, Faire, GPOs, and Pactum to find the white space.
- [Market and Customer Research](./0-research/market-and-customer-research.md) - Grounds the Tool 2 candidate: inputs are the largest controllable cost, the channel is opaque by design, margins went negative in 2025, and no incumbent occupies the grower's independent buyer position.

### Phase 1 - Analysis

- [Brainstorming Session](./1-analysis/brainstorming.md) - Wide-then-converge ideation (First Principles, Role Playing, Assumption Reversal, SCAMPER) on naming, the killer first feature, onboarding hooks, trust mechanics, and gain-share pricing.
- [Domain Research](./1-analysis/domain-research.md) - The ground the agent lives on: how inputs actually get bought, where margin hides (rebates, zone pricing, prepay timing), FIFRA/EPA/DPR rules, and what agentic buying tech makes possible now.
- [Market Research](./1-analysis/market-research.md) - The formal BMAD market-research artifact: segments, pain points, jobs-to-be-done, a competitive matrix, and a bottom-up TAM/SAM/SOM with explicit assumptions.
- [PRFAQ](./1-analysis/prfaq.md) - Working-backwards press release plus FAQ: the launch story of a buyer that works for the farm not the store, paid only out of proven savings.
- [Product Brief](./1-analysis/product-brief.md) - The brief: problem, solution, the FBN clone-and-beat thesis, scope discipline (legibility first), and the path to earning the right to act.

### Phase 2 - Planning

- [PRD](./2-planning/prd.md) - The product requirements: Glossary, 17 functional requirements, named-persona user journeys, success metrics, and the Savings Attribution gate on monetization. The contract for what v1 builds and why.
- [UX Specification](./2-planning/ux-spec.md) - The experience contract: information architecture, key screens, per-journey flows, and accessibility and honesty floors, inheriting the Tool 1 OS shell, rail, and three-views discipline.
- [Design System](./2-planning/design.md) - The visual vocabulary for Tool 2: the warm agricultural palette, tokens, and components extending the Terra brand to the input-spend hero.
- [Epics and Stories](./2-planning/epics.md) - The eight-epic, vertically-sliced breakdown of all 17 FRs, with v1 scope (Epics 1 to 7) and POST-MVP (Epic 8) clearly fenced.

### Phase 3 - Solutioning

- [Architecture](./3-solutioning/architecture.md) - The solution design: how the 17 FRs and 9 NFRs are built inside the existing Next.js + TypeScript + Prisma + Postgres app, extending Tool 1 patterns rather than inventing parallel ones.
- [Architecture Decision Records](./3-solutioning/architecture-decisions.md) - The load-bearing, contested decisions behind the architecture (in-repo shared schema, no Dealer credentials, the Crop Plan correction, Finding immutability, and more).

### Phase 4 - Implementation

- [Story 1.1 - Stand up the Purchasing Agent on the shared data model](./4-implementation/1-1-stand-up-the-purchasing-agent-on-the-shared-data-model.md) - Stands up the procurement schema on the shared Prisma model with pure-logic boundaries and a Batth-shaped seed, Tool 1 untouched. Status: ready-for-dev.
- [Story 1.2 - Ingest an Invoice by photo, PDF, or email forward and extract its lines](./4-implementation/1-2-ingest-an-invoice-by-photo-pdf-or-email-forward-and-extract-its-lines.md) - Reads submitted invoices into structured lines with zero Dealer credentials, flagging unreadable lines "needs review," running against fixtures. Status: ready-for-dev.
- [Story 1.3 - Attribute each extracted line to a Ranch, Entity, and Account](./4-implementation/1-3-attribute-each-extracted-line-to-a-ranch-entity-and-account.md) - Attaches every line to exactly one Ranch, Entity, and Account, with grower-correctable, persisting attribution and ambiguous lines routed to the Review queue. Status: ready-for-dev.
- [Sprint Status](./4-implementation/sprint-status.yaml) - The sprint plan and tracking file: proposed slicing, dependency order, the Epic 3 (Crop Plan) blocker, and per-epic and per-story status.

### Phase 5 - Reviews

- [PRD Validation Report](./5-reviews/prd-validation-report.md) - Checklist validation of the PRD. Gate: go-with-conditions, Grade: Good.
- [Implementation Readiness Report](./5-reviews/implementation-readiness-report.md) - FR-to-epic-to-story traceability, UX-PRD-architecture alignment, epic quality, and architecture completeness. Gate: go-with-conditions.
- [Adversarial Review](./5-reviews/adversarial-review.md) - A cynical VC plus principal-engineer teardown of the whole package, separating fatal objections from solvable ones with the evidence that would settle each. Gate: go-with-conditions.
- [Risk Register and Pre-Mortem](./5-reviews/risk-register-and-premortem.md) - An 18-months-out pre-mortem with a ranked risk register, leading indicators, owners, and three kill criteria. Gate: go-with-conditions.

## Reading order

If you are new to this package, read in this order. Each step assumes the one before it.

1. [Implementation Readiness Report](./5-reviews/implementation-readiness-report.md) - the top-level synthesis and the gate. Read this first to know where the package stands.
2. [Clone Target and AI Thesis](./0-research/clone-target-and-ai-thesis.md) - the thesis. What we copy, who we copy, and where the white space is.
3. [Product Brief](./1-analysis/product-brief.md) - the brief. Problem, solution, scope discipline.
4. [PRD](./2-planning/prd.md) - the requirements. Glossary, FRs, user journeys, success metrics, the monetization gate.
5. [UX Specification](./2-planning/ux-spec.md) and [Architecture](./3-solutioning/architecture.md) - how it looks and how it is built. Read the UX spec alongside the [Design System](./2-planning/design.md), and the architecture alongside the [Architecture Decision Records](./3-solutioning/architecture-decisions.md).
6. [Epics and Stories](./2-planning/epics.md), then the Phase 4 stories ([1.1](./4-implementation/1-1-stand-up-the-purchasing-agent-on-the-shared-data-model.md), [1.2](./4-implementation/1-2-ingest-an-invoice-by-photo-pdf-or-email-forward-and-extract-its-lines.md), [1.3](./4-implementation/1-3-attribute-each-extracted-line-to-a-ranch-entity-and-account.md)) and the [Sprint Status](./4-implementation/sprint-status.yaml) - the work, sliced.
7. The remaining reviews - [Adversarial Review](./5-reviews/adversarial-review.md), [PRD Validation Report](./5-reviews/prd-validation-report.md), and [Risk Register and Pre-Mortem](./5-reviews/risk-register-and-premortem.md) - the case against, the conditions, and the kill criteria.

## How this was built

Each phase was grounded in the one before it. Research grounded analysis, analysis grounded planning, planning grounded solutioning, solutioning grounded implementation. Every phase was web-researched against the source base of 154 sources, and figures that are vendor self-reports, advocacy estimates, or forecasts are labeled "(estimate)" so the soft numbers stay marked as soft. Each phase was adversarially reviewed before the next one started, so a weak claim was caught and corrected rather than inherited. That discipline is why the architecture openly contradicts the PRD on the single largest technical claim (the Crop Plan does not exist in the schema) instead of carrying it forward unexamined.

## Current gate status

All four reviews land on the same verdict: go-with-conditions.

- **PRD validation: go-with-conditions** (Grade: Good). Strong, honest PRD. The Savings-Attribution gate cleanly bounds monetization, FR testability and Glossary discipline are solid. Conditions: add Success Metric coverage for four user-facing FRs (FR-3 BoM forecast, FR-4 Buy Window Calendar, FR-10 Prepay timing, FR-14 committed-spend-vs-budget) and resolve the retention-window and deletion-SLA NOTE FOR PM with concrete numbers.
- **Implementation readiness: go-with-conditions.** Coherent, fully traced package with 100 percent FR coverage (17 of 17) and a verified architecture, ready to build on its critical path. Gated by the Crop Plan model (a blocker scoped to Epic 3 only) and the unsolved Savings Attribution method (monetization only, does not block Epics 1 to 7). Four documents that assert the Crop Plan is reused from Tool 1 must be corrected.
- **Adversarial review: go-with-conditions.** The v1 engine is genuinely buildable on the proven Tool 1 stack. One hard schema blocker (the Crop Plan does not exist) and several load-bearing business unknowns (single-grower band coverage, savings attribution, dealer density) must be closed before the epics that depend on them start. The architecture self-criticism verifies against the real repo and is accurate, not performative.
- **Pre-mortem: go-with-conditions.** v1 is buildable and worth doing as the evidence-gathering step, but every dollar of revenue and the product's headline live in deferred POST-MVP work. The real risks are business-model and trust-timing, not technical. Three kill criteria define when to stop: no clean billable attribution after a full closed-loop season; a single-grower band structurally too thin with no honest reference-price fallback; or uniform rejection of the tool by the grower-PCA pilot circle as "the app that fights your dealer."

The shared blocker across reviews is the Crop Plan: the energy `Crop` model has no program or growth stage, so FR-3 and FR-4 (and the Buy Window Calendar home view) cannot be built as written. Architecture section 4.6 offers two scoped fixes (a net-new `CropProgram` plus grower-supplied ingestion, or a repeat-buy projection from prior Invoices). That decision must be taken before Epic 3 is scheduled. The shared monetization gate is Savings Attribution: until it is solved, only under-credited Rebate recovery is cleanly attributable, so v1 ships free and builds the immutable lineage track record toward an eventual gain-share model.
