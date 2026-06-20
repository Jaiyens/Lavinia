import { prisma } from "@/lib/db";
import {
  resolveHistoryScope,
  getConversation,
  updateConversation,
  deleteConversation,
} from "@/lib/almond/conversation-store";

/**
 * Almond saved-history single-thread endpoint (per-user, per-farm).
 *   GET    -> load a thread's full messages (to continue it).
 *   PUT    -> replace a thread's messages after a later turn (re-derives the title).
 *   DELETE -> remove a thread.
 *
 * Every handler scopes by (id, userId, farmId): a thread that is not the caller's on their active
 * farm is structurally unreachable (no row -> 404), the same cross-tenant gate as report downloads.
 */
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await resolveHistoryScope();
  if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const conversation = await getConversation(prisma, scope, id);
  if (!conversation) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ conversation });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await resolveHistoryScope();
  if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  let messages: unknown;
  try {
    const body: unknown = await req.json();
    messages = body && typeof body === "object" ? (body as { messages?: unknown }).messages : undefined;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const updated = await updateConversation(prisma, scope, id, messages);
  // Not the caller's thread (or nothing worth saving) -> 404, never a peek or a write to another row.
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ conversation: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await resolveHistoryScope();
  if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await deleteConversation(prisma, scope, id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
