import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { resolveFarmAccess } from "@/lib/auth/access";
import { en } from "@/copy/en";
import { Card } from "@/components/ui/card";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { worksheetSeasons } from "@/lib/crops/worksheet-load";
import { Reveal } from "../../../_components/shell/reveal";
import { resolveActiveFarmId, resolveFarm } from "../../_data";
import { TgmForm, type BlockChoice } from "../_components/tgm-form";

// Good-meats (TGM) entry. Both paths write customer-sourced TgmRecord rows that feed the worksheet's
// Good-meats / Sellable columns. Manager-gated: a viewer sees a read-only note (the Server Actions
// re-check the role regardless). Server Component: resolves the operator's OWN farm, gathers the block
// list + the seasons, and hands them to the client form. It computes no pounds.
const c = en.crops.worksheet.tgmForm;

export default async function TgmPage() {
  const userId = await sessionUserId();
  const activeId = await resolveActiveFarmId(userId);
  const resolved = await resolveFarm(userId, activeId, false);

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{en.crops.worksheet.noFarm}</p>
      </div>
    );
  }

  const { farm } = resolved;
  const access = userId ? await resolveFarmAccess(prisma, farm.id, userId) : null;
  const canWrite = access?.canManageData ?? false;

  const [seasons, blocks] = await Promise.all([
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
          <p className="type-label-caps mt-3 text-primary">{c.title}</p>
          <h1 className="type-display-lg mt-1 text-on-surface">{c.title}</h1>
          <p className="mt-2 max-w-2xl type-body-md text-on-surface-variant">{c.subtitle}</p>
        </header>

        {canWrite ? (
          <TgmForm blocks={blocks} seasons={seasons} />
        ) : (
          <Card className="rounded-[var(--radius-control)] p-6">
            <p className="type-body-md text-on-surface-variant">{en.crops.cost.map.readOnly}</p>
          </Card>
        )}
      </Reveal>
    </div>
  );
}
