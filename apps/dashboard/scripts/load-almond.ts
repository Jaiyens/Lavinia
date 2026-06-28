/*
 * Load the captured Almond Logic API responses into Terra.
 *
 * Reads the crawl output (scripts/scrape-almond-logic.ts writes it) and populates:
 *   - AlmondSnapshot : every endpoint's raw JSON (powers the 1:1 portal replica)
 *   - CropDelivery   : every per-load delivery row (full columns)
 *
 * Idempotent (upserts). Run via `npm run almond:sync` (which crawls first, then loads), or directly:
 *   DATABASE_URL=... npx tsx scripts/load-almond.ts
 */
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db";

const OUT =
  process.env.ALMOND_CAPTURE ??
  "/private/tmp/claude-501/-Users-kamransalahuddin-Lavinia/b3fbda0a-56a1-4e8d-8041-b4d70fb9de5a/scratchpad/almond-capture/api-results.json";

type Res = { endpoint: string; params: Record<string, string | number>; json: unknown };
type Huller = { id: number; name: string };
type Del = {
  loadId?: string | number; fieldTicketNumber?: string | number; deliveryDate?: string;
  field?: string | number; variety?: string; gross?: number | string; tare?: number | string;
  net?: number | string; mediaId?: string | number;
};

const toInt = (v: unknown) =>
  typeof v === "number" ? Math.round(v) : typeof v === "string" ? Math.round(Number(v.replace(/[^0-9.-]/g, "")) || 0) : 0;
const toDate = (s?: string) => { if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d; };
const paramsKey = (p: Record<string, string | number>) =>
  Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join("&");

async function main() {
  const results = (JSON.parse(readFileSync(OUT, "utf8")).results as Res[]) ?? [];
  const farm = await prisma.farm.findFirst();
  if (!farm) throw new Error("no farm");
  const hullers = (results.find((r) => r.endpoint === "getHullers.php")?.json as Huller[]) ?? [];
  const hullerName = (id: number) => hullers.find((h) => h.id === id)?.name ?? `Huller ${id}`;

  // 1) Snapshots: every endpoint response, verbatim.
  let snaps = 0;
  for (const r of results) {
    const key = paramsKey(r.params);
    await prisma.almondSnapshot.upsert({
      where: { farmId_endpoint_paramsKey: { farmId: farm.id, endpoint: r.endpoint, paramsKey: key } },
      create: { farmId: farm.id, endpoint: r.endpoint, paramsKey: key, payload: r.json as object },
      update: { payload: r.json as object, fetchedAt: new Date() },
    });
    snaps++;
  }

  // 2) Deliveries: every per-load row (full columns).
  const rows: Array<{
    farmId: string; hullerId: number; huller: string; cropYear: number; loadId: string;
    fieldTicket: string | null; field: string | null; variety: string; grossLb: number;
    tareLb: number; netLb: number; deliveryDate: Date | null; mediaId: string | null; source: string;
  }> = [];
  for (const r of results) {
    if (r.endpoint !== "getDeliveries.php" || !Array.isArray(r.json)) continue;
    const cropYear = Number(r.params.cropYear);
    const hullerId = Number(r.params.hullerId);
    for (const d of r.json as Del[]) {
      rows.push({
        farmId: farm.id, hullerId, huller: hullerName(hullerId), cropYear,
        loadId: String(d.loadId ?? ""), fieldTicket: d.fieldTicketNumber != null ? String(d.fieldTicketNumber) : null,
        field: d.field != null ? String(d.field) : null, variety: d.variety ?? "Unknown",
        grossLb: toInt(d.gross), tareLb: toInt(d.tare), netLb: toInt(d.net),
        deliveryDate: toDate(d.deliveryDate), mediaId: d.mediaId != null ? String(d.mediaId) : null, source: "ALMOND_LOGIC",
      });
    }
  }
  await prisma.cropDelivery.deleteMany({ where: { farmId: farm.id } });
  await prisma.cropDelivery.createMany({ data: rows, skipDuplicates: true });

  console.log(`Loaded ${snaps} snapshots, ${rows.length} deliveries for ${farm.name}.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
