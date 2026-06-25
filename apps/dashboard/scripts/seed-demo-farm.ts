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
// pooler, port 5432). It REFUSES to run against anything that is not Supabase, and refuses
// the pooled 6543 endpoint. It never touches local terra_batth or Neon.

import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  // Box-Muller
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
/** Weighted draw from [value, weight][]. */
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
const MAX_DEG = 0.46; // ~32 mi N/S; lng a touch wider. Keep inside ~40 mi.

// ---------------------------------------------------------------------------
// Scale knobs (the dials I tune in dry run to land spend $5.6-6.0M, savings ~$580K).
// ---------------------------------------------------------------------------
const N_RANCHES = 25;
const N_METERS = 150;
const N_SOLAR = 40; // solar-flagged meters (excluded from spend headline)
const COST_SOURCE = { BILLED: 133, MODELED: 4, REVIEW: 6, NONE: 7 };
// Meters-per-ranch cluster: descending power law summing to ~90% of meters (rest unassigned).
const RANCH_ASSIGNED = Math.round(N_METERS * 0.9); // ~135 -> ~10% unassigned
// Account distribution across the 5 entities (+ a few unassigned accounts).
const ACCOUNTS_PER_ENTITY = [14, 11, 8, 5, 3]; // 41 assigned
const N_UNASSIGNED_ACCOUNTS = 5; // -> 46 accounts total

// Size (peak kW) heavy tail + load factor split. avgKw = peakKw * LF.
const SIZE_MEDIAN_KW = 40;
const SIZE_SIGMA = 0.8;
const MAX_PEAK_KW = 480;
const SOLAR_SIZE_MEDIAN_KW = 70;
const SOLAR_SIZE_SIGMA = 0.62;
// "Standby/frost" cohort: low-utilization pumps sitting on the demand-charge AG-C/AG-5 rate.
// These are the genuine mis-ratings the rate lever detects (AG-B has no demand charge). The
// crossover where AG-B beats AG-C is LF ~= 0.12, so this band sits firmly below it.
const PEAKY_FRACTION = 0.36;
const LF_IRRIGATION = [0.4, 0.6];
const LF_PEAKY = [0.05, 0.1];

/** Descending power-law cluster: `total` items across `groups`, big head, long tail of 1s. */
function descendingCluster(total: number, groups: number, exponent: number): number[] {
  const w = Array.from({ length: groups }, (_, r) => 1 / Math.pow(r + 1, exponent));
  const sum = w.reduce((s, v) => s + v, 0);
  const raw = w.map((v) => (v / sum) * total);
  const out = raw.map((v) => Math.max(1, Math.round(v)));
  // fix rounding drift to hit `total` exactly, adjusting the head/tail
  let diff = total - out.reduce((s, v) => s + v, 0);
  for (let r = 0; diff !== 0; r = (r + 1) % groups) {
    if (diff > 0) { out[r]! += 1; diff -= 1; }
    else if (out[r]! > 1) { out[r]! -= 1; diff += 1; }
  }
  return out.sort((a, b) => b - a);
}
const RANCH_CLUSTER = descendingCluster(RANCH_ASSIGNED, N_RANCHES, 0.92);

// Seasonal envelope (Central Valley irrigation), month 1-12.
const SEASONAL = [0.1, 0.12, 0.3, 0.55, 0.85, 1.1, 1.25, 1.2, 1.0, 0.65, 0.3, 0.12];
const SEASONAL_MEAN = SEASONAL.reduce((s, v) => s + v, 0) / 12;

// Rate-schedule weights for BILLED (priceable AG only) vs the non-ag long tail (NONE/REVIEW).
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
  ["HAGC", 24],
  ["AGC", 8],
  ["AGC Ag35+ kW High Use", 8],
];
const NONAG_RATE_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["A1X", 3], ["B1 Bus Low Use", 4], ["E19P", 1], ["HE1", 5], ["HB1", 2],
  ["OL1", 1], ["HETOUC", 2], ["HEM", 2], ["HAGFB", 2], ["G1 RB Residential Service", 1],
];
const MODELED_RATE_WEIGHTS: ReadonlyArray<readonly [string, number]> = [
  ["HAGA1", 2], ["AGA1 Ag<35 kW Low Use", 2], ["HAGB", 1], ["HAGC", 2],
];

// Normalized 24h load shapes (peak 1.0) per rate family, taken from the profile, used only
// to split monthly kWh into the 5-8pm peak bucket vs off-peak. Trimmed to representatives.
const SHAPES: Record<string, number[]> = {
  "AG-C": [0.756, 0.759, 0.766, 0.771, 0.789, 0.806, 0.869, 0.942, 0.988, 0.999, 1, 0.993, 0.978, 0.964, 0.923, 0.84, 0.479, 0.075, 0.067, 0.07, 0.474, 0.72, 0.736, 0.747],
  "AG-A": [0.725, 0.724, 0.732, 0.755, 0.782, 0.797, 0.822, 0.865, 0.942, 0.966, 0.966, 0.954, 0.961, 0.991, 1, 0.935, 0.704, 0.143, 0.08, 0.079, 0.344, 0.628, 0.718, 0.728],
  "AG-B": [0.77, 0.77, 0.778, 0.772, 0.775, 0.776, 0.821, 0.826, 0.832, 0.844, 0.865, 0.872, 0.924, 0.949, 1, 0.997, 0.57, 0.168, 0.173, 0.174, 0.766, 0.801, 0.792, 0.804],
  "AG-5": [0.74, 0.748, 0.753, 0.75, 0.749, 0.748, 0.776, 0.86, 0.944, 0.989, 1, 0.942, 0.821, 0.817, 0.796, 0.774, 0.522, 0.125, 0.154, 0.183, 0.577, 0.727, 0.724, 0.739],
  "AG-4": [0.923, 0.917, 0.918, 0.923, 0.925, 0.925, 0.938, 0.942, 0.971, 0.977, 1, 0.713, 0.617, 0.612, 0.616, 0.62, 0.365, 0.126, 0.405, 0.534, 0.922, 0.947, 0.932, 0.926],
};
function shapeForLabel(label: string): number[] {
  const mapped = mapScheduleLabel(label, CARD, 100);
  const fam = mapped?.plan.family ?? "AG-C";
  return SHAPES[fam] ?? SHAPES["AG-C"]!;
}
/** Fraction of daily energy that lands in the 5-8pm rate peak (hours 17,18,19). */
function peakFraction(shape: number[]): number {
  const total = shape.reduce((s, v) => s + v, 0);
  const peak = (shape[17] ?? 0) + (shape[18] ?? 0) + (shape[19] ?? 0);
  return total > 0 ? peak / total : 0;
}

const CARD: RateCard = loadRateCard();

// ---------------------------------------------------------------------------
// 12 monthly cycles: Jun 2025 .. May 2026.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// The in-memory model.
// ---------------------------------------------------------------------------
type CostSource = "BILLED" | "MODELED" | "REVIEW" | "NONE";
type LineItem = { kind: string; label: string | null; amountCents: number; quantity: number | null; unit: string | null; rate: number | null };
type Period = { start: string; close: string; printedTotalCents: number | null; peakKw: number; totalKwh: number; demandCents: number; tariff: string; lineItems: LineItem[] };
type Meter = {
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
  annualSpendCents: number; // priced annual (informational; solar excluded from headline)
};

// --- price one cycle EXACTLY as the lever recomputes it (peakWindowDemandKw=null) -------
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

function normSeasonal(month: number): number {
  return (SEASONAL[month - 1] ?? 0.5) / SEASONAL_MEAN;
}

/** Build a meter's 12 monthly priced cycles. Reconciled => printedTotalCents set. */
function buildCycles(m: Meter): void {
  const shape = shapeForLabel(m.rateLabel);
  const pf = peakFraction(shape);
  const avgKw = m.peakKw * m.lf;
  // Resolve ONE plan per meter exactly as the lever does (max cycle kW for the demand tier).
  const cyclePeaks = MONTHS.map((mo) => m.peakKw * Math.min(1, Math.max(0.15, normSeasonal(mo.month))) * (1 + 0.06 * randn()));
  const maxCycleKw = Math.max(...cyclePeaks);
  const mapped = mapScheduleLabel(m.rateLabel, CARD, maxCycleKw);
  if (!mapped) return; // non-ag (REVIEW/NONE) — handled elsewhere
  const plan = mapped.plan;
  for (let i = 0; i < 12; i++) {
    const mo = MONTHS[i]!;
    const ns = normSeasonal(mo.month);
    const monthlyKwh = avgKw * mo.days * 24 * ns;
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

// ---------------------------------------------------------------------------
// Build the whole farm.
// ---------------------------------------------------------------------------
function ringPoint(): { lat: number; lng: number } {
  // Cluster ranch centers in the ag belt around Fresno; reject the dense city core.
  for (let tries = 0; tries < 50; tries++) {
    const dLat = (rand() * 2 - 1) * MAX_DEG;
    const dLng = (rand() * 2 - 1) * (MAX_DEG * 1.15);
    const dist = Math.hypot(dLat, dLng / 1.15);
    if (dist > 0.06 && dist < MAX_DEG) return { lat: FRESNO.lat + dLat, lng: FRESNO.lng + dLng };
  }
  return { lat: FRESNO.lat + 0.2, lng: FRESNO.lng - 0.2 };
}

function build() {
  // crops per ranch
  const ranchCenters = Array.from({ length: N_RANCHES }, () => ringPoint());
  const ranchNames = shuffle(RANCH_WORDS).slice(0, N_RANCHES).map((w, i) => `${w} ${RANCH_SUFFIX[i % RANCH_SUFFIX.length]}`);
  const ranchCrops = Array.from({ length: N_RANCHES }, () => weighted(CROPS.map((c) => [c.name, c.weight] as const)));

  // meter -> ranch assignment via the descending cluster (rest unassigned)
  const ranchOfMeter: (number | null)[] = [];
  for (let r = 0; r < N_RANCHES; r++) {
    const count = RANCH_CLUSTER[r] ?? 1;
    for (let k = 0; k < count; k++) ranchOfMeter.push(r);
  }
  while (ranchOfMeter.length < N_METERS) ranchOfMeter.push(null); // unassigned (~10%)
  const ranchAssign = shuffle(ranchOfMeter).slice(0, N_METERS);

  // accounts -> entity assignment
  const accounts: { number: string; entityIdx: number | null; coverage: string }[] = [];
  let acctSeq = 1000;
  for (let e = 0; e < ACCOUNTS_PER_ENTITY.length; e++) {
    for (let k = 0; k < ACCOUNTS_PER_ENTITY[e]!; k++) {
      accounts.push({ number: String(2000000000 + acctSeq++ * 37 % 8999999999).padStart(10, "0"), entityIdx: e, coverage: "reconciled" });
    }
  }
  for (let k = 0; k < N_UNASSIGNED_ACCOUNTS; k++) {
    accounts.push({ number: String(2000000000 + acctSeq++ * 37 % 8999999999).padStart(10, "0"), entityIdx: null, coverage: "no_bill" });
  }

  // cost-source assignment across meters
  const sources: CostSource[] = [];
  for (const [s, n] of Object.entries(COST_SOURCE)) for (let k = 0; k < n; k++) sources.push(s as CostSource);
  const sourceAssign = shuffle(sources);

  // pick which meters are solar: prefer BILLED meters
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

    const peaky = rand() < PEAKY_FRACTION;
    const lf = peaky ? randRange(LF_PEAKY[0]!, LF_PEAKY[1]!) : randRange(LF_IRRIGATION[0]!, LF_IRRIGATION[1]!);
    const peakKw = Math.min(MAX_PEAK_KW, Math.max(4, isSolar ? lognormal(SOLAR_SIZE_MEDIAN_KW, SOLAR_SIZE_SIGMA) : lognormal(SIZE_MEDIAN_KW, SIZE_SIGMA)));

    const ranchIdx = ranchAssign[i] ?? null;
    const center = ranchIdx !== null ? ranchCenters[ranchIdx]! : ringPoint();
    const lat = center.lat + (rand() * 2 - 1) * 0.013;
    const lng = center.lng + (rand() * 2 - 1) * 0.013;

    const prefix = pick(METER_PREFIX);
    const meter: Meter = {
      idx: i,
      name: `${prefix} ${i + 1}`,
      growerPumpId: `M-${String(i + 1).padStart(3, "0")}`,
      serviceId: String(7000000000 + Math.floor(rand() * 2999999999)).padStart(10, "0"),
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
    };
    meters.push(meter);
  }

  // account assignment: ~90% of meters get an account (weighted toward assigned accounts)
  for (const m of meters) {
    if (rand() < 0.9) m.accountIdx = Math.floor(rand() * accounts.length);
  }

  // solar arrays: 2, split benefiting meters ~4:6
  const arrays = [
    { name: "Northgate Solar", nameplateKw: 760, nemType: "nem2_agg", trueUpMonth: 4, saId: String(7100000001) },
    { name: "Cypress Solar", nameplateKw: 1250, nemType: "nem2_agg", trueUpMonth: 9, saId: String(7100000002) },
  ];
  const solarMeters = meters.filter((m) => m.isSolar);
  solarMeters.forEach((m, k) => {
    const arrIdx = k % 10 < 4 ? 0 : 1; // ~4:6 split
    m.arrayIdx = arrIdx;
    m.trueUpMonth = arrays[arrIdx]!.trueUpMonth;
    m.solarKw = Math.round(arrays[arrIdx]!.nameplateKw * randRange(0.04, 0.16));
  });

  // build priced cycles
  for (const m of meters) {
    if (m.costSource === "BILLED") {
      buildCycles(m);
    } else if (m.costSource === "MODELED") {
      // priced like a bill but stored as a modeled MONTHLY estimate (no reconciled bill)
      buildCycles(m);
      const summer = m.periods.find((p) => seasonFor(p.start, CARD) === "summer");
      m.modeledMonthlyCents = summer?.printedTotalCents ?? m.periods[0]?.printedTotalCents ?? null;
      m.periods = []; // MODELED has no reconciled BillingPeriods
      m.annualSpendCents = 0;
    } else if (m.costSource === "REVIEW") {
      // a bill that failed reconciliation: a couple of periods with NO printed total
      for (let i = 5; i < 8; i++) {
        const mo = MONTHS[i]!;
        m.periods.push({ start: mo.start, close: mo.close, printedTotalCents: null, peakKw: Math.round(m.peakKw * 100) / 100, totalKwh: 0, demandCents: 0, tariff: m.rateLabel, lineItems: [] });
      }
    } // NONE: nothing
  }

  return { meters, ranchNames, ranchCrops, ranchCenters, accounts, arrays };
}

// ---------------------------------------------------------------------------
// Dry-run report: spend (real basis) + savings (REAL rateLever in memory).
// ---------------------------------------------------------------------------
function leverPeriods(m: Meter): LeverPeriod[] {
  return m.periods.map((p) => ({ start: p.start, close: p.close, printedTotalCents: p.printedTotalCents, lineItems: p.lineItems }));
}
function isSolarNem(m: Meter): boolean {
  return m.isSolar || m.solarKw !== null || m.nemType !== null;
}

function report(model: ReturnType<typeof build>) {
  const { meters } = model;
  const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  // headline annual spend = non-solar reconciled printed totals (mirrors kpi spendByMonth)
  let annualSpend = 0;
  for (const m of meters) {
    if (m.costSource !== "BILLED" || isSolarNem(m)) continue;
    for (const p of m.periods) annualSpend += p.printedTotalCents ?? 0;
  }

  // savings via the REAL pure lever (same input runRateLever builds from the DB)
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
    } else if (res.kind === "qualitative") {
      qualitativeCount += 1;
    }
  }

  const bySource: Record<string, number> = {};
  for (const m of meters) bySource[m.costSource] = (bySource[m.costSource] ?? 0) + 1;
  const solarCount = meters.filter((m) => m.isSolar).length;
  const assignedRanch = meters.filter((m) => m.ranchIdx !== null).length;
  const assignedAcct = meters.filter((m) => m.accountIdx !== null).length;

  // rate family histogram
  const fam: Record<string, number> = {};
  for (const m of meters) {
    const mp = mapScheduleLabel(m.rateLabel, CARD, 100);
    const key = mp ? mp.plan.family : "non-ag";
    fam[key] = (fam[key] ?? 0) + 1;
  }

  console.log("\n================= DRY RUN: synthetic demo farm =================");
  console.log(`meters=${meters.length} cost-source=${JSON.stringify(bySource)} solar=${solarCount}`);
  console.log(`ranch-assigned=${assignedRanch}/${meters.length} (${Math.round(100 * assignedRanch / meters.length)}%)  acct-assigned=${assignedAcct}/${meters.length}`);
  console.log(`rate families: ${JSON.stringify(fam)}`);
  console.log(`\nANNUAL PG&E SPEND (non-solar reconciled): ${usd(annualSpend)}  [target $5.6M-$6.0M]`);
  console.log(`IDENTIFIED SAVINGS (real rateLever): ${usd(savingsCents)}  (~${(100 * savingsCents / annualSpend).toFixed(1)}% of spend)  [target ~$580K / ~10%]`);
  console.log(`  rate-switch estimates: ${estimateCount}   legacy qualitative: ${qualitativeCount}`);
  const topSwitch = switches.sort((a, b) => b.save - a.save).slice(0, 8);
  for (const s of topSwitch) console.log(`    ${s.name.padEnd(14)} ${s.from} -> ${s.to}  ${usd(s.save)}`);
  // spend distribution
  const annuals = meters.filter((m) => m.costSource === "BILLED" && !isSolarNem(m)).map((m) => m.annualSpendCents).sort((a, b) => b - a);
  console.log(`\nnon-solar billed meters=${annuals.length}  top meter ${usd(annuals[0] ?? 0)}/yr  median ${usd(annuals[Math.floor(annuals.length / 2)] ?? 0)}/yr`);
  console.log("================================================================\n");
  return { annualSpend, savingsCents, estimateCount, qualitativeCount };
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
const WRITE = process.argv.includes("--write");
const model = build();
const summary = report(model);

if (!WRITE) {
  console.log("DRY RUN only. Re-run with --write to persist to Supabase + run engines.");
} else {
  // dynamic import so a dry run never even loads Prisma
  void (async () => {
    const { writeToSupabase } = await import("./seed-demo-farm.write");
    await writeToSupabase(model, summary);
  })();
}

export type DemoModel = ReturnType<typeof build>;
export { CARD, MONTHS, isSolarNem };
