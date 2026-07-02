// READ-ONLY: dump the crop structure for the connected farm so we can tell the real Batth blocks
// (seeded from the worksheet CSV) from leftover demo/placeholder rows before cleaning anything.
// Writes NOTHING. Usage:
//   DATABASE_URL="$U" DATABASE_URL_UNPOOLED="$U" npx tsx scripts/inspect-crop-data.ts
import { prisma } from "@/lib/db";
import { withFarmTenant } from "@/lib/crops/tenant-db";

async function main(): Promise<void> {
  const farm = await prisma.farm.findFirst({ select: { id: true, name: true } });
  if (!farm) throw new Error("no farm");
  console.log(`FARM: ${farm.name} (${farm.id})\n`);

  await withFarmTenant(prisma, farm.id, async (tx) => {
    const blocks = await tx.block.findMany({
      where: { farmId: farm.id },
      select: {
        id: true,
        name: true,
        acreage: true,
        entity: { select: { name: true } },
        _count: { select: { blockPlantings: true, tgmRecords: true, cropFieldBlocks: true, pumps: true } },
      },
      orderBy: { name: "asc" },
    });
    console.log(`BLOCKS (${blocks.length}) — name | acreage | entity | plantings | tgm | fieldMaps | pumps`);
    for (const b of blocks) {
      console.log(
        `  ${b.name} | ${b.acreage ?? "-"} | ${b.entity?.name ?? "-"} | ${b._count.blockPlantings} | ${b._count.tgmRecords} | ${b._count.cropFieldBlocks} | ${b._count.pumps}`,
      );
    }

    const maps = await tx.cropFieldBlock.findMany({
      where: { farmId: farm.id },
      select: { field: true, block: { select: { name: true } } },
    });
    console.log(`\nFIELD -> BLOCK MAP (${maps.length}):`);
    for (const m of maps) console.log(`  field ${m.field} -> block ${m.block?.name ?? "?"}`);

    const deliveries = await tx.cropDelivery.groupBy({
      by: ["field", "cropYear"],
      where: { farmId: farm.id },
      _count: { _all: true },
      _sum: { netLb: true },
    });
    const byField = new Map<string, { loads: number; lb: number }>();
    for (const d of deliveries) {
      const k = d.field ?? "(none)";
      const cur = byField.get(k) ?? { loads: 0, lb: 0 };
      cur.loads += d._count._all;
      cur.lb += d._sum.netLb ?? 0;
      byField.set(k, cur);
    }
    console.log(`\nDELIVERY FIELDS (distinct ${byField.size}) — field | loads | total netLb`);
    for (const [field, v] of [...byField.entries()].sort((a, b) => b[1].lb - a[1].lb)) {
      console.log(`  ${field} | ${v.loads} | ${v.lb.toLocaleString()}`);
    }

    const entities = await tx.entity.findMany({ where: { farmId: farm.id }, select: { name: true } });
    console.log(`\nENTITIES (${entities.length}): ${entities.map((e) => e.name).join(", ")}`);
  });

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
