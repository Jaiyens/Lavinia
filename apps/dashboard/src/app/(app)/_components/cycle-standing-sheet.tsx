"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { en } from "@/copy/en";
import type { MeterView } from "@/lib/dashboard/load";
import type { MeterReadSchedule } from "@/lib/pge/schedule";
import type { IntervalReading } from "@/lib/energy/types";
import { openCycleStanding } from "@/lib/dashboard/calendar";
import { closeDateShort } from "@/lib/format/date";

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
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = `cycle-standing-${meter.id}`;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const standing = openCycleStanding(meter, readings, schedule, todayIso);
  const closeStr = standing ? closeDateShort(standing.closeIso) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={en.shell.drawer.close}
        onClick={onClose}
        className="absolute inset-0 bg-inverse-surface/30"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-t-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-5 shadow-[var(--shadow-e3,0_12px_32px_rgba(20,25,15,0.10))] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 sm:rounded-[var(--radius-lg)]"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="type-title text-on-surface">
            {t.standingTitle(meter.name, closeStr)}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={en.shell.drawer.close}
            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[var(--radius-control)] text-on-surface-variant transition-colors hover:bg-surface-container-low"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

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

        <button
          type="button"
          onClick={onTrace}
          className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-control)] border border-outline-variant text-on-surface transition-colors hover:bg-surface-container-low"
        >
          <span className="type-body-md">{t.trace}</span>
        </button>
      </div>
    </div>
  );
}
