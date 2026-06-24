import type { PrismaClient } from "@prisma/client";
import { loadFindings, type FindingView } from "@/lib/dashboard/findings";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { loadMetersForFarm, type MeterPeriodView, type MeterView } from "@/lib/dashboard/load";

const METER_HEADERS = [
  "id",
  "name",
  "service_id",
  "account_number",
  "entity",
  "ranch",
  "crop",
  "rate_schedule",
  "serial_code",
  "coverage_state",
  "cost_source",
  "is_solar",
  "nem_type",
  "true_up_month",
  "true_up_amount_cents",
  "latitude",
  "longitude",
  "gpm",
  "horsepower",
] as const;

const BILLING_HEADERS = [
  "meter_id",
  "meter_name",
  "start",
  "close",
  "printed_total_cents",
  "demand_cents",
  "total_kwh",
  "peak_kw",
  "tariff",
] as const;

type CsvValue = string | number | boolean | null | undefined;

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function toCsv(headers: readonly string[], rows: readonly CsvValue[][]): string {
  return [headers.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");
}

function toJsonl(values: readonly unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join("\n");
}

function meterRow(meter: MeterView): CsvValue[] {
  return [
    meter.id,
    meter.name,
    meter.serviceId,
    meter.accountNumber,
    meter.entityName,
    meter.ranchName,
    meter.cropName,
    meter.rateSchedule,
    meter.serialCode,
    meter.coverageState,
    meter.costSource,
    meter.isSolar,
    meter.nemType,
    meter.trueUpMonth,
    meter.trueUpAmountCents,
    meter.latitude,
    meter.longitude,
    meter.gpm,
    meter.horsepower,
  ];
}

function billingRow(meter: MeterView, period: MeterPeriodView): CsvValue[] {
  return [
    meter.id,
    meter.name,
    period.start,
    period.close,
    period.printedTotalCents,
    period.demandCents,
    period.totalKwh,
    period.peakKw,
    period.tariff,
  ];
}

function summarizeFindings(findings: readonly FindingView[]): {
  total: number;
  act: number;
  watch: number;
  info: number;
  impactUsd: number;
} {
  return findings.reduce(
    (acc, finding) => {
      acc.total += 1;
      acc[finding.severity] += 1;
      acc.impactUsd += Math.max(0, finding.impactUsd ?? 0);
      return acc;
    },
    { total: 0, act: 0, watch: 0, info: 0, impactUsd: 0 },
  );
}

function buildContextIndex(farmName: string, meters: readonly MeterView[], findings: readonly FindingView[]): string {
  const reconciled = meters.filter((meter) => meter.coverageState === "reconciled").length;
  const solar = meters.filter((meter) => meter.isSolar || meter.nemType !== null).length;
  return [
    `# ${farmName} farm data`,
    "",
    "The farm data is staged under ./inputs/ for command-line analysis.",
    "",
    "Start here:",
    "- inputs/farm/overview.json: farm-level summary, KPIs, and counts",
    "- inputs/farm/meters.csv: one row per meter",
    "- inputs/farm/billing-periods.csv: one row per meter billing period",
    "- inputs/farm/billing-periods.jsonl: same billing periods as structured records",
    "- inputs/farm/findings.jsonl: current recommendation findings",
    "- inputs/farm/analysis.json: small precomputed summary",
    "",
    "Useful commands:",
    "- ls inputs/farm",
    "- sed -n '1,20p' inputs/farm/meters.csv",
    "- grep -i 'AG-C' inputs/farm/meters.csv",
    "- awk -F, '{print $8}' inputs/farm/meters.csv | sort | uniq -c",
    "",
    "Grounding rules:",
    "- Every number in your answer must come from these files.",
    "- If the files do not contain a fact, say it is not on file.",
    "- Do not infer utility credentials, account secrets, or real-time meter state.",
    "",
    `Meters: ${meters.length}`,
    `Reconciled meters: ${reconciled}`,
    `Solar or NEM meters: ${solar}`,
    `Open findings: ${findings.length}`,
  ].join("\n");
}

function buildAnalysis(meters: readonly MeterView[], findings: readonly FindingView[]) {
  const rateCounts = new Map<string, number>();
  const coverageCounts = new Map<string, number>();
  for (const meter of meters) {
    rateCounts.set(meter.rateSchedule ?? "unknown", (rateCounts.get(meter.rateSchedule ?? "unknown") ?? 0) + 1);
    coverageCounts.set(meter.coverageState, (coverageCounts.get(meter.coverageState) ?? 0) + 1);
  }

  return {
    rateCounts: Object.fromEntries([...rateCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    coverageCounts: Object.fromEntries([...coverageCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    findings: summarizeFindings(findings),
    latestBillingClose: meters
      .flatMap((meter) => meter.periods.map((period) => period.close))
      .sort()
      .at(-1) ?? null,
  };
}

export async function buildFarmFiles(
  prisma: PrismaClient,
  farmId: string,
  farmName: string,
): Promise<Record<string, string>> {
  const [meters, findings] = await Promise.all([
    loadMetersForFarm(prisma, farmId),
    loadFindings(prisma, farmId),
  ]);
  const kpi = computeKpiStrip(meters);
  const billingRows = meters.flatMap((meter) =>
    meter.periods.map((period) => ({
      meterId: meter.id,
      meterName: meter.name,
      accountNumber: meter.accountNumber,
      rateSchedule: meter.rateSchedule,
      start: period.start,
      close: period.close,
      printedTotalCents: period.printedTotalCents,
      demandCents: period.demandCents,
      totalKwh: period.totalKwh,
      peakKw: period.peakKw,
      tariff: period.tariff,
      lineItems: period.lineItems,
    })),
  );

  return {
    "inputs/context-index.md": buildContextIndex(farmName, meters, findings),
    "inputs/farm/overview.json": JSON.stringify(
      {
        farm: { id: farmId, name: farmName },
        kpi,
        meterCount: meters.length,
        findingCount: findings.length,
      },
      null,
      2,
    ),
    "inputs/farm/meters.csv": toCsv(METER_HEADERS, meters.map(meterRow)),
    "inputs/farm/billing-periods.csv": toCsv(
      BILLING_HEADERS,
      meters.flatMap((meter) => meter.periods.map((period) => billingRow(meter, period))),
    ),
    "inputs/farm/billing-periods.jsonl": toJsonl(billingRows),
    "inputs/farm/findings.jsonl": toJsonl(findings),
    "inputs/farm/analysis.json": JSON.stringify(buildAnalysis(meters, findings), null, 2),
  };
}
