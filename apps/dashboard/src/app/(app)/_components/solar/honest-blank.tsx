"use client";

import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import type { HonestBlankState } from "@/lib/dashboard/honest-blank";

// The honest-blank / honest-unknown primitive (G-0, UX-DR11). ONE component every net-metering dollar
// cell and every absent structural datum renders, so "not on file yet" looks identical everywhere and
// the grower learns the state once. Built first; every later dollar cell (A-5, A-9, C-2, C-4, D-2, the
// calendar/array credit columns) imports it instead of re-inventing it.
//
// THE ONE LAW (the trust contract): program STRUCTURE and TIMING are in Terra's data today;
// net-metering dollar CREDITS are not. A credit cell with no backing statement renders the calm
// honest-BLANK state - `on-surface-variant` weight, the not-on-file token, NO color, NO severity chip
// - paired with the non-salesy "Upload the true-up statement to settle this" path. It reads as a
// deliberate, settled absence, never an error, a guess, a zero, or a bare dash (NFR6: red is reserved
// for money at risk right now; this is not that).
//
// TWO ABSENCES, VISUALLY DISTINCT (AC2): the dollar honest-BLANK ("blank") carries the upload-to-settle
// path; the structural honest-UNKNOWN ("unknown" - a missing nameplate, true-up month, array link) is
// a quieter, italic settled-absence with NO upload path (no statement settles a structural fact). So
// the two are never confused: an un-uploaded credit and a genuinely-absent structural datum read
// differently. A "settled" state renders the caller's real value, so this primitive returns null for
// it (the caller renders the value itself); guarding that keeps a misuse from silently blanking a real
// figure.
//
// ASSISTIVE TECH (AC3): the absence is announced as CONTENT via an aria-label naming what is absent
// ("Credit: not on file yet"), never an empty cell a screen reader skips. The primitive carries no
// animation, so prefers-reduced-motion is honored by construction (there is no motion to reduce).

const t = en.solar.honestBlank;

export function HonestBlank({
  state,
  /** What this cell measures (e.g. "Credit", "Share", "Array size"), woven into the AT announcement
   *  and, for the dollar blank, used to keep the upload prompt scoped to this cell. */
  label,
  /** Show the non-salesy upload-to-settle path beneath the dollar blank (default true for a credit
   *  cell; pass false for a compact inline cell where the page-level upload affordance already exists,
   *  e.g. a dense table). Ignored for the structural unknown, which never carries an upload path. */
  showUpload = true,
  className,
}: {
  state: HonestBlankState;
  label: string;
  showUpload?: boolean;
  className?: string;
}) {
  // A settled value is rendered by the caller, not by the primitive: return nothing so a misuse can
  // never blank a real figure. The caller branches on `isHonestBlank(state)` before rendering this.
  if (state.kind === "settled") return null;

  if (state.kind === "unknown") {
    // Honest-UNKNOWN: a structural datum genuinely absent. Quieter and italic so it never reads as the
    // dollar blank, with NO upload path (nothing settles a missing nameplate). Announced as content.
    return (
      <span
        aria-label={t.unknownAria(label)}
        className={cn(
          "type-caption italic text-on-surface-variant",
          className,
        )}
      >
        <span aria-hidden>{t.unknown}</span>
      </span>
    );
  }

  // Honest-BLANK: a net-metering DOLLAR with no statement on file. The calm not-on-file label plus the
  // non-salesy upload-to-settle path. No color, no severity chip, no animation. Announced as content.
  return (
    <span
      aria-label={t.blankAria(label)}
      className={cn("inline-flex flex-col gap-0.5 text-on-surface-variant", className)}
    >
      <span aria-hidden className="type-caption tnum">
        {t.blank}
      </span>
      {showUpload && (
        <span aria-hidden className="type-label-caps text-on-surface-variant">
          {t.uploadToSettle}
        </span>
      )}
    </span>
  );
}
