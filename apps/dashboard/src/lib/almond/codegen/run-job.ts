import type { Prisma, PrismaClient } from "@prisma/client";
import { runCodegenWorkbook } from "@/lib/almond/skills/codegen-workbook";
import { runCodegenExport } from "@/lib/almond/skills/codegen-export";
import { storeReport } from "@/lib/almond/reports/store";
import type { AlmondToolDeps } from "@/lib/almond/tools";

/**
 * The BACKGROUND runner for a model-authored generation (Almond v2 Phase 2). The chat tool ENQUEUES a
 * GenerationJob row (status "pending") and returns immediately; this runner is scheduled via Next
 * `after()` from the chat route, so the ~30-90s codegen build runs AFTER the response is sent and a
 * closed tab does not kill it. It flips the row to "done" (with the finished GeneratedReport id) or
 * "failed", which the frontend polls /api/almond/generations to observe.
 *
 * This is SERVER-RUNTIME code (not a pure lib): it reads the clock (`new Date()`) for the lifecycle
 * timestamps, which is correct here. It is FAIL-SAFE by construction:
 *   - IDEMPOTENT: it loads the job FARM-SCOPED and returns early unless status is still "pending", so a
 *     duplicate `after()` (a retry, a double registration) never double-runs the build.
 *   - NEVER THROWS OUT: the whole body is wrapped, so any failure lands as status "failed" with a short
 *     reason — never an unhandled rejection in the background that would crash the runtime.
 */

/** The deps the runner closes over: the chat route's tool deps plus the persisting user id. Scope
 *  (`farmId`) and authorship (`createdById`) come ONLY from here — never from the job row's own columns
 *  beyond the farm-scoped lookup, and never from the model. */
export type RunGenerationJobDeps = AlmondToolDeps & {
  /** The signed-in grower the finished report is recorded under (the same id storeReport uses
   *  elsewhere); null for a non-auth context (the public Tour / demo). */
  createdById: string | null;
};

/** Run a single enqueued generation job by id. Idempotent + fail-safe (see the module doc). */
export async function runGenerationJob(deps: RunGenerationJobDeps, jobId: string): Promise<void> {
  const prisma: PrismaClient = deps.prisma;
  try {
    // Load FARM-SCOPED: a job id that is not this farm's is structurally unreachable (the where clause
    // pins farmId), so a stray id can never run another farm's build. Only a still-"pending" job runs:
    // a duplicate after() finds the job already running/done/failed and returns (idempotent).
    const job = await prisma.generationJob.findFirst({
      where: { id: jobId, farmId: deps.farmId },
    });
    if (!job || job.status !== "pending") return;

    // Mark running before any heavy work, so a poll sees the build in flight and a duplicate after()
    // (which re-reads status above) short-circuits.
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { status: "running", startedAt: new Date() },
    });

    // Dispatch by kind to the SAME from-scratch codegen builders the synchronous tool used. No
    // AbortSignal: the request is already done, so the build runs to completion (maxDuration=300 on the
    // route covers it).
    const result =
      job.kind === "workbook"
        ? await runCodegenWorkbook(deps, { request: job.requestText })
        : await runCodegenExport(deps, { request: job.requestText });

    if (result.kind === "file") {
      // Persist to the grower's Reports exactly as the synchronous responder did, then record the new
      // GeneratedReport id on the job so the frontend can fetch the file via /api/reports/[id]/download.
      const stored = await storeReport(
        { prisma, farmId: deps.farmId, createdById: deps.createdById },
        {
          kind: "codegen",
          title: result.fileName,
          requestText: job.requestText,
          coverageAsOf: result.coverageAsOf,
          params: job.paramsJson as Prisma.InputJsonValue,
          bytes: result.bytes,
          contentType: result.contentType,
          meterCount: result.meterCount,
        },
      );
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: "done", resultReportId: stored.id, completedAt: new Date() },
      });
      return;
    }

    // An empty/error outcome (or a runtime that could not produce a verifiable file): mark failed with
    // the builder's short reason, so the status endpoint surfaces an honest failure, never a stuck job.
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { status: "failed", error: result.message, completedAt: new Date() },
    });
  } catch (e) {
    // The build threw (snapshot read, persist, or an unexpected error). A background failure must land
    // as a terminal "failed" row, never an unhandled rejection. Best-effort: if even this write fails
    // there is nothing more to do, so swallow it (the job simply stays "running" until a future sweep).
    const reason = e instanceof Error ? e.message : "generation failed";
    try {
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: "failed", error: reason.slice(0, 300), completedAt: new Date() },
      });
    } catch {
      // Swallow: the runner must never throw out of the background `after()` callback.
    }
  }
}
