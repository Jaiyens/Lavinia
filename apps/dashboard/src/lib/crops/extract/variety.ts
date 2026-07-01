// Variety-name normalization for matching a packer SETTLEMENT row to the live ALMOND_LOGIC ESTIMATE
// it supersedes. Almond varieties are printed inconsistently across the grower's yield tool and the
// packer's statement (e.g. "NP" on a settlement vs "Nonpareil" on the estimate). Matching on the raw
// string would miss the estimate and the estimate->settled gap would never fall out of
// recomputePositions. So both sides are normalized to a CANONICAL variety key before matching.
//
// Hard rule: normalization is for MATCHING ONLY. The verbatim printed variety is still what is stored
// on the written row (the schema stores variety as printed, never inferred). An UNRECOGNIZED variety
// is NOT guessed — it normalizes to a stable, case-folded form of itself so it only ever matches an
// identically-spelled counterpart, never a wrong one. Withholding a match (-> supersedesId null) is
// always safe; a wrong match would corrupt the gap.

/**
 * Known alias -> canonical variety. Keys are the lowercased, trimmed alias; values the canonical
 * spelling. Extend as new spellings appear on real statements. NP<->Nonpareil is the common one.
 */
const ALIASES: Readonly<Record<string, string>> = {
  np: "nonpareil",
  "non pareil": "nonpareil",
  "non-pareil": "nonpareil",
  nonpareil: "nonpareil",
  mont: "monterey",
  monterey: "monterey",
  "mont.": "monterey",
  ind: "independence",
  independence: "independence",
  "but": "butte",
  butte: "butte",
  pad: "padre",
  padre: "padre",
  "but/pad": "butte/padre",
  "butte/padre": "butte/padre",
  "butte-padre": "butte/padre",
  fritz: "fritz",
  carmel: "carmel",
  car: "carmel",
  aldrich: "aldrich",
  ald: "aldrich",
  wood: "wood colony",
  "wood colony": "wood colony",
};

/**
 * Normalize a printed variety name to its canonical key for MATCHING. Lowercases, collapses internal
 * whitespace, trims, then applies the alias map. An unrecognized name returns its own cleaned form
 * (never a guess) so it matches only an identically-spelled counterpart.
 */
export function normalizeVariety(printed: string): string {
  const cleaned = printed.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[cleaned] ?? cleaned;
}
