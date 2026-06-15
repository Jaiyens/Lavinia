import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { en, usd, kwh } from "@/copy/en";
import { prisma } from "@/lib/db";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { summarizeGroups, emptySummary, type GroupPeriod } from "@/lib/dashboard/aggregate";
import { DashboardChrome } from "../_components/dashboard-chrome";
import { DrillRow, StatTiles, DrillEmpty } from "../_components/drill-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your operation · Terra" };

const UNASSIGNED = "unassigned";

export default async function FarmPage() {
  const resolved = await dashboardFarm(prisma);
  if (!resolved) redirect("/dashboard/pump-timing/onboarding");
  const { farm, dataKind } = resolved;

  const [entities, blocks, periods, pumps, accounts] = await Promise.all([
    prisma.entity.findMany({ where: { farmId: farm.id }, orderBy: { name: "asc" } }),
    prisma.block.findMany({ where: { farmId: farm.id }, orderBy: { name: "asc" } }),
    prisma.billingPeriod.findMany({
      where: { pump: { farmId: farm.id } },
      select: {
        close: true,
        totalBillUsd: true,
        totalKwh: true,
        pump: {
          select: {
            account: { select: { entityId: true } },
            blocks: { select: { id: true } },
          },
        },
      },
    }),
    prisma.pump.findMany({
      where: { farmId: farm.id },
      select: { account: { select: { entityId: true } }, blocks: { select: { id: true } } },
    }),
    prisma.account.findMany({ where: { farmId: farm.id }, select: { entityId: true } }),
  ]);

  // Group periods by entity and (separately) by ranch. A pump serves one block in the
  // Batth data, so a period counts once toward its ranch.
  const entityRows: GroupPeriod[] = periods.map((p) => ({
    key: p.pump.account?.entityId ?? UNASSIGNED,
    close: p.close.toISOString(),
    totalBillUsd: p.totalBillUsd,
    totalKwh: p.totalKwh,
  }));
  const ranchRows: GroupPeriod[] = periods.flatMap((p) =>
    p.pump.blocks.map((b) => ({
      key: b.id,
      close: p.close.toISOString(),
      totalBillUsd: p.totalBillUsd,
      totalKwh: p.totalKwh,
    })),
  );
  const byEntity = summarizeGroups(entityRows);
  const byRanch = summarizeGroups(ranchRows);

  const meterByEntity = new Map<string, number>();
  const meterByRanch = new Map<string, number>();
  for (const p of pumps) {
    const ek = p.account?.entityId ?? UNASSIGNED;
    meterByEntity.set(ek, (meterByEntity.get(ek) ?? 0) + 1);
    for (const b of p.blocks) meterByRanch.set(b.id, (meterByRanch.get(b.id) ?? 0) + 1);
  }
  const acctByEntity = new Map<string, number>();
  for (const a of accounts) {
    const k = a.entityId ?? UNASSIGNED;
    acctByEntity.set(k, (acctByEntity.get(k) ?? 0) + 1);
  }

  const farmLatestSpend = [...byEntity.values()].reduce((s, g) => s + g.latestSpend, 0);
  const farm12Kwh = [...byEntity.values()].reduce((s, g) => s + g.kwh, 0);
  const unassignedCount = meterByEntity.get(UNASSIGNED) ?? 0;
  const d = en.dashboard.drill;

  return (
    <main className="min-h-[100svh]">
      <DashboardChrome dataKind={dataKind} back={{ href: "/dashboard/pump-timing", label: en.dashboard.back }} />
      <section className="px-5 py-10 lg:px-8 lg:py-14">
        <div className="reveal mx-auto max-w-3xl">
          <p className="eyebrow eyebrow-muted">{d.farmTitle}</p>
          <h1 className="font-display mt-2 text-[clamp(2rem,4.5vw,3rem)] leading-tight text-balance">{farm.name}</h1>

          <StatTiles
            tiles={[
              { label: d.cycleSpendLabel, value: usd(farmLatestSpend) },
              { label: d.usageLabel, value: kwh(farm12Kwh) },
              { label: d.metersTitle, value: String(farm.pumps.length) },
            ]}
          />

          <h2 className="font-display mt-12 text-xl">{d.entitiesTitle}</h2>
          {entities.length === 0 ? (
            <DrillEmpty message={d.noEntities} />
          ) : (
            <div className="mt-4 space-y-2.5">
              {entities.map((e) => {
                const g = byEntity.get(e.id) ?? emptySummary(e.id);
                return (
                  <DrillRow
                    key={e.id}
                    href={`/dashboard/pump-timing/farm/${e.id}`}
                    title={e.name}
                    sub={`${d.meterCount(meterByEntity.get(e.id) ?? 0)} · ${d.accountCount(acctByEntity.get(e.id) ?? 0)}`}
                    spend={g.latestSpend}
                    series={g.spendSeries}
                  />
                );
              })}
              {unassignedCount > 0 ? (
                <DrillRow
                  href={`/dashboard/pump-timing/farm/${UNASSIGNED}`}
                  title={d.unassigned}
                  sub={`${d.meterCount(unassignedCount)} · ${d.unassignedNote}`}
                  spend={(byEntity.get(UNASSIGNED) ?? emptySummary(UNASSIGNED)).latestSpend}
                  series={(byEntity.get(UNASSIGNED) ?? emptySummary(UNASSIGNED)).spendSeries}
                />
              ) : null}
            </div>
          )}

          <h2 className="font-display mt-12 text-xl">{d.ranchesTitle}</h2>
          {blocks.length === 0 ? (
            <DrillEmpty message={d.noMeters} />
          ) : (
            <div className="mt-4 space-y-2.5">
              {blocks.map((b) => {
                const g = byRanch.get(b.id) ?? emptySummary(b.id);
                const acres = b.acreage ? `${en.dashboard.drill.meterCount(meterByRanch.get(b.id) ?? 0)} · ${Math.round(b.acreage)} acres` : d.meterCount(meterByRanch.get(b.id) ?? 0);
                return (
                  <DrillRow
                    key={b.id}
                    href={`/dashboard/pump-timing/ranch/${b.id}`}
                    title={b.name}
                    sub={acres}
                    spend={g.latestSpend}
                    series={g.spendSeries}
                  />
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
