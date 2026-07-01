/*
 * Seed CropFieldBlock (field -> block) mappings so "Cost per pound by block" can compute a real $/lb.
 *
 * The cost engine is complete; it just needs a row linking each Almond Logic delivery `field` to a
 * Terra Block. A field code does NOT encode which block it is, so the real mapping is Gagan's
 * operational knowledge. This script writes a PLACEHOLDER mapping so the feature is demonstrable: the
 * MATH is real (reconciled PG&E energy / mapped yield), but the field->block PAIRING is illustrative
 * until the real one is entered (re-run this with real data, or use the in-app dropdown /
 * mapFieldToBlockAction — no code change needed).
 *
 * It maps each distinct delivery field to one of the farm's ENERGY-BEARING blocks (blocks with >=1
 * pump) — a block with yield but no meter would show $0, not a useful number. Deterministic (sorted,
 * round-robin), idempotent (upsert on @@unique([farmId, field])), and tenant-scoped via withFarmTenant
 * so it works with RLS enabled.
 *
 * Run (local):  npx tsx --env-file=.env.local scripts/seed-crop-field-blocks.ts
 * Run (prod):   read -r "U?Paste your prod database URL, then Enter: " && \
 *                 DATABASE_URL="$U" DATABASE_URL_UNPOOLED="$U" npx tsx scripts/seed-crop-field-blocks.ts
 */
import { prisma } from "@/lib/db";
import { withFarmTenant } from "@/lib/crops/tenant-db";

async function main(): Promise<void> {
  const farm = await prisma.farm.findFirst({ select: { id: true, name: true } });
  if (!farm) throw new Error("no farm found");

  // Everything (reads + upserts) runs inside withFarmTenant so it works with RLS enabled on
  // CropDelivery / CropFieldBlock (a bare read would return zero rows under FORCE RLS).
  const count = await withFarmTenant(prisma, farm.id, async (tx) => {
    // Distinct non-empty delivery fields for this farm.
    const deliveryRows = await tx.cropDelivery.findMany({
      where: { farmId: farm.id, field: { not: null } },
      select: { field: true },
      distinct: ["field"],
    });
    const fields = deliveryRows
      .map((r) => r.field)
      .filter((f): f is string => typeof f === "string" && f.trim() !== "")
      .sort();

    // Prefer ENERGY-BEARING blocks (>=1 pump) so a mapped field yields a real ratio (not $0). Fall
    // back to all blocks when none have meters (a block with yield but no meter shows $0 until meters
    // are linked — honest, and lets the routing be verified even on a farm with no energy yet).
    const energyBlocks = await tx.block.findMany({
      where: { farmId: farm.id, pumps: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const allBlocks = await tx.block.findMany({
      where: { farmId: farm.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const blocks = energyBlocks.length > 0 ? energyBlocks : allBlocks;

    if (fields.length === 0) {
      console.log(`No delivery fields to map for ${farm.name}; run the Almond Logic load first.`);
      return 0;
    }
    if (blocks.length === 0) {
      throw new Error(`${farm.name} has no blocks to map to.`);
    }
    if (energyBlocks.length === 0) {
      console.log(
        "  WARNING: no energy-bearing blocks (no block has a linked meter) — $/lb will show $0 until meters are linked to blocks.",
      );
    }

    console.log(
      `Placeholder field->block mapping for ${farm.name} (${fields.length} fields, ${blocks.length} blocks):`,
    );
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]!;
      const block = blocks[i % blocks.length]!;
      await tx.cropFieldBlock.upsert({
        where: { farmId_field: { farmId: farm.id, field } },
        create: { farmId: farm.id, field, blockId: block.id },
        update: { blockId: block.id },
      });
      console.log(`  ${field}  ->  ${block.name}`);
    }
    return fields.length;
  });

  console.log(`Done. ${count} placeholder mappings upserted (illustrative until Gagan's real map).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
