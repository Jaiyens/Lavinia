import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { en, lbs } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { loadCropDeliveries, varietyWeights, totalNet } from "@/lib/crops/deliveries";
import { resolveActiveFarmId, resolveFarm } from "../../_data";
import { Reveal } from "../../../_components/shell/reveal";
import { CropDeliveriesTable } from "../../../_components/crop-deliveries-table";
import { CropVarietyPie } from "../../../_components/crop-variety-pie";

// The Deliveries view: a Terra-themed replica of the Almond Logic deliveries detail. Server
// Component — resolves the operator's OWN farm exactly like the Crops/Energy tabs, then loads every
// per-load row and renders the full table + the delivery-weight-by-variety pie. Every pound is summed
// in the lib (varietyWeights / totalNet) and only formatted here.
export default async function CropDeliveriesPage() {
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
  const rows = await loadCropDeliveries(prisma, farm.id);
  const pie = varietyWeights(rows);
  const net = totalNet(rows);

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
            href="/almondlogic"
            className="type-label-caps inline-flex items-center gap-1 text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <ArrowLeft size={14} aria-hidden /> Crop position
          </Link>
          <p className="type-label-caps mt-3 text-primary">{farm.name}</p>
          <h1 className="type-display-lg mt-1 text-on-surface">Deliveries</h1>
          <p className="type-body-md mt-2 text-on-surface-variant">
            {rows.length} loads, {lbs(net)} net delivered. Every row from Almond Logic, none summarized.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="flex min-h-[14rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8">
            <p className="type-body-md text-on-surface-variant">No deliveries imported yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="type-title mb-3 text-on-surface">Delivery weight by variety</h2>
              <CropVarietyPie data={pie} />
            </section>
            <section>
              <h2 className="type-title mb-3 text-on-surface">All deliveries</h2>
              <CropDeliveriesTable rows={rows} />
            </section>
          </div>
        )}
      </Reveal>
    </div>
  );
}
