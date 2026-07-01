// The tenant-scoped writer for Almond Logic portal data: raw API results -> AlmondSnapshot (verbatim
// JSON) + CropDelivery (parsed, integer-pound rows). Extracted from scripts/load-almond.ts so the
// script AND any server-side sync share ONE write path, and so all writes go through withFarmTenant —
// which is what makes RLS on AlmondSnapshot + CropDelivery safe (a bare-client write would be blocked
// by RLS, or leak across farms without it). Deterministic: deliveries come from parseDeliveries (never
// a fabricated pound); snapshots are the portal's own JSON stored verbatim. The whole write is one
// transaction (atomic).

import type { Prisma, PrismaClient } from "@prisma/client";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { parseDeliveries } from "./parse-deliveries";

/** One captured portal API response (the shape scripts/scrape-almond-logic.ts writes). */
export type PortalApiResult = {
  endpoint: string;
  params: Record<string, string | number>;
  json: unknown;
};

/** Stable serialization of query params (matches almond-portal/data.ts + the scrape capture). */
export function paramsKey(p: Record<string, string | number>): string {
  return Object.keys(p)
    .sort()
    .map((k) => `${k}=${p[k]}`)
    .join("&");
}

type HullerRef = { id: number; name: string };

/** Parse a portal date string to a Date, or null when absent/invalid (never inserts an Invalid Date). */
function toDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Write portal API results for one farm: upsert every response into AlmondSnapshot, and REPLACE the
 * farm's CropDelivery rows (delete + createMany) from the getDeliveries responses via parseDeliveries.
 * Idempotent; runs inside withFarmTenant so RLS is honored (and cross-farm writes are impossible).
 * `now` is injectable for deterministic tests (snapshot fetchedAt); defaults to the wall clock.
 */
export async function writePortalData(
  prisma: PrismaClient,
  farmId: string,
  results: readonly PortalApiResult[],
  now: () => Date = () => new Date(),
): Promise<{ snapshots: number; deliveries: number }> {
  const hullers =
    (results.find((r) => r.endpoint === "getHullers.php")?.json as HullerRef[] | undefined) ?? [];
  const hullerName = (id: number): string => hullers.find((h) => h.id === id)?.name ?? `Huller ${id}`;

  const deliveryRows: Prisma.CropDeliveryCreateManyInput[] = [];
  for (const r of results) {
    if (r.endpoint !== "getDeliveries.php") continue;
    const hullerId = Number(r.params.hullerId);
    const cropYear = Number(r.params.cropYear);
    for (const d of parseDeliveries(r.json, { hullerId, huller: hullerName(hullerId), cropYear })) {
      deliveryRows.push({
        farmId,
        hullerId: d.hullerId,
        huller: d.huller,
        cropYear: d.cropYear,
        loadId: d.loadId,
        fieldTicket: d.fieldTicket,
        field: d.field,
        variety: d.variety,
        grossLb: d.grossLb,
        tareLb: d.tareLb,
        netLb: d.netLb,
        deliveryDate: toDate(d.deliveryDate),
        mediaId: d.mediaId,
        source: d.source,
      });
    }
  }

  return withFarmTenant(prisma, farmId, async (tx) => {
    let snapshots = 0;
    for (const r of results) {
      const key = paramsKey(r.params);
      await tx.almondSnapshot.upsert({
        where: { farmId_endpoint_paramsKey: { farmId, endpoint: r.endpoint, paramsKey: key } },
        create: {
          farmId,
          endpoint: r.endpoint,
          paramsKey: key,
          payload: r.json as Prisma.InputJsonValue,
        },
        update: { payload: r.json as Prisma.InputJsonValue, fetchedAt: now() },
      });
      snapshots += 1;
    }
    await tx.cropDelivery.deleteMany({ where: { farmId } });
    await tx.cropDelivery.createMany({ data: deliveryRows, skipDuplicates: true });
    return { snapshots, deliveries: deliveryRows.length };
  });
}
