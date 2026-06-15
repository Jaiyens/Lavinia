// The recommendation detail: the evidence behind one finding, the before/after bill-shrink
// for a demand-charge spike, and the one chart relevant to it (one time frame per view).
// Server component, rendered identically by the full page and the intercepting modal. Reads
// everything from the rec's stored action.params plus the meter's billing history, so every
// number traces back to the meter data.

import Link from "next/link";
import { en, rateGloss, usd } from "@/copy/en";
import { cn } from "@/lib/cn";
import { RATE_OPTIMIZATION_TOOL } from "@/lib/energy/rate-compare";
import { DEMAND_CHARGE_TOOL } from "@/lib/energy/retrospective";
import { BILL_AUDIT_TOOL } from "@/lib/energy/bill-audit";
import { BeforeAfterBar } from "@/components/charts/before-after-bar";
import { ColumnChart, type Column } from "@/components/charts/column-chart";
import { polarityOf } from "./finding-view";
import { ResolveActions } from "./resolve-actions";
import type { RecDetailData } from "./rec-detail-data";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(iso: string | undefined): string | null {
  if (!iso || iso.length < 7) return null;
  const m = Number(iso.slice(5, 7)) - 1;
  return MONTHS[m] ? `${MONTHS[m]} ${iso.slice(0, 4)}` : null;
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function EvidenceRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-line flex items-baseline justify-between gap-4 border-b py-3 last:border-b-0">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="text-ink text-right text-sm font-medium">
        {value}
        {sub ? <span className="text-muted ml-2 font-normal">{sub}</span> : null}
      </dd>
    </div>
  );
}

const MONEY_COLOR: Record<string, string> = {
  save: "text-green-deep",
  risk: "text-risk",
  neutral: "text-ink",
};

export function RecDetail({ data }: { data: RecDetailData }) {
  const { rec, params, pump } = data;
  const d = en.dashboard.detail;
  const polarity = polarityOf(rec.tool);
  const cycleLabel = monthLabel(typeof params.cycleStart === "string" ? params.cycleStart : undefined);

  return (
    <article className="space-y-8">
      <header>
        <h1 className="font-display text-[clamp(1.6rem,3.5vw,2.4rem)] leading-tight text-balance">{rec.situation}</h1>
        {rec.impactUsd != null && polarity !== "neutral" ? (
          <p className="mt-4">
            <span className={cn("figure tnum text-5xl sm:text-6xl", MONEY_COLOR[polarity])}>{usd(rec.impactUsd)}</span>
            <span className="text-muted ml-2 text-sm">
              {polarity === "risk" ? en.dashboard.feed.onceLabel : en.dashboard.feed.perYear}
            </span>
          </p>
        ) : null}
        {rec.impactNote ? (
          <p className="text-foreground/80 mt-4 max-w-2xl leading-relaxed text-pretty">{rec.impactNote}</p>
        ) : null}
      </header>

      {/* Evidence: which meter, which rate, which account, which cycle. */}
      <section>
        <h2 className="label-caps text-muted mb-2">{d.evidenceTitle}</h2>
        <dl className="border-line bg-surface rounded-2xl border px-5 py-1">
          {pump ? <EvidenceRow label={d.meterLabel} value={pump.name} /> : null}
          {pump?.rateSchedule ? (
            <EvidenceRow label={d.rateLabel} value={pump.rateSchedule} sub={rateGloss(pump.rateSchedule)} />
          ) : null}
          {pump?.account ? <EvidenceRow label={d.accountLabel} value={pump.account.number} /> : null}
          {pump && pump.blocks.length > 0 ? (
            <EvidenceRow label={d.ranchLabel} value={en.pumpTiming.names(pump.blocks.map((b) => b.name))} />
          ) : null}
          {cycleLabel ? <EvidenceRow label={d.cycleLabel} value={cycleLabel} /> : null}
        </dl>
      </section>

      <CategoryBody data={data} cycleLabel={cycleLabel} />

      {/* Honest stub + the one-tap responses. */}
      <section className="border-line border-t pt-6">
        <p className="text-foreground text-sm font-medium">{rec.action && typeof rec.action === "object" && "label" in rec.action ? String((rec.action as { label?: unknown }).label ?? "") : ""}</p>
        <p className="text-faint mt-1 mb-4 text-xs leading-relaxed">{en.dashboard.feed.stubNote}</p>
        <ResolveActions recId={rec.id} />
        {pump ? (
          <Link
            href={`/dashboard/pump-timing/meter/${pump.id}`}
            className="label-caps text-muted hover:text-foreground mt-5 inline-flex items-center gap-2 transition-colors"
          >
            {en.dashboard.drill.openMeter} <span aria-hidden>→</span>
          </Link>
        ) : null}
      </section>
    </article>
  );
}

function CategoryBody({ data, cycleLabel }: { data: RecDetailData; cycleLabel: string | null }) {
  const { rec, params, pump } = data;
  const d = en.dashboard.detail;

  // Demand-charge exposure: the before/after bill-shrink plus the cycle's daily peaks.
  if (rec.tool === DEMAND_CHARGE_TOOL) {
    const before = asNum(params.demandChargeUsd) ?? 0;
    const after = Math.max(before - (rec.impactUsd ?? 0), 0);
    const peakDay = typeof params.peakDay === "string" ? params.peakDay : null;
    const daily = Array.isArray(params.dailyPeaks) ? (params.dailyPeaks as { date: string; kw: number }[]) : [];
    const columns: Column[] = daily.map((p) => ({
      value: p.kw,
      label: p.date.slice(8, 10),
      highlight: p.date === peakDay,
    }));
    return (
      <>
        <section>
          <h2 className="label-caps text-muted mb-3">{d.beforeAfterTitle}</h2>
          <div className="border-line bg-surface rounded-2xl border p-6 sm:p-8">
            <BeforeAfterBar
              beforeUsd={before}
              afterUsd={after}
              beforeLabel={d.beforeLabel}
              afterLabel={d.afterLabel}
            />
            <p className="text-muted mt-6 text-sm leading-relaxed text-pretty">{d.beforeAfterNote(rec.impactUsd ?? 0)}</p>
          </div>
        </section>
        {columns.length > 0 ? (
          <section>
            <h2 className="label-caps text-muted mb-3">{d.dailyPeaksTitle}</h2>
            <div className="border-line bg-surface rounded-2xl border p-6">
              <ColumnChart columns={columns} ariaLabel={d.dailyPeaksTitle} caption={d.dailyPeaksNote} />
            </div>
          </section>
        ) : null}
      </>
    );
  }

  // Bill audit: the meter's spend over its cycles, the flagged one in red.
  if (rec.tool === BILL_AUDIT_TOOL && pump) {
    const flaggedClose = typeof params.cycleClose === "string" ? params.cycleClose.slice(0, 7) : null;
    const columns: Column[] = pump.billingPeriods.map((b) => ({
      value: b.totalBillUsd ?? 0,
      label: MONTHS[b.close.getUTCMonth()],
      highlight: b.close.toISOString().slice(0, 7) === flaggedClose,
    }));
    return (
      <section>
        <h2 className="label-caps text-muted mb-3">{en.dashboard.drill.spendOverTimeTitle}</h2>
        <div className="border-line bg-surface rounded-2xl border p-6">
          <ColumnChart columns={columns} ariaLabel={en.dashboard.drill.spendOverTimeTitle} caption={d.billAuditChartNote} />
          <dl className="mt-5">
            <EvidenceRow label={`${cycleLabel ?? "This"} bill`} value={usd(asNum(params.totalBillUsd) ?? 0)} />
            <EvidenceRow label="Usual comparable bill" value={usd(asNum(params.medianTotalUsd) ?? 0)} />
          </dl>
        </div>
      </section>
    );
  }

  // Rate optimization: the modeled current vs best, with the bill-reproduction trust line.
  if (rec.tool === RATE_OPTIMIZATION_TOOL) {
    const current = asNum(params.modeledCurrentUsd);
    const best = asNum(params.modeledBestUsd);
    const from = typeof params.fromSchedule === "string" ? params.fromSchedule : null;
    const to = typeof params.toSchedule === "string" ? params.toSchedule : null;
    const reproErr = asNum(params.reproductionError);
    const spend: Column[] = pump
      ? pump.billingPeriods.map((b) => ({ value: b.totalBillUsd ?? 0, label: MONTHS[b.close.getUTCMonth()] }))
      : [];
    return (
      <>
        {from && to && current != null && best != null ? (
          <section>
            <h2 className="label-caps text-muted mb-3">{d.whatWeFound}</h2>
            <div className="border-line bg-surface grid grid-cols-2 gap-px overflow-hidden rounded-2xl border">
              <div className="bg-surface p-5">
                <p className="text-muted text-sm">
                  {from} <span className="text-faint">{rateGloss(from)}</span>
                </p>
                <p className="tnum text-ink mt-1 font-mono text-2xl">{usd(current)}</p>
                <p className="text-faint text-xs">modeled this year</p>
              </div>
              <div className="bg-green-tint/40 p-5">
                <p className="text-green-deep text-sm font-medium">
                  {to} <span className="text-green-deep/60">{rateGloss(to)}</span>
                </p>
                <p className="tnum text-green-deep mt-1 font-mono text-2xl">{usd(best)}</p>
                <p className="text-green-deep/60 text-xs">modeled this year</p>
              </div>
            </div>
            {reproErr != null ? (
              <p className="text-faint mt-3 font-mono text-xs leading-relaxed">
                {en.rateOptimization.matchedWithin(Math.round(reproErr * 100))}
              </p>
            ) : null}
          </section>
        ) : null}
        {spend.length > 0 ? (
          <section>
            <h2 className="label-caps text-muted mb-3">{en.dashboard.drill.spendOverTimeTitle}</h2>
            <div className="border-line bg-surface rounded-2xl border p-6">
              <ColumnChart columns={spend} ariaLabel={en.dashboard.drill.spendOverTimeTitle} />
            </div>
          </section>
        ) : null}
      </>
    );
  }

  // Solar / NEM and the legacy-fleet rollup: the note carries the story; show spend if we have it.
  if (pump && pump.billingPeriods.length > 1) {
    const spend: Column[] = pump.billingPeriods.map((b) => ({
      value: b.totalBillUsd ?? 0,
      label: MONTHS[b.close.getUTCMonth()],
    }));
    return (
      <section>
        <h2 className="label-caps text-muted mb-3">{en.dashboard.drill.spendOverTimeTitle}</h2>
        <div className="border-line bg-surface rounded-2xl border p-6">
          <ColumnChart columns={spend} ariaLabel={en.dashboard.drill.spendOverTimeTitle} />
        </div>
      </section>
    );
  }

  return null;
}
