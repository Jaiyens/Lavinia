// The crop-production calculation engine (spec Section 5.3). Every yield/turnout/loss/payable/
// available figure Terra computes for itself lives here as a PURE function of integer pounds — no
// model, no DB, no clock — so it is provably correct and testable to the pound. This mirrors the
// discipline of src/lib/energy (pure math, no UI/DB coupling) and src/lib/crops/pound-gate.ts.
//
// Hard integrity rules encoded here (Section 4):
//  - Deterministic code owns every number. The AI model NEVER emits a poundage or a ratio; it only
//    parses structure. These functions are the sole source of a computed crop figure.
//  - Turnout that Almond Logic itself reports (loadRuns' r.turnout) is the SOURCE's own figure and
//    is passed through verbatim elsewhere; turnoutPct() here is Terra's independent recomputation
//    from field + huller weights for the reporting dashboard's computed column. They are distinct.
//  - The grade-deduction rate is NEVER hard-coded (no literal 0.97 anywhere). It is passed in;
//    DEFAULT_GRADE_DEDUCTION_RATE is only a starting default, editable per record / per packer.
//
// Ratio functions return a fraction in ~[0, 1+] (e.g. 0.1727), NOT a percentage — the UI renders
// x100. Every ratio guards divide-by-zero and missing inputs by returning null (an honest "no
// answer"), never 0 or a guess (Section 4 rule 6: show "insufficient data", never fabricate).

/**
 * The default grade deduction rate (Column K on Gagan's sheet, "roughly 3 percent"). A DEFAULT
 * only — stored editable per TgmRecord / per packer, never hard-coded into the payable math. Jorge
 * was uncertain about the exact K<->L interplay, so payableLbs() takes the rate as an argument and
 * this constant is merely the seed value a form pre-fills. Do NOT bake 0.97 into any formula.
 */
export const DEFAULT_GRADE_DEDUCTION_RATE = 0.03;

/**
 * Turnout: deliverable almonds as a fraction of what was delivered to the huller.
 * hullerWeightLbs / fieldWeightLbs (Column I / Column F). This is the deliverable-almonds figure.
 * Returns null when fieldWeightLbs <= 0 (divide-by-zero / missing input) — never a fabricated 0.
 * Render as a percent (x100) at the edge. Golden fixture: 109,000 / 631,000 = 0.1727 (~17.3%).
 */
export function turnoutPct(hullerWeightLbs: number, fieldWeightLbs: number): number | null {
  if (!Number.isFinite(hullerWeightLbs) || !Number.isFinite(fieldWeightLbs)) return null;
  if (fieldWeightLbs <= 0) return null;
  return hullerWeightLbs / fieldWeightLbs;
}

/**
 * Sellable percent: the fraction the customer actually pays on. tgmLbs / hullerWeightLbs
 * (Total Good Meats over huller weight). Distinct from turnout: turnout is off field weight, this
 * is off huller weight. Returns null when hullerWeightLbs <= 0 (missing input), never a guess.
 */
export function sellablePct(tgmLbs: number, hullerWeightLbs: number): number | null {
  if (!Number.isFinite(tgmLbs) || !Number.isFinite(hullerWeightLbs)) return null;
  if (hullerWeightLbs <= 0) return null;
  return tgmLbs / hullerWeightLbs;
}

/**
 * Year-over-year field weight: currentLbs / priorLbs (Column G). Returns null CLEANLY when there
 * is no comparable prior year (priorLbs <= 0 or missing) — the first year a block exists has no
 * YoY, and that is an honest null, not a 1.0 or a 0. Golden fixture: 631,000 / 493,000 = ~1.28
 * (a ~28% increase; Jorge stated "1.279, a 27.9 percent increase").
 */
export function yoyFieldWeight(currentLbs: number, priorLbs: number): number | null {
  if (!Number.isFinite(currentLbs) || !Number.isFinite(priorLbs)) return null;
  if (priorLbs <= 0) return null;
  return currentLbs / priorLbs;
}

/**
 * Huller weight minus Total Good Meats — the loss between the huller weight and the packer's good
 * meats (Column L). Pure integer subtraction; may be any sign but is normally positive. No guard
 * needed (subtraction has no divide-by-zero); NaN in -> NaN is prevented by the finite check.
 */
export function hullerToTgmLoss(hullerWeightLbs: number, tgmLbs: number): number {
  if (!Number.isFinite(hullerWeightLbs) || !Number.isFinite(tgmLbs)) return NaN;
  return hullerWeightLbs - tgmLbs;
}

/**
 * Payable pounds: tgmLbs * (1 - gradeDeductionRate), rounded to whole pounds (money law: integers).
 * The rate is ALWAYS supplied by the caller (Section 4 rule 4 / "What not to do" #4 — never
 * hard-code the deduction). Jorge flagged the exact K<->L interplay as unconfirmed against Gagan's
 * live sheet, so this is the documented default formula, not a verified truth: confirm before
 * trusting the payable output. A rate of 0 returns tgmLbs unchanged.
 */
export function payableLbs(tgmLbs: number, gradeDeductionRate: number): number {
  if (!Number.isFinite(tgmLbs) || !Number.isFinite(gradeDeductionRate)) return NaN;
  return Math.round(tgmLbs * (1 - gradeDeductionRate));
}

/**
 * Available pounds: netGoodMeatsLbs - committedLbs - soldLbs (the pool of uncommitted, unsold
 * meats). Returned HONESTLY: it may be negative (oversold), and it is NEVER clamped to 0 — the same
 * discipline as Position.unsoldPounds. A negative result is an oversell that must be FLAGGED, not
 * hidden; callers use isOversold() to surface it. Pure integer subtraction.
 */
export function availableLbs(
  netGoodMeatsLbs: number,
  committedLbs: number,
  soldLbs: number,
): number {
  if (
    !Number.isFinite(netGoodMeatsLbs) ||
    !Number.isFinite(committedLbs) ||
    !Number.isFinite(soldLbs)
  ) {
    return NaN;
  }
  return netGoodMeatsLbs - committedLbs - soldLbs;
}

/**
 * True when an available-pounds figure is an oversell (negative). Makes the "never let it go
 * negative silently — flag it" rule (Section 5.3) explicit and testable, without clamping the
 * honest number availableLbs() returns.
 */
export function isOversold(availablePounds: number): boolean {
  return Number.isFinite(availablePounds) && availablePounds < 0;
}
