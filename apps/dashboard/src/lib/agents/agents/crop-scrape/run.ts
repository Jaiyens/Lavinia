// The crop-scrape agent (kind "crop_scrape", monthly, cron-triggered). It is the RECURRING half of
// the crop ingest pipeline: the extension (Phase 3) is a one-time portability probe, and this agent
// is what keeps the position fresh on the backend with no one clicking. It composes Cron -> Workflow
// — for each of the farm's legal entities it starts the durable `ingestCropYear` workflow (Phase 2),
// which scrapes inside a Vercel Sandbox (Phase 4), gates the pounds, writes the ledger, and recomputes.
//
// CREDENTIAL-GATED, FAIL-CLOSED: the live scrape needs Vercel Sandbox credentials, the credential
// encryption key, and R2 storage. Absent any of these the agent records a clean no-op run ("not
// configured; skipped") and NEVER falls back to writing the committed stub fixtures onto a real
// grower's farm. Per-entity grower auth is resolved through a seam (`resolveScrapeAuth`) that returns
// null until the encrypted-credential store lands; entities without auth are skipped, never stubbed.
//
// DETERMINISM / HARD RULES: the workflow's poundGate + recomputePositions own every number; this
// agent produces no pound itself. It never logs a credential, cookie, or grower secret (only counts).
// Resilience: any throw closes the run "failed" with a redacted reason and is NOT re-thrown, so the
// dispatcher's sweep over the other farms continues.

import type { PrismaClient } from "@prisma/client";
import {
  canRunLiveScrape,
  type ScrapeAuth,
} from "@/lib/crops/scrape/sandbox-scrape";
import { R2ObjectStore, r2Configured } from "@/lib/storage/r2";
import { ingestCropYear } from "@/workflows/ingest-crop-year";
import { prismaLoadLedger } from "@/workflows/steps/recompute-positions";
import { prismaRunInTenant } from "@/workflows/steps/write-yield-records";
import { register } from "../../registry";
import { completeAgentRun, startAgentRun } from "../../run";

/** The crop year a recurring refresh targets: the current calendar year (almond crop years align to
 *  the calendar year). This is side-effecting agent code, so a real clock is fine here (unlike the
 *  pure deterministic core, which never reads the clock). */
function currentCropYear(): number {
  return new Date().getFullYear();
}

/**
 * Resolve the grower auth for one entity's scrape. SEAM: the encrypted-credential store is part of
 * the live-scrape work (Phase 4 wiring) and does not exist yet, so this returns null today and the
 * entity is skipped. When the store lands, load the EncryptedCredential / forwarded session cookie
 * here (decryption happens later, inside the Sandbox, at the moment of use — never here, never logged).
 */
async function resolveScrapeAuth(
  _prisma: PrismaClient,
  _entityId: string,
): Promise<ScrapeAuth | null> {
  return null; // TODO(live): load the grower's encrypted credential / session cookie for this entity
}

/** A redacted, secret-free note for the run ledger. */
function redactedNote(err: unknown): string {
  const message = err instanceof Error ? err.message : "unknown error";
  return `crop scrape failed: ${message}`.slice(0, 500);
}

/**
 * Run the crop-scrape agent for one farm. Opens a run; if scrape/R2 are not configured records a
 * no-op and returns; otherwise starts `ingestCropYear` for each entity that has resolvable auth.
 */
async function runCropScrape(prisma: PrismaClient, farmId: string): Promise<void> {
  const { id: runId } = await startAgentRun(prisma, {
    farmId,
    kind: "crop_scrape",
    triggeredBy: "cron",
  });
  try {
    if (!canRunLiveScrape() || !r2Configured()) {
      await completeAgentRun(prisma, runId, {
        status: "succeeded",
        note: "crop scrape not configured (no Sandbox / encryption / R2 credentials); skipped",
      });
      return;
    }

    const entities = await prisma.entity.findMany({ where: { farmId }, select: { id: true } });
    const cropYear = currentCropYear();
    const objectStore = new R2ObjectStore();
    const runInTenant = prismaRunInTenant(prisma);
    const loadLedger = prismaLoadLedger(prisma);

    let ingested = 0;
    for (const entity of entities) {
      const auth = await resolveScrapeAuth(prisma, entity.id);
      if (!auth) continue; // no credential for this entity yet -> skip, never stub onto a real farm
      await ingestCropYear(entity.id, cropYear, {
        farmId,
        runInTenant,
        loadLedger,
        scrape: { auth, objectStore },
        source: "ALMOND_LOGIC",
      });
      ingested += 1;
    }

    await completeAgentRun(prisma, runId, {
      status: "succeeded",
      note: `crop scrape: ingested ${ingested}/${entities.length} entities for ${cropYear}`,
    });
  } catch (err) {
    await completeAgentRun(prisma, runId, { status: "failed", note: redactedNote(err) });
  }
}

register({
  kind: "crop_scrape",
  label: "Crop production scrape",
  trigger: "cron",
  cadence: "monthly",
  run: runCropScrape,
});
