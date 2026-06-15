---
title: Executive Summary - Terra Purchasing Agent
status: draft
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Executive Summary: Terra Purchasing Agent

This is the single page that explains what was produced autonomously and what to do next. Read it first.

## 1. What this is

The Terra Purchasing Agent is the buyer that works for the farm, not the store: it makes a grower's input spend legible, shows where they overpaid and what rebates they are owed, and earns the right to act later. The thesis is to clone Farmers Business Network's proven price-transparency wedge and beat it with an AI-native, farmer-side agent on the axis FBN structurally cannot follow, because FBN is a seller and we are the grower's independent agent.

## 2. Why now

Five tailwinds line up at once. Margins are negative (almond net returns swung from +$205/acre in 2019 to roughly a $4,280/acre loss in 2024, against a full cost base near $5,000 to $6,500/acre; the input slice this tool works is the roughly $800/acre fertilizer-and-crop-protection line). Working capital is strained (2025 operating loans roughly 30 percent larger year over year, first-year interest up 70 to 90 percent, Chapter 12 bankruptcies up 46 percent to 315). FBN is contracting out of the specialty lane, leaving the independent non-seller position open. Agentic-commerce rails are arriving (ACP, Visa and Mastercard agent payments, Ever.Ag freight agents), which makes the later auto-PO leg buildable when its turn comes. And a bipartisan Fertilizer Transparency Act would force USDA to publish weekly prices, validating the thesis at the policy level. Crop inputs were $72.2B, or 28.6 percent of crop-farm total expenses, in 2024: the largest controllable cost and the one the grower can see least.

## 3. What v1 is (and what it is not)

v1 is legibility plus a grower-side rebate-and-prepay audit, built entirely from the grower's own documents, human-in-the-loop, every Recommendation display-only. It ingests historical invoices (photo, PDF, email forward) and the crop plan, attributes every line to a ranch, entity, and account, normalizes each line to a per-unit same-active-ingredient Market Band, flags overpayment and under-credited rebates, forecasts a bill of materials, and gives one cross-entity spend-versus-budget ledger. It arms the PCA with read-only visibility rather than routing around them.

Explicitly POST-MVP, and never described as shipping now: live cross-supplier scouting, agentic negotiation and RFQ, auto-PO and delivery tracking, attached financing, true delegated auto-buy, and any cross-grower price pooling or public benchmark. The name oversells a v1 that buys nothing; keep internal messaging honest that v1 is legibility plus audit, not an autonomous buyer.

## 4. How it monetizes (and the one prerequisite)

Gain-share: Terra is paid only as a share of realized savings, free to start, which removes the segment's biggest adoption blocker (prove the ROI before I pay). One prerequisite gates all billing: Savings Attribution, a clean and auditable method to prove a saved dollar is the agent's doing and not the grower's own dealer haggling. Until that method exists, gain-share cannot be honestly billed. So v1 is free by design, and its job is to build the immutable, invoice-level, loop-closed track record that makes clean attribution possible. Under-credited rebate recovery is the one cleanly attributable case today; overpayment-versus-band is not billable until the method is solved.

## 5. The plan

Seven v1 epics, each standalone and on the critical path: (1) connect a source and see attributed spend, (2) the internal Review queue that holds low-confidence work out of the numbers, (3) forecast the season from the crop plan, (4) normalize and show against the Market Band, (5) turn findings into display-only Recommendations and close the loop, (6) cross-entity spend control, (7) arm the advisor. Epic 8 (scout, negotiate, act) is named only so the destination is visible and never mistaken for v1. All 17 FRs map to one epic and one story each (100 percent coverage). Foundation stories are drafted: Story 1.1 stands the tool up on Terra's existing shared data model (Farm, Entity, Ranch/Block, Crop, Account, the Recommendation grammar), reusing the Tool 1 OS shell, vision-extraction discipline, and credential discipline. It lands as Tool 2 inside the same Next.js + TypeScript + Prisma + Postgres app, with pure math in a new src/lib/procurement modeled on src/lib/energy, so the eventual monorepo move stays mechanical.

## 6. Decisions that need you

- **The Crop Plan model (hard blocker, Epic 3 only).** The "Crop Plan" the forecast depends on does not exist in the schema. The real Crop is {id, name, cropCoefficient, blocks, ranches, pumps}, with no program and no growth stage, so the forecast formula (acres x crop x program x growth stage) has nothing to read. Architecture section 4.6 gives two scoped paths: (a) model a net-new CropProgram with a grower-supplied ingestion step, or (b) ship a repeat-buy projection from prior-season invoices first. The recommendation is (b) first, (a) later. Decide before Epic 3 starts. Four documents falsely assert the Crop Plan is reused from Tool 1 (PRD section 8 #7, the PRD Assumptions Index, Story 3.1, and UX 2.3) and need correcting.
- **The Savings Attribution method (gates all revenue).** Nobody proposed a method, only the evidence trail v1 builds. Make it a dated, owned item now. It does not block any of Epics 1 through 7; it blocks billing.
- **Design partners.** Line up two or three real growers and their PCAs from Terra's existing energy customers, to run the band against a real Batth-shaped export and pressure-test the arm-the-advisor posture.

## 7. Validation verdicts (the gates)

- **PRD validation: go-with-conditions.** Strong, honest PRD; attribution gates monetization cleanly throughout. Conditions: add Success Metric coverage for four user-facing FRs (FR-3, FR-4, FR-10, FR-14), and resolve the unbounded data-retention and deletion-SLA note before launch.
- **Implementation readiness: go-with-conditions.** Coherent, fully-traced, 100 percent FR coverage, architecture verified against the real repo. Ready to build on its critical path, gated by the Crop Plan model (one epic) and unsolved attribution (monetization only).
- **Adversarial review: go-with-conditions.** The v1 engine is genuinely buildable on the proven Tool 1 stack. Three load-bearing business unknowns must be settled with evidence before the dependent epics: the single-grower band may be too thin to flag overpayment credibly, attribution caps the day-one billable surface to rebate recovery only, and dealer density may cap scouting. Plus the Crop Plan schema blocker.
- **Pre-mortem: go-with-conditions.** v1 is worth doing as the evidence-gathering step, but every dollar of revenue and the product's headline live in deferred POST-MVP work; the real risks are business-model and trust-timing, not technical. Three kill criteria: no clean billable attribution after a full closed-loop season, the single-grower band is too thin with no honest fallback, or the grower-PCA pilot circle uniformly rejects the tool as the app that fights your dealer.

## 8. Recommended next three steps

1. **Make the Crop Plan call before Epic 3.** Pick path (b) (repeat-buy projection from prior invoices) to unblock the calendar on real data now, with (a) (net-new CropProgram) as the path to the full agronomic forecast later. Correct the four documents that wrongly call the Crop Plan reused. Epics 1, 2, and 4 can start immediately and do not wait on this.
2. **Run the band against the real Batth export.** Measure what fraction of spend gets a reliable single-grower band versus what comes from clean rebate-audit dollars. This settles the two biggest business unknowns (band thinness and the day-one billable surface) on real data, not in theory, and tells us whether single-grower is a viable launch posture.
3. **Open the attribution and partner workstreams.** Name a dated owner for the Savings Attribution method, and line up two or three energy customers and their PCAs as design partners to pressure-test legibility, the rebate audit, and the arm-the-advisor posture before scaling.
