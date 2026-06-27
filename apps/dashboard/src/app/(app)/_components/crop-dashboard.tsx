import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { resolveFarmAccess } from "@/lib/auth/access";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import {
  cropYearBars,
  cropYearSummary,
  latestCropYear,
  packerRows,
} from "@/lib/crops/views";
import { loadCropLedger } from "@/lib/crops/load";
import { resolveActiveFarmId, resolveFarm, resolveCropPosition, resolveCropReviewQueue } from "../(dashboard)/_data";
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
        <header className="mb-8">
          <p className="type-label-caps text-primary">{en.crops.eyebrow}</p>
          <h1 className="type-display-lg mt-1 text-on-surface">{en.crops.title}</h1>
          {year !== null && (
            <p className="mt-1 type-body-md text-on-surface-variant">{en.crops.yearLabel(year)}</p>
          )}
        </header>

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
