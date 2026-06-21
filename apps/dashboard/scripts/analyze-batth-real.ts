// Prove the Batth savings numbers with the dashboard's OWN pure findings engines.
//
// Loads the real, demo-ready fixture (fixtures/batth-real-meters.json: a
// NormalizedMeter[]-shaped view of account 4699664587-8's real billing extract joined
// to the real 183-meter master inventory), maps each meter into the energy engines'
// plain input types, and runs the three pure levers over every meter:
//
//   - billAudit()        (bill-audit.ts)   - one-cycle bill anomaly vs the meter's own median
//   - retrospective()    (retrospective.ts) - demand-charge exposure per cycle (+ avoidable spike)
//   - rateOptimization() (rate-compare.ts) - cheapest eligible rate vs the meter's modeled bill
//
// These are PURE functions over data structures: NO database. The script prints every
// resulting finding (with annual dollars) as JSON, plus a rollup, to stdout.
//
// HONESTY NOTE: the real export has billing summaries but NO interval (Green Button)
// series yet, so `intervals` is empty everywhere. That means:
//   * retrospective surfaces every demand-charge cycle (the $ exposure is real and
//     read straight off the bill) but cannot pin an avoidable daily spike (no daily
//     peaks without intervals), so those findings are `info` with no impactUsd.
//   * billAudit needs >=3 same-season comparable cycles per meter; the extract carries
//     one latest cycle per meter, so it honestly finds nothing yet (no fabricated anomaly).
//   * rateOptimization models cost from the usage profile, which is empty without
//     intervals, so it cannot reproduce the real bill (reproductionError huge) and makes
//     no "switch and save" claim. It is reported as a no-op, honestly.
// This script proves exactly what the engines CAN stand behind on bill-only data today.
//
//   npx tsx scripts/analyze-batth-real.ts
//   npx tsx scripts/analyze-batth-real.ts --pretty   # human-readable summary too

import { readFileSync } from "node:fs";
import path from "node:path";

import { loadRateCard } from "@/lib/pge/rate-card";
import { billAudit } from "@/lib/energy/bill-audit";
import { retrospective } from "@/lib/energy/retrospective";
import { bucketUsage, rateOptimization } from "@/lib/energy/rate-compare";
import type { CycleBill } from "@/lib/energy/types";
import type { NormalizedMeter, NormalizedSummary } from "@/lib/normalize/types";
import type { DraftRecommendation } from "@/lib/recommendations";

const FARM_ID = "batth-real";
const TIMEZONE = "America/Los_Angeles";
const ASOF = "2026-06-21";

// The non-NormalizedMeter map/metadata block this fixture carries alongside each meter.
// The energy engines never read it; only this script does, to recover the billed peakKw
// (NormalizedSummary has no peak field) and to name the pump in farmer-facing copy.
type MeterMeta = {
  growerPumpId: string | null;
  saIdDescriptor?: string | null;
  rateSchedule: string | null;
  latitude: number | null;
  longitude: number | null;
  ranch: string | null;
  status: string | null;
  peakKw: number | null;
  annualCostUsd: number | null;
  billed: boolean;
  nem: { trueUpAmountUsd?: number | null; trueUpMonth?: number | null } | null;
};

type FixtureMeter = NormalizedMeter & { meta: MeterMeta };
type Fixture = {
  account: string;
  farm: string;
  timezone: string;
  meters: FixtureMeter[];
};

/**
 * Map a verbose PG&E tariff label (as it prints on the real bill / in the master
 * inventory, e.g. "AGC Ag35+ kW High Use", "AGA1 Ag<35 kW Low Use", "AG5B Large
 * Time-of-Use Agricultural Power") to the clean schedule token the rate engine's
 * familyOf() understands (one of "AG-A1"/"AG-A2"/"AG-B1"/"AG-B2"/"AG-C1"/"AG-C2"/
 * "AG-4"/"AG-5"). This is a pure fixture->engine boundary helper; it does NOT touch
 * any shared library file, so existing rates.test.ts / rate-compare.test.ts are
 * untouched. familyOf() then reduces the token to its card family ("AG-A"/"AG-B"/
 * "AG-C"/"AG-4"/"AG-5"); planFor() matches by family + size class.
 *
 * Business/non-ag schedules (B1, B19, ...) are returned verbatim: there is no ag
 * plan for them on the card, so rateOptimization correctly no-ops them (it only
 * compares within agricultural candidates). Returning the raw label keeps that
 * honest rather than mis-mapping a business meter into an ag rate.
 */
function normalizeTariffLabel(raw: string | null | undefined): string {
  if (raw == null) return "";
  // Collapse to the leading token and uppercase: the bill prints the family code
  // first, then a verbose human description ("AGC Ag35+ kW High Use" -> "AGC").
  const head = raw.trim().toUpperCase().split(/\s+/)[0] ?? "";

  // Order matters: test the more specific (digit-suffixed) codes before the bare
  // family so "AGA1"/"AGA2" never fall through to a generic "AGA".
  const map: ReadonlyArray<readonly [RegExp, string]> = [
    // AG-A small/large (the "H" prefix is PG&E's bundled-vs-unbundled marker, same family).
    [/^H?AGA1$/, "AG-A1"],
    [/^H?AGA2$/, "AG-A2"],
    // AG-B: PG&E does not size-tier AG-B; map to the small-tier schedule string
    // (familyOf() drops the digit to "AG-B" and planFor() picks the tier by peak kW).
    [/^H?AGFB$/, "AG-B"], // HAGFB = AG-B family variant in the inventory
    [/^H?AGB\d?$/, "AG-B"],
    // AG-C small/large.
    [/^H?AGC1$/, "AG-C1"],
    [/^H?AGC2$/, "AG-C2"],
    [/^H?AGC$/, "AG-C"], // bare AGC: familyOf() -> "AG-C", tier chosen by peak kW
    // Legacy closed schedules. AG-4 family on the card is "AG-4" (AG4C is its only
    // member here); AG-5 family is "AG-5" (AG5B large / AG5C small both -> "AG-5").
    [/^H?AG4[A-Z]?$/, "AG-4"],
    [/^H?AG5[A-Z]?$/, "AG-5"],
  ];
  for (const [re, token] of map) {
    if (re.test(head)) return token;
  }
  // Unmapped (business/non-ag like B1/B19/E19P/OL1/A1X): return the raw head so the
  // engine's non-ag gate no-ops it honestly instead of guessing an ag family.
  return head;
}

/** A plain-language pump name for the finding copy, from the fixture metadata. */
function pumpNameFor(m: FixtureMeter): string {
  const pid = m.meta.growerPumpId ?? m.meta.saIdDescriptor ?? null;
  const ranch = m.meta.ranch ? ` (${m.meta.ranch})` : "";
  if (pid) return `${pid}${ranch}`;
  return `Meter ${m.serviceId}${ranch}`;
}

/**
 * Map a NormalizedSummary (+ the meter's billed peakKw from meta) to the engines'
 * CycleBill. The summary carries dollars; the demand kW that set the charge lives in
 * the fixture's meta block (NormalizedSummary has no peak field), so we attach it here
 * so retrospective can price the $/kW and billAudit can prove usage stayed flat.
 */
function toCycleBill(s: NormalizedSummary, peakKw: number | null): CycleBill {
  return {
    start: s.start,
    close: s.close,
    tariff: s.tariff,
    demandChargeUsd: s.demandChargeUsd,
    peakKw,
    totalBillUsd: s.totalBillUsd,
  };
}

function main(): void {
  const pretty = process.argv.includes("--pretty");
  const card = loadRateCard();
  const summerMonths = card.summerMonths;

  const file = path.join(process.cwd(), "fixtures", "batth-real-meters.json");
  const fixture = JSON.parse(readFileSync(file, "utf8")) as Fixture;

  const billAuditFindings: DraftRecommendation[] = [];
  const retrospectiveFindings: DraftRecommendation[] = [];
  const rateFindings: DraftRecommendation[] = [];

  type RateOptDiagnostic = {
    serviceId: string;
    pumpName: string;
    rawTariff: string | null;
    normalizedSchedule: string;
    mappedToCardPlan: boolean;
    observedPeakKw: number;
    modeledCurrentUsd: number;
    modeledBestUsd: number | null;
    bestSchedule: string | null;
    actualUsd: number;
    reproductionError: number | null;
    withinTolerance: boolean;
    savingsUsd: number;
    emittedFinding: boolean;
  };
  const rateOptDiagnostics: RateOptDiagnostic[] = [];

  // The retrospective lever emits one rec per demand-charge cycle; tag whether each
  // carries a priced avoidable spike (it never will without intervals) so the rollup
  // is honest about what bill-only data can vs cannot prove.
  let demandChargeCycles = 0;
  let demandChargeUsdTotal = 0;
  let pricedSpikeFindings = 0;

  for (const m of fixture.meters) {
    const pumpName = pumpNameFor(m);
    const peakKw = m.meta.peakKw;

    // No billing summaries => map/metadata-only meter. Nothing for the bill-level
    // engines to chew on; skip (the interval engines would no-op anyway).
    if (m.summaries.length === 0) continue;

    const bills: CycleBill[] = m.summaries.map((s) => toCycleBill(s, peakKw));

    // --- bill-audit: one-cycle anomaly vs the meter's own same-season median ---
    const ba = billAudit({
      farmId: FARM_ID,
      pumpId: m.serviceId,
      pumpName,
      bills,
      summerMonths,
      asOf: ASOF,
    });
    billAuditFindings.push(...ba);

    // --- retrospective: demand-charge exposure (+ avoidable spike if intervals) ---
    const retro = retrospective({
      farmId: FARM_ID,
      pumpId: m.serviceId,
      pumpName,
      timezone: TIMEZONE,
      intervals: m.intervals, // empty in the real export
      bills,
      asOf: ASOF,
      // The runner uses "act" for a priced spike; keep the default "info" here since
      // no spike can be priced without intervals, so the severity stays honest.
    });
    for (const r of retro) {
      demandChargeCycles += 1;
      const dc = (r.action.params as { demandChargeUsd?: number }).demandChargeUsd;
      if (typeof dc === "number") demandChargeUsdTotal += dc;
      if (typeof r.impactUsd === "number") pricedSpikeFindings += 1;
    }
    retrospectiveFindings.push(...retro);

    // --- rate-optimization: cheapest eligible rate vs the modeled bill ---
    // Build the usage profile from (empty) intervals + the real bills, sum the real
    // billed dollars as the actual annual bill, and let the engine gate itself.
    const profile = bucketUsage(m.intervals, bills, TIMEZONE, card);
    const actualAnnualBillUsd = m.summaries.reduce(
      (sum, s) => sum + (s.totalBillUsd ?? 0),
      0,
    );
    // Normalize the verbose bill/inventory tariff label to the clean schedule token
    // the rate engine's familyOf() understands, at the fixture->engine boundary.
    const currentSchedule = normalizeTariffLabel(
      m.tariff ?? m.meta.rateSchedule ?? "",
    );
    const ro = rateOptimization({
      farmId: FARM_ID,
      pumpId: m.serviceId,
      pumpName,
      currentSchedule,
      profile,
      actualAnnualBillUsd,
      card,
      asOf: ASOF,
    });
    if (ro.recommendation) rateFindings.push(ro.recommendation);

    // Per-meter rate-opt diagnostics: capture WHY each meter does/does not yield a
    // switch finding, so the no-op (or finding) is provable, not asserted.
    rateOptDiagnostics.push({
      serviceId: m.serviceId,
      pumpName,
      rawTariff: m.tariff ?? m.meta.rateSchedule ?? null,
      normalizedSchedule: currentSchedule,
      mappedToCardPlan: ro.modeledCurrentUsd > 0 || ro.bestSchedule !== null,
      observedPeakKw: profile.observedPeakKw,
      modeledCurrentUsd: ro.modeledCurrentUsd,
      modeledBestUsd: ro.modeledBestUsd,
      bestSchedule: ro.bestSchedule,
      actualUsd: ro.actualUsd,
      reproductionError: Number.isFinite(ro.reproductionError)
        ? Math.round(ro.reproductionError * 1000) / 1000
        : null,
      withinTolerance: ro.withinTolerance,
      savingsUsd: ro.savingsUsd,
      emittedFinding: ro.recommendation !== null,
    });
  }

  const sumImpact = (recs: DraftRecommendation[]): number =>
    Math.round(recs.reduce((s, r) => s + (r.impactUsd ?? 0), 0) * 100) / 100;

  const output = {
    farm: fixture.farm,
    account: fixture.account,
    asOf: ASOF,
    fixture: {
      totalMeters: fixture.meters.length,
      billedMeters: fixture.meters.filter((m) => m.summaries.length > 0).length,
      metadataOnlyMeters: fixture.meters.filter((m) => m.summaries.length === 0)
        .length,
      metersWithDemandCharge: fixture.meters.filter((m) =>
        m.summaries.some((s) => (s.demandChargeUsd ?? 0) > 0),
      ).length,
      intervalsPresent: fixture.meters.some((m) => m.intervals.length > 0),
    },
    engines: {
      billAudit: {
        findings: billAuditFindings.length,
        totalImpactUsd: sumImpact(billAuditFindings),
        note:
          billAuditFindings.length === 0
            ? "No anomaly: each meter has one latest cycle, below the 3-comparator minimum. Honest no-op until billing history lands."
            : "Bill anomalies flagged.",
        recommendations: billAuditFindings,
      },
      retrospectiveDemandCharge: {
        findings: retrospectiveFindings.length,
        demandChargeCyclesExposed: demandChargeCycles,
        demandChargeUsdTotal: Math.round(demandChargeUsdTotal * 100) / 100,
        pricedAvoidableSpikes: pricedSpikeFindings,
        totalAvoidableImpactUsd: sumImpact(retrospectiveFindings),
        note:
          pricedSpikeFindings === 0
            ? "Every demand-charge cycle is surfaced with its real charge in the situation copy, but no avoidable daily spike can be priced without interval data (intervals empty), so these are info-severity with no impactUsd. The exposed demand-charge dollars are read straight off the bills."
            : "Avoidable demand spikes priced.",
        recommendations: retrospectiveFindings,
      },
      rateOptimization: {
        findings: rateFindings.length,
        totalSavingsUsd: sumImpact(rateFindings),
        note:
          rateFindings.length === 0
            ? "No rate switch claimed: even after the label fix, NormalizedSummary carries no kWh and intervals are empty, so the modeled usage profile has zero energy. The engine cannot reproduce the real bills and refuses to claim savings. Interval (Green Button) data is what unlocks rate-opt."
            : "ARTIFACT WARNING - DO NOT TRUST THESE DOLLARS. The label fix lets meters map to card families, but with intervals empty and NormalizedSummary carrying NO kWh, the modeled bill for every meter is demand-charge + customer-charge ONLY (energy term x 0 on both the current and candidate plan). The few findings emitted are pure max-demand $/kW arbitrage (e.g. AG-C 24.95/kW vs AG-B 13.95/kW) on demand-heavy pumps; they pass the bill-reproduction gate only by coincidence on low-energy winter cycles where the printed bill happens to be demand-dominated. Because AG-B's ENERGY rates are HIGHER than AG-C's, the sign of the real comparison is unknown until energy kWh is present. These are FALSE POSITIVES from missing energy data, not trustworthy savings. Rate-opt is genuinely unlocked only by interval (Green Button) TOU usage.",
        mappedToCardPlanMeters: rateOptDiagnostics.filter((d) => d.mappedToCardPlan)
          .length,
        artifactFindingsModelEnergyAsZero: rateFindings.length > 0,
        diagnostics: rateOptDiagnostics,
        recommendations: rateFindings,
      },
    },
  };

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");

  if (pretty) {
    process.stderr.write(
      [
        "",
        `Batth Farms (${fixture.account}) - engine-computed findings, asOf ${ASOF}`,
        `  meters in fixture: ${output.fixture.totalMeters} (${output.fixture.billedMeters} billed, ${output.fixture.metadataOnlyMeters} map/metadata-only)`,
        `  intervals present: ${output.fixture.intervalsPresent}`,
        "",
        `  bill-audit:           ${output.engines.billAudit.findings} findings, $${output.engines.billAudit.totalImpactUsd}`,
        `  demand-charge expose: ${output.engines.retrospectiveDemandCharge.findings} findings over ${output.engines.retrospectiveDemandCharge.demandChargeCyclesExposed} demand-charge cycles = $${output.engines.retrospectiveDemandCharge.demandChargeUsdTotal} in demand charges on the table (priced avoidable spikes: ${output.engines.retrospectiveDemandCharge.pricedAvoidableSpikes})`,
        `  rate-optimization:    ${output.engines.rateOptimization.findings} findings, $${output.engines.rateOptimization.totalSavingsUsd}/yr savings`,
        "",
      ].join("\n") + "\n",
    );
  }
}

main();
