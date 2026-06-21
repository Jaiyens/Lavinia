// Tunable thresholds for the Meters demand-risk board, in ONE place so a product tweak (how
// close is "danger"?) never means hunting through components. PURE constants only - no rate-card
// read here, so this module is safe to import from client components. The $/kW lookup (which
// reads the committed card via node:fs) lives in the server-only rate.ts, imported only by the
// feed. User-facing copy is in src/copy/en.ts under en.meters.

/**
 * Risk bands by HEADROOM FRACTION (headroom / peakSoFar), per meter. Headroom is the gap
 * between a meter's peak-so-far this cycle and its current draw; a SMALL fraction means the
 * current draw is right under the ceiling and one push sets a new, costlier peak.
 *
 * - safe:    plenty of room below the peak (>= warnFraction of the ceiling free).
 * - watch:   closing in (between dangerFraction and warnFraction free).
 * - danger:  right under the ceiling (< dangerFraction free) - one spike resets the peak.
 *
 * A meter currently ABOVE its old peak (negative headroom) is already setting a new peak:
 * that is the most urgent state of all and maps to "danger" in classifyRisk.
 */
export type RiskLevel = "safe" | "watch" | "danger";

// Bands chosen against the brief's two anchor cases: a pump at 180 kW that already peaked at
// 200 (10% headroom) must read SAFE, while a pump at 145 kW under a 150 ceiling (3.3% headroom)
// must read DANGER. So "watch" begins under 8% free and "danger" under 4% free - tight enough
// that only a meter genuinely hugging its ceiling lights up.
export const RISK_CONFIG = {
  /** Below this much headroom (as a fraction of peak-so-far) a meter is "watch". */
  warnFraction: 0.08,
  /** Below this much headroom (as a fraction of peak-so-far) a meter is "danger". */
  dangerFraction: 0.04,
} as const;

/**
 * How much over its current ceiling we assume a "danger" meter could climb when we quote the
 * dollar consequence of crossing the peak. The board's headline dollar figure answers "what
 * does it cost if this meter beats its peak?"; we price a small, believable new peak above
 * the current draw rather than an unbounded one. Expressed as a fraction of current draw added
 * on top of the gap to the ceiling.
 */
export const CROSS_PEAK_ASSUMPTION = {
  /** New-peak overshoot above the current ceiling we price the consequence against (8%). */
  overshootFraction: 0.08,
} as const;
