import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { loadHullers, loadRuns } from "@/lib/almond-portal/data";
import { Reveal } from "../../../_components/shell/reveal";
import { resolveAlmondFarm, resolveContext } from "../_data";
import { RunsTable } from "../_components/runs/runs-table";

// The Almond Logic RUNS / TURNOUT screen, rebuilt 1:1 inside Terra (re-skinned in our palette/fonts).
// The shared portal layout already renders the grower header, sub-nav and hullers/handlers sidebar;
// this page renders ONLY the main content: a Runs table scoped to the active huller + crop year (read
// from the ?hullerId & ?cropYear search params via resolveContext). A run is one validated hulling
// batch with its turnout - the percent of delivered weight that came back as edible meat. Runs are
// sparse (most huller/year combinations have none), so the empty state is the common case. Server
// Component - it resolves the operator's OWN farm and loads through the typed data contract; the
// table only formats.
export default async function AlmondRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ hullerId?: string; cropYear?: string }>;
}) {
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
  const sp = await searchParams;
  const hullers = await loadHullers(prisma, farm.id);
  const ctx = resolveContext(sp, hullers);
  const runs = await loadRuns(prisma, farm.id, ctx.hullerId ?? 0, ctx.cropYear ?? 0);

  const activeHuller = hullers.find((h) => h.id === ctx.hullerId) ?? hullers[0] ?? null;
  const hullerName = activeHuller?.name ?? "Huller";

  return (
    <div className="relative min-w-0">
      <DotPattern
        width={22}
        height={22}
        cr={1}
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 h-[280px] text-primary/15",
          "[mask-image:radial-gradient(360px_circle_at_top,white,transparent)]",
        )}
      />
      <Reveal>
        <header className="mb-6">
          <p className="type-label-caps text-primary">Runs</p>
          <h2 className="type-display-lg mt-1 text-on-surface">{hullerName}</h2>
          <p className="type-body-md mt-2 text-on-surface-variant">
            {ctx.cropYear == null ? "No crop year selected" : `${ctx.cropYear} crop year`}
            {" · "}
            {runs.length === 1 ? "1 run" : `${runs.length} runs`}
          </p>
        </header>

        {runs.length === 0 ? (
          <div className="flex min-h-[14rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 text-center">
            <p className="type-body-md text-on-surface-variant">
              No runs for this huller and crop year.
            </p>
          </div>
        ) : (
          <section>
            <RunsTable runs={runs} />
          </section>
        )}
      </Reveal>
    </div>
  );
}
