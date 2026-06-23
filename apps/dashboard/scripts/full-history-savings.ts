// CLI: print the full-history annual rate-switch savings for a farm (read-only).
// Core lives in src/lib/recommendations/full-history-savings.ts.
//   DATABASE_URL=postgresql://USER@127.0.0.1:5432/terra_batth tsx scripts/full-history-savings.ts <farmId>

import { PrismaClient } from "@prisma/client";
import { computeFullHistorySavings } from "@/lib/recommendations/full-history-savings";

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

async function main(): Promise<void> {
  const farmId = process.argv[2];
  if (!farmId) throw new Error("usage: tsx scripts/full-history-savings.ts <farmId>");
  const prisma = new PrismaClient();
  try {
    const r = await computeFullHistorySavings(prisma, farmId);
    const confirmed = r.results.filter((x) => x.status === "confirmed");
    const pending = r.results.filter((x) => x.status === "pending_reconcile");
    const sum = (xs: { annualSavingsCents: number }[]) => xs.reduce((s, x) => s + x.annualSavingsCents, 0);
    const confTotal = sum(confirmed);

    console.log("");
    console.log(`FULL-HISTORY ANNUAL SAVINGS - ${r.farmName} (card ${r.rateCardVersion})`);
    console.log("=".repeat(64));
    console.log(`AG meters priced on 12-mo interval usage: ${r.consideredMeters}`);
    console.log(`CONFIRMED (reconciles, limiter-correct, AG-B eligible): ${usd(confTotal)}/yr across ${confirmed.length} meters  -> 20% fee ${usd(confTotal * 0.2)}`);
    console.log(`PENDING-reconcile (real usage, bill not yet validated <3%): ${usd(sum(pending))}/yr across ${pending.length} meters`);
    console.log("");
    console.log("top 15:");
    for (const t of r.results.slice(0, 15)) {
      console.log(`  ${usd(t.annualSavingsCents).padStart(9)}/yr  ${t.fromSchedule}->${t.toSchedule}  peak ${t.observedPeakKw}kW  [${t.status}${t.pdpFlag ? ",PDP?" : ""}]  ${t.name}`);
    }
    console.log("");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[full-history-savings] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
