// Demand-response enrollment detection (Story 3.7, FR-18): if a posted bill
// prints a DR program line (a PDP event credit, a BIP charge), surface the
// enrollment as plain INFORMATION. Never a recommendation, never a savings
// claim - Batth-class growers already curtail and are already enrolled; there
// is no defensible dollar to put on it (the levers list keeps DR info-only).
//
// The two TOU clocks (AR-14): DR EVENTS run in the 4-9pm window
// (tou.ts DR_EVENT_WINDOW) - all DR copy phrases that window, and never the
// 5-8pm RATE peak that prices energy and demand.
//
// Pure: no UI, no DB, no clock, no fs. Colocated tests in dr.test.ts.

/** The DR programs a PG&E ag bill can print. */
export type DrProgram = "pdp" | "bip" | "cbp";

/** Printed-label patterns per program, matched case-insensitively anywhere in
 *  the label (real prints embed the program in a sentence: "PDP Event Day
 *  Credit 06/12"). Detection is from the printed bill only - no enrollment is
 *  ever inferred or assumed. */
const PROGRAM_PATTERNS: ReadonlyArray<{ program: DrProgram; pattern: RegExp }> = [
  // Word boundaries on BOTH alternatives, and [\s-]+ between words so scanned
  // labels with hyphenation or doubled spaces ("Peak-Day  Pricing") still match.
  { program: "pdp", pattern: /\bPDP\b|\bpeak[\s-]+day[\s-]+pricing\b/i },
  { program: "bip", pattern: /\bBIP\b|\bbase[\s-]+interruptible\b/i },
  { program: "cbp", pattern: /\bCBP\b|\bcapacity[\s-]+bidding\b/i },
];

/**
 * The DR program a meter's billed line items show enrollment in, or null when
 * nothing prints (the honest default - the real account's extracted bills carry
 * no DR marker today). First match wins: a meter is enrolled in one program at
 * a time on the printed bill.
 */
export function drEnrollment(
  lineItems: ReadonlyArray<{ label: string | null }>,
): DrProgram | null {
  for (const item of lineItems) {
    if (item.label === null) continue;
    for (const { program, pattern } of PROGRAM_PATTERNS) {
      if (pattern.test(item.label)) return program;
    }
  }
  return null;
}
