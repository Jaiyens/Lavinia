import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { activeFarmId } from "@/lib/auth/active-farm";
import { currentFarm } from "@/lib/onboarding/farm";

/**
 * The background-generation status endpoint (Almond v2 Phase 2). The frontend polls this to learn when a
 * model-authored spreadsheet/PDF that was enqueued during a chat turn has finished building (the build
 * runs in the chat route's `after()`, surviving the grower leaving the page). Once a job is "done", the
 * frontend fetches the finished FILE via the existing /api/reports/[resultReportId]/download route — this
 * endpoint returns NO bytes, only the job ledger rows.
 *
 * Owner-scoped, mirroring /api/reports/[id]/download exactly so the isolation gate is identical:
 *   1. ANONYMOUS -> 401. The caller must be signed in.
 *   2. AUTHENTICATED, OWN FARM resolved via `currentFarm` (the active-farm cookie, membership-scoped).
 *      A signed-in grower who is a member of no farm resolves null -> 404.
 *   3. The jobs are read FARM-SCOPED (`where: { farmId }`), so a job on another farm is structurally
 *      unreachable — cross-farm access cannot succeed even with a valid id.
 *
 * Read-only. Node runtime (Prisma).
 */
export const runtime = "nodejs";

/** How many recent jobs to return (newest first). A grower rarely has more than a couple in flight; a
 *  dozen is plenty for the tracker to show recent builds without an unbounded scan. */
const RECENT_LIMIT = 12;

export async function GET(): Promise<Response> {
  const userId = await sessionUserId();
  // Anonymous caller: there is no owner to scope to. 401, exactly as the download route.
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // The caller's active farm, membership-scoped. A signed-in grower who is a member of no farm resolves
  // null here, so they can read nothing.
  const activeId = await activeFarmId(userId);
  const farm = await currentFarm(prisma, userId, activeId);
  if (!farm) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // FARM-SCOPED read: a job belonging to another farm is never returned (the WHERE pins farmId), so a
  // different farm's job is structurally unreachable. No bytes — the file is fetched via the reports
  // download route once a job is "done".
  const jobs = await prisma.generationJob.findMany({
    where: { farmId: farm.id },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
    select: {
      id: true,
      kind: true,
      status: true,
      requestText: true,
      resultReportId: true,
      error: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return Response.json({ jobs });
}
