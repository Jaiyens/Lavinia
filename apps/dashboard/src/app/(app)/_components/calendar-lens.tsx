"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import type { DayButton } from "react-day-picker";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { Button, Calendar } from "@/components/ui";
import type { MeterView } from "@/lib/dashboard/load";
import type { MeterReadSchedule } from "@/lib/pge/schedule";
import { filterMeters } from "@/lib/dashboard/table";
import {
  anyResolvableSerial,
  calendarBounds,
  calendarMonth,
  defaultCalendarMonth,
  nextCloses,
} from "@/lib/dashboard/calendar";
import { SURFACE } from "@/lib/dashboard/surface";
import { CycleStandingSheet } from "./cycle-standing-sheet";

// The Calendar lens (Story 3.5, FR-16): each meter's billing-cycle close on a month grid - the
// timing hook, one lens face among four. Now built on the shadcn Calendar (react-day-picker): the
// data logic (the calendarMonth model, the cycle KPIs, the bounds, the day panel, the scheduled-vs-
// actual standing sheet) is unchanged; only the grid chrome is the shared primitive. Two mark kinds,
// never conflated (AR-14): a BILLED close is a fact from the posted bill (solid dot); a SCHEDULED
// read comes from the meter's serial letter via the committed 2026 PG&E table (dashed dot) and may
// shift. Selecting a marked day opens a panel under the grid listing that day's meters as buttons
// that write the canonical nuqs `meter` key (the shared drawer opens).

const t = en.shell.calendar;

/** Per-day mark counts, looked up by the custom day button via context (RDP can't pass extra props). */
type DayCounts = { actual: number; scheduled: number };
const DayCountsContext = React.createContext<Map<string, DayCounts>>(new Map());

/** Local-date ISO (YYYY-MM-DD) - the calendar model keys days this way, in local civil time. */
function isoOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function monthStart(ym: string): Date {
  return new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
}

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

  const initial = useMemo(() => defaultCalendarMonth(meters, todayIso), [meters, todayIso]);
  const [month, setMonth] = useState<Date>(() => new Date(initial.year, initial.month - 1, 1));
  const [openDayIso, setOpenDayIso] = useState<string | null>(null);
  const [standingMeterId, setStandingMeterId] = useState<string | null>(null);

  // KPI strip inputs follow the VISIBLE set so the counts match the grid below.
  const closes = useMemo(() => nextCloses(visible, schedule, todayIso), [visible, schedule, todayIso]);
  const standingMeter =
    standingMeterId !== null ? (meters.find((m) => m.id === standingMeterId) ?? null) : null;

  // Bounds follow the VISIBLE set so navigation stays inside months its own meters populate; the
  // shown month is clamped into [min, max] so a filter change can never strand it out of range.
  const bounds = useMemo(
    () => calendarBounds(visible, schedule, todayIso),
    [visible, schedule, todayIso],
  );
  const minDate = monthStart(bounds.minYm);
  const maxDate = monthStart(bounds.maxYm);
  const shownDate = month < minDate ? minDate : month > maxDate ? maxDate : month;

  const model = useMemo(
    () => calendarMonth(visible, shownDate.getFullYear(), shownDate.getMonth() + 1, schedule),
    [visible, shownDate, schedule],
  );

  // Per-day mark counts keyed by local ISO, for the dot indicators in each cell.
  const countsByIso = useMemo(() => {
    const map = new Map<string, DayCounts>();
    for (const day of model.days) {
      if (day.chips.length === 0) continue;
      const actual = day.chips.filter((c) => c.kind === "actual").length;
      map.set(day.iso, { actual, scheduled: day.chips.length - actual });
    }
    return map;
  }, [model.days]);

  const openDay =
    openDayIso?.slice(0, 7) === isoOf(shownDate).slice(0, 7)
      ? (model.days.find((d) => d.iso === openDayIso && d.chips.length > 0) ?? null)
      : null;
  const selectedDate = openDay ? new Date(openDay.iso + "T00:00:00") : undefined;

  const monthName = en.shell.drawer.months[shownDate.getMonth()] ?? String(shownDate.getMonth() + 1);
  const anySerials = anyResolvableSerial(meters, schedule);

  return (
    <section
      id="energy-lens"
      aria-label={en.shell.lens.calendar}
      className="scroll-mt-6 flex h-full min-h-0 flex-col rounded-[var(--radius-lg)] bg-surface-container-lowest p-4 shadow-e2 sm:p-6"
    >
      <h2 className="type-title text-on-surface">{t.heading}</h2>

      {/* Cycle KPI strip: the month at a glance, in the grower's frame. "Running hot" tints clay only
          when > 0, and the label carries the meaning so color is never the only signal. */}
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

      <DayCountsContext.Provider value={countsByIso}>
        <Calendar
          mode="single"
          required={false}
          selected={selectedDate}
          onSelect={(date) => setOpenDayIso(date ? isoOf(date) : null)}
          month={shownDate}
          onMonthChange={setMonth}
          startMonth={minDate}
          endMonth={maxDate}
          showOutsideDays={false}
          components={{ DayButton: CycleDayButton }}
          // bg-transparent so the grid shows the white section behind it (the default bg-background
          // maps to --bg, the grey page color, which read as a grey box). Compact cells so the month
          // fits its tile with no vertical scrollbar.
          className="mt-2 w-full bg-transparent p-0 [--cell-size:--spacing(9)]"
          classNames={{ month: "flex w-full flex-col gap-2", month_grid: "w-full border-collapse" }}
        />
      </DayCountsContext.Provider>

      {openDay !== null && (
        <div className="mt-3 rounded-[var(--radius-control)] border border-outline-variant p-3">
          <p className="type-label-caps text-on-surface-variant">
            {t.dayHeading(openDay.day, monthName, shownDate.getFullYear())}
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

      {/* Legend: the two kinds, in words (style is never the only signal). */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1">
        <p className="type-caption flex items-center gap-1.5 text-on-surface">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-on-surface" />
          {t.legendActual}
        </p>
        <p className="type-caption flex items-center gap-1.5 text-on-surface-variant">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-on-surface-variant"
          />
          {t.legendScheduled}
        </p>
      </div>
      {!anySerials && <p className="type-caption mt-2 text-on-surface-variant">{t.noSerials}</p>}

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

/** One cycle KPI: a count under a caps label. The clay tint is paired with its label, so color is
 *  never the only signal (a grower who cannot tell green from clay still reads it). */
function CycleKpi({ label, value, hot = false }: { label: string; value: number; hot?: boolean }) {
  return (
    <div className="rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest p-3">
      <p className="type-label-caps text-on-surface-variant">{label}</p>
      <p className={cn("type-title tnum mt-1", hot ? "text-alert" : "text-on-surface")}>{value}</p>
    </div>
  );
}

/** The day cell button: the date number plus the day's close-mark dots (solid = billed/actual,
 *  dashed = scheduled). Mark counts come through context since RDP gives the button only its date. */
function CycleDayButton({
  className,
  day,
  modifiers,
  children: _children,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const counts = React.useContext(DayCountsContext);
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  const marks = counts.get(isoOf(day.date));

  return (
    <Button
      ref={ref}
      variant="ghost"
      data-selected-single={modifiers.selected}
      className={cn(
        "relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col items-center justify-center gap-0.5 border-0 font-normal leading-none data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <span className="tnum text-xs">{day.date.getDate()}</span>
      {marks && (marks.actual > 0 || marks.scheduled > 0) && (
        <span className="flex items-center gap-0.5">
          {marks.actual > 0 && (
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-on-surface" />
          )}
          {marks.scheduled > 0 && (
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full border border-dashed border-on-surface-variant"
            />
          )}
        </span>
      )}
    </Button>
  );
}
