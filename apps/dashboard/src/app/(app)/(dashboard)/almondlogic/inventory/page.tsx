import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { resolveFarmAccess } from "@/lib/auth/access";
import { en } from "@/copy/en";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { loadInventory } from "@/lib/crops/inventory-load";
import { worksheetSeasons } from "@/lib/crops/worksheet-load";
import { Reveal } from "../../../_components/shell/reveal";
import { resolveActiveFarmId, resolveFarm } from "../../_data";
import { InventoryView, type BlockChoice } from "../_components/inventory-view";

// Good-meats inventory. Server Component: resolves the operator's OWN farm, loads the rolled-up
// positions (loadInventory -> the pure engine), plus the block list + seasons for the add form, and
// hands them to the client view. It computes no pounds. The add form is manager-gated (the Server
// Action re-checks the role); a viewer sees the read-only table with no form.
const c = en.crops.worksheet.inventory;

export default async function InventoryPage() {
  const userId = await sessionUserId();
  const activeId = await resolveActiveFarmId(userId);
  const resolved = await resolveFarm(userId, activeId, false);

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{c.noFarm}</p>
      </div>
    );
  }

  const { farm } = resolved;
  const access = userId ? await resolveFarmAccess(prisma, farm.id, userId) : null;
  const canWrite = access?.canManageData ?? false;

  const [inventory, seasons, blocks] = await Promise.all([
    loadInventory(prisma, farm.id),
    worksheetSeasons(prisma, farm.id),
    withFarmTenant(prisma, farm.id, (tx) =>
      tx.block.findMany({
        where: { farmId: farm.id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ) as Promise<BlockChoice[]>,
  ]);

  return (
    <div className="relative min-w-0 flex-1">
      <Reveal>
        <header className="mb-6">
          <Link
            href="/almondlogic/worksheet"
            className="type-label-caps inline-flex items-center gap-1 text-on-surface-variant transition-colors hover:text-on-surface"
          >
            <ArrowLeft size={14} aria-hidden /> {en.crops.worksheet.title}
          </Link>
          <p className="type-label-caps mt-3 text-primary">{c.eyebrow}</p>
          <h1 className="type-display-lg mt-1 text-on-surface">{c.title}</h1>
          <p className="mt-2 max-w-2xl type-body-md text-on-surface-variant">{c.subtitle}</p>
        </header>

        <InventoryView
          positions={inventory.positions}
          totals={inventory.totals}
          facets={inventory.facets}
          blocks={blocks}
          seasons={seasons}
          canWrite={canWrite}
        />
      </Reveal>
    </div>
  );
}
