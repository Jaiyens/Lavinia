import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { en } from "@/copy/en";
import { loadGrower, loadHullers, loadHandlers } from "@/lib/almond-portal/data";
import { resolveActiveFarmId, resolveFarm } from "../_data";
import { resolveDefaultContext } from "./_data";
import { PortalBody } from "./_components/portal-body";
import { PortalNav } from "./_components/portal-nav";
import { PortalSidebar } from "./_components/portal-sidebar";
import { SyncButton } from "./_components/sync-button";

// The Almond Logic portal, rebuilt 1:1 inside Terra (re-skinned in our palette/fonts). This layout
// is the shell every screen shares: the grower header, the screen sub-nav (Home / Grower Details /
// Runs / Reports), and the hullers/handlers sidebar that scopes the active huller + crop year (via
// the ?hullerId & ?cropYear search params). Server Component - resolves the operator's OWN farm the
// same way the rest of the dashboard does, then loads the portal context.
export default async function AlmondPortalLayout({ children }: { children: React.ReactNode }) {
  const userId = await sessionUserId();
  const activeId = await resolveActiveFarmId(userId);
  const resolved = await resolveFarm(userId, activeId, false);

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{en.crops.noFarm}</p>
      </div>
    );
  }

  const { farm } = resolved;
  const [grower, hullers, handlers, def] = await Promise.all([
    loadGrower(prisma, farm.id),
    loadHullers(prisma, farm.id),
    loadHandlers(prisma, farm.id),
    resolveDefaultContext(farm.id),
  ]);

  return (
    <div className="relative min-w-0 flex-1 px-5 py-6 lg:px-10 lg:py-8">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="type-label-caps text-primary">Almond Logic</p>
          <h1 className="type-display-lg mt-1 text-on-surface">{grower?.name ?? farm.name}</h1>
        </div>
        {/* The in-app sync trigger. DEV-ONLY for now: the dev path spawns a HEADED crawler on the
            developer's machine, which has no production equivalent yet (the prod route + hosted
            browser + credential store are scaffolded in src/app/api/almond/sync/route.ts). Gated on
            NODE_ENV so it never renders for a real grower until the production lift lands. */}
        {process.env.NODE_ENV === "development" ? <SyncButton /> : null}
      </header>

      <PortalNav />

      <PortalBody
        sidebar={
          <PortalSidebar
            hullers={hullers}
            handlers={handlers}
            defaultHullerId={def.hullerId}
            defaultCropYear={def.cropYear}
          />
        }
      >
        {children}
      </PortalBody>
    </div>
  );
}
