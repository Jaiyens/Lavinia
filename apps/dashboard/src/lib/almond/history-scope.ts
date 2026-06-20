import { sessionUserId } from "@/lib/auth";
import { activeFarmId } from "@/lib/auth/active-farm";
import type { HistoryScope } from "./conversation-store";

/**
 * The active history scope for this request, or null when there is none (no session, or a member of
 * no farm). `activeFarmId` re-validates the active-farm cookie against live membership on every call,
 * so the farmId here is always one the user may access. The public Tour resolves null and persists
 * nothing — demo chats are ephemeral, exactly as before.
 *
 * Kept in its own (auth-importing) module so `conversation-store.ts` stays an auth-free DB edge,
 * matching the other DB-edge modules (reports/store, access). That lets the conversation-store db
 * test load under vitest without pulling next-auth -> next/server into the test runner.
 */
export async function resolveHistoryScope(): Promise<HistoryScope | null> {
  const userId = await sessionUserId();
  if (!userId) return null;
  const farmId = await activeFarmId(userId);
  if (!farmId) return null;
  return { userId, farmId };
}
