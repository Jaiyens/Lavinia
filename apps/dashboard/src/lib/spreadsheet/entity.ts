// Collapse the master sheet's billing-name variants to one legal entity.
//
// A big grower's spreadsheet prints the same legal owner several ways: a trailing
// comma, "LLC" vs "L.L.C.", "&" vs "and", stray case, a stray period. Batth's real
// sheet carries 7 such billing-name spellings for 6 actual entities. The importer
// must land them on 6 Entities WITHOUT guessing - a wrong merge would invent an
// owner (NFR-4). So we dedupe on a deterministic canonical key, never on fuzzy
// similarity: two spellings collapse iff they normalize to the exact same key.
//
// Pure (no IO), so it is unit-tested and reused by the DB importer (farm.ts).

// Legal-suffix folding. Periods are stripped before these run, so "L.L.C." has
// already become "LLC" and "INC." has become "INC" by the time we get here.
const SUFFIX_FOLDS: Array<[RegExp, string]> = [
  [/\bINCORPORATED\b/g, "INC"],
  [/\bCORPORATION\b/g, "CORP"],
  [/\bCOMPANY\b/g, "CO"],
  [/\bLIMITED PARTNERSHIP\b/g, "LP"],
];

/**
 * The deterministic dedupe key for a billing name. Upper-cased, "&"->"AND",
 * commas/periods dropped, whitespace collapsed, legal suffixes folded to one
 * token. Two billing-name variants of one owner MUST produce the same key; two
 * genuinely different owners MUST NOT. This is the identity the importer keys on.
 */
export function canonicalEntityKey(name: string): string {
  let s = name.trim().toUpperCase();
  s = s.replace(/&/g, " AND ");
  s = s.replace(/\./g, ""); // "L.L.C." -> "LLC", "INC." -> "INC"
  s = s.replace(/,/g, " "); // "Batth Farms, LLC" -> "Batth Farms  LLC"
  s = s.replace(/\s+/g, " ").trim();
  for (const [re, rep] of SUFFIX_FOLDS) s = s.replace(re, rep);
  return s.replace(/\s+/g, " ").trim();
}

// Tokens kept upper-case in the human-readable owner; everything else Title-cased.
const KEEP_UPPER = new Set(["LLC", "INC", "CORP", "CO", "LP", "LLP"]);

/**
 * A clean, human-readable canonical owner derived from the key, stored on
 * Entity.actualOwner. Deterministic so every variant of one owner yields the same
 * display string. Legal suffixes stay upper-case, "AND" lower-cases to a connector,
 * one- and two-letter initials (e.g. "S", "K") are left as-is.
 */
export function displayOwner(name: string): string {
  return canonicalEntityKey(name)
    .split(" ")
    .filter((w) => w !== "")
    .map((w) => {
      if (w === "AND") return "and";
      if (KEEP_UPPER.has(w)) return w;
      if (w.length <= 2) return w; // initials like "S", "K"
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(" ");
}
