// Run the real recommendation levers (today: the 3.3 rate-optimization lever)
// against the dashboard farm, or an explicit farm id. Idempotent: pending
// engine findings are replaced, resolved ones are never touched.
//
//   npm run levers:run            # dashboard farm (real outranks demo)
//   npm run levers:run -- <farmId>
//
// NOTE: never point this at the demo seed farm - the seed's runEngines owns the
// same rate-optimization tool key there.

import { PrismaClient } from "@prisma/client";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { runRateLever } from "@/lib/recommendations/run-rate-lever";
import { runSolarInsight } from "@/lib/recommendations/run-solar-insight";

async function main() {
  const prisma = new PrismaClient();
  try {
    let farmId = process.argv[2];
    if (!farmId) {
      const resolved = await dashboardFarm(prisma);
      if (!resolved) {
        console.error("[levers] no dashboard farm found and no farm id given");
        process.exitCode = 1;
        return;
      }
      if (resolved.dataKind !== "real") {
        console.error(
          "[levers] refusing to run: the dashboard farm is the demo seed, and runEngines owns the demo's rate findings",
        );
        process.exitCode = 1;
        return;
      }
      farmId = resolved.farm.id;
    }
    const asOf = new Date().toISOString();
    const result = await runRateLever(prisma, farmId, asOf);
    console.log(
      `[levers] rate lever on ${farmId}: ${result.created} findings (${result.estimates} dollar estimates, ${result.qualitative} qualitative), ${result.legacyFlagged} meters flagged legacy`,
    );
    const solar = await runSolarInsight(prisma, farmId, asOf);
    console.log(`[levers] solar insight on ${farmId}: ${solar.created} findings`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[levers] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
