/*
 * Load the captured Almond Logic API responses into Terra.
 *
 * Reads the crawl output (scripts/scrape-almond-logic.ts writes it) and populates:
 *   - AlmondSnapshot : every endpoint's raw JSON (powers the 1:1 portal replica)
 *   - CropDelivery   : every per-load delivery row (full columns)
 *
 * Also (when R2 creds are present) puts any captured REPORT PDFs to R2 under the content-addressed
 * rawPageKey — raw report bytes belong in object storage, NEVER Postgres (the crop track's hard rule).
 * The PDFs come from scripts/discover-almond-reports.ts (its download handler) into ALMOND_REPORTS_DIR.
 * With no R2 creds this step is a no-op (offline-green). The structured pound data is extracted from
 * those PDFs by the ingest-reports workflow, never here.
 *
 * Idempotent (upserts; R2 puts are content-addressed). Run via `npm run almond:sync` (which crawls
 * first, then loads), or directly:
 *   DATABASE_URL=... npx tsx scripts/load-almond.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { R2ObjectStore, r2Configured, rawPageKey } from "@/lib/storage/r2";

const CAPTURE_BASE =
  "/private/tmp/claude-501/-Users-kamransalahuddin-Lavinia/b3fbda0a-56a1-4e8d-8041-b4d70fb9de5a/scratchpad/almond-capture";

const OUT = process.env.ALMOND_CAPTURE ?? `${CAPTURE_BASE}/api-results.json`;

// Where discover-almond-reports.ts drops captured report PDFs. Each PDF is put to R2 under rawPageKey.
const REPORTS_DIR = process.env.ALMOND_REPORTS_DIR ?? `${CAPTURE_BASE}/reports`;

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

const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Best-effort crop year from a report filename (a 4-digit 20xx); falls back to the given default. */
const cropYearFromName = (name: string, fallback: number): number => {
  const m = /(20\d{2})/.exec(name);
  return m ? Number(m[1]) : fallback;
};

/**
 * Put any captured REPORT PDFs (discover-almond-reports.ts download output) to R2 under the
 * content-addressed rawPageKey. Raw bytes go to object storage, NEVER Postgres. No-op when R2 is
 * unconfigured or the reports dir is absent (offline-green). The structured pound data is extracted
 * from these PDFs by the ingest-reports workflow, not here. Returns the count uploaded.
 */
async function uploadReportPdfsToR2(farmId: string, entityId: string, defaultCropYear: number): Promise<number> {
  if (!r2Configured()) {
    console.log("[load-almond] R2 not configured; skipping report-PDF upload (offline-green).");
    return 0;
  }
  if (!existsSync(REPORTS_DIR)) {
    console.log(`[load-almond] no reports dir at ${REPORTS_DIR}; skipping report-PDF upload.`);
    return 0;
  }
  const pdfs = readdirSync(REPORTS_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
  const store = new R2ObjectStore();
  let n = 0;
  for (const file of pdfs) {
    const buf = readFileSync(join(REPORTS_DIR, file));
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const cropYear = cropYearFromName(file, defaultCropYear);
    const key = rawPageKey(farmId, entityId, cropYear, sha256Hex(bytes), "pdf");
    await store.put(key, bytes, "application/pdf");
    n++;
    console.log(`[load-almond] put report PDF -> ${key}`);
  }
  return n;
}

async function main() {
  const capture = JSON.parse(readFileSync(OUT, "utf8")) as { growerId?: string | number; results?: Res[] };
  const results = capture.results ?? [];
  const growerId = capture.growerId != null ? String(capture.growerId) : "unknown";
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

  // 3) Report PDFs -> R2 (raw bytes never touch Postgres). No-op without R2 creds / reports dir.
  const defaultCropYear = rows.length > 0 ? Math.max(...rows.map((r) => r.cropYear)) : new Date().getFullYear();
  const reportPdfs = await uploadReportPdfsToR2(farm.id, growerId, defaultCropYear);

  console.log(
    `Loaded ${snaps} snapshots, ${rows.length} deliveries, ${reportPdfs} report PDFs for ${farm.name}.`,
  );
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
