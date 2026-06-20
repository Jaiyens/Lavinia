import { Prisma, type PrismaClient } from "@prisma/client";
import { sessionUserId } from "@/lib/auth";
import { activeFarmId } from "@/lib/auth/active-farm";
import {
  sanitizeHistoryMessages,
  deriveTitle,
  isSaveable,
  type StoredMessage,
  type ConversationSummary,
} from "./history";

// The server side of Almond's saved history. Every read and write is scoped to BOTH the signed-in
// user AND their validated active farm, so a grower only ever touches their OWN threads on the farm
// they are currently viewing. The (id, userId, farmId) where-clause makes another user's (or another
// farm's) thread structurally unreachable — a forged or guessed id finds no row, exactly like the
// report-download IDOR gate, never a 200 with someone else's chat.

/** The tenant scope a history call runs under: a user and the farm the thread belongs to. */
export type HistoryScope = { userId: string; farmId: string };

/**
 * The active history scope for this request, or null when there is none (no session, or a member of
 * no farm). `activeFarmId` re-validates the active-farm cookie against live membership on every call,
 * so the farmId here is always one the user may access. The public Tour resolves null and persists
 * nothing — demo chats are ephemeral, exactly as before.
 */
export async function resolveHistoryScope(): Promise<HistoryScope | null> {
  const userId = await sessionUserId();
  if (!userId) return null;
  const farmId = await activeFarmId(userId);
  if (!farmId) return null;
  return { userId, farmId };
}

/** A user's own threads for the active farm, newest-first (summaries only, no message bodies). */
export async function listConversations(
  prisma: PrismaClient,
  scope: HistoryScope,
): Promise<ConversationSummary[]> {
  const rows = await prisma.almondConversation.findMany({
    where: { userId: scope.userId, farmId: scope.farmId },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() }));
}

function asJson(messages: StoredMessage[]): Prisma.InputJsonValue {
  // StoredMessage[] is plain serializable data; the cast satisfies Prisma's recursive Json input
  // type without widening the public StoredMessage shape.
  return messages as unknown as Prisma.InputJsonValue;
}

/**
 * Create a thread from a (sanitized) message array. Returns null when the payload has nothing worth
 * saving (no user turn AND answer) so an abandoned or malformed save never leaves an empty row.
 */
export async function createConversation(
  prisma: PrismaClient,
  scope: HistoryScope,
  input: unknown,
): Promise<ConversationSummary | null> {
  const messages = sanitizeHistoryMessages(input);
  if (!isSaveable(messages)) return null;
  const row = await prisma.almondConversation.create({
    data: { userId: scope.userId, farmId: scope.farmId, title: deriveTitle(messages), messages: asJson(messages) },
    select: { id: true, title: true, updatedAt: true },
  });
  return { id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() };
}

/** A single thread's full (sanitized) messages, or null when it is not the caller's on this farm. */
export async function getConversation(
  prisma: PrismaClient,
  scope: HistoryScope,
  id: string,
): Promise<{ id: string; title: string; messages: StoredMessage[] } | null> {
  const row = await prisma.almondConversation.findFirst({
    where: { id, userId: scope.userId, farmId: scope.farmId },
    select: { id: true, title: true, messages: true },
  });
  if (!row) return null;
  return { id: row.id, title: row.title, messages: sanitizeHistoryMessages(row.messages) };
}

/**
 * Replace a thread's messages (and re-derive its title). Ownership is enforced in the WHERE, so a
 * forged id touches zero rows and returns null — never another user's thread.
 */
export async function updateConversation(
  prisma: PrismaClient,
  scope: HistoryScope,
  id: string,
  input: unknown,
): Promise<ConversationSummary | null> {
  const messages = sanitizeHistoryMessages(input);
  if (!isSaveable(messages)) return null;
  const result = await prisma.almondConversation.updateMany({
    where: { id, userId: scope.userId, farmId: scope.farmId },
    data: { title: deriveTitle(messages), messages: asJson(messages) },
  });
  if (result.count === 0) return null;
  const row = await prisma.almondConversation.findFirst({
    where: { id, userId: scope.userId, farmId: scope.farmId },
    select: { id: true, title: true, updatedAt: true },
  });
  return row ? { id: row.id, title: row.title, updatedAt: row.updatedAt.toISOString() } : null;
}

/** Delete a thread. Returns false when nothing matched (not the caller's, or already gone). */
export async function deleteConversation(
  prisma: PrismaClient,
  scope: HistoryScope,
  id: string,
): Promise<boolean> {
  const result = await prisma.almondConversation.deleteMany({
    where: { id, userId: scope.userId, farmId: scope.farmId },
  });
  return result.count > 0;
}
