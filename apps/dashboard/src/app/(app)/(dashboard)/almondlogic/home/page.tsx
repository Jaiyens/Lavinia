import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { en, usdPerLb } from "@/copy/en";
import { Card } from "@/components/ui/card";
import { loadRecentActivity } from "@/lib/almond-portal/data";
import { Reveal } from "../../../_components/shell/reveal";
import { resolveCostPerPound } from "../../_data";
import { resolveAlmondFarm, resolveDefaultContext } from "../_data";
import { PortalNews } from "../_components/home/portal-news";
import { RecentActivity } from "../_components/home/recent-activity";

// The Almond Logic portal HOME, rebuilt 1:1 inside Terra. Now a "Source data" screen under the crop
// worksheet (the module front door), reachable via /almondlogic/home. The portal shell (layout.tsx)
// renders the grower header, the screen sub-nav, and the hullers/handlers sidebar; this page renders
// the main content: the farm cost-per-pound headline (the differentiator number, links to the full
// Cost view), then the two-column "Grower Portal News" + "Recent Activity" home. Server Component,
// farmId-scoped; every figure comes from the pure cost engine via resolveCostPerPound and is only
// formatted here.
export default async function AlmondHomePage() {
  const resolved = await resolveAlmondFarm();

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{en.crops.noFarm}</p>
      </div>
    );
  }

  const { farm } = resolved;
  const def = await resolveDefaultContext(farm.id);
  const costYear = def.cropYear ?? new Date().getFullYear();
  const [activity, cost] = await Promise.all([
    loadRecentActivity(prisma, farm.id),
    resolveCostPerPound(farm.id, costYear),
  ]);

  return (
    <Reveal>
      {/* The farm-wide cost-per-pound headline: the number only Terra can produce (PG&E energy /
          delivered pounds), with its caveat so it is never overread. Links to the per-block breakdown. */}
      <Link href="/almondlogic/cost" className="mb-6 block">
        <Card className="min-h-[6rem] justify-start gap-0 rounded-[var(--radius-control)] p-5 transition-colors hover:bg-surface-container-low">
          <span className="type-label-caps inline-flex items-center gap-1.5 text-on-surface-variant">
            {en.crops.cost.farmLabel} <ArrowRight size={14} aria-hidden />
          </span>
          {cost.farm.energyCents === 0 || cost.farm.centsPerLb === null ? (
            <p className="mt-2 type-body-md text-on-surface-variant">{en.crops.cost.noFarmRatio}</p>
          ) : (
            <>
              <span className="type-headline mt-1 tnum text-on-surface">{usdPerLb(cost.farm.centsPerLb)}</span>
              <span className="mt-2 type-caption text-on-surface-variant">{en.crops.cost.farmCaveat}</span>
            </>
          )}
        </Card>
      </Link>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PortalNews />
        <RecentActivity activity={activity} />
      </div>
    </Reveal>
  );
}
