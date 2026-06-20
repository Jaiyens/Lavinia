import { prisma } from "@/lib/db";
import {
  resolveHistoryScope,
  listConversations,
  createConversation,
} from "@/lib/almond/conversation-store";

/**
 * Almond saved-history collection endpoint (per-user, per-farm).
 *   GET  -> the signed-in grower's own threads for their active farm, newest-first.
 *   POST -> create a thread from a completed conversation (the client saves the FIRST turn here,
 *           then PUTs the same id on later turns). Created lazily so an abandoned composer never
 *           leaves an empty row.
 *
 * No session (or no farm) -> GET yields an empty list and POST a 401: the public Tour persists
 * nothing and its demo chats stay ephemeral, exactly as before.
 */
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const scope = await resolveHistoryScope();
  // No scope is not an error here: the client only lists when history is enabled, and an empty list
  // is the correct, leak-free answer for an anonymous/farm-less caller.
  if (!scope) return Response.json({ conversations: [] });
  const conversations = await listConversations(prisma, scope);
  return Response.json({ conversations });
}

export async function POST(req: Request): Promise<Response> {
  const scope = await resolveHistoryScope();
  if (!scope) return Response.json({ error: "unauthorized" }, { status: 401 });

  let messages: unknown;
  try {
    const body: unknown = await req.json();
    messages = body && typeof body === "object" ? (body as { messages?: unknown }).messages : undefined;
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const created = await createConversation(prisma, scope, messages);
  // Nothing worth saving (no user turn AND answer): a clean 400, never an empty row.
  if (!created) return Response.json({ error: "nothing to save" }, { status: 400 });
  return Response.json({ conversation: created }, { status: 201 });
}
