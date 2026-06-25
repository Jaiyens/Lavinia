// Seed a FULL synthetic demo farm into Supabase. The data mirrors the SHAPE of a real
// client (counts, meters-per-ranch clustering, rate-schedule mix, cost-source mix, NEM
// structure, seasonal+diurnal load) but is clearly NOT that client: invented names,
// invented coordinates (clustered around Fresno), invented absolute scale (~$5.8M/yr, not
// the source's ~$8.32M). For public demos + investor links: no real identity or real
// financial total appears anywhere.
//
// PRICING + SAVINGS ARE THE REAL ENGINES, never hand-rolled:
//   - every BillingPeriod is priced with priceCycleCents (src/lib/energy/rates.ts), the
//     SAME function (with peakWindowDemandKw=null) the rate lever back-tests against, so a
//     bill reconciles to the dashboard's own recompute at ~0% deviation;
//   - savings come from runRateLever (src/lib/recommendations/run-rate-lever.ts) +
//     runSolarInsight, run against the seeded farm. The dry run calls the SAME pure
//     rateLever() in memory so the reported savings equal what the DB run produces.
//
// Usage (run from apps/dashboard):
//   npx tsx scripts/seed-demo-farm.ts            # DRY RUN: build, price, report, no DB
//   npx tsx scripts/seed-demo-farm.ts --write    # persist to Supabase + run engines
//
// Target DB is read from apps/dashboard/.env DATABASE_URL_UNPOOLED (Supabase session
// pooler, port 5432). It REFUSES anything that is not Supabase, and the pooled 6543
// endpoint. It never touches local terra_batth or Neon.

import {
  priceCycleCents,
  seasonFor,
  type CyclePriceInput,
  type RateCard,
  type RatePlan,
  type TouPeriod,
} from "@/lib/energy/rates";
import { mapScheduleLabel, rateLever, type LeverPeriod } from "@/lib/energy/rate-lever";
import { loadRateCard } from "@/lib/pge/rate-card";
import { centsFromDollars } from "@/lib/format/money";

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) so the build is reproducible across runs.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0x7e44a17);
const rand = () => rng();
const randRange = (lo: number, hi: number) => lo + (hi - lo) * rand();
function randn(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function lognormal(median: number, sigma: number): number {
  return median * Math.exp(sigma * randn());
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
function weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((s, e) => s + e[1], 0);
  let r = rand() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1]![0];
}

// ---------------------------------------------------------------------------
// Identity pools — all invented, clearly NOT the source client.
// ---------------------------------------------------------------------------
const FARM_NAME = "Sundance Valley Farms";
const ENTITY_NAMES = [
  { name: "Almond Hollow Ag", billingName: "ALMOND HOLLOW AG LLC", owner: "Almond Hollow Ag LLC" },
  { name: "Rio Vista Orchards", billingName: "RIO VISTA ORCHARDS LP", owner: "Rio Vista Orchards LP" },
  { name: "Sierra Vista Farming", billingName: "SIERRA VISTA FARMING CO", owner: "Sierra Vista Farming Co" },
  { name: "Kings River Nut Partners", billingName: "KINGS RIVER NUT PARTNERS LLC", owner: "Kings River Nut Partners LLC" },
  { name: "Blue Oak Ranch Holdings", billingName: "BLUE OAK RANCH HOLDINGS INC", owner: "Blue Oak Ranch Holdings Inc" },
];
const RANCH_WORDS = [
  "North Avenue", "Elkhorn", "Mountain View", "Tamarack", "Goldenrod", "Cottonwood",
  "Sycamore", "Manzanita", "Quail Run", "Lone Pine", "Sandy Loam", "Dry Creek",
  "Wildflower", "Persimmon", "Olive Grove", "Cedar Crest", "Blue Heron", "Red Barn",
  "Hawk Ridge", "Willow Bend", "Sunfield", "Larkspur", "Three Rocks", "Indian Springs",
  "Foxtail", "Saddleback", "Verde Mesa", "Buckeye",
];
const RANCH_SUFFIX = ["Ranch", "Block", "Orchard", "Vineyard"];
const CROPS = [
  { name: "Almonds", kc: 1.0, weight: 50 },
  { name: "Pistachios", kc: 1.1, weight: 18 },
  { name: "Walnuts", kc: 1.1, weight: 12 },
  { name: "Wine Grapes", kc: 0.7, weight: 9 },
  { name: "Citrus", kc: 0.65, weight: 7 },
  { name: "Processing Tomatoes", kc: 1.05, weight: 4 },
];
const METER_PREFIX = ["Well", "Pump", "Booster", "Riser", "Filter Station", "Lift Pump"];
const PERSON_NAMES = [
  "Marco Delgado", "Priya Natarajan", "Curtis Bohannon", "Elena Vasquez", "Trent McAllister",
];

// ---------------------------------------------------------------------------
// Geography: 25 ranch centers within ~40 mi of Fresno; meters cluster near them.
// ---------------------------------------------------------------------------
const FRESNO = { lat: 36.7378, lng: -119.7871 };
const MAX_DEG = 0.46;

// ---------------------------------------------------------------------------
// Scale knobs (tuned in dry run for spend $5.6-6.0M, savings ~$580K).
// ---------------------------------------------------------------------------
const N_RANCHES = 25;
const N_METERS = 150;
const N_SOLAR = 40;
const COST_SOURCE = { BILLED: 133, MODELED: 4, REVIEW: 6, NONE: 7 };
const RANCH_ASSIGNED = Math.round(N_METERS * 0.9); // ~135 -> ~10% unassigned
const ACCOUNTS_PER_ENTITY = [14, 11, 8, 5, 3]; // 41 assigned
const N_UNASSIGNED_ACCOUNTS = 5; // -> 46 accounts total

const MAX_PEAK_KW = 620;
const SOLAR_SIZE_MEDIAN_KW = 29;
const SOLAR_SIZE_SIGMA = 0.55;
// A solar/NEM meter nets most of its consumption against on-site generation, so its PRINTED
// bill is demand-dominated with only a small net-energy charge (the "solar doesn't cover the
// demand charge" story). Billed energy = gross x this factor; demand is unaffected. This also
// keeps the solar fleet a modest share of total spend, so the headline stays in band whether
// or not the dashboard's kpi excludes solar from the spend rollup.
const SOLAR_BILL_ENERGY_FACTOR = 0.06;
// Two non-solar cohorts:
//  - "irrigation": correctly-rated workhorse pumps, mid load factor, smaller nameplate.
//  - "standby/frost": low-utilization big-nameplate pumps sitting on the demand-charge
//    AG-C/AG-5 rate. Genuine mis-ratings the rate lever detects (AG-B has no demand charge;
//    AG-B beats AG-C below LF ~= 0.12). Demand-dominated bills => high spend share AND
//    ~20-27% per-meter savings. This is the real rate-optimization story, not forced.
const PEAKY_FRACTION = 0.53;
const IRRIG_MEDIAN_KW = 48;
const IRRIG_SIGMA = 0.72;
const PEAKY_MEDIAN_KW = 152;
const PEAKY_SIGMA = 0.73;
const LF_IRRIGATION = [0.4, 0.58];
const LF_PEAKY = [0.05, 0.095];

/** Descending power-law cluster: `total` items across `groups`, big head, long tail of 1s. */
function descendingCluster(total: number, groups: number, exponent: number): number[] {
  const w = Array.from({ length: groups }, (_, r) => 1 / Math.pow(r + 1, exponent));
  const sum = w.reduce((s, v) => s + v, 0);
  const out = w.map((v) => Math.max(1, Math.round((v / sum) * total)));
  let diff = total - out.reduce((s, v) => s + v, 0);
  for (let r = 0; diff !== 0; r = (r + 1) % groups) {
    if (diff > 0) { out[r]! += 1; diff -= 1; }
    else if (out[r]! > 1) { out[r]! -= 1; diff += 1; }
  }
  return out.sort((a, b) => b - a);
}
const RANCH_CLUSTER = descendingCluster(RANCH_ASSIGNED, N_RANCHES, 0.92);

// Rate-schedule weights: BILLED (priceable AG only) vs the non-ag long tail (NONE/REVIEW).
const BILLED_RATE_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["HAGC", 70],
  ["AGC Ag35+ kW High Use", 12],
  ["AGC", 11],
  ["HAGA2", 13],
  ["AGA2 Ag<35 kW High Use", 5],
  ["HAGA1", 6],
  ["AGA1 Ag<35 kW Low Use", 9],
  ["HAGB", 7],
  ["AGB Ag35+ kW Med Use", 5],
  ["AG5B", 14],
  ["AG5C", 7],
  ["AG5B Large Time-of-Use Agricultural Power", 2],
  ["AG5C Large Time-of-Use Agricultural Power", 2],
  ["AG4C", 2],
  ["HAG5B", 1],
];
const SOLAR_RATE_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["HAGC", 24], ["AGC", 8], ["AGC Ag35+ kW High Use", 8],
];
const NONAG_RATE_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["A1X", 3], ["B1 Bus Low Use", 4], ["E19P", 1], ["HE1", 5], ["HB1", 2],
  ["OL1", 1], ["HETOUC", 2], ["HEM", 2], ["HAGFB", 2], ["G1 RB Residential Service", 1],
];
const MODELED_RATE_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["HAGA1", 2], ["AGA1 Ag<35 kW Low Use", 2], ["HAGB", 1], ["HAGC", 2],
];

// Illustrative SYNTHETIC normalized 24h load shapes (peak 1.0) per rate family. Hand-authored
// from ag-domain reasoning (irrigation pumps run off-peak overnight + midday and curtail during
// the 5-8pm rate peak), NOT lifted from any real account or profiling artifact. Used only to
// split each meter's monthly kWh into the 5-8pm peak bucket vs off-peak (the peak share is a
// couple percent for every ag family). Swap in real-fleet shapes if/when desired.
const SHAPES: Record<string, number[]> = {
  // daytime irrigation: high midday, near-zero during the 5-8pm peak, mild overnight base
  "AG-C": [0.70, 0.70, 0.70, 0.72, 0.76, 0.82, 0.90, 0.96, 1.00, 1.00, 0.99, 0.97, 0.94, 0.90, 0.82, 0.66, 0.34, 0.08, 0.05, 0.05, 0.42, 0.64, 0.68, 0.70],
  // <35kW pumps peaking a touch later in the afternoon
  "AG-A": [0.72, 0.72, 0.74, 0.76, 0.80, 0.84, 0.88, 0.92, 0.95, 0.98, 1.00, 1.00, 0.99, 0.97, 0.92, 0.80, 0.58, 0.16, 0.08, 0.08, 0.34, 0.58, 0.66, 0.70],
  // flatter mid-use profile, late-afternoon peak
  "AG-B": [0.76, 0.76, 0.76, 0.76, 0.78, 0.80, 0.84, 0.86, 0.88, 0.90, 0.92, 0.94, 0.96, 0.98, 1.00, 0.92, 0.56, 0.18, 0.16, 0.16, 0.70, 0.78, 0.78, 0.77],
  // legacy demand-rate pumps, midday peak
  "AG-5": [0.74, 0.74, 0.74, 0.74, 0.75, 0.76, 0.80, 0.88, 0.95, 0.99, 1.00, 0.94, 0.84, 0.82, 0.80, 0.72, 0.50, 0.12, 0.14, 0.18, 0.56, 0.72, 0.72, 0.74],
  // legacy three-tier, broad midday plateau
  "AG-4": [0.92, 0.92, 0.92, 0.92, 0.93, 0.94, 0.95, 0.96, 0.98, 0.99, 1.00, 0.72, 0.62, 0.61, 0.62, 0.62, 0.36, 0.12, 0.40, 0.52, 0.92, 0.95, 0.93, 0.92],
};
function shapeForLabel(label: string): number[] {
  const mapped = mapScheduleLabel(label, CARD, 100);
  const fam = mapped?.plan.family ?? "AG-C";
  return SHAPES[fam] ?? SHAPES["AG-C"]!;
}
function peakFraction(shape: number[]): number {
  const total = shape.reduce((s, v) => s + v, 0);
  const peak = (shape[17] ?? 0) + (shape[18] ?? 0) + (shape[19] ?? 0);
  return total > 0 ? peak / total : 0;
}

const CARD: RateCard = loadRateCard();

// 12 monthly cycles: Jun 2025 .. May 2026.
type Month = { year: number; month: number; start: string; close: string; days: number };
function buildMonths(): Month[] {
  const out: Month[] = [];
  let y = 2025;
  let m = 6;
  for (let i = 0; i < 12; i++) {
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const start = `${y}-${String(m).padStart(2, "0")}-01T00:00:00.000Z`;
    const close = `${y}-${String(m).padStart(2, "0")}-${String(days).padStart(2, "0")}T00:00:00.000Z`;
    out.push({ year: y, month: m, start, close, days });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
const MONTHS = buildMonths();

// Seasonal envelope (Central Valley irrigation), month 1-12.
const SEASONAL = [0.1, 0.12, 0.3, 0.55, 0.85, 1.1, 1.25, 1.2, 1.0, 0.65, 0.3, 0.12];
const SEASONAL_MEAN = SEASONAL.reduce((s, v) => s + v, 0) / 12;
function normSeasonal(month: number): number {
  return (SEASONAL[month - 1] ?? 0.5) / SEASONAL_MEAN;
}

// ---------------------------------------------------------------------------
// In-memory model.
// ---------------------------------------------------------------------------
export type CostSource = "BILLED" | "MODELED" | "REVIEW" | "NONE";
export type LineItem = { kind: string; label: string | null; amountCents: number; quantity: number | null; unit: string | null; rate: number | null };
export type Period = { start: string; close: string; printedTotalCents: number | null; peakKw: number; totalKwh: number; demandCents: number; tariff: string; lineItems: LineItem[] };
export type Meter = {
  idx: number;
  name: string;
  growerPumpId: string;
  serviceId: string;
  rateLabel: string;
  costSource: CostSource;
  isLegacy: boolean;
  isSolar: boolean;
  nemType: string | null;
  solarKw: number | null;
  trueUpMonth: number | null;
  arrayIdx: number | null;
  status: string | null;
  gpm: number | null;
  peakKw: number;
  lf: number;
  lat: number;
  lng: number;
  ranchIdx: number | null;
  accountIdx: number | null;
  cropName: string;
  periods: Period[];
  modeledMonthlyCents: number | null;
  annualSpendCents: number;
};

function priceCycle(plan: RatePlan, input: CyclePriceInput, days: number): { totalCents: number; lineItems: LineItem[]; demandCents: number } {
  const breakdown = priceCycleCents(input, plan);
  const sp = input.season === "summer" ? plan.summer : plan.winter;
  const lineItems: LineItem[] = [];
  const buckets: [TouPeriod, string][] = [["peak", "Peak"], ["off_peak", "Off-Peak"]];
  for (const [b, label] of buckets) {
    const kwh = input.energyKwh[b] ?? 0;
    if (kwh <= 0) continue;
    lineItems.push({ kind: "tou_energy", label, amountCents: centsFromDollars(kwh * (sp.energy[b] ?? 0)), quantity: Math.round(kwh * 100) / 100, unit: "kWh", rate: sp.energy[b] ?? 0 });
  }
  const maxKw = input.maxDemandKw ?? 0;
  const dRate = sp.demand.maxDemandPerKw ?? 0;
  const demandCents = centsFromDollars(maxKw * dRate);
  lineItems.push({ kind: "demand", label: "Maximum Demand", amountCents: demandCents, quantity: Math.round(maxKw * 100) / 100, unit: "kW", rate: dRate });
  const perDay = plan.customerChargePerDay ?? (plan.customerChargePerMonth * 12) / 365;
  lineItems.push({ kind: "other", label: `Customer Charge (${days} days @ $${perDay.toFixed(5)})`, amountCents: centsFromDollars(days * perDay), quantity: days, unit: null, rate: perDay });
  return { totalCents: breakdown.totalCents, lineItems, demandCents };
}

/** Build a meter's 12 monthly priced cycles, priced the SAME way the lever recomputes. */
function buildCycles(m: Meter): void {
  const shape = shapeForLabel(m.rateLabel);
  const pf = peakFraction(shape);
  const avgKw = m.peakKw * m.lf;
  const cyclePeaks = MONTHS.map((mo) => m.peakKw * Math.min(1, Math.max(0.15, normSeasonal(mo.month))) * (1 + 0.06 * randn()));
  const maxCycleKw = Math.max(...cyclePeaks);
  const mapped = mapScheduleLabel(m.rateLabel, CARD, maxCycleKw);
  if (!mapped) return;
  const plan = mapped.plan;
  for (let i = 0; i < 12; i++) {
    const mo = MONTHS[i]!;
    const ns = normSeasonal(mo.month);
    const monthlyKwh = avgKw * mo.days * 24 * ns * (m.isSolar ? SOLAR_BILL_ENERGY_FACTOR : 1);
    const peakKwh = monthlyKwh * pf;
    const offKwh = monthlyKwh - peakKwh;
    const cyclePeakKw = Math.max(1, cyclePeaks[i]!);
    const season = seasonFor(mo.start, CARD);
    const input: CyclePriceInput = { days: mo.days, season, energyKwh: { peak: peakKwh, off_peak: offKwh }, maxDemandKw: cyclePeakKw, peakWindowDemandKw: null };
    const priced = priceCycle(plan, input, mo.days);
    m.periods.push({
      start: mo.start, close: mo.close, printedTotalCents: priced.totalCents,
      peakKw: Math.round(cyclePeakKw * 100) / 100, totalKwh: Math.round((peakKwh + offKwh) * 100) / 100,
      demandCents: priced.demandCents, tariff: m.rateLabel, lineItems: priced.lineItems,
    });
  }
  m.annualSpendCents = m.periods.reduce((s, p) => s + (p.printedTotalCents ?? 0), 0);
}

function ringPoint(): { lat: number; lng: number } {
  for (let tries = 0; tries < 50; tries++) {
    const dLat = (rand() * 2 - 1) * MAX_DEG;
    const dLng = (rand() * 2 - 1) * (MAX_DEG * 1.15);
    const dist = Math.hypot(dLat, dLng / 1.15);
    if (dist > 0.06 && dist < MAX_DEG) return { lat: FRESNO.lat + dLat, lng: FRESNO.lng + dLng };
  }
  return { lat: FRESNO.lat + 0.2, lng: FRESNO.lng - 0.2 };
}

export function build() {
  const ranchCenters = Array.from({ length: N_RANCHES }, () => ringPoint());
  const ranchNames = shuffle(RANCH_WORDS).slice(0, N_RANCHES).map((w, i) => `${w} ${RANCH_SUFFIX[i % RANCH_SUFFIX.length]}`);
  const ranchCrops = Array.from({ length: N_RANCHES }, () => weighted(CROPS.map((c) => [c.name, c.weight] as const)));

  const ranchOfMeter: (number | null)[] = [];
  for (let r = 0; r < N_RANCHES; r++) {
    const count = RANCH_CLUSTER[r] ?? 1;
    for (let k = 0; k < count; k++) ranchOfMeter.push(r);
  }
  while (ranchOfMeter.length < N_METERS) ranchOfMeter.push(null);
  const ranchAssign = shuffle(ranchOfMeter).slice(0, N_METERS);

  const usedAcct = new Set<string>();
  const acctNum = () => {
    for (;;) {
      const n = String(2_000_000_000 + Math.floor(rand() * 7_899_999_999)).padStart(10, "0");
      if (!usedAcct.has(n)) { usedAcct.add(n); return n; }
    }
  };
  const usedSa = new Set<string>();
  const saId = () => {
    for (;;) {
      const n = String(7_000_000_000 + Math.floor(rand() * 2_899_999_999)).padStart(10, "0");
      if (!usedSa.has(n)) { usedSa.add(n); return n; }
    }
  };
  const accounts: { number: string; entityIdx: number | null; coverage: string }[] = [];
  for (let e = 0; e < ACCOUNTS_PER_ENTITY.length; e++) {
    for (let k = 0; k < ACCOUNTS_PER_ENTITY[e]!; k++) accounts.push({ number: acctNum(), entityIdx: e, coverage: "reconciled" });
  }
  for (let k = 0; k < N_UNASSIGNED_ACCOUNTS; k++) accounts.push({ number: acctNum(), entityIdx: null, coverage: "no_bill" });

  const sources: CostSource[] = [];
  for (const [s, n] of Object.entries(COST_SOURCE)) for (let k = 0; k < n; k++) sources.push(s as CostSource);
  const sourceAssign = shuffle(sources);

  const billedIdx: number[] = [];
  sourceAssign.forEach((s, i) => { if (s === "BILLED") billedIdx.push(i); });
  const solarSet = new Set(shuffle(billedIdx).slice(0, N_SOLAR));

  const meters: Meter[] = [];
  for (let i = 0; i < N_METERS; i++) {
    const cost = sourceAssign[i]!;
    const isSolar = solarSet.has(i);
    let rateLabel: string;
    if (isSolar) rateLabel = weighted(SOLAR_RATE_WEIGHTS);
    else if (cost === "BILLED") rateLabel = weighted(BILLED_RATE_WEIGHTS);
    else if (cost === "MODELED") rateLabel = weighted(MODELED_RATE_WEIGHTS);
    else rateLabel = weighted(NONAG_RATE_WEIGHTS);

    const mapped = mapScheduleLabel(rateLabel, CARD, 100);
    const isLegacy = mapped?.plan.legacy ?? false;

    const peaky = !isSolar && rand() < PEAKY_FRACTION;
    const lf = peaky ? randRange(LF_PEAKY[0]!, LF_PEAKY[1]!) : randRange(LF_IRRIGATION[0]!, LF_IRRIGATION[1]!);
    const rawKw = isSolar
      ? lognormal(SOLAR_SIZE_MEDIAN_KW, SOLAR_SIZE_SIGMA)
      : peaky
        ? lognormal(PEAKY_MEDIAN_KW, PEAKY_SIGMA)
        : lognormal(IRRIG_MEDIAN_KW, IRRIG_SIGMA);
    const peakKw = Math.min(MAX_PEAK_KW, Math.max(4, rawKw));

    const ranchIdx = ranchAssign[i] ?? null;
    const center = ranchIdx !== null ? ranchCenters[ranchIdx]! : ringPoint();
    const lat = center.lat + (rand() * 2 - 1) * 0.013;
    const lng = center.lng + (rand() * 2 - 1) * 0.013;

    meters.push({
      idx: i,
      name: `${pick(METER_PREFIX)} ${i + 1}`,
      growerPumpId: `M-${String(i + 1).padStart(3, "0")}`,
      serviceId: saId(),
      rateLabel,
      costSource: cost,
      isLegacy,
      isSolar,
      nemType: isSolar ? "nem2_agg" : null,
      solarKw: null,
      trueUpMonth: null,
      arrayIdx: null,
      status: weighted([["GOOD", 78] as const, ["OLD", 10], ["BAD", 7], ["NEW WELL", 5]]),
      gpm: rand() < 0.78 ? Math.round(randRange(300, 2600)) : null,
      peakKw: Math.round(peakKw * 10) / 10,
      lf,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      ranchIdx,
      accountIdx: null,
      cropName: ranchIdx !== null ? ranchCrops[ranchIdx]! : weighted(CROPS.map((c) => [c.name, c.weight] as const)),
      periods: [],
      modeledMonthlyCents: null,
      annualSpendCents: 0,
    });
  }

  for (const m of meters) if (rand() < 0.9) m.accountIdx = Math.floor(rand() * accounts.length);

  const arrays = [
    { name: "Northgate Solar", nameplateKw: 760, nemType: "nem2_agg", trueUpMonth: 4, saId: "7100000001" },
    { name: "Cypress Solar", nameplateKw: 1250, nemType: "nem2_agg", trueUpMonth: 9, saId: "7100000002" },
  ];
  const solarMeters = meters.filter((m) => m.isSolar);
  solarMeters.forEach((m, k) => {
    const arrIdx = k % 10 < 4 ? 0 : 1;
    m.arrayIdx = arrIdx;
    m.trueUpMonth = arrays[arrIdx]!.trueUpMonth;
    m.solarKw = Math.round(arrays[arrIdx]!.nameplateKw * randRange(0.04, 0.16));
  });

  for (const m of meters) {
    if (m.costSource === "BILLED") {
      buildCycles(m);
    } else if (m.costSource === "MODELED") {
      buildCycles(m);
      const summer = m.periods.find((p) => seasonFor(p.start, CARD) === "summer");
      m.modeledMonthlyCents = summer?.printedTotalCents ?? m.periods[0]?.printedTotalCents ?? null;
      m.periods = [];
      m.annualSpendCents = 0;
    } else if (m.costSource === "REVIEW") {
      for (let i = 5; i < 8; i++) {
        const mo = MONTHS[i]!;
        m.periods.push({ start: mo.start, close: mo.close, printedTotalCents: null, peakKw: Math.round(m.peakKw * 100) / 100, totalKwh: 0, demandCents: 0, tariff: m.rateLabel, lineItems: [] });
      }
    }
  }

  return { meters, ranchNames, ranchCrops, ranchCenters, accounts, arrays };
}

// ---------------------------------------------------------------------------
// Dry-run report: spend + savings via the REAL pure rateLever.
// ---------------------------------------------------------------------------
export function leverPeriods(m: Meter): LeverPeriod[] {
  return m.periods.map((p) => ({ start: p.start, close: p.close, printedTotalCents: p.printedTotalCents, lineItems: p.lineItems }));
}
export function isSolarNem(m: Meter): boolean {
  return m.isSolar || m.solarKw !== null || m.nemType !== null;
}

export function report(model: ReturnType<typeof build>) {
  const { meters } = model;
  const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  let annualSpend = 0; // non-solar reconciled (kpi versions that exclude solar)
  let allReconciled = 0; // ALL reconciled incl solar (kpi versions that include solar)
  let solarSpend = 0;
  for (const m of meters) {
    if (m.costSource !== "BILLED") continue;
    const t = m.periods.reduce((s, p) => s + (p.printedTotalCents ?? 0), 0);
    allReconciled += t;
    if (isSolarNem(m)) solarSpend += t;
    else annualSpend += t;
  }

  let savingsCents = 0;
  let estimateCount = 0;
  let qualitativeCount = 0;
  const switches: { name: string; from: string; to: string; save: number }[] = [];
  for (const m of meters) {
    if (m.costSource !== "BILLED" || isSolarNem(m)) continue;
    const res = rateLever({ scheduleLabel: m.rateLabel, periods: leverPeriods(m) }, CARD);
    if (res.kind === "estimate") {
      savingsCents += res.savingsCents;
      estimateCount += 1;
      switches.push({ name: m.name, from: res.currentSchedule, to: res.targetSchedule, save: res.savingsCents });
    } else if (res.kind === "qualitative") qualitativeCount += 1;
  }

  const bySource: Record<string, number> = {};
  for (const m of meters) bySource[m.costSource] = (bySource[m.costSource] ?? 0) + 1;
  const fam: Record<string, number> = {};
  for (const m of meters) {
    const mp = mapScheduleLabel(m.rateLabel, CARD, 100);
    const key = mp ? mp.plan.family : "non-ag";
    fam[key] = (fam[key] ?? 0) + 1;
  }
  const assignedRanch = meters.filter((m) => m.ranchIdx !== null).length;
  const assignedAcct = meters.filter((m) => m.accountIdx !== null).length;

  console.log("\n================= DRY RUN: synthetic demo farm =================");
  console.log(`meters=${meters.length} cost-source=${JSON.stringify(bySource)} solar=${meters.filter((m) => m.isSolar).length}`);
  console.log(`ranch-assigned=${assignedRanch}/${meters.length} (${Math.round(100 * assignedRanch / meters.length)}%)  acct-assigned=${assignedAcct}/${meters.length}`);
  console.log(`rate families: ${JSON.stringify(fam)}`);
  console.log(`\nANNUAL PG&E SPEND:`);
  console.log(`  ALL reconciled (incl solar): ${usd(allReconciled)}  [target $5.6M-$6.0M; NOT $8.32M]`);
  console.log(`  non-solar reconciled:        ${usd(annualSpend)}    solar (net/demand-dominated): ${usd(solarSpend)}`);
  console.log(`IDENTIFIED SAVINGS (real rateLever): ${usd(savingsCents)}  (~${(100 * savingsCents / allReconciled).toFixed(1)}% of all-reconciled, ~${(100 * savingsCents / annualSpend).toFixed(1)}% of non-solar)  [target ~$580K / ~10%]`);
  console.log(`  rate-switch estimates: ${estimateCount}   legacy qualitative: ${qualitativeCount}`);
  for (const s of switches.sort((a, b) => b.save - a.save).slice(0, 8)) console.log(`    ${s.name.padEnd(16)} ${s.from} -> ${s.to}  ${usd(s.save)}`);
  const annuals = meters.filter((m) => m.costSource === "BILLED" && !isSolarNem(m)).map((m) => m.annualSpendCents).sort((a, b) => b - a);
  console.log(`\nnon-solar billed meters=${annuals.length}  top ${usd(annuals[0] ?? 0)}/yr  median ${usd(annuals[Math.floor(annuals.length / 2)] ?? 0)}/yr`);
  console.log("================================================================\n");
  return { annualSpend, savingsCents, estimateCount, qualitativeCount };
}

export { CARD, MONTHS, FARM_NAME, ENTITY_NAMES, CROPS, PERSON_NAMES, normSeasonal, shapeForLabel, peakFraction };

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
const WRITE = process.argv.includes("--write");
const model = build();
const summary = report(model);

if (!WRITE) {
  console.log("DRY RUN only. Re-run with --write to persist to Supabase + run engines.");
} else {
  void (async () => {
    const { writeToSupabase } = await import("./seed-demo-farm.write");
    await writeToSupabase(model, summary);
  })();
}
