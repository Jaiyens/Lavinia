import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { resolveFarmAccess } from "@/lib/auth/access";
import { cn } from "@/lib/cn";
import { en, lbs, usdPerLb } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import { DotPattern } from "@/components/ui/dot-pattern";
import { Card } from "@/components/ui/card";
import { loadCropDeliveries } from "@/lib/crops/deliveries";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { resolveActiveFarmId, resolveFarm, resolveCostPerPound } from "../../_data";
import { Reveal } from "../../../_components/shell/reveal";
import { CropCostTable } from "../../../_components/crop-cost-table";
import {
  CropFieldBlockMap,
  type BlockOption,
  type FieldWeight,
} from "../../../_components/crop-field-block-map";

// Cost per pound by block (WS1): the number only Terra can produce, reconciled PG&E energy cost
// divided by mapped almond yield. Server Component - resolves the operator's OWN farm exactly like
// the Crops/Deliveries tabs, picks the crop year (the latest delivered season, else the current
// year), and resolves the cost through the pure engine (resolveCostPerPound). The farm headline,
// the per-block table, the residual lines, and the field->block mapping UI all FORMAT the engine's
// integer figures; nothing here computes a per-pound number. The mapping facts (distinct fields with
// their total delivered pounds, the farm's blocks, the current field->block map) are gathered here
// and handed to the client mapping component.

// The crop-year window currently follows the calendar year (see cropYearWindow); the season the page
// shows is the latest crop year that has any deliveries, falling back to the current calendar year so
// a brand-new farm still renders an honest empty state for this season.
function pickCropYear(deliveryYears: readonly number[]): number {
  if (deliveryYears.length > 0) return Math.max(...deliveryYears);
  return new Date().getFullYear();
}

export default async function CropCostPage() {
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
  const t = en.crops.cost;

  // Mapping is a write (manager or owner); a viewer sees the read-only map.
  const access = userId ? await resolveFarmAccess(prisma, farm.id, userId) : null;
  const mapReadOnly = !(access?.canManageData ?? false);

  // Deliveries drive both the crop year and the field-mapping rows.
  const deliveries = await loadCropDeliveries(prisma, farm.id);
  const cropYear = pickCropYear(deliveries.map((d) => d.cropYear));

  // The cost result (the only producer of figures) for the chosen season.
  const cost = await resolveCostPerPound(farm.id, cropYear);

  // The blocks + the current field->block map for the mapping UI (RLS-scoped). Read here (not from
  // the cost result) because the dropdown needs every block, including ones with no energy or yield.
  const { blocks, fieldBlockMap } = await withFarmTenant(prisma, farm.id, async (tx) => {
    const blockRows = await tx.block.findMany({
      where: { farmId: farm.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const mapRows = await tx.cropFieldBlock.findMany({
      where: { farmId: farm.id },
      select: { field: true, blockId: true },
    });
    const blocks: BlockOption[] = blockRows.map((b) => ({ id: b.id, name: b.name }));
    const fieldBlockMap: Record<string, string> = {};
    for (const r of mapRows) fieldBlockMap[r.field] = r.blockId;
    return { blocks, fieldBlockMap };
  });

  // Distinct delivery fields for the chosen crop year, each with its total delivered pounds, sorted
  // by weight desc so the biggest fields surface first. Summed here (server), never in a component.
  const weightByField = new Map<string, number>();
  for (const d of deliveries) {
    if (d.cropYear !== cropYear || d.field === null) continue;
    weightByField.set(d.field, (weightByField.get(d.field) ?? 0) + d.netLb);
  }
  const fieldWeights: FieldWeight[] = [...weightByField.entries()]
    .map(([field, netLb]) => ({ field, netLb }))
    .sort((a, b) => b.netLb - a.netLb || (a.field < b.field ? -1 : 1));

  const hasResidualYield = cost.residual.unmappedYieldLb > 0;
  const hasResidualEnergy = cost.residual.unallocatableEnergyCents > 0;
  const anyResidual = hasResidualYield || hasResidualEnergy;
  const noEnergy = cost.farm.energyCents === 0;

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
          <Link
            href="/crops"
            className="type-label-caps inline-flex items-center gap-1 text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <ArrowLeft size={14} aria-hidden /> {en.crops.title}
          </Link>
          <p className="type-label-caps mt-3 text-primary">{farm.name}</p>
          <h1 className="type-display-lg mt-1 text-on-surface">{t.title}</h1>
          <p className="type-body-md mt-2 text-on-surface-variant">
            {t.yearLabel(cropYear)}. {t.coverage(cost.residual.metersReconciled, cost.residual.metersTotal)}.
          </p>
        </header>

        <div className="flex flex-col gap-10">
          {/* Farm headline tile: the differentiator number, with its caveat so it is never overread. */}
          <Card className="min-h-[6rem] justify-start gap-0 rounded-[var(--radius-control)] p-5">
            <span className="type-label-caps text-on-surface-variant">{t.farmLabel}</span>
            {noEnergy ? (
              <p className="mt-2 type-body-md text-on-surface-variant">{t.noEnergy}</p>
            ) : cost.farm.centsPerLb === null ? (
              <p className="mt-2 type-body-md text-on-surface-variant">{t.noFarmRatio}</p>
            ) : (
              <>
                <span className="type-display-lg mt-1 tnum text-on-surface">
                  {usdPerLb(cost.farm.centsPerLb)}
                </span>
                <span className="mt-2 type-caption text-on-surface-variant">{t.farmCaveat}</span>
              </>
            )}
          </Card>

          {/* Per-block table. */}
          <section aria-label={t.table.caption}>
            <h2 className="mb-3 type-headline text-on-surface">{t.table.caption}</h2>
            <CropCostTable rows={cost.blocks} />
          </section>

          {/* Residual lines: pounds and dollars not yet attributed, surfaced honestly. */}
          <section aria-label={t.residual.title}>
            <h2 className="mb-3 type-headline text-on-surface">{t.residual.title}</h2>
            <Card className="gap-2 rounded-[var(--radius-control)] p-5">
              {anyResidual ? (
                <ul className="flex flex-col gap-1.5">
                  {hasResidualYield && (
                    <li className="type-body-md text-on-surface">
                      {t.residual.unmappedYield(lbs(cost.residual.unmappedYieldLb))}
                    </li>
                  )}
                  {hasResidualEnergy && (
                    <li className="type-body-md text-on-surface">
                      {t.residual.unallocatableEnergy(formatUsdWhole(cost.residual.unallocatableEnergyCents))}
                    </li>
                  )}
                  {hasResidualYield && (
                    <li className="type-caption text-on-surface-variant">{t.residual.mapHint}</li>
                  )}
                </ul>
              ) : (
                <p className="type-body-md text-on-surface-variant">{t.residual.allAttributed}</p>
              )}
            </Card>
          </section>

          {/* Field -> block mapping. */}
          <CropFieldBlockMap
            fieldWeights={fieldWeights}
            blocks={blocks}
            fieldBlockMap={fieldBlockMap}
            readOnly={mapReadOnly}
          />
        </div>
      </Reveal>
    </div>
  );
}
