// The drawer's "Why this rate" proof section (Feature B). Two parts, in order: the meter's
// own load pattern (a representative day OR the monthly peak-kW trend, whichever it has data
// for) so the pumping shape is visible, then the side-by-side bill comparison - the SAME
// cycle's usage priced under the current rate and the recommended rate. The copy makes it
// explicit: identical usage, two rates, different cost. When there is no priceable cycle or
// no standard target the comparison is omitted; the shape still renders.

import { ColumnChart, type Column } from "@/components/charts/column-chart";
import { LoadCurve } from "@/components/charts/load-curve";
import { TwoRateCompare } from "@/components/charts/two-rate-compare";
import { en } from "@/copy/en";
import { synthesizeDay, monthlyPeakTrend } from "@/lib/energy/load-shape";
import {
  buildProofComparison,
  MODEL_TOLERANCE,
} from "@/lib/dashboard/spike-detail";
import type { MeterView } from "@/lib/dashboard/load";
import type { RateCard } from "@/lib/energy/rates";

const t = en.proof;

export function ProofSection({
  meter,
  card,
  recommendedSchedule,
}: {
  meter: MeterView;
  card: RateCard;
  /** From the meter's rate finding when present; else the standard ag target is used. */
  recommendedSchedule?: string | null;
}) {
  // Monthly peak-kW trend across the meter's reconciled cycles (one point per cycle peak).
  const trend = monthlyPeakTrend(
    meter.periods.map((p) => ({ close: p.close, peakKw: p.peakKw })),
  );
  // A representative day from the latest cycle peak, so the pumping shape reads even with one
  // cycle. Seeded by the meter id so it is stable.
  const latestPeak = [...meter.periods].reverse().find((p) => p.peakKw !== null && p.peakKw > 0);
  const day =
    latestPeak && latestPeak.peakKw !== null
      ? synthesizeDay({ peakKw: latestPeak.peakKw, seed: `${meter.id}:shape` })
      : null;

  const proof = buildProofComparison(meter, card, recommendedSchedule);

  // Highlight the highest-peak bar in the trend (the cycle the demand charge most exposed).
  let maxIdx = -1;
  let maxVal = -Infinity;
  trend.forEach((pt, i) => {
    if (pt.peakKw > maxVal) {
      maxVal = pt.peakKw;
      maxIdx = i;
    }
  });
  const columns: Column[] = trend.map((pt, i) => ({
    value: pt.peakKw,
    label: pt.label,
    highlight: i === maxIdx,
  }));

  if (day === null && trend.length === 0 && proof === null) return null;

  return (
    <section className="mt-4">
      {/* Part 1: the meter's own shape. Prefer the multi-cycle trend; otherwise the day. */}
      {trend.length >= 2 ? (
        <>
          <p className="type-label-caps text-on-surface-variant">{t.trendTitle}</p>
          <p className="type-caption mt-0.5 text-on-surface-variant">{t.trendIntro}</p>
          <div className="mt-2">
            <ColumnChart columns={columns} ariaLabel={t.trendTitle} height={120} />
          </div>
        </>
      ) : day !== null ? (
        <>
          <p className="type-label-caps text-on-surface-variant">{t.shapeTitle}</p>
          <p className="type-caption mt-0.5 text-on-surface-variant">{t.shapeIntro}</p>
          <div className="mt-2 rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-3">
            <LoadCurve
              combined={day.points}
              peakIndex={day.peakIndex}
              ariaLabel={t.shapeTitle}
            />
          </div>
        </>
      ) : null}

      {/* Part 2: same usage, two rates. */}
      {proof !== null && (
        <div className="mt-6">
          <p className="type-label-caps text-on-surface-variant">{t.compareTitle}</p>
          <p className="type-caption mt-0.5 text-on-surface-variant">{t.compareIntro}</p>
          <div className="mt-3">
            <TwoRateCompare
              fromSchedule={proof.fromSchedule}
              toSchedule={proof.toSchedule}
              from={proof.comparison.from.breakdown}
              to={proof.comparison.to.breakdown}
              saveCents={proof.comparison.saveCents}
              billedTotalCents={proof.billedTotalCents}
              modelDeltaFraction={proof.modelDeltaFraction}
              tolerance={MODEL_TOLERANCE}
            />
          </div>
        </div>
      )}
    </section>
  );
}
