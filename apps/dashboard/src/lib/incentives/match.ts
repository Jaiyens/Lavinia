// The pure incentive matcher: over a farm's already-persisted meters, run every catalog
// program's deterministic eligibility predicate and emit an honest-blank, display-only
// Recommendation for each (meter, program) hit. Mirrors the demand-response / solar finding
// builders' shape (draftRecommendation, tool tag, params carrying the identity), with ONE
// deliberate difference: there is NO dollar. A rebate's value needs interval data and the
// deterministic engines this agent never runs, so impactUsd is always undefined and the
// program note lives in impactNote - the same honest-blank treatment the solar demand insight
// uses for money that is owed-not-at-stake.
//
// DE-DUPE against the existing findings (the brief's "EXCLUDE any case the demand-response /
// solar finding already routes"):
//   - dr.ts (FR-18) surfaces a DR program the bill ALREADY prints as info. We compute that
//     same drEnrollment here and the catalog's curtailment rows (PDP/CBP/BIP) require
//     enrolledDrProgram === null, so we never re-surface an enrollment the grower already has.
//   - solar-nem.ts (FR-15) surfaces the "solar does not cover the demand charge" insight for
//     AG-C solar meters. The SGIP row is a DIFFERENT subject (a storage rebate, not the demand
//     charge) so it does not duplicate that insight; it is intentionally allowed to co-exist.
//
// Pure: no DB, no clock, no IO, no LLM. The DB edge (run-incentives.ts) loads meters + the
// rate card and passes them in. Colocated tests in match.test.ts.

import { en } from "@/copy/en";
import { draftRecommendation } from "@/lib/recommendations";
import type { DraftRecommendation } from "@/lib/recommendations";
import { drEnrollment } from "@/lib/energy/dr";
import type { RateCard } from "@/lib/energy/rates";
import { INCENTIVE_CATALOG, type IncentiveMeterFacts } from "./catalog";

/** The `tool` tag on every recommendation this module emits (mirrors SOLAR_TOOL). */
export const INCENTIVE_TOOL = "rebate";

/** One printed billing line item the matcher reads (for the DR de-dupe only). */
export type IncentiveLineItem = { label: string | null };

/**
 * The meter projection the matcher needs: identity, the facts the predicates read, plus the
 * printed line items (so this module computes enrolledDrProgram itself, owning the dr.ts
 * de-dupe rather than trusting a caller-supplied flag).
 */
export type IncentiveMeter = {
  id: string;
  name: string;
  scheduleLabel: string | null;
  isSolar: boolean;
  lineItems: readonly IncentiveLineItem[];
};

export type MatchIncentivesInput = {
  farmId: string;
  meters: readonly IncentiveMeter[];
  card: RateCard;
  /** The analysis reference timestamp; becomes each draft's createdAt (no clock here). */
  asOf: string;
};

/**
 * Match every catalog program against every meter and return the honest-blank drafts. Stable
 * order: meters in input order, programs in catalog order, so the output (and the dedupe key
 * stream) is deterministic. impactUsd is NEVER set; the program note is the only money-shaped
 * field, and it carries no dollar.
 */
export function matchIncentives(input: MatchIncentivesInput): DraftRecommendation[] {
  const drafts: DraftRecommendation[] = [];
  const ctx = { card: input.card };

  for (const meter of input.meters) {
    const facts: IncentiveMeterFacts = {
      scheduleLabel: meter.scheduleLabel,
      isSolar: meter.isSolar,
      // The dr.ts de-dupe: a program the bill already prints is owned by the DR info finding.
      enrolledDrProgram: drEnrollment(meter.lineItems),
    };

    for (const program of INCENTIVE_CATALOG) {
      if (!program.eligible(facts, ctx)) continue;
      drafts.push(
        draftRecommendation({
          tool: INCENTIVE_TOOL,
          farmId: input.farmId,
          severity: "watch",
          createdAt: input.asOf,
          situation: en.agents.incentives.situation(meter.name, program.name),
          // No impactUsd. The note explains the program in plain English, no dollar.
          impactNote: en.agents.incentives.programNote(program.name),
          action: {
            kind: "review_incentive",
            label: en.agents.incentives.action(),
            params: {
              pumpId: meter.id,
              programId: program.id,
            },
            execute: null,
          },
        }),
      );
    }
  }

  return drafts;
}
