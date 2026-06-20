// The drawer's Demand-spike section (Feature A). Given a built SpikeDetail (the foundation's
// analyzeSpike output for the latest material-demand cycle), it renders the intra-day load
// curve with the peak window called out, the plain-English cause, the concrete fix, and the
// before/after dollar line ("$X now to about $Y, save about $Z"). Every number is derived:
// the time of day and the dollars that window set come from the analysis, never hardcoded.

import { LoadCurve } from "@/components/charts/load-curve";
import { en } from "@/copy/en";
import { formatUsd } from "@/lib/format/money";
import type { SpikeDetail } from "@/lib/dashboard/spike-detail";

const t = en.spike;

/** Minute-of-day to a "5pm" style label (the peak time, derived from the analysis). */
function clockLabel(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "alert" | "primary" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="type-label-caps text-on-surface-variant">{label}</span>
      <span
        className={`type-num tnum ${tone === "alert" ? "text-alert" : tone === "primary" ? "text-primary" : "text-on-surface"}`}
      >
        {value}
      </span>
    </div>
  );
}

export function SpikeSection({ detail }: { detail: SpikeDetail }) {
  const { analysis } = detail;
  const peakTime = clockLabel(analysis.peakMinute);
  const cause = analysis.cause === "overlap" ? t.causeOverlap : t.causePeakWindow;

  return (
    <section className="mt-4">
      <p className="type-body-md text-on-surface-variant">{t.intro}</p>

      {/* The headline: the window and the dollars it set (both derived). */}
      <p className="type-headline tnum mt-3 text-on-surface">
        {t.windowSet(peakTime, formatUsd(analysis.demandCents))}
      </p>

      <div className="mt-3 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-3">
        <LoadCurve
          combined={analysis.combined}
          peakIndex={analysis.peakIndex}
          byPump={analysis.byPump}
          ariaLabel={t.curveAria}
          peakLabel={peakTime}
        />
      </div>

      <p className="type-caption mt-2 text-on-surface-variant">
        {analysis.cause === "overlap" ? t.overlapPumpsNote : t.representativeNote}
      </p>

      {/* Cause + fix. */}
      <p className="type-body-md mt-4 text-on-surface">{cause}</p>
      <div className="mt-2 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-low p-3">
        <p className="type-label-caps text-on-surface-variant">{t.fixLabel}</p>
        <p className="type-body-md mt-1 text-on-surface">{analysis.fix.label}</p>

        <div className="mt-3 border-t border-outline-variant pt-2">
          <Stat label={t.nowLabel} value={formatUsd(analysis.demandCents)} tone="alert" />
          <Stat label={t.newPeakLabel} value={t.peakKw(formatKw(analysis.fix.newPeakKw))} />
          <Stat label={t.afterLabel} value={formatUsd(analysis.fix.newDemandCents)} />
          <Stat label={t.saveLabel} value={formatUsd(analysis.fix.saveCents)} tone="primary" />
        </div>
      </div>

      <p className="type-body-md mt-3 font-medium text-on-surface">
        {t.delta(
          formatUsd(analysis.demandCents),
          formatUsd(analysis.fix.newDemandCents),
          formatUsd(analysis.fix.saveCents),
        )}
      </p>
    </section>
  );
}

/** kW to a compact, tabular string. */
function formatKw(kw: number): string {
  return kw.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
