import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { resolveFarmAccess } from "@/lib/auth/access";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { loadCropLedger } from "@/lib/crops/load";
import { loadCropDeliveries, varietyWeights } from "@/lib/crops/deliveries";
import { recomputePositions } from "@/lib/crops/positions";
import { cashSummary } from "@/lib/crops/collection";
import { commitmentLedgerRows, reconciliationRows } from "@/lib/crops/views";
import {
  resolveActiveFarmId,
  resolveFarm,
  resolveCropReviewQueue,
} from "../../_data";
import { Reveal } from "../../../_components/shell/reveal";
import { CropPackerTable } from "../../../_components/crop-packer-table";
import { CropReviewQueue } from "../../../_components/crop-review-queue";
import { CropReconciliationTable } from "./_components/crop-reconciliation-table";
import { CropCashKpis } from "./_components/crop-cash-kpis";

// The POUND-GATE + COMMITMENT LEDGER page (WS2b). Server Component: resolves the signed-in operator's
// OWN farm exactly the way the Crops/Deliveries tabs do, then loads the append-only ledger and the
// delivery rows, runs the ledger through recomputePositions (the ONLY producer of pound totals), and
// renders three surfaces:
//  1. the cash KPI strip (committed / collected / outstanding dollars), from cashSummary.
//  2. the pound-gate table: field weight vs settled weight per crop year + variety, the ~10 percent
//     gap rows badged, from reconciliationRows.
//  3. the commitment ledger: one row per live commitment at its lifecycle stage with its cash and a
//     manager-gated "Record collection" action, from commitmentLedgerRows.
//  4. the reconciliation queue (records the pound-gate could not certify), with the manual resolve.
// The module's law holds: every pound and cent here is summed in the lib and only FORMATTED by the
// components below; an Almond Logic estimate is never read as a packer-settled final.
const tr = en.crops.reconcile;

export default async function CropReconcilePage() {
  const userId = await sessionUserId();
  const activeId = await resolveActiveFarmId(userId);
  const resolved = await resolveFarm(userId, activeId, false);

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{tr.noFarm}</p>
      </div>
    );
  }

  const { farm } = resolved;
  // A signed-in VIEWER is read-only: recording a collection requires manager+, so hide the action.
  const access = userId ? await resolveFarmAccess(prisma, farm.id, userId) : null;
  const readOnly = !(access?.canManageData ?? false);

  const ledger = await loadCropLedger(prisma, farm.id);
  const deliveries = await loadCropDeliveries(prisma, farm.id);
  const reviewRows = await resolveCropReviewQueue(farm.id);

  // The position (the ONLY producer of pound totals) drives the pound-gate; the ledger drives the
  // lifecycle + cash. Every figure below is summed in the lib, never in a component.
  const positions = recomputePositions(ledger);
  const fieldByVariety = varietyWeights(deliveries);
  const reconRows = reconciliationRows(positions, fieldByVariety);
  const ledgerRows = commitmentLedgerRows(ledger);
  const cash = cashSummary(ledger.commitments);

  const empty = reconRows.length === 0 && ledgerRows.length === 0;

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
            href="/almondlogic/worksheet"
            className="type-label-caps inline-flex items-center gap-1 text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <ArrowLeft size={14} aria-hidden /> {tr.back}
          </Link>
          <p className="type-label-caps mt-3 text-primary">{farm.name}</p>
          <h1 className="type-display-lg mt-1 text-on-surface">{tr.title}</h1>
          <p className="type-body-md mt-2 text-on-surface-variant">{tr.subtitle}</p>
        </header>

        {empty ? (
          <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8">
            <p className="type-body-md text-on-surface-variant">{tr.empty}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            <CropCashKpis summary={cash} />

            <section aria-label={tr.table.caption}>
              <h2 className="mb-3 type-headline text-on-surface">{tr.table.caption}</h2>
              <CropReconciliationTable rows={reconRows} />
            </section>

            <section aria-label={en.crops.table.caption}>
              <h2 className="mb-3 type-headline text-on-surface">{en.crops.table.caption}</h2>
              <CropPackerTable ledger={{ rows: ledgerRows, readOnly }} />
            </section>

            <CropReviewQueue rows={reviewRows} readOnly={readOnly} />
          </div>
        )}
      </Reveal>
    </div>
  );
}
