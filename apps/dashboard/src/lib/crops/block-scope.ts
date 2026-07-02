// Guard: a blockId supplied to a write action must belong to the acting farm. Block is NOT RLS-scoped
// (it is application-scoped), so a manager who learns another farm's block cuid could otherwise store a
// row (TGM / inventory / sale) that references a foreign block — leaking that block's name on read. The
// explicit farmId filter is what enforces isolation here (there is no RLS policy on Block to lean on).

import type { PrismaClient } from "@prisma/client";

/** True iff `blockId` is a block on `farmId`. A null/empty blockId is "whole farm" -> allowed. */
export async function blockInFarm(
  prisma: PrismaClient,
  farmId: string,
  blockId: string | null,
): Promise<boolean> {
  if (blockId == null || blockId === "") return true;
  const found = await prisma.block.findFirst({ where: { id: blockId, farmId }, select: { id: true } });
  return found !== null;
}
