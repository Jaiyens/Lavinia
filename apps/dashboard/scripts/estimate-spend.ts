// Run the modeled-cost engine on a real PG&E "Download My Data" usage CSV and print the
// estimated spend it produces — the demoable proof that usage -> dollars works end to end.
//
//   npx tsx scripts/estimate-spend.ts ../../Historical_20250622-20250630.csv
//
// Prints: farm totals (priced vs unpriced meters, modeled monthly tariff spend), the top
// meters by modeled spend, spend by account, and a spot-check. Tariff component only;
// excludes taxes/NBC/PCIA/true-up (see modeled-cost.ts). No DB.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { modelFarmSpend, type MeterIntervals } from "@/lib/energy/modeled-cost";
import { loadRateCard } from "@/lib/pge/rate-card";
import { normalizeDownloadMyDataCsv } from "@/lib/normalize/downloadmydata";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function main(): void {
  const file = process.argv[2] ?? "../../Historical_20250622-20250630.csv";
  const csv = readFileSync(join(process.cwd(), file), "utf8");
  const meters = normalizeDownloadMyDataCsv(csv);
  const input: MeterIntervals[] = meters.map((m) => ({
    serviceId: m.serviceId,
    rateCode: m.tariff,
    accountNumber: m.accountNumber,
    intervals: m.intervals,
  }));

  const card = loadRateCard();
  const report = modelFarmSpend(input, card);

  console.log(`\n=== MODELED SPEND (tariff component) — ${file} ===`);
  console.log(`rate card: ${card.utility} v${report.cardVersion} eff ${report.effectiveDate} | season=${report.season}`);
  console.log(
    `meters: ${report.totals.meters} | priced: ${report.totals.pricedMeters} | unpriced (rate not loaded / no usage): ${report.totals.unpricedMeters}`,
  );
  console.log(`MODELED MONTHLY TARIFF SPEND (priced meters): ${usd(report.totals.monthlyCents)}/mo`);
  console.log(`  excludes taxes, NBC/PCIA, climate credit, CARE, NEM true-up`);

  console.log(`\n--- top 12 meters by modeled monthly spend ---`);
  for (const m of report.meters.filter((x) => x.priced).sort((a, b) => b.monthlyCents - a.monthlyCents).slice(0, 12)) {
    console.log(
      `  SA ${m.serviceId.padEnd(11)} ${(m.rateCode ?? "?").padEnd(7)} ${usd(m.monthlyCents).padStart(9)}/mo` +
        `  (energy ${usd(m.breakdown.energyCents)}, demand ${usd(m.breakdown.demandCents)}, cust ${usd(m.breakdown.customerCents)})` +
        `  peakKw=${m.maxDemandKw} kWh/mo~${Math.round((m.totalImportKwh / m.windowDays) * 30.44)}`,
    );
  }

  console.log(`\n--- modeled monthly spend by account (top 12) ---`);
  for (const a of report.byAccount.slice(0, 12)) {
    console.log(`  acct ${a.accountNumber.padEnd(11)} ${usd(a.monthlyCents).padStart(10)}/mo  (${a.pricedMeters}/${a.meters} meters priced)`);
  }

  const unpriced = report.meters.filter((m) => !m.priced);
  const reasons = new Map<string, number>();
  for (const m of unpriced) reasons.set(m.reason ?? "?", (reasons.get(m.reason ?? "?") ?? 0) + 1);
  console.log(`\n--- unpriced meters: ${unpriced.length} ---`);
  for (const [r, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(3)}  ${r}`);

  const spot = report.meters.find((m) => m.serviceId === "91898735");
  if (spot) {
    console.log(`\n--- spot-check SA 91898735 (${spot.rateCode}) ---`);
    console.log(`  ${JSON.stringify({ ...spot, breakdown: spot.breakdown }, null, 0)}`);
  }
}

main();
