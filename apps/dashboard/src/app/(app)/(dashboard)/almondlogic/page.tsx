import { prisma } from "@/lib/db";
import { en } from "@/copy/en";
import { loadRecentActivity } from "@/lib/almond-portal/data";
import { Reveal } from "../../_components/shell/reveal";
import { resolveAlmondFarm } from "./_data";
import { PortalNews } from "./_components/home/portal-news";
import { RecentActivity } from "./_components/home/recent-activity";

// The Almond Logic portal HOME, rebuilt 1:1 inside Terra. The portal shell (layout.tsx) already
// renders the grower header, the screen sub-nav, and the hullers/handlers sidebar; this page renders
// only the main content: a two-column home mirroring Almond Logic, with a wider "Grower Portal News"
// column on the left and a "Recent Activity" rail on the right. Server Component, farmId-scoped.
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
  const activity = await loadRecentActivity(prisma, farm.id);

  return (
    <Reveal>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <PortalNews />
        <RecentActivity activity={activity} />
      </div>
    </Reveal>
  );
}
