"use client";

import { type ReactNode } from "react";
import { useQueryState } from "nuqs";
import { cn } from "@/lib/cn";
import { cardClass } from "@/components/ui";
import { en } from "@/copy/en";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SURFACE } from "@/lib/dashboard/surface";
import { solarLensQueryOptions } from "@/lib/solar/lens-solar";
import type { SolarKpis } from "@/lib/dashboard/solar";

// The solar KPI strip (A-3, UX-DR2). Four calm tiles - solar meters | arrays | next true-up |
// needs review - the "known at a glance" line the tab opens with. There is deliberately NO dollar
// tile: money is never the hero on this surface. The two counts (meters, arrays) count up ONCE via
// the Magic UI number-ticker, which renders the final value directly under prefers-reduced-motion.
// The needs-review tile is plain typography with NO color (NFR6: watch carries no color); a zero
// reads as a calm "All linked" line, never an alarm.
//
// Tapping Next true-up routes to the Calendar lens (writes only the `lens` key); tapping Needs review
// scrolls to the lens region so the grower can see the meters in context (the per-meter needs-review
// FILTER key lands with the populator harden + filter keys in later stories - this story wires the
// affordance, not a not-yet-existing filter key, so it never writes a key the registry does not own).

function scrollToLens(): void {
  document.getElementById("solar-lens")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Tile({
  label,
  onClick,
  ariaLabel,
  children,
}: {
  label: string;
  onClick?: () => void;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const body = (
    <>
      <span className="type-label-caps text-on-surface-variant">{label}</span>
      <div className="mt-1 flex flex-1 flex-col justify-center">{children}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cardClass({
          interactive: true,
          radius: "control",
          className: "flex min-h-[6rem] flex-col p-4 text-left",
        })}
      >
        {body}
      </button>
    );
  }
  return (
    <div
      className={cardClass({
        radius: "control",
        className: "flex min-h-[6rem] flex-col p-4 text-left",
      })}
    >
      {body}
    </div>
  );
}

export function SolarKpiStrip({ kpis }: { kpis: SolarKpis }) {
  const [, setLens] = useQueryState(SURFACE.lens, solarLensQueryOptions());
  const t = en.solar.kpi;
  const { solarMeterCount, arrayCount, nextTrueUp, needsReviewCount } = kpis;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/* Solar meters. */}
      <Tile label={t.metersLabel}>
        <NumberTicker
          value={solarMeterCount}
          className="type-headline tnum text-on-surface"
        />
        <span className="type-caption mt-1 text-on-surface-variant">{t.metersSub(solarMeterCount)}</span>
      </Tile>

      {/* Arrays. */}
      <Tile label={t.arraysLabel}>
        <NumberTicker value={arrayCount} className="type-headline tnum text-on-surface" />
        <span className="type-caption mt-1 text-on-surface-variant">{t.arraysSub(arrayCount)}</span>
      </Tile>

      {/* Next true-up: routes to the Calendar lens. Honest-blank when no month is on file. */}
      <Tile label={t.trueUpLabel} onClick={() => void setLens("calendar")} ariaLabel={t.trueUpAria}>
        {nextTrueUp ? (
          <>
            <span className="type-headline text-on-surface">{t.trueUpValue(nextTrueUp.month)}</span>
            <span className="type-caption mt-1 text-on-surface-variant">
              {t.trueUpLead(nextTrueUp.monthsAhead)}
            </span>
          </>
        ) : (
          <span className="type-body-md text-on-surface-variant">{t.trueUpNone}</span>
        )}
      </Tile>

      {/* Needs review: plain typography, NO color (NFR6). Zero reads calm. Scrolls to the lens. */}
      <Tile
        label={t.reviewLabel}
        onClick={scrollToLens}
        ariaLabel={t.reviewAria}
      >
        <span className={cn("type-headline tnum text-on-surface")}>{t.reviewValue(needsReviewCount)}</span>
        <span className="type-caption mt-1 text-on-surface-variant">{t.reviewSub(needsReviewCount)}</span>
      </Tile>
    </div>
  );
}
