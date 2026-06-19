"use client";

import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import type { MeterView } from "@/lib/dashboard/load";
import type { MeterReadSchedule } from "@/lib/pge/schedule";
import { filterMeters } from "@/lib/dashboard/table";
import {
  anyResolvableSerial,
  calendarBounds,
  calendarMonth,
  defaultCalendarMonth,
  nextCloses,
  type CalendarDay,
} from "@/lib/dashboard/calendar";
import { SURFACE } from "@/lib/dashboard/surface";
import { CycleStandingSheet } from "./cycle-standing-sheet";

// The Calendar lens (Story 3.5, FR-16): each meter's billing-cycle close on a
// small month grid - the timing hook, one lens face among four, never the home
// surface. Two mark kinds, never conflated (AR-14): a BILLED close is a fact
// from the posted bill; a SCHEDULED read comes from the meter's serial letter
// via the committed 2026 PG&E table and may shift.
//
// Interaction model (Batth scale: all 46 real meters can close on ONE day, the
// seed's 183 likewise): the DAY CELL is the tap target (>= 44px), showing a
// count; tapping it opens a day panel under the grid listing that day's meters
// as full-height buttons that write the canonical nuqs `meter` key (the shared
// drawer opens; no new URL params - month paging and the open day are local
// view state; the canonical key set is closed: lens|entity|ranch|rate|meter).

const t = en.shell.calendar;
const MONTHS = en.shell.drawer.months;

export function CalendarLens({
  meters,
  schedule,
  todayIso,
}: {
  meters: MeterView[];
  schedule: MeterReadSchedule;
  todayIso: string;
}) {
  const [entity] = useQueryState(SURFACE.entity);
  const [ranch] = useQueryState(SURFACE.ranch);
  const [rate] = useQueryState(SURFACE.rate);
  const [, setMeter] = useQueryState(SURFACE.meter);

  const visible = useMemo(
    () => filterMeters(meters, { entity, ranch, rate }),
    [meters, entity, ranch, rate],
  );

  // Anchor/bounds follow the VISIBLE set so a filtered view opens on a month
  // its own meters populate. The anchor is re-clamped at render (not just at
  // init) so a filter change or fresh data can never strand it out of bounds.
  const [anchor, setAnchor] = useState(() => defaultCalendarMonth(meters, todayIso));
  const [openDayIso, setOpenDayIso] = useState<string | null>(null);
  const [standingMeterId, setStandingMeterId] = useState<string | null>(null);

  // KPI strip inputs follow the VISIBLE set so the counts match the grid below.
  const closes = useMemo(
    () => nextCloses(visible, schedule, todayIso),
    [visible, schedule, todayIso],
  );
  const standingMeter =
    standingMeterId !== null ? (meters.find((m) => m.id === standingMeterId) ?? null) : null;

  const bounds = useMemo(
    () => calendarBounds(visible, schedule, todayIso),
    [visible, schedule, todayIso],
  );
  const anchorYm = `${anchor.year.toString().padStart(4, "0")}-${anchor.month
    .toString()
    .padStart(2, "0")}`;
  const clampedYm =
    anchorYm < bounds.minYm ? bounds.minYm : anchorYm > bounds.maxYm ? bounds.maxYm : anchorYm;
  const shown = { year: Number(clampedYm.slice(0, 4)), month: Number(clampedYm.slice(5, 7)) };

  const model = useMemo(
    () => calendarMonth(visible, shown.year, shown.month, schedule),
    [visible, shown.year, shown.month, schedule],
  );
  const openDay = openDayIso?.slice(0, 7) === clampedYm
    ? model.days.find((d) => d.iso === openDayIso && d.chips.length > 0) ?? null
    : null;

  const canPrev = clampedYm > bounds.minYm;
  const canNext = clampedYm < bounds.maxYm;
  const page = (delta: number) => {
    setOpenDayIso(null);
    const next = shown.month + delta;
    if (next < 1) setAnchor({ year: shown.year - 1, month: 12 });
    else if (next > 12) setAnchor({ year: shown.year + 1, month: 1 });
    else setAnchor({ year: shown.year, month: next });
  };

  const monthName = MONTHS[shown.month - 1] ?? String(shown.month);
  const anySerials = anyResolvableSerial(meters, schedule);

  return (
    <section
      id="energy-lens"
      aria-label={en.shell.lens.calendar}
      className="scroll-mt-6 flex h-full min-h-0 flex-col rounded-[var(--radius-lg)] bg-surface-container-lowest p-4 shadow-e2 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="type-title text-on-surface">{t.heading}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => page(-1)}
            disabled={!canPrev}
            aria-label={t.prevMonth}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-control)] border border-outline-variant text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <p className="type-body-md tnum min-w-[9rem] text-center text-on-surface" aria-live="polite">
            {monthName} {shown.year}
          </p>
          <button
            type="button"
            onClick={() => page(1)}
            disabled={!canNext}
            aria-label={t.nextMonth}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-control)] border border-outline-variant text-on-surface transition-colors hover:bg-surface-container-low disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Cycle KPI strip: the month at a glance, in the grower's frame. "Running hot" tints
          clay only when > 0, and the label carries the meaning so color is never the only signal. */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <CycleKpi label={t.cycle.kpiClosingWeek} value={closes.closingThisWeek} />
        <CycleKpi label={t.cycle.kpiClosingMonth} value={closes.closingThisMonth} />
        <CycleKpi label={t.cycle.kpiHot} value={closes.hotCount} hot={closes.hotCount > 0} />
      </div>
      {closes.unforecastable > 0 && (
        <p className="type-caption mt-2 text-on-surface-variant">
          {t.cycle.unforecastable(closes.unforecastable)}
        </p>
      )}

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div aria-hidden className="grid grid-cols-7 gap-px">
          {t.weekdays.map((day) => (
            <p key={day} className="type-label-caps px-1 py-1 text-center text-on-surface-variant">
              {day}
            </p>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-control)] border border-outline-variant bg-outline-variant">
          {Array.from({ length: model.leadingBlanks }, (_, i) => (
            <div key={`lead-${i}`} aria-hidden className="min-h-11 bg-surface-container-lowest" />
          ))}
          {model.days.map((day) => (
            <DayCell
              key={day.iso}
              day={day}
              isOpen={openDay?.iso === day.iso}
              onToggle={() =>
                setOpenDayIso((cur) => (cur === day.iso ? null : day.iso))
              }
            />
          ))}
          {/* Trailing fillers complete the last week row so the hairline backdrop
              only ever shows through the 1px gaps, never as a solid block. */}
          {Array.from(
            { length: (7 - ((model.leadingBlanks + model.days.length) % 7)) % 7 },
            (_, i) => (
              <div key={`tail-${i}`} aria-hidden className="min-h-11 bg-surface-container-lowest" />
            ),
          )}
        </div>
      </div>

      {openDay !== null && (
        <div className="mt-3 rounded-[var(--radius-control)] border border-outline-variant p-3">
          <p className="type-label-caps text-on-surface-variant">
            {t.dayHeading(openDay.day, monthName, shown.year)}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {openDay.chips.map((chip) => (
              <li key={`${chip.meterId}-${chip.kind}`}>
                <button
                  type="button"
                  onClick={() =>
                    chip.kind === "scheduled"
                      ? setStandingMeterId(chip.meterId)
                      : void setMeter(chip.meterId)
                  }
                  aria-label={t.chipAria(chip.meterName, chip.kind)}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-outline-variant px-3 text-left transition-colors hover:bg-surface-container-low"
                >
                  <span className="type-body-md truncate text-on-surface">{chip.meterName}</span>
                  <span className="type-caption shrink-0 text-on-surface-variant">
                    {chip.kind === "actual" ? t.kindActual : t.kindScheduled}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {model.actualCount === 0 && model.scheduledCount === 0 && (
        <p className="type-body-md mt-3 text-on-surface-variant">{t.empty}</p>
      )}

      {/* Legend: the two kinds, in words (style is never the only signal). The
          no-serials line is the honest scheduled-side state. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1">
        <p className="type-caption flex items-center gap-1.5 text-on-surface">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-on-surface" />
          {t.legendActual}
        </p>
        <p className="type-caption flex items-center gap-1.5 text-on-surface-variant">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-on-surface-variant" />
          {t.legendScheduled}
        </p>
      </div>
      {!anySerials && (
        <p className="type-caption mt-2 text-on-surface-variant">{t.noSerials}</p>
      )}

      {standingMeter !== null && (
        <CycleStandingSheet
          meter={standingMeter}
          schedule={schedule}
          todayIso={todayIso}
          onClose={() => setStandingMeterId(null)}
          onTrace={() => {
            const id = standingMeter.id;
            setStandingMeterId(null);
            void setMeter(id);
          }}
        />
      )}
    </section>
  );
}

/** One cycle KPI: a count under a caps label. The clay tint is paired with its label, so
 *  color is never the only signal (a grower who cannot tell green from clay still reads it). */
function CycleKpi({ label, value, hot = false }: { label: string; value: number; hot?: boolean }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest p-3">
      <p className="type-label-caps text-on-surface-variant">{label}</p>
      <p className={cn("type-title tnum mt-1", hot ? "text-alert" : "text-on-surface")}>{value}</p>
    </div>
  );
}

/** One day cell: a single >= 44px tap target showing the day's mark counts. */
function DayCell({
  day,
  isOpen,
  onToggle,
}: {
  day: CalendarDay;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const actual = day.chips.filter((c) => c.kind === "actual").length;
  const scheduled = day.chips.length - actual;
  const hasMarks = day.chips.length > 0;

  if (!hasMarks) {
    return (
      <div className="min-h-11 bg-surface-container-lowest p-1.5">
        <p className="type-caption tnum text-on-surface-variant">{day.day}</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={t.dayAria(day.iso, day.chips.length)}
      aria-expanded={isOpen}
      className={cn(
        "min-h-11 bg-surface-container-lowest p-1.5 text-left transition-colors hover:bg-surface-container-low",
        isOpen && "bg-surface-container-low",
      )}
    >
      <p className="type-caption tnum text-on-surface">{day.day}</p>
      {actual > 0 && (
        <p className="mt-0.5 flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full bg-on-surface" />
          <span className="type-caption tnum text-on-surface">{actual}</span>
        </p>
      )}
      {scheduled > 0 && (
        <p className="mt-0.5 flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full border border-dashed border-on-surface-variant" />
          <span className="type-caption tnum text-on-surface-variant">{scheduled}</span>
        </p>
      )}
    </button>
  );
}
