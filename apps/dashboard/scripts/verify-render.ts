// End-to-end read-path verification: drive the EXACT functions the dashboard page calls
// (loadDashboard / loadMetersForFarm / loadFindings / toMeterRow) for the real owner, and
// prove the meters, cost classification, intervals, and findings all project correctly.
// LOCAL DB only. Proves "it renders" without a browser session.

import { PrismaClient } from "@prisma/client";
import { loadDashboard, loadMetersForFarm } from "@/lib/dashboard/load";
import { loadFindings } from "@/lib/dashboard/findings";
import { toMeterRow } from "@/lib/dashboard/table";
import { toMapPins } from "@/lib/dashboard/map";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!(/(127\.0\.0\.1|localhost)/.test(url) && /terra_batth/.test(url))) {
    throw new Error("REFUSING: not local terra_batth");
  }
  const prisma = new PrismaClient();
  const owner = await prisma.user.findFirstOrThrow({ where: { email: "gpt4shared@gmail.com" }, select: { id: true } });

  // 1) The page's resolver: owner-scoped dashboard (NOT the demo path).
  const dash = await loadDashboard(prisma, { userId: owner.id });
  if (!dash) throw new Error("loadDashboard returned null for the owner");
  console.log(`farm="${dash.farm.name}" dataKind=${dash.dataKind} meters=${dash.meters.length}`);

  const meters = await loadMetersForFarm(prisma, dash.farm.id);
  const bySource: Record<string, number> = {};
  let withIntervalsCost = 0;
  for (const m of meters) bySource[m.costSource ?? "?"] = (bySource[m.costSource ?? "?"] ?? 0) + 1;
  const rows = meters.map(toMeterRow);
  const billedRows = rows.filter((r) => r.costSource === "BILLED" && r.costCents != null);
  const modeledRows = rows.filter((r) => r.costSource === "MODELED" && r.modeledCents != null);
  for (const m of meters) if (m.modeledMonthlyCents != null) withIntervalsCost++;

  console.log(`costSource breakdown: ${JSON.stringify(bySource)}`);
  console.log(`table rows: BILLED-with-$ ${billedRows.length}, MODELED-with-est ${modeledRows.length}, modeled persisted ${withIntervalsCost}`);

  // 2) Map pins (lat/long render).
  const map = toMapPins(meters);
  const pinCount = map.pins.length;
  console.log(`map pins: ${pinCount} (unlocated ${map.unlocated.length})`);

  // 3) Findings (the savings rail).
  const findings = await loadFindings(prisma, dash.farm.id);
  const byTool: Record<string, number> = {};
  let withDollar = 0;
  for (const f of findings) {
    byTool[f.tool] = (byTool[f.tool] ?? 0) + 1;
    if (f.impactUsd != null) withDollar++;
  }
  console.log(`findings: ${findings.length} | byTool ${JSON.stringify(byTool)} | with-$ ${withDollar}`);

  // 4) A concrete BILLED meter and a concrete MODELED meter (prove both shapes render).
  const billed = meters.find((m) => m.costSource === "BILLED" && m.periods.length > 0);
  const modeled = meters.find((m) => m.costSource === "MODELED" && m.modeledMonthlyCents != null);
  if (billed) {
    const latest = billed.periods[billed.periods.length - 1];
    console.log(`sample BILLED ${billed.name}: rate=${billed.rateSchedule} printed=$${((latest?.printedTotalCents ?? 0) / 100).toFixed(2)} periods=${billed.periods.length}`);
  }
  if (modeled) {
    console.log(`sample MODELED ${modeled.name}: rate=${modeled.rateSchedule} est=$${((modeled.modeledMonthlyCents ?? 0) / 100).toFixed(2)}/mo periods=${modeled.periods.length}`);
  }

  // Assertions the page relies on.
  const problems: string[] = [];
  if (dash.dataKind !== "real") problems.push(`dataKind is ${dash.dataKind}, expected real (owned, not demo)`);
  if (meters.length < 180) problems.push(`only ${meters.length} meters`);
  if (billedRows.length === 0) problems.push("no BILLED meter renders an actual cost");
  if (modeledRows.length === 0) problems.push("no MODELED meter renders an estimate");
  if (pinCount < 150) problems.push(`only ${pinCount} map pins`);
  if (findings.length === 0) problems.push("no findings");
  console.log(problems.length ? `READ-PATH PROBLEMS: ${JSON.stringify(problems)}` : `READ-PATH: PASS`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
