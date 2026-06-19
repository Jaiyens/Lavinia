// One-off demo realism: the seed closes every cycle on the same day (DAYS_PER_CYCLE=28), so every
// account's bill derives the same due date and the dates list collapses to one row. A real 57-account
// farm is on VARIED cycles - the whole premise of the product. Stagger each billing period's close to
// the day implied by its meter's serial (MR-07 -> 7th, MR-14 -> 14th, MR-21 -> 21st). Reversible (a
// db:reset re-seeds the uniform values). Run: npx tsx scripts/stagger-demo-cycles.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const n = await prisma.$executeRawUnsafe(
    `UPDATE "BillingPeriod" bp
     SET "close" = date_trunc('month', bp."close")
       + make_interval(days => (CASE p."serialCode"
           WHEN 'MR-07' THEN 6
           WHEN 'MR-14' THEN 13
           WHEN 'MR-21' THEN 20
           ELSE 27 END))
     FROM "Pump" p
     WHERE bp."pumpId" = p."id" AND p."serialCode" IS NOT NULL`,
  );
  console.log(`Staggered close dates on ${n} billing period(s).`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
