import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { en, usd, kwh } from "@/copy/en";
import { prisma } from "@/lib/db";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { loadRateCard } from "@/lib/pge/rate-card";
import { bucketUsage } from "@/lib/energy/rate-compare";
import type { CycleBill, IntervalReading } from "@/lib/energy/types";
import { summarizeGroups, emptySummary } from "@/lib/dashboard/aggregate";
import { ColumnChart, type Column } from "@/components/charts/column-chart";
import { TouSplit } from "@/components/charts/tou-split";
import { DashboardChrome } from "../../_components/dashboard-chrome";
import { RateFact, StatTiles } from "../../_components/drill-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meter · Terra" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-faint">{label}</span>
      <span className="tnum text-ink font-mono">{value}</span>
    </span>
  );
}

export default async function MeterPage({ params }: { params: Promise<{ pumpId: string }> }) {
  const { pumpId } = await params;
  const resolved = await dashboardFarm(prisma);
  if (!resolved) redirect("/dashboard/pump-timing/onboarding");
  const { farm, dataKind } = resolved;

  const pump = await prisma.pump.findFirst({
    where: { id: pumpId, farmId: farm.id },
    include: {
      account: { select: { number: true, entityId: true } },
      blocks: { select: { id: true, name: true } },
      billingPeriods: { orderBy: { close: "asc" } },
      intervals: { orderBy: { start: "asc" } },
    },
  });
  if (!pump) notFound();

  const d = en.dashboard.drill;
  const bills: CycleBill[] = pump.billingPeriods.map((b) => ({
    start: b.start.toISOString().slice(0, 10),
    close: b.close.toISOString().slice(0, 10),
    tariff: b.tariff,
    demandChargeUsd: b.demandChargeUsd,
    peakKw: b.peakKw,
    totalBillUsd: b.totalBillUsd,
  }));

  const rollup =
    summarizeGroups(
      pump.billingPeriods.map((b) => ({ key: "m", close: b.close.toISOString(), totalBillUsd: b.totalBillUsd, totalKwh: b.totalKwh })),
    ).get("m") ?? emptySummary("m");

  const spendColumns: Column[] = pump.billingPeriods.map((b) => ({
    value: b.totalBillUsd ?? 0,
    label: MONTHS[b.close.getUTCMonth()],
  }));
  const usageColumns: Column[] = pump.billingPeriods.map((b) => ({
    value: b.totalKwh ?? 0,
    label: MONTHS[b.close.getUTCMonth()],
  }));
  const hasUsage = pump.billingPeriods.some((b) => b.totalKwh != null);

  // TOU split for the latest cycle, bucketed from real intervals.
  let tou: { peak: number; partial_peak: number; off_peak: number } | null = null;
  if (pump.intervals.length > 0 && bills.length > 0) {
    const intervals: IntervalReading[] = pump.intervals.map((iv) => ({
      start: iv.start.toISOString(),
      durationSec: iv.durationSec,
      kWh: iv.kWh,
    }));
    const profile = bucketUsage(intervals, bills, farm.timezone, loadRateCard());
    const latest = profile.cycles[profile.cycles.length - 1];
    if (latest) tou = latest.energyKwh;
  }

  const facts: { label: string; value: string }[] = [];
  if (pump.horsepower) facts.push({ label: "Size", value: d.hp(pump.horsepower) });
  if (pump.gpm) facts.push({ label: "Flow", value: d.gpm(pump.gpm) });
  if (pump.solarKw) facts.push({ label: "Solar", value: d.solar(pump.solarKw) });
  if (pump.trueUpMonth) facts.push({ label: "True-up", value: MONTHS[pump.trueUpMonth - 1] ?? "" });

  const backHref = pump.blocks[0]
    ? `/dashboard/pump-timing/ranch/${pump.blocks[0].id}`
    : "/dashboard/pump-timing/farm";

  return (
    <main className="min-h-[100svh]">
      <DashboardChrome dataKind={dataKind} back={{ href: backHref, label: en.dashboard.back }} />
      <section className="px-5 py-10 lg:px-8 lg:py-14">
        <div className="reveal mx-auto max-w-3xl">
          <p className="eyebrow eyebrow-muted">{d.meterTitle}</p>
          <h1 className="font-display mt-2 text-[clamp(1.8rem,4vw,2.6rem)] leading-tight text-balance">{pump.name}</h1>

          {/* Rate is a first-class fact: code plus plain gloss. */}
          <div className="mt-4">
            <p className="eyebrow eyebrow-muted mb-1.5">{d.rateFirst}</p>
            <RateFact code={pump.rateSchedule} size="lg" />
          </div>

          {facts.length > 0 ? (
            <div className="text-muted mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {facts.map((f) => (
                <Fact key={f.label} label={f.label} value={f.value} />
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {pump.blocks.map((b) => (
              <Link key={b.id} href={`/dashboard/pump-timing/ranch/${b.id}`} className="text-green-deep hover:underline">
                {b.name}
              </Link>
            ))}
            {pump.account && pump.accountId ? (
              <Link
                href={`/dashboard/pump-timing/farm/${pump.account.entityId ?? "unassigned"}/${pump.accountId}`}
                className="text-muted hover:text-foreground"
              >
                {d.accountLabel} {pump.account.number}
              </Link>
            ) : null}
          </div>

          <StatTiles
            tiles={[
              { label: d.cycleSpendLabel, value: usd(rollup.latestSpend) },
              { label: d.spendLabel, value: usd(rollup.spend) },
              { label: d.usageLabel, value: kwh(rollup.kwh) },
            ]}
          />

          {/* Charts live here, on drill-in. One time frame per chart. */}
          {tou ? (
            <section className="mt-12">
              <h2 className="font-display text-xl">{d.demandBreakdownTitle}</h2>
              <div className="border-line bg-surface mt-4 rounded-2xl border p-6">
                <TouSplit peakKwh={tou.peak} partialPeakKwh={tou.partial_peak} offPeakKwh={tou.off_peak} />
              </div>
            </section>
          ) : (
            <p className="text-muted border-line mt-12 rounded-2xl border border-dashed p-6 text-sm text-pretty">
              {d.noMeteredHistory}
            </p>
          )}

          {spendColumns.length > 0 ? (
            <section className="mt-10">
              <h2 className="font-display text-xl">{d.spendOverTimeTitle}</h2>
              <div className="border-line bg-surface mt-4 rounded-2xl border p-6">
                <ColumnChart columns={spendColumns} ariaLabel={d.spendOverTimeTitle} />
              </div>
            </section>
          ) : null}

          {hasUsage ? (
            <section className="mt-10">
              <h2 className="font-display text-xl">{d.usageOverTimeTitle}</h2>
              <div className="border-line bg-surface mt-4 rounded-2xl border p-6">
                <ColumnChart columns={usageColumns} ariaLabel={d.usageOverTimeTitle} />
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
