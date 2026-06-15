// The three glance numbers under the heroes: total spend this cycle, electric used, and
// water pumped, each with a trend arrow versus last cycle. The kept Wexus pattern, reframed.
// Mono, tabular figures. Trend arrows are directional only (muted ink), never colored, so
// green stays reserved for savings and red for money at risk. Server component.

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { en, gallons, kwh, usd } from "@/copy/en";
import type { Glance, GlanceMetric } from "@/lib/dashboard/derive";

function Trend({ metric }: { metric: GlanceMetric }) {
  if (!metric.hasData) return null;
  if (metric.trendPct === null) {
    return <span className="text-faint font-mono text-xs">{en.dashboard.home.noTrend}</span>;
  }
  const pct = metric.trendPct;
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  const text =
    pct > 0
      ? en.dashboard.home.trendUp(pct)
      : pct < 0
        ? en.dashboard.home.trendDown(Math.abs(pct))
        : en.dashboard.home.trendFlat;
  return (
    <span className="text-muted inline-flex items-center gap-1 font-mono text-xs">
      <Icon className="size-3.5" aria-hidden />
      {text}
    </span>
  );
}

function Cell({
  label,
  value,
  hasData,
  estimate,
  estimateNote,
  metric,
}: {
  label: string;
  value: string;
  hasData: boolean;
  estimate?: boolean;
  estimateNote?: string;
  metric: GlanceMetric;
}) {
  return (
    <div className="py-1">
      <p className="eyebrow eyebrow-muted flex items-center gap-2">
        {label}
        {estimate ? (
          <span className="text-faint border-line rounded-full border px-1.5 py-0.5 text-[0.6rem] tracking-normal normal-case" title={estimateNote}>
            {en.dashboard.home.estimate}
          </span>
        ) : null}
      </p>
      {hasData ? (
        <p className="tnum text-ink mt-1.5 font-mono text-2xl sm:text-[1.7rem]">{value}</p>
      ) : (
        <p className="text-ink/30 mt-1.5 font-mono text-2xl sm:text-[1.7rem]">&mdash;</p>
      )}
      <div className="mt-1.5 min-h-[1.1rem]">
        <Trend metric={metric} />
      </div>
    </div>
  );
}

export function GlanceRow({ glance }: { glance: Glance }) {
  return (
    <section className="border-line mt-10 grid grid-cols-1 gap-x-6 gap-y-5 border-t pt-6 sm:grid-cols-3">
      <Cell
        label={en.dashboard.home.glanceSpend}
        value={usd(glance.spend.value)}
        hasData={glance.spend.hasData}
        metric={glance.spend}
      />
      <Cell
        label={en.dashboard.home.glanceElectric}
        value={kwh(glance.electric.value)}
        hasData={glance.electric.hasData}
        metric={glance.electric}
      />
      <Cell
        label={en.dashboard.home.glanceWater}
        value={gallons(glance.water.value)}
        hasData={glance.water.hasData}
        estimate
        estimateNote={en.dashboard.home.waterNote}
        metric={glance.water}
      />
    </section>
  );
}
