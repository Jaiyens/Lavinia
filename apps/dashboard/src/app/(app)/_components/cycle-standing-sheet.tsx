"use client";

import type { MeterView } from "@/lib/dashboard/load";
import type { MeterReadSchedule } from "@/lib/pge/schedule";
import type { IntervalReading } from "@/lib/energy/types";
import { openCycleStanding } from "@/lib/dashboard/calendar";
import { closeDateShort } from "@/lib/format/date";
import { en } from "@/copy/en";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

// The open-cycle standing sheet (billing-cycle surface, 2026-06-17): tap a SCHEDULED
// (forecast) close -> "where does this open cycle stand?" Retrospective and honestly
// day-lagged. No dollar figure (the cycle surface sells getting ahead, not savings); the
// steer is gated to fresh data on a still-open cycle so we never give live run/don't-run
// advice (planner, not live meter). Until interval readings are wired it degrades to the
// close date + an honest "we don't have this cycle's reads yet."

const t = en.shell.calendar.cycle;

export function CycleStandingSheet({
  meter,
  schedule,
  todayIso,
  readings = [],
  onClose,
  onTrace,
}: {
  meter: MeterView;
  schedule: MeterReadSchedule;
  todayIso: string;
  readings?: readonly IntervalReading[];
  onClose: () => void;
  onTrace: () => void;
}) {
  const standing = openCycleStanding(meter, readings, schedule, todayIso);
  const closeStr = standing ? closeDateShort(standing.closeIso) : "";

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-md gap-0 rounded-t-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-5"
      >
        <SheetTitle className="type-title pr-8 text-on-surface">
          {t.standingTitle(meter.name, closeStr)}
        </SheetTitle>

        {standing && standing.peakAtIso !== null ? (
          <div className="mt-3">
            <p className="type-body-md text-on-surface">
              {t.standingPeak(closeDateShort(standing.peakAtIso))}
            </p>
            {standing.asOfIso !== null && (
              <p className="type-label-caps mt-1 text-on-surface-variant">
                {standing.asOfStale
                  ? t.asOfStale(closeDateShort(standing.asOfIso))
                  : t.asOf(closeDateShort(standing.asOfIso))}
              </p>
            )}
            {standing.steerOk && (
              <p className="type-body-md mt-3 text-on-surface">{t.steer(closeStr)}</p>
            )}
          </div>
        ) : (
          <p className="type-body-md mt-3 text-on-surface-variant">{t.noReads}</p>
        )}

        {/* PG&E's own forecast caveat, in their words (never invented by us). */}
        {schedule.mayShiftNote !== null && (
          <p className="type-caption mt-3 text-on-surface-variant">
            {t.expected}: {schedule.mayShiftNote}
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={onTrace}
          className="mt-4 min-h-[44px] w-full"
        >
          <span className="type-body-md">{t.trace}</span>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
