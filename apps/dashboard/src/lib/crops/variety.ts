// Variety normalization. Gagan's worksheet CSV uses short codes (np/m/f/ald/i/ind/w/car…) while the
// Almond Logic scrape stores full names (NONPAREIL/MONTEREY/FRITZ/ALDRICH/INDEPENDENCE…). The worksheet
// groups by variety across BOTH sources, so both must normalize to ONE canonical key (uppercase full
// name). Only well-known almond variety codes are mapped; an UNRECOGNIZED code is returned trimmed +
// uppercased as-is (never guessed into a wrong full name) so it stays distinguishable and stable.

const CANONICAL: Record<string, string> = {
  np: "NONPAREIL",
  nonpareil: "NONPAREIL",
  m: "MONTEREY",
  monterey: "MONTEREY",
  f: "FRITZ",
  fritz: "FRITZ",
  ald: "ALDRICH",
  aldrich: "ALDRICH",
  i: "INDEPENDENCE",
  ind: "INDEPENDENCE",
  independence: "INDEPENDENCE",
  w: "WOOD COLONY",
  "wood colony": "WOOD COLONY",
  car: "CARMEL",
  carmel: "CARMEL",
};

/**
 * Canonicalize a variety string to a single key used to join CSV codes and scrape names. Case- and
 * whitespace-insensitive. Known codes map to the full uppercase name; unknown codes (e.g. "bp",
 * "avl", or a compound "MONTEREY/NONPAREIL") are returned trimmed + uppercased unchanged — flagged by
 * staying as-is rather than fabricated into a full variety name. Empty/blank input → "UNKNOWN".
 */
export function normalizeVariety(raw: string | null | undefined): string {
  if (raw == null) return "UNKNOWN";
  const key = raw.trim().toLowerCase();
  if (key === "") return "UNKNOWN";
  return CANONICAL[key] ?? raw.trim().toUpperCase();
}

/** Whether a normalized variety is one of the well-known almond varieties (vs an unrecognized code). */
export function isKnownVariety(normalized: string): boolean {
  return new Set(Object.values(CANONICAL)).has(normalized);
}
