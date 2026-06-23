// CLI for the reconciliation verification harness: read a LOCAL Postgres and print
// the pass/fail reconciliation report for every billed meter. The reconcile-and-flag
// CORE lives in src/lib/recommendations/reconciliation-sweep.ts (the function a
// nightly trigger will call); this file is only the local-DB-guarded CLI wrapper. It
// reads the engine, writes nothing, and builds NO external fetch or cron.
//
//   npm run verify:reconciliation                 # the dashboard farm, 3% default band
//   npm run verify:reconciliation -- <farmId>     # an explicit farm
//   TERRA_BACK_TEST_BAND_PCT=2 npm run verify:reconciliation
//   TERRA_RECONCILE_JSON=1 npm run verify:reconciliation   # also dump the full JSON

import { PrismaClient } from "@prisma/client";
import { formatUsd } from "@/lib/format/money";
import { PER_CYCLE_BAND_FACTOR } from "@/lib/energy/back-test-config";
import {
  runReconciliationSweep,
  type SweepReport,
} from "@/lib/recommendations/reconciliation-sweep";

/** Hard guard: only ever read a local Postgres (never a remote/prod URL). */
function assertLocalDb(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!/(127\.0\.0\.1|localhost)/.test(url)) {
    throw new Error(
      "REFUSING TO RUN: DATABASE_URL is not a local Postgres (127.0.0.1/localhost).\n" +
        "This harness is local-only; set DATABASE_URL to your local terra_batth/terra_all DB.",
    );
  }
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function printReport(report: SweepReport): void {
  console.log("");
  console.log("PG&E reconciliation verification");
  console.log("================================");
  console.log(`farm:            ${report.farmId}`);
  console.log(
    `rate card:       ${report.rateCardVersion ?? "(unversioned)"} (effective ${report.cardEffectiveDate})`,
  );
  console.log(
    `band:            ${report.bandPct}% aggregate / ${report.bandPct * PER_CYCLE_BAND_FACTOR}% per cycle`,
  );
  console.log(`billed meters:   ${report.meterCount} (reconciled, non-solar)`);
  console.log(`testable:        ${report.testableCount}   not testable: ${report.notTestableCount}`);
  console.log(`PASS:            ${report.passCount}/${report.testableCount}  (${pct(report.passRate)})`);
  console.log("");
  console.log("pass rate by band (one sweep, re-tested):");
  for (const t of report.passRateByThreshold) {
    const mark = t.bandPct === report.bandPct ? "  <- default" : "";
    console.log(
      `  ${String(t.bandPct).padStart(2)}%   ${t.passCount}/${report.testableCount}   ${pct(t.passRate)}${mark}`,
    );
  }
  console.log("");
  if (report.failures.length === 0) {
    console.log("no failures: every testable meter reconciled within band.");
  } else {
    console.log(
      `failures (${report.failures.length}) - meter | computed | real | error | cause | bill dates:`,
    );
    for (const f of report.failures) {
      const span =
        f.billDates.length > 0
          ? `${f.billDates[0]?.start?.slice(0, 10)}..${f.billDates[f.billDates.length - 1]?.close?.slice(0, 10)}`
          : "(none)";
      console.log(
        `  ${f.meterName} [${f.rateSchedule ?? "?"}] | ${formatUsd(f.computedCents)} | ${formatUsd(f.realCents)} | ${
          f.pctError === null ? "n/a" : `${f.pctError.toFixed(2)}%`
        } | ${f.cause} | ${span}`,
      );
    }
  }
  console.log("");
}

async function main(): Promise<void> {
  assertLocalDb();
  const prisma = new PrismaClient();
  try {
    const farmId = process.argv[2];
    const report = await runReconciliationSweep(prisma, farmId ? { farmId } : {});
    printReport(report);
    if (process.env.TERRA_RECONCILE_JSON === "1") {
      console.log(JSON.stringify(report, null, 1));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[verify] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
