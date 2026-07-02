// Read-only: list the farms on the connected database (id, name) plus which one the seed's
// findFirst() would pick, so we can confirm the seed targets the right farm before writing. Writes
// nothing. Usage:
//   DATABASE_URL="$U" DATABASE_URL_UNPOOLED="$U" npx tsx scripts/list-farms.ts
import { prisma } from "@/lib/db";

async function main(): Promise<void> {
  const farms = await prisma.farm.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  console.log(`farms on this database: ${farms.length}`);
  for (const f of farms) console.log(`  - ${f.name}  (${f.id})`);
  const first = await prisma.farm.findFirst({ select: { id: true, name: true } });
  console.log(`\nthe seed's findFirst() would target: ${first ? `${first.name} (${first.id})` : "NONE"}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
