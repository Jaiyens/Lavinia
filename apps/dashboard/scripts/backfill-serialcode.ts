// One-off: backfill the canonical Pump.serialCode from the deprecated billingSerial
// (the demo seeds populate billingSerial only). Additive + reversible (sets a null
// column from an existing one); lets the billing-cycle forecast surface render on the
// demo farm. Run: npm run tsx scripts/backfill-serialcode.ts  (or tsx directly).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "Pump" SET "serialCode" = "billingSerial" WHERE "serialCode" IS NULL AND "billingSerial" IS NOT NULL`,
  );
  console.log(`Backfilled serialCode on ${updated} pump(s).`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
