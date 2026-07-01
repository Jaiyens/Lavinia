// The CropRun loader: parse the durable huller-run data out of the AlmondSnapshot getRuns JSON and
// persist it as CropRun rows (deduped by runId), so the worksheet + year-over-year can sum huller
// (bin) weight by field->block+variety across years without re-parsing ephemeral JSON each render.
// Tenant-scoped (withFarmTenant) so it is RLS-safe. Idempotent: replaces the farm's CropRun rows.
// Deterministic parse; never invents a weight (missing -> null). Variety is canonicalized so it joins
// the CSV/worksheet grain.

import type { Prisma, PrismaClient } from "@prisma/client";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { normalizeVariety } from "@/lib/crops/variety";

type RawRun = {
  runId?: string | number;
  validationDTS?: string;
  field?: string | number;
  variety?: string;
  totalBins?: number | string;
  loadWeight?: number | string;
  binWeight?: number | string;
  turnout?: number | string;
};

/** hullerId + cropYear from a getRuns paramsKey like "cropYear=2025&growerId=23&hullerId=10". */
function parseParamsKey(key: string): { hullerId: number; cropYear: number } {
  const params = new Map(key.split("&").map((p) => p.split("=") as [string, string]));
  return { hullerId: Number(params.get("hullerId")), cropYear: Number(params.get("cropYear")) };
}

function toInt(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) && v.trim() !== "" ? Math.round(n) : null;
  }
  return null;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) && v.trim() !== "" ? n : null;
  }
  return null;
}

function toDate(v: unknown): Date | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Persist all of a farm's huller runs from its getRuns snapshots into CropRun (deduped by runId within
 * a huller+year). Returns the count written. Runs inside withFarmTenant so RLS is honored.
 */
export async function writeCropRuns(
  prisma: PrismaClient,
  farmId: string,
): Promise<{ runs: number }> {
  return withFarmTenant(prisma, farmId, async (tx) => {
    const snaps = await tx.almondSnapshot.findMany({
      where: { farmId, endpoint: "getRuns.php" },
      select: { paramsKey: true, payload: true },
    });

    const seen = new Set<string>();
    const rows: Prisma.CropRunCreateManyInput[] = [];
    for (const snap of snaps) {
      const { hullerId, cropYear } = parseParamsKey(snap.paramsKey);
      if (!Number.isFinite(hullerId) || !Number.isFinite(cropYear)) continue;
      const payload = snap.payload as { runs?: RawRun[] } | null;
      for (const r of Array.isArray(payload?.runs) ? payload.runs : []) {
        const runId = r.runId != null ? String(r.runId) : "";
        if (runId === "") continue;
        const key = `${hullerId}|${cropYear}|${runId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          farmId,
          hullerId,
          cropYear,
          runId,
          field: r.field != null ? String(r.field) : null,
          variety: normalizeVariety(typeof r.variety === "string" ? r.variety : null),
          binWeight: toInt(r.binWeight),
          loadWeight: toInt(r.loadWeight),
          totalBins: toInt(r.totalBins),
          turnout: toNum(r.turnout),
          validatedAt: toDate(r.validationDTS),
          source: "ALMOND_LOGIC",
        });
      }
    }

    await tx.cropRun.deleteMany({ where: { farmId } });
    await tx.cropRun.createMany({ data: rows, skipDuplicates: true });
    return { runs: rows.length };
  });
}
