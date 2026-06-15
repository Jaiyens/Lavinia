// Loads the committed PG&E ag rate-card fixture. fs-backed server-side edge; the
// pricing math itself is pure and lives in src/lib/energy/rates.ts. Resolves the
// fixture from process.cwd() (NOT new URL(..., import.meta.url)): the latter
// points inside .next once bundled and breaks under `next start`/Vercel. The
// fixture ships on Vercel via outputFileTracingIncludes in next.config.ts (the
// root "/**" glob traces ./fixtures/**/* for every server route, including the
// (app) shell that 3.3+ reads the card from).

import { readFileSync } from "node:fs";
import path from "node:path";
import { TOU_PERIODS, type RateCard, type SeasonPrices } from "@/lib/energy/rates";

// The rate card is a committed, immutable fixture that never changes at runtime, yet
// EnergyDashboard reads it on every render (once per meter-verification pass). Memoize the
// validated card at module scope so the disk read + JSON.parse + validation runs once per
// server process instead of once per request (part of the Home<->Energy latency fix).
let cachedCard: RateCard | null = null;

/** Read and validate fixtures/pge-ag-rate-card.json into a RateCard (cached after first load). */
export function loadRateCard(): RateCard {
  if (cachedCard !== null) return cachedCard;
  const file = path.join(process.cwd(), "fixtures", "pge-ag-rate-card.json");
  const card = JSON.parse(readFileSync(file, "utf8")) as RateCard;
  validateRateCard(card);
  cachedCard = card;
  return card;
}

/** Guard the demo against a malformed card: every ag family must carry both size
 *  tiers, the card must be versioned/dated, every plan must carry the per-day
 *  customer charge and its provenance note, and AG-C must carry its published
 *  Demand Charge Limiter. A throw here is a build/dev-time guard, never a user
 *  surface. */
function validateRateCard(card: RateCard): void {
  if (!Array.isArray(card.plans) || card.plans.length === 0) {
    throw new Error("rate card has no plans");
  }
  if (!Array.isArray(card.summerMonths) || card.summerMonths.length === 0) {
    throw new Error("rate card is missing summerMonths");
  }
  if (typeof card.sizeBreakKw !== "number") {
    throw new Error("rate card is missing sizeBreakKw");
  }
  if (typeof card.version !== "string" || card.version.length === 0) {
    throw new Error("rate card is missing its version");
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(card.effectiveDate) ||
    Number.isNaN(new Date(`${card.effectiveDate}T00:00:00.000Z`).getTime()) ||
    new Date(`${card.effectiveDate}T00:00:00.000Z`).toISOString().slice(0, 10) !==
      card.effectiveDate
  ) {
    throw new Error("rate card effectiveDate is not a real YYYY-MM-DD date");
  }
  if (!card.summerMonths.every((m) => Number.isInteger(m) && m >= 1 && m <= 12)) {
    throw new Error("rate card summerMonths must be integer months 1-12");
  }
  const families = new Set(card.plans.map((p) => p.family));
  for (const family of ["AG-A", "AG-B", "AG-C", "AG-4", "AG-5"]) {
    if (!families.has(family)) {
      throw new Error(`rate card is missing the ${family} family`);
    }
  }
  for (const family of families) {
    for (const sizeClass of ["small", "large"] as const) {
      const has = card.plans.some(
        (p) => p.family === family && p.sizeClass === sizeClass,
      );
      if (!has) {
        throw new Error(`rate card ${family} is missing the ${sizeClass} tier`);
      }
    }
  }
  for (const plan of card.plans) {
    // AG-4/AG-5 reuse one schedule string across tiers, so errors name the tier too.
    const id = `${plan.schedule} (${plan.sizeClass})`;
    if (typeof plan.customerChargePerDay !== "number" || plan.customerChargePerDay <= 0) {
      throw new Error(`rate card ${id} is missing customerChargePerDay`);
    }
    // The legacy float path reads the monthly figure, the cents path reads the
    // per-day print; keep the two within 5 cents of one month so the same plan
    // can never quote two different customer charges.
    const derivedMonthly = (plan.customerChargePerDay * 365) / 12;
    if (Math.abs(derivedMonthly - plan.customerChargePerMonth) > 0.05) {
      throw new Error(
        `rate card ${id} customerChargePerMonth drifts from its per-day figure`,
      );
    }
    if (typeof plan.sourceNote !== "string" || plan.sourceNote.length === 0) {
      throw new Error(`rate card ${id} is missing its sourceNote provenance`);
    }
    if (
      plan.family === "AG-C" &&
      (typeof plan.demandChargeLimiterPerKwh !== "number" ||
        plan.demandChargeLimiterPerKwh <= 0)
    ) {
      throw new Error(`rate card ${id} is missing a positive AG-C demand charge limiter`);
    }
    for (const seasonName of ["summer", "winter"] as const) {
      const season: SeasonPrices | undefined = plan[seasonName];
      if (season === undefined || season.energy === undefined || season.demand === undefined) {
        throw new Error(`rate card ${id} is missing its ${seasonName} prices`);
      }
      for (const period of TOU_PERIODS) {
        const price = season.energy[period];
        if (!Number.isFinite(price) || price < 0) {
          throw new Error(`rate card ${id} ${seasonName} ${period} price is not a valid rate`);
        }
      }
      for (const dk of ["maxDemandPerKw", "peakPeriodDemandPerKw"] as const) {
        const v = season.demand[dk];
        if (v !== undefined && (!Number.isFinite(v) || v < 0)) {
          throw new Error(`rate card ${id} ${seasonName} ${dk} is not a valid rate`);
        }
      }
    }
  }
}
