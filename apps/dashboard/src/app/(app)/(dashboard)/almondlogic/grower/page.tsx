import Link from "next/link";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { en, lbs } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { loadHullers } from "@/lib/almond-portal/data";
import { loadCropDeliveries, totalNet } from "@/lib/crops/deliveries";
import { Reveal } from "../../../_components/shell/reveal";
import { AlmondCredentialForm } from "../_components/almond-credential-form";
import { DeliverySummaryTable } from "../_components/reports/report-tables";
import { deliverySummaryByVariety, deliverySummaryTotal } from "../_components/reports/aggregate";
import { resolveAlmondFarm, resolveContext, resolveDefaultContext } from "../_data";

// The Almond Logic GROWER DETAILS screen, rebuilt 1:1 inside Terra (re-skinned in our palette/fonts).
// The portal shell (layout.tsx) renders the grower header, sub-nav, and hullers/handlers sidebar; this
// page renders only the main content: the deliveries detail for the ACTIVE huller + crop year. The
// reports list and the delivery-weight-by-variety pie now live on their own tabs (Reports, Deliveries),
// so they are not duplicated here. Server Component - resolves the operator's OWN farm, loads every
// per-load row, then scopes to the selected context. Every pound is summed in the lib, formatted here.

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
  const net = totalNet(rows);
  // Grower Details is a scoped SUMMARY (by variety) for the active huller + year; the full per-load
  // table lives once on the Deliveries tab (no duplicate raw table across two screens).
  const summary = deliverySummaryByVariety(rows);
  const summaryTotal = deliverySummaryTotal(summary);

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

        <section aria-label="Deliveries by variety" className="min-w-0">
          {rows.length === 0 ? (
            <div className="flex min-h-[14rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 shadow-e1">
              <p className="type-body-md text-on-surface-variant">
                No deliveries for this huller and crop year.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <DeliverySummaryTable rows={summary} total={summaryTotal} />
              <Link
                href="/almondlogic/deliveries"
                className="type-label-caps inline-flex items-center gap-1 text-primary hover:underline"
              >
                View all loads in Deliveries
              </Link>
            </div>
          )}
        </section>

        <section aria-label={en.crops.credential.title} className="mt-8 min-w-0">
          <AlmondCredentialForm />
        </section>
      </Reveal>
    </div>
  );
}
