"use client";

import { useQueryState } from "nuqs";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui";
import { SURFACE } from "@/lib/dashboard/surface";
import { solarLensQueryOptions } from "@/lib/solar/lens-solar";
import type { SolarDataset } from "@/lib/dashboard/solar";
import { HonestBlank } from "./honest-blank";

// The Calendar lens (D-2, FR12/FR13/FR15, UX-DR5): the true-up heartbeat. It RENDERS the pure D-1
// derivation (dataset.calendar = buildTrueUpCalendar over the fleet's true-up months, rolled forward
// from the page-edge nowMonth); it computes nothing itself, so the clock stays at the server edge and
// the grid, the next-upcoming pull-out, and the KPI strip's next-true-up tile can never disagree
// (they all read the same injected nowMonth derivation).
//
// THE ONE LAW (the trust contract): this lens carries STRUCTURE and TIMING only - which month each
// meter and array settles - and NEVER a fabricated true-up credit dollar. The per-entry credit reads
// honest-blank through the shared <HonestBlank> primitive until a statement is uploaded (the upload
// affordance itself is wired in G-3); no dollar is computed or guessed here. A meter with no true-up
// month is not placed (it is countable upstream as "no month on file"), never a fabricated zero.
//
// UX-DR5: a twelve-month rolling grid; the next-upcoming pulled out above the grid as a lead line in
// plain words ("Next true-up: December, 6 meters, about 6 weeks out"), never raw date math; a
// persistent calm monthly-reconciliation note (FR15), sourced from en.ts; honest empty state when no
// true-up month is on file. Tabular figures for the counts; no color (NFR6: red is for money at
// stake, and the credit here is honest-blank); >= 44px nothing-yet cells stay calm, not interactive.

const t = en.solar.calendar;

/** One month cell on the rolling grid. A populated cell names its settling meter (and array) counts;
 *  an empty month reads calm with no fabricated zero. The credit dollar is honest-blank per cell. */
function MonthCell({
  month,
  meterCount,
  arrayCount,
}: {
  month: number;
  meterCount: number;
  arrayCount: number;
}) {
  const populated = meterCount > 0 || arrayCount > 0;
  return (
    <div
      // A populated cell is announced as content (the month + its settling counts), so the heartbeat
      // reads to a screen reader and never as an empty cell it skips. An empty month is decorative.
      aria-label={populated ? t.cellAria(month, meterCount, arrayCount) : undefined}
      className={cn(
        "flex min-h-[5.5rem] flex-col gap-1 rounded-[var(--radius-control)] border p-3",
        populated
          ? "border-outline-variant bg-surface-container-lowest"
          : "border-outline-variant/60 bg-surface-container-lowest/60",
      )}
    >
      <p className="type-label-caps text-on-surface-variant">{t.monthName(month)}</p>
      {populated ? (
        <>
          <p className="type-body-md tnum text-on-surface">{t.cellMeters(meterCount)}</p>
          {arrayCount > 0 && (
            <p className="type-caption tnum text-on-surface-variant">{t.cellArrays(arrayCount)}</p>
          )}
          {/* The per-cell credit is honest-blank until a statement settles it (FR14). The upload path
              itself is wired in G-3; until then the calm not-on-file state names the absence. The
              page-level upload affordance covers the action, so this inline cell omits its own prompt. */}
          <span className="type-caption mt-auto text-on-surface-variant">
            {t.creditLabel}:{" "}
            <HonestBlank state={{ kind: "blank" }} label={t.creditLabel} showUpload={false} />
          </span>
        </>
      ) : null}
    </div>
  );
}

export function SolarCalendarLens({ dataset }: { dataset: SolarDataset }) {
  // Read the lens key only so a deep link to ?lens=calendar resolves; the toggle owns the writes.
  useQueryState(SURFACE.lens, solarLensQueryOptions());

  const { cells, nextUpcoming } = dataset.calendar;
  const anyPlaced = cells.some((c) => c.meterCount > 0 || c.arrayCount > 0);

  return (
    <section id="solar-lens" aria-label={en.solar.lens.calendar} className="scroll-mt-6 space-y-4">
      {/* The next-upcoming pull-out, above the grid, in plain words (FR13). Honest absence when no
          meter has a true-up month on file - never a fabricated date. */}
      <article className={cardClass({ className: "p-4" })}>
        <p className="type-label-caps text-on-surface-variant">{t.nextLabel}</p>
        <p className="type-title mt-1 text-on-surface" aria-live="polite">
          {nextUpcoming !== null
            ? t.nextLine(nextUpcoming.month, nextUpcoming.meterCount, nextUpcoming.monthsAhead)
            : t.nextNone}
        </p>
      </article>

      {anyPlaced ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {cells.map((cell, i) => (
            // The rolling grid can legitimately show the same month twice only across a full year
            // wrap; cells are exactly twelve forward from today, so the index is the stable key.
            <MonthCell
              key={`${cell.month}-${i}`}
              month={cell.month}
              meterCount={cell.meterCount}
              arrayCount={cell.arrayCount}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <p className="type-body-md text-on-surface-variant">{t.empty}</p>
        </div>
      )}

      {/* The persistent monthly-reconciliation note (FR15), sourced from en.ts, never hardcoded. */}
      <p className="type-caption text-on-surface-variant">{t.monthlyNote}</p>
    </section>
  );
}
