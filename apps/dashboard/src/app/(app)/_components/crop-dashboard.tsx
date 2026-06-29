import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { resolveFarmAccess } from "@/lib/auth/access";
import { cn } from "@/lib/cn";
import { en, usdPerLb } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { Card } from "@/components/ui/card";
import {
  cropYearBars,
  cropYearSummary,
  latestCropYear,
  packerRows,
} from "@/lib/crops/views";
import { loadCropLedger } from "@/lib/crops/load";
import {
  resolveActiveFarmId,
  resolveFarm,
  resolveCropPosition,
  resolveCropReviewQueue,
  resolveCostPerPound,
} from "../(dashboard)/_data";
import { Reveal } from "./shell/reveal";
import { CropKpis } from "./crop-kpis";
import { CropPackerTable } from "./crop-packer-table";
import { CropYoyChart } from "./crop-yoy-chart";
import { CropReviewQueue } from "./crop-review-queue";

// The Crops tab (Phase 6). Server Component: resolves the signed-in operator's OWN farm exactly the
// way the Energy tab does (owner-scoped on the session + the active-farm cookie, never another
// grower's), then loads the crop POSITION through recomputePositions (resolveCropPosition) and the
// reconciliation queue, and stacks the reveal-wrapped sections. The module's law holds throughout:
// every pound on this surface comes from the position or a direct query and is formatted, never
// computed, by the components below; an Almond Logic estimate is always tagged so it is never read
// as a packer-settled final.
export async function CropDashboard() {
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
  // A signed-in VIEWER is read-only: the manual resolve requires manager+, so hide the buttons.
  const access = userId ? await resolveFarmAccess(prisma, farm.id, userId) : null;
  const reviewReadOnly = !(access?.canManageData ?? false);

  // The position (the ONLY producer of pound totals) + the un-certified review rows. The packer
  // table also needs the raw ledger commitments, which packerRows() folds against the position.
  const positions = await resolveCropPosition(farm.id);
  const reviewRows = await resolveCropReviewQueue(farm.id);
  const ledger = await loadCropLedger(prisma, farm.id);

  // Pure view projections (every pound summed in the lib, never in a component below).
  const year = latestCropYear(positions);
  const summary = year !== null ? cropYearSummary(positions, year) : null;
  const rows = packerRows(ledger, positions);
  const bars = cropYearBars(positions);

  // The farm-wide cost-per-pound headline (WS1): reconciled PG&E energy / delivered pounds for the
  // latest season (falls back to the current year so a connected farm with no position still tries).
  // Every figure is produced by the pure engine inside resolveCostPerPound; the tile only formats.
  const costYear = year ?? new Date().getFullYear();
  const cost = await resolveCostPerPound(farm.id, costYear);

  const empty = positions.length === 0;

  return (
    <div className="relative min-w-0 flex-1 px-5 py-6 lg:px-12 lg:py-10">
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
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="type-label-caps text-primary">{en.crops.eyebrow}</p>
            <h1 className="type-display-lg mt-1 text-on-surface">{en.crops.title}</h1>
            {year !== null && (
              <p className="mt-1 type-body-md text-on-surface-variant">{en.crops.yearLabel(year)}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/crops/cost"
              className="type-label-caps inline-flex min-h-[40px] items-center gap-1.5 rounded-[var(--radius-md)] border border-outline-variant bg-surface-container-lowest px-4 text-on-surface shadow-e1 transition-colors hover:bg-surface-container-low"
            >
              {en.crops.cost.viewLink} <ArrowRight size={14} aria-hidden />
            </Link>
            <Link
              href="/crops/reconcile"
              className="type-label-caps inline-flex min-h-[40px] items-center gap-1.5 rounded-[var(--radius-md)] border border-outline-variant bg-surface-container-lowest px-4 text-on-surface shadow-e1 transition-colors hover:bg-surface-container-low"
            >
              {en.crops.cost.reconcileLink} <ArrowRight size={14} aria-hidden />
            </Link>
            <Link
              href="/crops/deliveries"
              className="type-label-caps inline-flex min-h-[40px] items-center gap-1.5 rounded-[var(--radius-md)] border border-outline-variant bg-surface-container-lowest px-4 text-on-surface shadow-e1 transition-colors hover:bg-surface-container-low"
            >
              View all deliveries <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </header>

        {/* The farm-wide cost-per-pound headline tile (WS1): the differentiator number, with its
            caveat so it is never overread. Links to the full per-block breakdown. */}
        <Link href="/crops/cost" className="mb-8 block">
          <Card className="min-h-[6rem] justify-start gap-0 rounded-[var(--radius-control)] p-5 transition-colors hover:bg-surface-container-low">
            <span className="type-label-caps text-on-surface-variant">{en.crops.cost.farmLabel}</span>
            {cost.farm.energyCents === 0 || cost.farm.centsPerLb === null ? (
              <p className="mt-2 type-body-md text-on-surface-variant">{en.crops.cost.noFarmRatio}</p>
            ) : (
              <>
                <span className="type-headline mt-1 tnum text-on-surface">
                  {usdPerLb(cost.farm.centsPerLb)}
                </span>
                <span className="mt-2 type-caption text-on-surface-variant">
                  {en.crops.cost.farmCaveat}
                </span>
              </>
            )}
          </Card>
        </Link>

        {empty ? (
          <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8">
            <p className="type-body-md text-on-surface-variant">{en.crops.empty}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {summary && <CropKpis summary={summary} />}

            <section aria-label={en.crops.table.caption}>
              <h2 className="mb-3 type-headline text-on-surface">{en.crops.table.caption}</h2>
              <CropPackerTable rows={rows} />
            </section>

            <section aria-label={en.crops.chart.caption}>
              <h2 className="mb-3 type-headline text-on-surface">{en.crops.chart.caption}</h2>
              <CropYoyChart bars={bars} />
            </section>

            <CropReviewQueue rows={reviewRows} readOnly={reviewReadOnly} />
          </div>
        )}
      </Reveal>
    </div>
  );
}
