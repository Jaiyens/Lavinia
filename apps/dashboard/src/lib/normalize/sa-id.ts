// Canonical SA-ID normalization (Story 1.6, AR / FR-4). A PG&E Service Agreement ID is the
// stable join key between an extracted bill and the inventory. On a bill it may be printed
// with a trailing descriptor (the grower's "P0xx" Pump ID or a label), e.g.
// "1007066742 P001" or "1007066742 (P001 - WEST WELL)". The join must match on the bare ID,
// so this splits the canonical `saId` (the leading token) from the preserved `descriptor`
// (the remainder), trimming both. Pure string utility - no raw-type import, safe in any layer.

/**
 * Split a printed SA ID into its canonical id and an optional trailing descriptor.
 *
 * - Trim first. The canonical `saId` is the leading token (up to the first whitespace run or
 *   an opening parenthesis). The `descriptor` is the trimmed remainder, with a single wrapping
 *   pair of parentheses stripped, or `null` when there is no suffix.
 * - Hyphens are NOT split on (they occur inside IDs). A blank input yields `{ saId: "", descriptor: null }`.
 */
export function normalizeSaId(raw: string): { saId: string; descriptor: string | null } {
  const trimmed = raw.trim();
  if (trimmed === "") return { saId: "", descriptor: null };

  // The canonical id is the leading run up to the first whitespace or "(". Anything from
  // there on is the descriptor, preserved VERBATIM (no character dropped) except that a
  // single wrapping paren pair is unwrapped.
  const sep = trimmed.search(/[\s(]/);
  if (sep === -1) return { saId: trimmed, descriptor: null }; // no separator: all id (hyphens included)

  const saId = trimmed.slice(0, sep);
  let descriptor = trimmed.slice(sep).trim();
  // Unwrap a single wrapping pair only: "(P001 - WEST)" -> "P001 - WEST". A lone trailing
  // ")" with no opening "(" is kept as printed (never silently dropped - AC2 fidelity).
  if (descriptor.startsWith("(") && descriptor.endsWith(")")) {
    descriptor = descriptor.slice(1, -1).trim();
  }
  return { saId, descriptor: descriptor === "" ? null : descriptor };
}
