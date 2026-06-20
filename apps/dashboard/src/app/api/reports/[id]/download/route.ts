import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { activeFarmId } from "@/lib/auth/active-farm";
import { currentFarm } from "@/lib/onboarding/farm";
import { loadReportForFarm } from "@/lib/almond/reports/store";
import { getPrivateBlob } from "@/lib/storage/blob";

/**
 * Owner-scoped report download (Story 8.6). A grower fetches a spreadsheet Almond made earlier and
 * kept privately. The isolation gate is layered, and ownership is re-checked on every request:
 *
 *   1. ANONYMOUS -> 401. The caller must be signed in; the public Tour has no reports (its exports
 *      are never stored) and cannot reach this route.
 *   2. AUTHENTICATED, OWN FARM resolved via `currentFarm` (the `Farm.userId` / dashboardFarm law):
 *      load the report FARM-SCOPED. A report id belonging to ANOTHER farm (or a non-existent id)
 *      finds no row and returns 404 — a different farm's id is structurally unreachable, not just
 *      hidden, because the query is `where: { id, farmId }`.
 *   3. The bytes live in PRIVATE Vercel Blob; only after the ownership re-check do we stream them
 *      back (the SDK attaches the store token, so the private blob is never served to an
 *      unauthenticated fetch of its URL). A blob that is somehow missing returns 404, never a 500.
 *
 * Read-only: nothing here mutates. Node runtime (Prisma + the Blob SDK's Node fetch).
 */
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const userId = await sessionUserId();
  // Anonymous caller: there is no owner to scope to. 401, never a peek at a private file.
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // The caller's active farm, membership-scoped. A signed-in grower who is a member of no farm
  // resolves null here, so they can fetch nothing. loadReportForFarm below is additionally scoped
  // by farmId, so a report on a farm the caller is not a member of is structurally unreachable.
  const activeId = await activeFarmId(userId);
  const farm = await currentFarm(prisma, userId, activeId);
  if (!farm) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const { id } = await params;
  // Farm-scoped load: a report on another farm (or a bad id) finds no row -> 404. This is the
  // cross-farm gate — even a valid id for a different farm is unreachable.
  const report = await loadReportForFarm(prisma, farm.id, id);
  if (!report) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  // Ownership confirmed: stream the private bytes. A missing blob (e.g. lifecycle-expired) is a 404,
  // never an unhandled crash.
  const blob = await getPrivateBlob(report.blobPathname);
  if (!blob) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  return new Response(blob.stream, {
    status: 200,
    headers: {
      "Content-Type": blob.contentType,
      "Content-Length": String(blob.byteSize),
      // Force a download with the server-authored title, never an inline render or a client name.
      "Content-Disposition": `attachment; filename="${encodeURIComponent(report.title)}"`,
      // Private data: never cache in a shared/CDN cache.
      "Cache-Control": "private, no-store",
    },
  });
}
