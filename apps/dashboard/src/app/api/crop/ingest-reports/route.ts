// The report-ingest TRIGGER. Starts the durable ingestCropReports workflow for one (entityId,
// cropYear): scrape the grower's report PDFs, extract settlement + commitment docs over the
// ZERO-DATA-RETENTION endpoint, gate, and write to the crop ledger. On deploy the WDK build adapter
// makes the workflow durable; locally it runs inline so the handler awaits it.
//
// Fail-closed auth (mirrors src/app/api/crop/ingest/route.ts): the request MUST carry
// `Authorization: Bearer ${CRON_SECRET}`. With CRON_SECRET unset OR a non-matching header it is a 401
// — so an absent secret keeps the route inert (offline-green). System-initiated trigger with no user
// session: writes are farmId-scoped by the payload's farm and RLS (withFarmTenant inside the write
// steps), never by a per-request role check.
//
// ZDR fail-closed: the live ZDR readers are wired ONLY when `hasZdrKey()` is true. With no key the
// readers are omitted and every grower document degrades to needs_review (nothing is written, nothing
// leaks) — grower data is NEVER sent without a zero-retention path. This route constructs models via
// `@/lib/ai/zdr` only; it never touches `@/lib/ai/gateway`.

import { prisma } from "@/lib/db";
import { ingestCropReports } from "@/workflows/ingest-crop-reports";
import { prismaRunInSettlementTenant } from "@/workflows/steps/write-settlement-records";
import { prismaRunInCommitmentTenant } from "@/workflows/steps/write-commitment-records";
import { prismaLoadLedger } from "@/workflows/steps/recompute-positions";
import { hasZdrKey } from "@/lib/ai/zdr";
import { createZdrPoundReader } from "@/lib/crops/extract/reader";
import { createZdrCommitmentReader } from "@/lib/crops/extract/commitment-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Fail-closed bearer check: requires CRON_SECRET set AND a matching Authorization header. */
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // unset -> inert (offline-green)
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type IngestBody = {
  entityId?: unknown;
  cropYear?: unknown;
  farmId?: unknown;
};

function parseBody(value: unknown): IngestBody {
  return typeof value === "object" && value !== null ? (value as IngestBody) : {};
}

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = parseBody(await req.json().catch(() => ({})));
  const entityId = typeof body.entityId === "string" ? body.entityId : null;
  const cropYear =
    typeof body.cropYear === "number" && Number.isInteger(body.cropYear) ? body.cropYear : null;
  const farmId = typeof body.farmId === "string" ? body.farmId : null;

  if (entityId === null || cropYear === null || farmId === null) {
    return Response.json(
      { error: "bad_request", detail: "entityId (string), cropYear (int), farmId (string) required" },
      { status: 400 },
    );
  }

  // ZDR fail-closed: wire the live readers ONLY when a zero-retention key is present. Otherwise omit
  // them so every grower document degrades to needs_review (no leak, nothing written).
  const zdr = hasZdrKey();

  try {
    const result = await ingestCropReports(entityId, cropYear, {
      farmId,
      runInSettlementTenant: prismaRunInSettlementTenant(prisma),
      runInCommitmentTenant: prismaRunInCommitmentTenant(prisma),
      loadLedger: prismaLoadLedger(prisma),
      settlementReader: zdr ? createZdrPoundReader() : undefined,
      commitmentReader: zdr ? createZdrCommitmentReader() : undefined,
      // No `scrape.auth` here -> the scrape step runs the committed-fixture stub until the live
      // grower-auth resolution lands. Raw PDFs (live) go to R2 inside the scrape lib, never here.
    });
    const written = result.documents.reduce(
      (acc, d) => acc + (d.settlement?.written ?? 0) + (d.commitment?.written ?? 0),
      0,
    );
    return Response.json({
      ok: true,
      entityId: result.entityId,
      cropYear: result.cropYear,
      scrapeBranch: result.scrapeBranch,
      zdr,
      documents: result.documents.length,
      written,
      positionCells: result.positions.length,
    });
  } catch (err) {
    console.error("[crop ingest-reports] workflow failed", err);
    return Response.json({ error: "ingest_failed" }, { status: 500 });
  }
}
