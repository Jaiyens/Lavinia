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

/**
 * Canonicalize a PG&E account number to its stable dedupe key.
 *
 * The master sheet prints "Full Acct #" with a trailing check digit and the export
 * zero-pads ("4699664587-8" vs "0091898735"), so the same account reads two ways. This
 * mirrors the Python validator's `norm_account`: take everything before a "-" check-digit
 * suffix, then drop leading zeros, so both spellings collapse to one key (the 57 accounts
 * reconcile and re-imports merge instead of forking new Account rows).
 *
 * NOTE: this DOES split on a leading "-" (the account check digit), unlike `normalizeSaId`,
 * which deliberately keeps hyphens because they occur inside SA IDs. Empty input -> null;
 * an all-zero number canonicalizes to "0" (never an empty key).
 */
export function normalizeAccountNumber(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const head = trimmed.split("-")[0] ?? "";
  const stripped = head.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

/**
 * Canonicalize a PG&E Service Agreement ID to the natural (un-padded) form the inventory and
 * every downstream artifact use as the Pump upsert key. The "Download My Data" CSV zero-pads
 * every SA to 10 digits (e.g. "0091898735"), but the master sheet uses the natural id
 * ("91898735"). Strip leading zeros so a CSV import and a master-sheet import resolve to the
 * SAME Pump instead of forking a duplicate. Idempotent on a natural id; proven 0 collisions
 * across the 207 Batth export SAs.
 *
 * Unlike `normalizeAccountNumber`, this does NOT split on "-": a hyphen can appear inside a
 * full SA id and must be preserved. Guards an all-zero string (which would collapse to "")
 * by returning the trimmed input verbatim.
 */
export function canonSaId(raw: string): string {
  const t = raw.trim();
  const s = t.replace(/^0+/, "");
  return s === "" ? t : s;
}
