// The rebate / incentive catalog: a SMALL, static, committed list of real California
// agricultural energy programs, each carrying a DETERMINISTIC eligibility predicate over a
// meter's already-persisted facts (its rate-plan family, whether it is solar, and the DR
// programs its printed bill already names). No dollars, no clock, no IO, no LLM. This is the
// generalization of the demand-response info finding (src/lib/energy/dr.ts): instead of
// reading the program OFF the printed bill, we MATCH the meter to programs it could enroll
// in, surfaced as honest-blank, display-only Recommendations (the dollar is never invented -
// a real saving needs interval data and the deterministic engines, which this agent does not
// run).
//
// FUTURE (fenced): an LLM catalog-ingestion pass could read PG&E / CPUC / CEC program PDFs
// and PROPOSE new catalog rows (program id, plain-English copy, the structured eligibility
// it parsed) for a human to commit here. That is deliberately NOT built: v1 is a hand-curated
// static catalog so every emitted finding traces to a row a person wrote and checked. No
// network, no model construction, no gateway call ever happens in this module.

import { planFromLabel } from "@/lib/energy/rate-lever";
import type { DrProgram } from "@/lib/energy/dr";
import type { RateCard } from "@/lib/energy/rates";

/**
 * The meter facts an eligibility predicate reads. A deliberately SMALL projection of the
 * canonical MeterView so the catalog stays pure and trivially testable (no Prisma type, no
 * full view). The DB edge maps a MeterView down to this.
 */
export type IncentiveMeterFacts = {
  /** The meter's stored schedule label, as the bill prints it (e.g. "AGC Ag35+ kW High Use"). */
  scheduleLabel: string | null;
  /** Whether the meter is NEM solar (the importer flags this). */
  isSolar: boolean;
  /**
   * The DR program this meter's printed bill ALREADY names, or null. Computed by the DB edge
   * via drEnrollment() over the meter's billing line items. A program the bill already prints
   * is INFORMATION the dr.ts path owns; the catalog never re-flags an enrollment the grower
   * is already in (the de-dupe against the existing DR finding).
   */
  enrolledDrProgram: DrProgram | null;
};

/** The shared context every predicate may read (the rate card, for plan-family parsing). */
export type IncentiveContext = {
  card: RateCard;
};

/**
 * One catalog program. `id` is the stable identity used for resolved-finding dedupe and
 * never changes once shipped. `eligible` is a PURE predicate: same facts in, same boolean
 * out, no IO. `drProgram` (when set) is the DR program this catalog row corresponds to, so
 * the matcher can skip a row whose enrollment the bill already prints (the dr.ts overlap).
 */
export type IncentiveProgram = {
  /** Stable machine id (kebab); the dedupe key half. */
  id: string;
  /** Plain-English program name for the situation line. */
  name: string;
  /**
   * The DR program this row maps to, when it is one. Used ONLY to skip the row when the
   * meter's bill already prints that enrollment (so the catalog never duplicates the
   * dr.ts info finding). null for non-DR programs (e.g. SGIP storage).
   */
  drProgram: DrProgram | null;
  /** Deterministic eligibility over a meter's persisted facts. */
  eligible: (facts: IncentiveMeterFacts, ctx: IncentiveContext) => boolean;
};

/**
 * The AG-C family is PG&E's demand-metered large-ag schedule (35+ kW). Programs that pay for
 * curtailing or limiting evening demand are scoped to it, mirroring the demand/solar findings'
 * AG-C gate. Returns false on an unknown / unmapped label - eligibility is never guessed.
 */
function isDemandMeteredFamily(facts: IncentiveMeterFacts, ctx: IncentiveContext): boolean {
  if (facts.scheduleLabel === null) return false;
  const plan = planFromLabel(facts.scheduleLabel, ctx.card, null);
  return plan !== null && plan.family === "AG-C";
}

/**
 * The committed catalog. Kept SMALL and real: four PG&E / CA ag programs a Batth-class
 * grower could plausibly enroll in. Each predicate reads only persisted facts.
 *
 *  - pge-pdp  Peak Day Pricing: a voluntary day-of program that credits curtailment on event
 *             days. Eligible for a demand-metered (AG-C) meter whose bill does NOT already
 *             print a PDP enrollment (that exact case is the dr.ts info finding).
 *  - pge-cbp  Capacity Bidding Program: a third-party-aggregated curtailment program for
 *             demand-metered meters; suppressed only when the bill already prints CBP.
 *  - pge-bip  Base Interruptible Program: a firm interruptible-load program for demand-metered
 *             meters; suppressed only when the bill already prints BIP.
 *  - ca-sgip  Self-Generation Incentive Program (storage note): a rebate for adding on-site
 *             storage. Surfaced for a SOLAR meter (a storage pairing the grower already has
 *             the generation for), as a forward-looking note distinct from the solar-nem
 *             demand insight (which explains the demand charge, not a storage rebate).
 *
 * The DR de-dupe is PER-PROGRAM: an enrollment the bill prints suppresses ONLY the matching
 * catalog row (the exact case dr.ts already routes), never the sibling curtailment programs -
 * a grower already on PDP can still be a candidate for CBP or BIP.
 */

/**
 * A demand-metered curtailment program is eligible for an AG-C meter UNLESS the meter's bill
 * already prints THIS program's enrollment (which the dr.ts info finding owns). `program` is
 * the DrProgram this row corresponds to.
 */
function curtailmentEligible(
  program: DrProgram,
): (facts: IncentiveMeterFacts, ctx: IncentiveContext) => boolean {
  return (facts, ctx) =>
    isDemandMeteredFamily(facts, ctx) && facts.enrolledDrProgram !== program;
}

export const INCENTIVE_CATALOG: readonly IncentiveProgram[] = [
  {
    id: "pge-pdp",
    name: "PG&E Peak Day Pricing",
    drProgram: "pdp",
    eligible: curtailmentEligible("pdp"),
  },
  {
    id: "pge-cbp",
    name: "PG&E Capacity Bidding Program",
    drProgram: "cbp",
    eligible: curtailmentEligible("cbp"),
  },
  {
    id: "pge-bip",
    name: "PG&E Base Interruptible Program",
    drProgram: "bip",
    eligible: curtailmentEligible("bip"),
  },
  {
    id: "ca-sgip",
    name: "California Self-Generation Incentive Program for storage",
    drProgram: null,
    eligible: (facts) => facts.isSolar,
  },
] as const;
