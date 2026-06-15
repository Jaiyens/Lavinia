// Runnable seed entry (invoked by `prisma db seed` / `npm run db:seed`). Seeds the
// representative Batth farm (the demo) and then runs the recommendation engine so
// the database ships with findings. The data and write logic live in batth-farm.ts
// and the engine in src/lib/recommendations/run.ts so tests can reuse them without
// this top-level run. This file is the only one with side effects.

import { PrismaClient } from "@prisma/client";
import { runEngines } from "@/lib/recommendations/run";
import { seedBatthFarm } from "./batth-farm";

async function main() {
  const prisma = new PrismaClient();
  try {
    const farm = await seedBatthFarm(prisma);
    const engine = await runEngines(prisma, farm.id);
    console.log(
      `Seeded ${farm.name}: ${farm.pumps} meters, ${farm.entities} entities, ` +
        `${farm.accounts} accounts, ${farm.bills} bills, ${farm.intervals} intervals.`,
    );
    console.log(
      `Engine: ${engine.created} recommendations (${JSON.stringify(engine.byTool)}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
