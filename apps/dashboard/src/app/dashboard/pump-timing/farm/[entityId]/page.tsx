import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { en, usd, kwh } from "@/copy/en";
import { prisma } from "@/lib/db";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { summarizeGroups, emptySummary, type GroupPeriod } from "@/lib/dashboard/aggregate";
import { DashboardChrome } from "../../_components/dashboard-chrome";
import { DrillRow, StatTiles, DrillEmpty } from "../../_components/drill-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entity · Terra" };

const UNASSIGNED = "unassigned";

export default async function EntityPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await params;
  const resolved = await dashboardFarm(prisma);
  if (!resolved) redirect("/dashboard/pump-timing/onboarding");
  const { farm, dataKind } = resolved;

  const isUnassigned = entityId === UNASSIGNED;
  const entity = isUnassigned
    ? null
    : await prisma.entity.findFirst({ where: { id: entityId, farmId: farm.id } });
  if (!isUnassigned && !entity) notFound();
  const entityName = entity?.name ?? en.dashboard.drill.unassigned;

  const accounts = await prisma.account.findMany({
    where: { farmId: farm.id, entityId: isUnassigned ? null : entityId },
    orderBy: { number: "asc" },
  });
  const accountIds = accounts.map((a) => a.id);

  const periods = await prisma.billingPeriod.findMany({
    where: { pump: { farmId: farm.id, accountId: { in: accountIds } } },
    select: { close: true, totalBillUsd: true, totalKwh: true, pump: { select: { accountId: true } } },
  });
  const rows: GroupPeriod[] = periods.map((p) => ({
    key: p.pump.accountId ?? UNASSIGNED,
    close: p.close.toISOString(),
    totalBillUsd: p.totalBillUsd,
    totalKwh: p.totalKwh,
  }));
  const byAccount = summarizeGroups(rows);

  const meterByAccount = new Map<string, number>();
  const pumps = await prisma.pump.findMany({
    where: { farmId: farm.id, accountId: { in: accountIds } },
    select: { accountId: true },
  });
  for (const p of pumps) {
    if (p.accountId) meterByAccount.set(p.accountId, (meterByAccount.get(p.accountId) ?? 0) + 1);
  }

  const latestSpend = [...byAccount.values()].reduce((s, g) => s + g.latestSpend, 0);
  const total12Kwh = [...byAccount.values()].reduce((s, g) => s + g.kwh, 0);
  const d = en.dashboard.drill;

  return (
    <main className="min-h-[100svh]">
      <DashboardChrome dataKind={dataKind} back={{ href: "/dashboard/pump-timing/farm", label: d.farmTitle }} />
      <section className="px-5 py-10 lg:px-8 lg:py-14">
        <div className="reveal mx-auto max-w-3xl">
          <p className="eyebrow eyebrow-muted">{d.entityLabel}</p>
          <h1 className="font-display mt-2 text-[clamp(1.8rem,4vw,2.6rem)] leading-tight text-balance">{entityName}</h1>
          {isUnassigned ? <p className="text-muted mt-3 text-sm text-pretty">{d.unassignedNote}</p> : null}

          <StatTiles
            tiles={[
              { label: d.cycleSpendLabel, value: usd(latestSpend) },
              { label: d.usageLabel, value: kwh(total12Kwh) },
              { label: d.accountsTitle, value: String(accounts.length) },
            ]}
          />

          <h2 className="font-display mt-12 text-xl">{d.accountsTitle}</h2>
          {accounts.length === 0 ? (
            <DrillEmpty message={d.noMeters} />
          ) : (
            <div className="mt-4 space-y-2.5">
              {accounts.map((a) => {
                const g = byAccount.get(a.id) ?? emptySummary(a.id);
                return (
                  <DrillRow
                    key={a.id}
                    href={`/dashboard/pump-timing/farm/${entityId}/${a.id}`}
                    title={`${d.accountLabel} ${a.number}`}
                    sub={d.meterCount(meterByAccount.get(a.id) ?? 0)}
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
