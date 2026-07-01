// The DB edge + pure projections for the Terra-themed "Deliveries" replica view: every per-load row
// scraped from Almond Logic, not the rolled-up position. Reads through withFarmTenant (farmId-scoped)
// and returns serializable DTOs; all aggregation is pure (summed here, never in a component).

import type { PrismaClient } from "@prisma/client";
import { gridCsv } from "@/lib/dashboard/csv";
import { withFarmTenant } from "./tenant-db";

export type DeliveryRow = {
  id: string;
  huller: string;
  hullerId: number;
  cropYear: number;
  loadId: string;
  fieldTicket: string | null;
  field: string | null;
  variety: string;
  grossLb: number;
  tareLb: number;
  netLb: number;
  deliveryDate: string | null; // ISO date, or null
};

/** Load every delivery row for a farm, newest crop year first. */
export async function loadCropDeliveries(
  prisma: PrismaClient,
  farmId: string,
): Promise<DeliveryRow[]> {
  return withFarmTenant(prisma, farmId, async (tx) => {
    const rows = await tx.cropDelivery.findMany({
      where: { farmId },
      orderBy: [{ cropYear: "desc" }, { loadId: "desc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      huller: r.huller,
      hullerId: r.hullerId,
      cropYear: r.cropYear,
      loadId: r.loadId,
      fieldTicket: r.fieldTicket,
      field: r.field,
      variety: r.variety,
      grossLb: r.grossLb,
      tareLb: r.tareLb,
      netLb: r.netLb,
      deliveryDate: r.deliveryDate ? r.deliveryDate.toISOString() : null,
    }));
  });
}

export type VarietyWeight = { variety: string; pounds: number };

/** Net delivered pounds by variety (desc), for the "delivery weight by variety" pie. Pure. */
export function varietyWeights(rows: readonly DeliveryRow[]): VarietyWeight[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.variety, (m.get(r.variety) ?? 0) + r.netLb);
  return [...m.entries()]
    .map(([variety, pounds]) => ({ variety, pounds }))
    .sort((a, b) => b.pounds - a.pounds);
}

/** Distinct sorted values for the filter dropdowns. Pure. */
export function distinct<K extends keyof DeliveryRow>(
  rows: readonly DeliveryRow[],
  key: K,
): DeliveryRow[K][] {
  return [...new Set(rows.map((r) => r[key]))].sort((a, b) => {
    const av = String(a ?? "");
    const bv = String(b ?? "");
    return av === bv ? 0 : av < bv ? 1 : -1; // desc; filter dropdowns show newest/first
  });
}

/** Total net delivered pounds across the given rows. Pure. */
export function totalNet(rows: readonly DeliveryRow[]): number {
  return rows.reduce((acc, r) => acc + r.netLb, 0);
}

/** Serialize exactly the rows shown (already filtered/sorted upstream) through the shared CSV. */
export function deliveriesCsv(rows: readonly DeliveryRow[]): string {
  const header = [
    "Huller",
    "Crop Year",
    "Load",
    "Field Ticket",
    "Field",
    "Variety",
    "Gross",
    "Tare",
    "Net",
    "Date",
  ];
  const body = rows.map((r) => [
    r.huller,
    String(r.cropYear),
    r.loadId,
    r.fieldTicket ?? "",
    r.field ?? "",
    r.variety,
    String(r.grossLb),
    String(r.tareLb),
    String(r.netLb),
    r.deliveryDate ? r.deliveryDate.slice(0, 10) : "",
  ]);
  return gridCsv([header, ...body]);
}
