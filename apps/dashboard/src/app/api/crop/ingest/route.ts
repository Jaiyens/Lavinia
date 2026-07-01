// The crop-ingest TRIGGER. Starts the durable ingestCropYear workflow for one (entityId, cropYear).
// On deploy this is what Cron (Phase 9) or an operator calls; the WDK build adapter makes the
// workflow durable, so this handler returns as soon as the run is enqueued. Locally the workflow
// runs inline (plain async), so the handler awaits it.
//
// Fail-closed auth (mirrors src/app/api/agents/cron/route.ts): the request MUST carry
// `Authorization: Bearer ${CRON_SECRET}`. With CRON_SECRET unset OR a non-matching header it is a
// 401 — so an absent secret keeps the route inert (offline-green: nothing runs). This is a
// system-initiated trigger with no user session, so writes are farmId-scoped by the payload's farm
// and RLS (withFarmTenant inside the write step), never by a per-request role check.

import { prisma } from "@/lib/db";
import { ingestCropYear } from "@/workflows/ingest-crop-year";
import { prismaRunInTenant } from "@/workflows/steps/write-yield-records";
import { prismaLoadLedger } from "@/workflows/steps/recompute-positions";

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
  const cropYear = typeof body.cropYear === "number" && Number.isInteger(body.cropYear) ? body.cropYear : null;
  const farmId = typeof body.farmId === "string" ? body.farmId : null;

  if (entityId === null || cropYear === null || farmId === null) {
    return Response.json(
      { error: "bad_request", detail: "entityId (string), cropYear (int), farmId (string) required" },
      { status: 400 },
    );
  }

  try {
    const result = await ingestCropYear(entityId, cropYear, {
      farmId,
      runInTenant: prismaRunInTenant(prisma),
      loadLedger: prismaLoadLedger(prisma),
      // No `scrape.auth` here -> the scrape step runs the committed-fixture stub until the live
      // grower-auth resolution lands. Raw pages (live) go to R2 inside the scrape lib, never here.
    });
    return Response.json({
      ok: true,
      entityId: result.entityId,
      cropYear: result.cropYear,
      scrapeBranch: result.scrapeBranch,
      coverage: result.coverage,
      written: result.write.written,
      withheld: result.write.withheld,
      positionCells: result.positions.length,
    });
  } catch (err) {
    console.error("[crop ingest] workflow failed", err);
    return Response.json({ error: "ingest_failed" }, { status: 500 });
  }
}
