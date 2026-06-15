---
title: Terra Purchasing Agent PRD Validation Report
status: complete
created: 2026-06-14
owner: Jaiyen
project: Terra
---

# Validation Report: Terra Purchasing Agent PRD

- **PRD:** `/Users/panda/Terra/_bmad-output/purchasing-agent/2-planning/prd.md`
- **Checklist:** `/Users/panda/Terra/.claude/skills/bmad-prd/assets/prd-validation-checklist.md`
- **Run at:** 2026-06-14
- **Gate:** go-with-conditions
- **Grade:** Good

## Overall verdict

This is a strong, honest PRD. It has a clear thesis (legibility before action, the buyer that works for the farm not the store), feature prioritization that follows from the thesis, and a discipline of naming what it gives up. The Savings Attribution gate on monetization is handled with unusual rigor: it is defined in the Glossary, raised as the load-bearing Open Question, stated as the Monetization prerequisite, encoded into the SM-1 / SM-1b split, and listed as a Non-Goal and a Risk. FR consequences are testable, the Glossary holds verbatim across the document, IDs are contiguous, and every User Journey carries a named protagonist. The one real gap is reverse traceability: seven of the seventeen FRs have no Success Metric that points back at them, which weakens the "every requirement earns its place" claim. The retention window and a deletion SLA are the only genuinely soft items, and both already carry a `[NOTE FOR PM]`. Clear these two conditions and the PRD is build-ready.

## Dimension verdicts

- Decision-readiness: strong
- Substance over theater: strong
- Strategic coherence: strong
- Done-ness clarity: adequate
- Scope honesty: strong
- Downstream usability: adequate
- Shape fit: strong

## Findings by severity

### Critical (0)

None.

### High (0)

None.

### Medium (3)

**[Downstream usability] Seven FRs have no Success Metric validating them (§7, lines 404-413)**
The SM-to-FR direction is clean: every "Validates" clause resolves to a real FR. The reverse direction is not. FR-3 (Bill of Materials forecast), FR-4 (Buy Window Calendar), FR-5 (per-unit normalization), FR-7 (Generic Equivalent), FR-10 (Prepay timing), FR-14 (Committed spend vs budget), and FR-17 (Review queue) appear in no SM's "Validates" list. FR-5 is the foundation under FR-6 and FR-8 and so is validated transitively, and FR-17 is correctly excluded from savings counts by design (line 342), so those two are defensible. But FR-3, FR-4, FR-10, and FR-14 are user-facing capabilities with no measurement attached. A reader cannot tell what "done and working" looks like for the forecast or the calendar at the product level.
*Fix:* Either add coverage to existing SMs (for example, fold FR-3 and FR-4 into SM-3 Activation or a new forecast-usefulness metric, and FR-14 into SM-5 Coverage), or add one line stating that some FRs are enabling capabilities validated indirectly and naming which. Open Question #7 (Crop Plan completeness, line 429) already gestures at an FR-3 measure; connect it.

**[Done-ness clarity] Retention window and deletion SLA are unbounded (§Data Governance, line 518)**
"retain the grower's Invoices and derived records for as long as needed" is the one place an adjective stands in for a bound. The `[NOTE FOR PM]` already flags it, which is the right move, but it remains an open decision that touches privacy posture and the credential-discipline brand promise. This is a condition to clear before build, not a defect in the PRD's reasoning.
*Fix:* Resolve the `[NOTE FOR PM]`: state a concrete retention window (for example, current plus N prior seasons) and a deletion turnaround, or move it to Open Questions with a named owner so it does not get lost.

**[Strategic coherence] Per-acre savings figure is directional and not yet a measured number (§1 line 17, §8 #2 line 424)**
The PRD is admirably honest that the 5-to-10-percent capture of the roughly $800/acre slice is directional and must be replaced by a measured number from real Batth-shaped Invoices. This honesty is a strength, not a flaw. It is flagged Medium only because the entire savings narrative, SM-1, and the eventual Gain-share rest on it, so it should not slip. The PRD already routes it correctly through SM-1's "defensible number, not a vendor headline" target and SM-C1's guard against gaming.
*Fix:* No PRD change required. Ensure Open Question #2 stays owned and gated to the first real-invoice run, since it feeds the figure the whole product is sold on.

### Low (2)

**[Downstream usability] SM-3 lists FR-11 but reads as an activation-of-legibility metric (§7 line 407)**
SM-3 (Activation) validates FR-1, FR-2, FR-13, and FR-11. FR-11 (surface findings as Recommendations) is the right include because the metric ends at "first dollar finding," but the connection is implicit. Minor.
*Fix:* Optional. A half-clause ("first finding surfaced as a Recommendation, FR-11") would make the chain explicit.

**[Scope honesty] Open-items density is moderate-to-high for a green-light PRD (7 Open Questions, 8 Assumptions, 3 `[NOTE FOR PM]`)**
Counted relative to stakes (a new revenue-bearing Tool 2), the density is reasonable and each item is real, not rhetorical. Open Question #1 (Savings Attribution) and #2 (per-acre savings) are genuinely load-bearing and correctly gated. Flagged Low only so the team tracks that two of these (attribution, per-acre figure) gate monetization and must be resolved before any billing, which the PRD already states.
*Fix:* None required. The PRD's own gating language (lines 366, 395, 461) already prevents these from being silently assumed-resolved.

## Checklist dimension detail

### FR testability: strong
Every FR carries a "Consequences (testable)" block with verifiable conditions (structured-record extraction at FR-1 line 144, exact-one-Entity-and-Account resolution at FR-2 line 154, same-Active-Ingredient collapse at FR-5 line 196, "no reliable band yet" suppression at FR-6 line 206 and FR-8 line 229, threshold-crossing rebate detection at FR-9 line 243, grammar conformance at FR-11 line 266, 180-plus-line usability at FR-13 line 291, obligating-event definition of Committed spend at FR-14 line 301, immediate revoke at FR-15 line 318). No "handles X gracefully," "reasonable performance," or "user-friendly" appears in any FR. The only soft adjective in the document ("as long as needed," line 518) sits in Data Governance retention and is already `[NOTE FOR PM]`-flagged.

### Glossary discipline: strong
The Glossary (§3, lines 92-127) defines every domain noun and the FRs, UJs, and SMs use them verbatim. Self-flagged drift terms hold: "program sheet" and "dealer sheet" appear only on the line that forbids them (line 106), never in use. "retailer" appears only where the Glossary explicitly permits it in prose (lines 17, 44, 100, 103), never as a structured term. The Committed spend obligating-event definition is consistent between the Glossary (line 118) and FR-14 (line 301). Cardinalities are stated (SKU-to-Active-Ingredient line 98, Farm-to-Entity line 113). Zero em dashes, zero exclamation marks across the document.

### UJ coverage: strong
Five UJs, each with a named protagonist (Harjit the grower, Manpreet the PCA), entry state, path, climax, resolution, and an edge case. Every UJ is realized by at least one FR via an inline "Realizes UJ-N" tag, and the mapping is complete: UJ-1 (FR-1, FR-2, FR-5, FR-6, FR-8, FR-11, FR-13), UJ-2 (FR-9, FR-11, FR-12, FR-17), UJ-3 (FR-3, FR-4, FR-6, FR-7, FR-8, FR-10, FR-11, FR-12), UJ-4 (FR-15, FR-16), UJ-5 (FR-2, FR-13, FR-14). No floating UJ, no FR orphaned from a journey. The UJ-1 and UJ-2 edge cases are explicitly realized by FR-17 (line 336). Shape fit is correct: a multi-stakeholder B2B product where UJs are load-bearing, and they carry their weight.

### Scope clarity: strong
The single best-handled dimension. POST-MVP work is fenced three times over and never described as shipping: §4.10 (lines 347-356, each `[NON-GOAL for MVP]`), §5 Non-Goals (lines 358-368), and §6.2 Out of Scope (lines 387-396), with consistent rationale across all three. The line between v1 and the destination is drawn inside individual FRs too (FR-7 line 215 "does not quote, source, or order," FR-11 line 267 "never performs a purchase"). Non-Users (§2.2) names who v1 does not serve and why. The `action`-field-shaped-for-later-execution discipline is stated and then re-confirmed as absent in v1 (FR-11 line 269).

### Measurable success metrics with counter-metrics: strong
Six SMs plus a deliberate SM-1 / SM-1b split that separates identified (potential, pre-action) savings from attributed realized (loop-closed, "verified") savings, which is the honest core of the whole product. Three counter-metrics are present and each counterbalances a named primary: SM-C1 guards SM-1 against a gamed Market Band (watch the SM-1-to-SM-1b gap), SM-C2 guards SM-3 activation speed against accuracy, SM-C3 guards against Recommendation-volume gaming of FR-11. This is exactly the "don't optimize the wrong thing" discipline the checklist asks for. The word "verified" is reserved for SM-1b throughout (lines 19, 365, 405, 417), never leaking to the pre-action number.

### Savings-attribution gates monetization: strong
The condition the validation specifically asked to check is met cleanly. Savings Attribution is defined (Glossary line 124), raised as the load-bearing Open Question #1 with explicit gating language "the prerequisite for any Gain-share billing and gates the entire monetization model" (line 423), stated as the Monetization-cluster prerequisite "a gate on the entire revenue model, not a detail to settle later" (line 461), encoded into SM-1b ("Overpayment-versus-band is only counted here once attribution is solved," line 405), listed as a Non-Goal ("does not bill Gain-share in v1, because clean Savings Attribution is not yet solved," line 366), carried in §6.2 ("Gain-share billing. Deferred until Savings Attribution is solved," line 395), surfaced as a High risk row (line 508), and recorded in the Assumptions Index (line 440). The chain from open unknown to deferred revenue is unbroken and consistent. Monetization cannot be billed without it, and the PRD says so in every place it would matter.

## Mechanical notes

- **ID continuity: clean.** FR-1 through FR-17 contiguous, no gaps or duplicates. UJ-1 through UJ-5 contiguous. SM-1, SM-1b, SM-2 through SM-6, plus SM-C1 through SM-C3. All `Realizes` and `Validates` cross-references resolve to existing IDs.
- **Cross-document references resolve.** All four upstream documents the PRD cites exist on disk: product-brief.md, prfaq.md, market-research.md (in `1-analysis/`), and clone-target-and-ai-thesis.md (in `0-research/`). CLAUDE.md path resolves.
- **Assumptions Index roundtrip: adequate.** The §9 index (lines 431-442) captures the structural assumptions and points each to its originating section. The inline-tag-to-index roundtrip is looser than strict BMAD form (the PRD uses prose "From §X" attributions rather than literal `[ASSUMPTION: ...]` inline tags), but no assumption is silently buried and the index is honest about what is inferred-not-confirmed.
- **`[NOTE FOR PM]` placement: good.** Three callouts, all at real tensions: the headline-honesty tension (line 389), the retention window (line 518), and they sit at genuine deferred decisions, not safe checkpoints.
- **Required sections present** for a chain-top revenue-bearing PRD: Vision, Target User with JTBD, UJs, Glossary, Features with FRs, Non-Goals, MVP Scope, Success Metrics, Open Questions, Assumptions Index, plus Adapt-In clusters (Why Now, Monetization, Platform, IA, Constraints, Risk, Data Governance).

## Conditions to clear before build

1. Add Success Metric coverage (or an explicit enabling-FR note) for FR-3, FR-4, FR-10, and FR-14 so every user-facing capability has a measured definition of done (§7).
2. Resolve the retention-window and deletion-SLA `[NOTE FOR PM]` with concrete numbers, or promote it to a tracked Open Question (§Data Governance line 518).
