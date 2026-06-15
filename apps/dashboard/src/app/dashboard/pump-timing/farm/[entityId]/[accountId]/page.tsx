import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { en, usd, kwh } from "@/copy/en";
import { prisma } from "@/lib/db";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { summarizeGroups, emptySummary, type GroupPeriod } from "@/lib/dashboard/aggregate";
import { DashboardChrome } from "../../../_components/dashboard-chrome";
import { DrillRow, StatTiles, DrillEmpty, Pagination } from "../../../_components/drill-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Account · Terra" };

const PAGE_SIZE = 24;

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ entityId: string; accountId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { entityId, accountId } = await params;
  const { page: pageParam } = await searchParams;
  const resolved = await dashboardFarm(prisma);
  if (!resolved) redirect("/dashboard/pump-timing/onboarding");
  const { farm, dataKind } = resolved;

  const account = await prisma.account.findFirst({ where: { id: accountId, farmId: farm.id } });
  if (!account) notFound();

  const total = await prisma.pump.count({ where: { farmId: farm.id, accountId } });
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const page = Math.min(Math.max(Number(pageParam) || 1, 1), totalPages);

  const pumps = await prisma.pump.findMany({
    where: { farmId: farm.id, accountId },
    orderBy: { name: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { blocks: { select: { name: true } } },
  });

  const periods = await prisma.billingPeriod.findMany({
    where: { pumpId: { in: pumps.map((p) => p.id) } },
    select: { pumpId: true, close: true, totalBillUsd: true, totalKwh: true },
  });
  const rows: GroupPeriod[] = periods.map((p) => ({
    key: p.pumpId,
    close: p.close.toISOString(),
    totalBillUsd: p.totalBillUsd,
    totalKwh: p.totalKwh,
  }));
  const byPump = summarizeGroups(rows);

  // Account-wide totals across all of its meters (not just this page).
  const allPeriods = await prisma.billingPeriod.findMany({
    where: { pump: { farmId: farm.id, accountId } },
    select: { close: true, totalBillUsd: true, totalKwh: true },
  });
  const acctRollup = summarizeGroups(
    allPeriods.map((p) => ({ key: "all", close: p.close.toISOString(), totalBillUsd: p.totalBillUsd, totalKwh: p.totalKwh })),
  ).get("all") ?? emptySummary("all");

  const d = en.dashboard.drill;
  const baseHref = `/dashboard/pump-timing/farm/${entityId}/${accountId}`;

  return (
    <main className="min-h-[100svh]">
      <DashboardChrome dataKind={dataKind} back={{ href: `/dashboard/pump-timing/farm/${entityId}`, label: d.entityLabel }} />
      <section className="px-5 py-10 lg:px-8 lg:py-14">
        <div className="reveal mx-auto max-w-3xl">
          <p className="eyebrow eyebrow-muted">{d.accountLabel}</p>
          <h1 className="font-display mt-2 text-[clamp(1.8rem,4vw,2.6rem)] leading-tight text-balance">{account.number}</h1>

          <StatTiles
            tiles={[
              { label: d.cycleSpendLabel, value: usd(acctRollup.latestSpend) },
              { label: d.usageLabel, value: kwh(acctRollup.kwh) },
              { label: d.metersTitle, value: String(total) },
            ]}
          />

          <h2 className="font-display mt-12 text-xl">{d.metersTitle}</h2>
          {pumps.length === 0 ? (
            <DrillEmpty message={d.noMeters} />
          ) : (
            <>
              <div className="mt-4 space-y-2.5">
                {pumps.map((p) => {
                  const g = byPump.get(p.id) ?? emptySummary(p.id);
                  const ranch = p.blocks.length ? en.pumpTiming.names(p.blocks.map((b) => b.name)) : undefined;
                  return (
                    <DrillRow
                      key={p.id}
                      href={`/dashboard/pump-timing/meter/${p.id}`}
                      title={p.name}
                      sub={ranch}
                      rateCode={p.rateSchedule}
                      spend={g.latestSpend}
                      series={g.spendSeries}
                    />
                  );
                })}
              </div>
              <Pagination page={page} totalPages={totalPages} baseHref={baseHref} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
