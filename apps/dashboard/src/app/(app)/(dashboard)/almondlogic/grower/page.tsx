import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { en, lbs } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { loadHullers, REPORT_LIST } from "@/lib/almond-portal/data";
import { loadCropDeliveries, varietyWeights, totalNet } from "@/lib/crops/deliveries";
import { Reveal } from "../../../_components/shell/reveal";
import { CropDeliveriesTable } from "../../../_components/crop-deliveries-table";
import { CropVarietyPie } from "../../../_components/crop-variety-pie";
import { resolveAlmondFarm, resolveContext, resolveDefaultContext } from "../_data";
import { ReportsPanel } from "../_components/grower/reports-panel";

// The Almond Logic GROWER DETAILS screen, rebuilt 1:1 inside Terra (re-skinned in our palette/fonts).
// The portal shell (layout.tsx) renders the grower header, sub-nav, and hullers/handlers sidebar; this
// page renders only the main content: the deliveries detail for the ACTIVE huller + crop year, the
// reports rail, and the delivery-weight-by-variety pie. Server Component - resolves the operator's
// OWN farm, loads every per-load row, then scopes to the selected context. Every pound is summed in
// the lib (varietyWeights / totalNet) and only formatted here.

export default async function AlmondGrowerPage({
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
  const ctx = resolveContext(sp, hullers, await resolveDefaultContext(farm.id));

  const all = await loadCropDeliveries(prisma, farm.id);
  const rows = all.filter((r) => r.hullerId === ctx.hullerId && r.cropYear === ctx.cropYear);

  const hullerName = hullers.find((h) => h.id === ctx.hullerId)?.name ?? "Huller";
  const pie = varietyWeights(rows);
  const net = totalNet(rows);

  const query = new URLSearchParams();
  if (ctx.hullerId != null) query.set("hullerId", String(ctx.hullerId));
  if (ctx.cropYear != null) query.set("cropYear", String(ctx.cropYear));
  const queryString = query.toString();

  return (
    <div className="relative min-w-0">
      <DotPattern
        width={22}
        height={22}
        cr={1}
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 h-[320px] text-primary/15",
          "[mask-image:radial-gradient(360px_circle_at_top,white,transparent)]",
        )}
      />
      <Reveal>
        <header className="mb-6">
          <p className="type-label-caps text-primary">Grower Details</p>
          <h1 className="type-display-lg mt-1 text-on-surface">{hullerName}</h1>
          <p className="type-body-md mt-2 text-on-surface-variant">
            {ctx.cropYear != null ? `Crop year ${ctx.cropYear}. ` : ""}
            {rows.length} {rows.length === 1 ? "load" : "loads"}, {lbs(net)} net delivered.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-label="Deliveries" className="min-w-0">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="type-title text-on-surface">Deliveries</h2>
              <p className="type-caption text-on-surface-variant">
                {hullerName}
                {ctx.cropYear != null ? ` · ${ctx.cropYear}` : ""} · {rows.length}{" "}
                {rows.length === 1 ? "load" : "loads"}
              </p>
            </div>
            {rows.length === 0 ? (
              <div className="flex min-h-[14rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 shadow-e1">
                <p className="type-body-md text-on-surface-variant">
                  No deliveries for this huller and crop year.
                </p>
              </div>
            ) : (
              <CropDeliveriesTable rows={rows} />
            )}
          </section>

          <aside className="space-y-6 lg:min-w-0">
            <ReportsPanel reports={REPORT_LIST} query={queryString} />
            <section aria-label="Delivery weight by variety">
              <h2 className="type-title mb-3 text-on-surface">Delivery weight by variety</h2>
              <CropVarietyPie data={pie} />
            </section>
          </aside>
        </div>
      </Reveal>
    </div>
  );
}
