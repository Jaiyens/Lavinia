import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { en, usd, kwh } from "@/copy/en";
import { prisma } from "@/lib/db";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { summarizeGroups, emptySummary } from "@/lib/dashboard/aggregate";
import { DashboardChrome } from "../../_components/dashboard-chrome";
import { DrillRow, StatTiles, DrillEmpty, Pagination } from "../../_components/drill-ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ranch · Terra" };

const PAGE_SIZE = 24;

export default async function RanchPage({
  params,
  searchParams,
}: {
  params: Promise<{ blockId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { blockId } = await params;
  const { page: pageParam } = await searchParams;
  const resolved = await dashboardFarm(prisma);
  if (!resolved) redirect("/dashboard/pump-timing/onboarding");
  const { farm, dataKind } = resolved;

  const block = await prisma.block.findFirst({
    where: { id: blockId, farmId: farm.id },
    include: { crop: { select: { name: true } } },
  });
  if (!block) notFound();

  const where = { farmId: farm.id, blocks: { some: { id: blockId } } };
  const total = await prisma.pump.count({ where });
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const page = Math.min(Math.max(Number(pageParam) || 1, 1), totalPages);

  const pumps = await prisma.pump.findMany({
    where,
    orderBy: { name: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { account: { select: { number: true } } },
  });

  const allPeriods = await prisma.billingPeriod.findMany({
    where: { pump: where },
    select: { pumpId: true, close: true, totalBillUsd: true, totalKwh: true },
  });
  const byPump = summarizeGroups(
    allPeriods.map((p) => ({ key: p.pumpId, close: p.close.toISOString(), totalBillUsd: p.totalBillUsd, totalKwh: p.totalKwh })),
  );
  const ranchRollup =
    summarizeGroups(
      allPeriods.map((p) => ({ key: "all", close: p.close.toISOString(), totalBillUsd: p.totalBillUsd, totalKwh: p.totalKwh })),
    ).get("all") ?? emptySummary("all");

  const d = en.dashboard.drill;
  const acres = block.acreage ? `${Math.round(block.acreage)} acres` : null;
  const sub = [block.crop?.name, acres].filter(Boolean).join(" · ");

  return (
    <main className="min-h-[100svh]">
      <DashboardChrome dataKind={dataKind} back={{ href: "/dashboard/pump-timing/farm", label: d.farmTitle }} />
      <section className="px-5 py-10 lg:px-8 lg:py-14">
        <div className="reveal mx-auto max-w-3xl">
          <p className="eyebrow eyebrow-muted">{d.ranchLabel}</p>
          <h1 className="font-display mt-2 text-[clamp(1.8rem,4vw,2.6rem)] leading-tight text-balance">{block.name}</h1>
          {sub ? <p className="text-muted mt-2 text-sm">{sub}</p> : null}

          <StatTiles
            tiles={[
              { label: d.cycleSpendLabel, value: usd(ranchRollup.latestSpend) },
              { label: d.usageLabel, value: kwh(ranchRollup.kwh) },
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
                  return (
                    <DrillRow
                      key={p.id}
                      href={`/dashboard/pump-timing/meter/${p.id}`}
                      title={p.name}
                      sub={p.account ? `${d.accountLabel} ${p.account.number}` : undefined}
                      rateCode={p.rateSchedule}
                      spend={g.latestSpend}
                      series={g.spendSeries}
                    />
                  );
                })}
              </div>
              <Pagination page={page} totalPages={totalPages} baseHref={`/dashboard/pump-timing/ranch/${blockId}`} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
