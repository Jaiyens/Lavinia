// The honest-blank / honest-unknown primitive (G-0). The trust contract implemented as ONE shared
// state the derivations emit and ONE shared component every surface renders, so a "not on file yet"
// cell looks identical everywhere and the grower learns the state once. This module is the PURE half:
// the `HonestBlankState` discriminated union plus the pure helpers that derive it. No Prisma, no
// React, no I/O, no clock (NFR1) - just a value in, a state out, proven with a colocated *.test.ts.
//
// THE ONE LAW (verbatim, every story inherits it): program STRUCTURE and TIMING are in Terra's data
// today; net-metering dollar CREDITS are not. Every net-metering dollar surface renders honest-blank
// until a true-up statement is on file. So a credit-dollar cell with no backing statement is "blank"
// (a deliberate, settled absence with the non-salesy upload path), never a fabricated zero, an
// estimate, an error, or a bare dash. This module never invents a credit; it only NAMES the absence.
//
// THREE STATES, never confused (AC1/AC2):
//   - "settled": a value is genuinely on file. The dependent surface renders the real value; the
//     primitive is NOT shown. Carried as a state so a caller can switch over one union end to end.
//   - "blank": a net-metering DOLLAR has no backing statement. Renders the calm "Not on file yet"
//     paired with "Upload the true-up statement to settle this". This is the honest-BLANK state.
//   - "unknown": a STRUCTURAL datum (not a dollar) is genuinely absent (no nameplate on file, no
//     true-up month, no array link). Renders a visually DISTINCT honest-UNKNOWN treatment so a
//     missing structural fact is never mistaken for an un-uploaded dollar, and vice versa.
//
// A credit dollar is NEVER "unknown" and a structural fact is NEVER "blank": the two helpers below
// keep that discipline by construction, so a caller cannot accidentally offer an upload path for a
// missing nameplate or hide a missing credit as a structural gap.

/** The shared "not on file yet" state, rendered identically everywhere via <HonestBlank> (G-0). */
export type HonestBlankState =
  | {
      /** A value is genuinely on file; the dependent surface renders the real value (no primitive). */
      kind: "settled";
    }
  | {
      /** A net-metering DOLLAR with no backing statement: honest-BLANK + the upload-to-settle path. */
      kind: "blank";
    }
  | {
      /** A STRUCTURAL datum genuinely absent: honest-UNKNOWN, a visually distinct settled absence. */
      kind: "unknown";
    };

/**
 * Derive the honest-blank state of a net-metering DOLLAR cell. A credit dollar is "settled" only when
 * a real amount (in cents) is on file from an uploaded statement; absent that (null/undefined, or a
 * non-finite value that could only be a bug), it is honest-BLANK - the calm "Not on file yet" with the
 * upload path, never a zero or a guess. A genuine on-file zero credit is still a settled value (a
 * statement can settle to nothing), so only the ABSENCE of an amount is blank, never a real 0.
 */
export function dollarState(amountCents: number | null | undefined): HonestBlankState {
  if (amountCents === null || amountCents === undefined) return { kind: "blank" };
  if (!Number.isFinite(amountCents)) return { kind: "blank" };
  return { kind: "settled" };
}

/**
 * Derive the honest-blank state of a STRUCTURAL datum (a nameplate, a true-up month, an array link -
 * anything that is NOT a net-metering dollar). Present (not null/undefined) is "settled"; absent is
 * honest-UNKNOWN, never honest-blank (a missing structural fact carries no upload-to-settle path,
 * because no statement settles a nameplate). This keeps the two absences distinct by construction.
 */
export function structuralState<T>(value: T | null | undefined): HonestBlankState {
  return value === null || value === undefined ? { kind: "unknown" } : { kind: "settled" };
}

/** True when a state is a settled absence the <HonestBlank> primitive renders (blank or unknown), as
 *  opposed to a settled value the caller renders itself. A small readability helper for callers that
 *  branch "show the real value" vs "show the primitive". */
export function isHonestBlank(state: HonestBlankState): state is { kind: "blank" | "unknown" } {
  return state.kind !== "settled";
}
