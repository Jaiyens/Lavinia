import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, RotateCw } from "lucide-react";
import { en } from "@/copy/en";
import { prisma } from "@/lib/db";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { compareFindings } from "@/lib/recommendations/top-finding";
import { glance, heroes, type CyclePeriod } from "@/lib/dashboard/derive";
import { refreshFindings } from "./actions";
import { DashboardChrome } from "./_components/dashboard-chrome";
import { HeroFigures } from "./_components/hero-figures";
import { GlanceRow } from "./_components/glance-row";
import { RecFeed } from "./_components/rec-feed";
import { recToFindingView, type FindingView } from "./_components/finding-view";

export const metadata: Metadata = {
  title: "Pump Timing · Terra",
  description: "Your meters, rates, and the money hiding in them, ranked.",
};

// Reads the database, so never prerender at build time.
export const dynamic = "force-dynamic";

export default async function PumpTimingPage() {
  const resolved = await dashboardFarm(prisma);
  // No farm at all (truly empty install): send the grower to onboarding to connect.
  if (!resolved) redirect("/dashboard/pump-timing/onboarding");
  const { farm, dataKind } = resolved;

  const [recs, periods, entityCount, accountCount] = await Promise.all([
    prisma.recommendation.findMany({ where: { farmId: farm.id, status: "pending" } }),
    prisma.billingPeriod.findMany({
      where: { pump: { farmId: farm.id } },
      select: {
        close: true,
        totalBillUsd: true,
        totalKwh: true,
        pump: { select: { gpm: true, horsepower: true } },
      },
    }),
    prisma.entity.count({ where: { farmId: farm.id } }),
    prisma.account.count({ where: { farmId: farm.id } }),
  ]);

  const hero = heroes(recs);
  const cyclePeriods: CyclePeriod[] = periods.map((p) => ({
    close: p.close.toISOString(),
    totalBillUsd: p.totalBillUsd,
    totalKwh: p.totalKwh,
    gpm: p.pump.gpm,
    horsepower: p.pump.horsepower,
  }));
  const g = glance(cyclePeriods);
  const findings: FindingView[] = recs.map(recToFindingView).sort(compareFindings);

  const h = en.dashboard.home;

  return (
    <main className="min-h-[100svh]">
      <DashboardChrome dataKind={dataKind} />

      <section className="px-5 py-10 lg:px-8 lg:py-14">
        <div className="mx-auto max-w-5xl">
          <p className="eyebrow eyebrow-muted">{h.eyebrow}</p>
          <h1 className="font-display mt-2 text-[clamp(2.2rem,5vw,3.4rem)] leading-[1.05] text-balance">
            {farm.name}
          </h1>
          <p className="text-foreground/80 mt-4 max-w-2xl text-lg leading-relaxed text-pretty">
            {h.status(hero.actionableCount, hero.saveUsd, hero.riskUsd)}
          </p>

          <div className="mt-10">
            <HeroFigures
              saveUsd={hero.saveUsd}
              riskUsd={hero.riskUsd}
              saveSub={h.saveSub(hero.saveCount)}
              riskSub={h.riskSub(hero.riskCount)}
            />
          </div>

          <GlanceRow glance={g} />

          <RecFeed findings={findings} />

          {/* Drill-down entry: the real Batth hierarchy lives one tap down. */}
          <section className="border-line mt-12 rounded-2xl border border-dashed p-6">
            <h2 className="font-display text-xl">{h.hierarchyTitle}</h2>
            <p className="text-muted mt-2 text-sm leading-relaxed text-pretty">
              {h.hierarchyNote(entityCount, accountCount, farm.pumps.length)}
            </p>
            <Link
              href="/dashboard/pump-timing/farm"
              className="label-caps text-green-deep mt-4 inline-flex items-center gap-2 transition-transform hover:translate-x-0.5"
            >
              {h.browseFarm} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </section>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
            <form action={refreshFindings}>
              <button type="submit" className="label-caps text-muted hover:text-foreground inline-flex items-center gap-2 transition-colors">
                {en.dashboard.recheck} <RotateCw className="size-3.5" aria-hidden />
              </button>
            </form>
            <Link href="/dashboard/pump-timing/settings" className="label-caps text-muted hover:text-foreground transition-colors">
              {en.dashboard.settings} <span aria-hidden>→</span>
            </Link>
            <Link href="/dashboard/pump-timing/onboarding" className="label-caps text-muted hover:text-foreground transition-colors">
              {en.onboarding.index.reonboard} <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
