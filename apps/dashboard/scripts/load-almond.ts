/*
 * Load the captured Almond Logic API responses into Terra.
 *
 * Reads the crawl output (scripts/scrape-almond-logic.ts writes it) and populates AlmondSnapshot +
 * CropDelivery via the shared, tenant-scoped writer `writePortalData` (src/lib/crops/scrape/portal-load.ts)
 * — the SAME write path a server-side sync would use, and RLS-safe (runs inside withFarmTenant).
 *
 * Also (when R2 creds are present) puts any captured REPORT PDFs to R2 under the content-addressed
 * rawPageKey — raw report bytes belong in object storage, NEVER Postgres. The PDFs come from
 * scripts/discover-almond-reports.ts into ALMOND_REPORTS_DIR. With no R2 creds this step is a no-op.
 *
 * Idempotent (snapshots upsert; deliveries are replaced for the farm; R2 puts are content-addressed).
 * Run via `npm run almond:sync` (crawls then loads), or directly:
 *   DATABASE_URL=... npx tsx scripts/load-almond.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { R2ObjectStore, r2Configured, rawPageKey } from "@/lib/storage/r2";
import { writePortalData, type PortalApiResult } from "@/lib/crops/scrape/portal-load";

const CAPTURE_BASE =
  "/private/tmp/claude-501/-Users-kamransalahuddin-Lavinia/b3fbda0a-56a1-4e8d-8041-b4d70fb9de5a/scratchpad/almond-capture";

const OUT = process.env.ALMOND_CAPTURE ?? `${CAPTURE_BASE}/api-results.json`;

// Where discover-almond-reports.ts drops captured report PDFs. Each PDF is put to R2 under rawPageKey.
const REPORTS_DIR = process.env.ALMOND_REPORTS_DIR ?? `${CAPTURE_BASE}/reports`;

const sha256Hex = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Best-effort crop year from a report filename (a 4-digit 20xx); falls back to the given default. */
const cropYearFromName = (name: string, fallback: number): number => {
  const m = /(20\d{2})/.exec(name);
  return m ? Number(m[1]) : fallback;
};

/**
 * Put any captured REPORT PDFs (discover-almond-reports.ts download output) to R2 under the
 * content-addressed rawPageKey. Raw bytes go to object storage, NEVER Postgres. No-op when R2 is
 * unconfigured or the reports dir is absent (offline-green). Returns the count uploaded.
 */
async function uploadReportPdfsToR2(
  farmId: string,
  entityId: string,
  defaultCropYear: number,
): Promise<number> {
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

async function main(): Promise<void> {
  const capture = JSON.parse(readFileSync(OUT, "utf8")) as {
    growerId?: string | number;
    results?: PortalApiResult[];
  };
  const results = capture.results ?? [];
  const growerId = capture.growerId != null ? String(capture.growerId) : "unknown";
  const farm = await prisma.farm.findFirst();
  if (!farm) throw new Error("no farm");

  // Snapshots + deliveries via the shared, tenant-scoped writer (RLS-safe, atomic).
  const { snapshots, deliveries } = await writePortalData(prisma, farm.id, results);

  // Report PDFs -> R2 (raw bytes never touch Postgres). No-op without R2 creds / reports dir.
  const years = results
    .filter((r) => r.endpoint === "getDeliveries.php")
    .map((r) => Number(r.params.cropYear))
    .filter((y) => Number.isFinite(y));
  const defaultCropYear = years.length > 0 ? Math.max(...years) : new Date().getFullYear();
  const reportPdfs = await uploadReportPdfsToR2(farm.id, growerId, defaultCropYear);

  console.log(
    `Loaded ${snapshots} snapshots, ${deliveries} deliveries, ${reportPdfs} report PDFs for ${farm.name}.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
