// Remove leftover DEMO blocks from the connected farm. A block is REAL if it has any BlockPlanting or
// TgmRecord (the worksheet seed always creates both); a DEMO block (from the original Sundance seed)
// has neither. Deleting a block CASCADES its field->block mappings + plantings and SetNulls any
// production/commitment/pool/tgm/inventory references, so real deliveries are never touched — the real
// fields simply become unmapped again (and re-map to real blocks when the full CSV is seeded).
//
// SAFE BY DEFAULT: dry run (prints what it would remove). Set APPLY=1 to actually delete. Usage:
//   DATABASE_URL="$U" DATABASE_URL_UNPOOLED="$U" npx tsx scripts/clean-demo-blocks.ts          (dry run)
//   APPLY=1 DATABASE_URL="$U" DATABASE_URL_UNPOOLED="$U" npx tsx scripts/clean-demo-blocks.ts  (delete)
import { prisma } from "@/lib/db";
import { withFarmTenant } from "@/lib/crops/tenant-db";

const APPLY = process.env.APPLY === "1";

async function main(): Promise<void> {
  const farm = await prisma.farm.findFirst({ select: { id: true, name: true } });
  if (!farm) throw new Error("no farm");
  console.log(`FARM: ${farm.name}\n`);

  await withFarmTenant(
    prisma,
    farm.id,
    async (tx) => {
      const blocks = await tx.block.findMany({
        where: { farmId: farm.id },
        select: {
          id: true,
          name: true,
          _count: { select: { blockPlantings: true, tgmRecords: true, cropFieldBlocks: true } },
        },
        orderBy: { name: "asc" },
      });
      const isReal = (b: (typeof blocks)[number]) =>
        b._count.blockPlantings > 0 || b._count.tgmRecords > 0;
      const real = blocks.filter(isReal);
      const demo = blocks.filter((b) => !isReal(b));

      console.log(`REAL blocks kept (${real.length}): ${real.map((b) => b.name).join(", ") || "(none)"}`);
      console.log(`DEMO blocks ${APPLY ? "being removed" : "that WOULD be removed"} (${demo.length}):`);
      for (const b of demo) console.log(`  - ${b.name}  (field maps: ${b._count.cropFieldBlocks})`);

      if (!APPLY) {
        console.log(`\nDRY RUN — nothing deleted. Re-run with APPLY=1 in front to delete.`);
        return;
      }
      if (demo.length === 0) {
        console.log(`\nNothing to remove.`);
        return;
      }
      const ids = demo.map((b) => b.id);
      const del = await tx.block.deleteMany({ where: { farmId: farm.id, id: { in: ids } } });
      console.log(`\nDELETED ${del.count} demo blocks (their field mappings cascaded away).`);
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
