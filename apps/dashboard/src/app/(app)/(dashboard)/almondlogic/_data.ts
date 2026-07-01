// Shared resolvers for the Almond Logic portal screens. Each screen page calls resolveAlmondFarm()
// to get the operator's OWN farm (same gating as the rest of the dashboard), then resolveContext()
// to pick the active huller + crop year from the URL search params. When the URL has no selection we
// fall back to the huller/year that actually HAS data (resolveDefaultContext) instead of blindly the
// first huller, so the portal lands on real data rather than an empty huller.

import { cache } from "react";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadRecentActivity, type HullerInfo } from "@/lib/almond-portal/data";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { resolveActiveFarmId, resolveFarm } from "../_data";

/** The signed-in operator's own farm, or null. */
export async function resolveAlmondFarm() {
  const userId = await sessionUserId();
  const activeId = await resolveActiveFarmId(userId);
  return resolveFarm(userId, activeId, false);
}

export type AlmondContext = { hullerId: number | null; cropYear: number | null };

/**
 * The huller + crop year that actually holds the most data for this farm — the right thing to land on
 * by default. Prefers the (hullerId, cropYear) with the most delivered loads; falls back to the most
 * recent activity's context; else null. Cached per request.
 */
export const resolveDefaultContext = cache(async (farmId: string): Promise<AlmondContext> => {
  // Wrapped in withFarmTenant so this CropDelivery read survives RLS on CropDelivery.
  const groups = await withFarmTenant(prisma, farmId, (tx) =>
    tx.cropDelivery.groupBy({
      by: ["hullerId", "cropYear"],
      where: { farmId },
      _count: { _all: true },
    }),
  );
  if (groups.length > 0) {
    const top = [...groups].sort((a, b) => b._count._all - a._count._all)[0];
    if (top) return { hullerId: top.hullerId, cropYear: top.cropYear };
  }
  const activity = await loadRecentActivity(prisma, farmId);
  const withCtx = activity.find((a) => a.hullerId !== null && a.cropYear !== null);
  if (withCtx) return { hullerId: withCtx.hullerId, cropYear: withCtx.cropYear };
  return { hullerId: null, cropYear: null };
});

/**
 * The active huller + crop year. URL search params win; otherwise the data-bearing `fallback`
 * (resolveDefaultContext) is used, then the first huller. The crop year prefers the URL, then the
 * fallback year when it belongs to the active huller, else that huller's latest year.
 */
export function resolveContext(
  sp: { hullerId?: string; cropYear?: string },
  hullers: HullerInfo[],
  fallback?: AlmondContext,
): AlmondContext {
  const fromUrlHuller = sp.hullerId ? Number(sp.hullerId) : null;
  const hullerId = fromUrlHuller ?? fallback?.hullerId ?? hullers[0]?.id ?? null;
  const active = hullers.find((h) => h.id === hullerId) ?? null;
  const fromUrlYear = sp.cropYear ? Number(sp.cropYear) : null;
  const cropYear =
    fromUrlYear ??
    (hullerId === fallback?.hullerId &&
    fallback?.cropYear != null &&
    active?.cropYears.includes(fallback.cropYear)
      ? fallback.cropYear
      : active?.cropYears[0] ?? null);
  return { hullerId, cropYear };
}
