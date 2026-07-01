// Runnable seed entry (invoked by `prisma db seed` / `npm run db:seed`). Seeds the
// representative Batth farm (the demo) and then runs the recommendation engine so
// the database ships with findings. The data and write logic live in batth-farm.ts
// and the engine in src/lib/recommendations/run.ts so tests can reuse them without
// this top-level run. This file is the only one with side effects.

import { PrismaClient } from "@prisma/client";
import { runEngines } from "@/lib/recommendations/run";
import { seedBatthFarm } from "./batth-farm";
import { seedBatthRealFarm } from "./batth-real-farm";
import { seedCropLedger } from "./crop-ledger-fixture";

async function main() {
  const prisma = new PrismaClient();
  try {
    // Opt-in REAL-farm seed: SEED_BATTH_REAL=1 lands the actual Batth export
    // (fixtures/batth-real-meters.json) INSTEAD of the synthetic demo, then runs the SAME
    // engine pass on it (identical function + args as the default path, just a different
    // farm id). The default (flag unset) behavior is unchanged.
    if (process.env.SEED_BATTH_REAL === "1") {
      const farm = await seedBatthRealFarm(prisma);
      const engine = await runEngines(prisma, farm.id);
      console.log(
        `Seeded REAL ${farm.name} (account ${farm.account}): ${farm.pumpsCreated} meters, ` +
          `${farm.billingPeriods} billing periods, ${farm.entities} entities, ` +
          `${farm.accounts} accounts, ${farm.arrays} arrays, ${farm.nemPeriodsCreated} NEM periods.`,
      );
      console.log(
        `Engine: ${engine.created} recommendations (${JSON.stringify(engine.byTool)}).`,
      );
      return;
    }

    const farm = await seedBatthFarm(prisma);
    const engine = await runEngines(prisma, farm.id);
    console.log(
      `Seeded ${farm.name}: ${farm.pumps} meters, ${farm.entities} entities, ` +
        `${farm.accounts} accounts, ${farm.bills} bills, ${farm.intervals} intervals.`,
    );
    console.log(
      `Engine: ${engine.created} recommendations (${JSON.stringify(engine.byTool)}).`,
    );

    // Opt-in crop ledger seed (SEED_CROP_LEDGER=1): lands one fully-known crop year so the crop
    // production tab + Almond render a real position. The default (flag unset) is unchanged.
    if (process.env.SEED_CROP_LEDGER === "1") {
      const crop = await seedCropLedger(prisma, farm.id);
      console.log(
        `Crop ledger (${crop.cropYear}): ${crop.productionRows} production, ` +
          `${crop.commitmentRows} commitment, ${crop.poolRows} pool rows.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
