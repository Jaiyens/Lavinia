// The data contract for the Terra-themed Almond Logic portal replica. Every screen reads through
// these typed accessors (never the raw table), so the screen components stay decoupled from storage.
// Sources: AlmondSnapshot (the portal's own JSON responses, captured via the grower's session) and
// CropDelivery (per-load rows). farmId-scoped throughout. Only the grower's NAME is surfaced from
// getUserInfo — never email/address/phone (not shown on the cloned screens, and PII).

import type { PrismaClient } from "@prisma/client";
import { withFarmTenant } from "@/lib/crops/tenant-db";

export type HullerInfo = { id: number; name: string; logoPath: string | null; cropYears: number[] };
export type HandlerInfo = {
  id: number;
  name: string;
  logoPath: string | null;
  cropYears: number[];
  currentCropYear: number | null;
};
export type GrowerInfo = { name: string };
export type RunInfo = {
  runId: string;
  validatedAt: string | null;
  field: string | null;
  variety: string;
  totalBins: number | null;
  loadWeight: number | null;
  binWeight: number | null;
  turnout: number | null;
};
export type ActivityInfo = {
  date: string | null;
  huller: string | null;
  grower: string | null;
  field: string | null;
  label: string | null;
  /** Deep-link target: the activity's huller + crop year + run, so "View" lands on the right data
   *  (the Runs screen scoped to this huller/year) instead of the default huller. */
  hullerId: number | null;
  cropYear: number | null;
  runNumber: string | null;
};

/** The grower-report list shown in the Almond Logic Reports panel (the portal exposes these as
 *  printable PDFs; we replicate the list + render the data-driven ones from snapshots/deliveries). */
export const REPORT_LIST: readonly string[] = [
  "Delivery Commitment By Handler",
  "Delivery Commitment Summary",
  "Field Ticket Deliveries",
  "Grower Manifest Summary",
  "Run Summary Report",
  "Stockpile History",
  "Stockpile Inventory",
  "Turnout by Grower/Field/Variety",
  "Turnout by Run",
  "UnCommitted Product",
];

export function paramsKey(p: Record<string, string | number>): string {
  return Object.keys(p)
    .sort()
    .map((k) => `${k}=${p[k]}`)
    .join("&");
}

// Every AlmondSnapshot read goes through here (and growerId below), wrapped in withFarmTenant so the
// per-transaction `app.current_farm_id` GUC is pinned — which makes these reads survive Row Level
// Security on AlmondSnapshot. Callers pass the full PrismaClient (withFarmTenant needs $transaction).
async function snapshot(
  prisma: PrismaClient,
  farmId: string,
  endpoint: string,
  params: Record<string, string | number> = {},
): Promise<unknown> {
  const row = await withFarmTenant(prisma, farmId, (tx) =>
    tx.almondSnapshot.findUnique({
      where: { farmId_endpoint_paramsKey: { farmId, endpoint, paramsKey: paramsKey(params) } },
    }),
  );
  return row?.payload ?? null;
}

const asArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number | null =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : null;
const numList = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((x) => Number(x)).filter((n) => !Number.isNaN(n)) : [];

export async function loadGrower(prisma: PrismaClient, farmId: string): Promise<GrowerInfo | null> {
  const u = (await snapshot(prisma, farmId, "getUserInfo.php")) as Record<string, unknown> | null;
  if (!u) return null;
  const name = [u.firstName, u.lastName].map((x) => (x == null ? "" : String(x).trim())).join(" ").trim();
  return { name: name || String(u.userName ?? "Grower") };
}

export async function loadHullers(prisma: PrismaClient, farmId: string): Promise<HullerInfo[]> {
  return asArray(await snapshot(prisma, farmId, "getHullers.php")).map((h) => ({
    id: Number(h.id),
    name: String(h.name ?? ""),
    logoPath: str(h.smallLogoPath),
    cropYears: numList(h.cropYears),
  }));
}

export async function loadHandlers(prisma: PrismaClient, farmId: string): Promise<HandlerInfo[]> {
  return asArray(await snapshot(prisma, farmId, "getHandlers.php")).map((h) => ({
    id: Number(h.id),
    name: String(h.name ?? ""),
    logoPath: str(h.logoPath),
    cropYears: numList(h.cropYears),
    currentCropYear: num(h.currentCropYear),
  }));
}

export async function loadRuns(
  prisma: PrismaClient,
  farmId: string,
  hullerId: number,
  cropYear: number,
): Promise<RunInfo[]> {
  const wrapper = (await snapshot(prisma, farmId, "getRuns.php", {
    hullerId,
    growerId: await growerId(prisma, farmId),
    cropYear,
  })) as { runs?: unknown } | null;
  return asArray(wrapper?.runs).map((r) => ({
    runId: String(r.runId ?? ""),
    validatedAt: str(r.validationDTS),
    field: str(r.field),
    variety: String(r.variety ?? ""),
    totalBins: num(r.totalBins),
    loadWeight: num(r.loadWeight),
    binWeight: num(r.binWeight),
    turnout: num(r.turnout),
  }));
}

export async function loadRecentActivity(prisma: PrismaClient, farmId: string): Promise<ActivityInfo[]> {
  return asArray(await snapshot(prisma, farmId, "getRecentActivity.php")).map((a) => {
    const runNumber = str(a.runNumber ?? a.runId);
    return {
      date: str(a.date ?? a.runDate ?? a.validationDTS),
      huller: str(a.huller ?? a.hullerName),
      grower: str(a.grower ?? a.growerName),
      field: str(a.field),
      label: str(a.label ?? a.description ?? (runNumber ? `Run ${runNumber} Validated` : null)),
      hullerId: num(a.hullerId),
      cropYear: num(a.cropYear),
      runNumber,
    };
  });
}

/** The grower's external id, read from a deliveries snapshot's paramsKey (best-effort, defaults 23).
 *  Wrapped in withFarmTenant so it survives RLS on AlmondSnapshot. */
async function growerId(prisma: PrismaClient, farmId: string): Promise<number> {
  const row = await withFarmTenant(prisma, farmId, (tx) =>
    tx.almondSnapshot.findFirst({
      where: { farmId, endpoint: "getRuns.php" },
      orderBy: { fetchedAt: "desc" },
    }),
  );
  const m = /growerId=(\d+)/.exec(row?.paramsKey ?? "");
  return m ? Number(m[1]) : 23;
}
