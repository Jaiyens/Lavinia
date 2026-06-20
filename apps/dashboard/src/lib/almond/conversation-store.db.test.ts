import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  updateConversation,
  type HistoryScope,
} from "./conversation-store";

// Tenant-isolation integration test for Almond's saved chat history, against a throwaway Postgres
// on the local test cluster (src/test/pg-harness.ts), never the dev/prod Neon db. It mirrors the
// proven reports/store + access gate pattern: two real users on two real farms, and every read /
// update / delete is proven to be scoped to BOTH the signed-in user AND their active farm via the
// (id, userId, farmId) WHERE clause. The whole point is that user B / farm B can never read,
// mutate, or delete user A's thread, and a forged or foreign id finds zero rows (null / false),
// exactly like the report-download IDOR gate.

let db: TestDb;
let prisma: PrismaClient;

let scopeA: HistoryScope; // user A on farm A — the owner of the threads under test
let scopeBOtherUser: HistoryScope; // a different user, but on farm A (proves the userId leg)
let scopeBOtherFarm: HistoryScope; // user A, but on a DIFFERENT farm (proves the farmId leg)
let scopeBForeign: HistoryScope; // a different user AND a different farm (fully foreign)

/** A minimal saveable thread: one user turn and one assistant turn (isSaveable requires both). */
function thread(question: string, answer: string): unknown {
  return [
    { id: "u1", role: "user", parts: [{ type: "text", text: question }] },
    { id: "a1", role: "assistant", parts: [{ type: "text", text: answer }] },
  ];
}

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;

  const userA = await prisma.user.create({ data: { email: "almond-history-a@example.com" } });
  const userB = await prisma.user.create({ data: { email: "almond-history-b@example.com" } });
  const farmA = await prisma.farm.create({ data: { name: "Farm A", isDemo: false } });
  const farmB = await prisma.farm.create({ data: { name: "Farm B", isDemo: false } });

  scopeA = { userId: userA.id, farmId: farmA.id };
  scopeBOtherUser = { userId: userB.id, farmId: farmA.id };
  scopeBOtherFarm = { userId: userA.id, farmId: farmB.id };
  scopeBForeign = { userId: userB.id, farmId: farmB.id };
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

describe("conversation-store tenant isolation", () => {
  it("getConversation: only the owning (userId, farmId) scope can read a thread", async () => {
    const created = await createConversation(prisma, scopeA, thread("how is pump 4", "it is fine"));
    expect(created).not.toBeNull();
    const id = created!.id;

    // The owner reads its own thread back.
    const own = await getConversation(prisma, scopeA, id);
    expect(own).not.toBeNull();
    expect(own!.id).toBe(id);
    expect(own!.messages).toHaveLength(2);

    // A different user (same farm), the same user on a different farm, and a fully foreign
    // (user B / farm B) scope all see nothing — the id is structurally unreachable.
    expect(await getConversation(prisma, scopeBOtherUser, id)).toBeNull();
    expect(await getConversation(prisma, scopeBOtherFarm, id)).toBeNull();
    expect(await getConversation(prisma, scopeBForeign, id)).toBeNull();
  });

  it("getConversation: a crafted / nonexistent id returns null, never another row", async () => {
    expect(await getConversation(prisma, scopeA, "totally-made-up-id")).toBeNull();
    expect(await getConversation(prisma, scopeBForeign, "totally-made-up-id")).toBeNull();
  });

  it("listConversations: a scope only ever lists its own (userId, farmId) threads", async () => {
    const mine = await createConversation(prisma, scopeA, thread("list me", "ok"));
    expect(mine).not.toBeNull();

    const aList = await listConversations(prisma, scopeA);
    expect(aList.some((c) => c.id === mine!.id)).toBe(true);

    // None of A's threads appear for another user, another farm, or a foreign scope.
    const ids = (scope: HistoryScope) =>
      listConversations(prisma, scope).then((rows) => rows.map((r) => r.id));
    expect(await ids(scopeBOtherUser)).not.toContain(mine!.id);
    expect(await ids(scopeBOtherFarm)).not.toContain(mine!.id);
    expect(await ids(scopeBForeign)).not.toContain(mine!.id);
  });

  it("updateConversation: a non-owning scope cannot mutate the thread (0 rows -> null)", async () => {
    const created = await createConversation(prisma, scopeA, thread("before", "answer"));
    expect(created).not.toBeNull();
    const id = created!.id;

    // Every non-owning scope's update touches zero rows and returns null.
    expect(await updateConversation(prisma, scopeBOtherUser, id, thread("hijack", "pwned"))).toBeNull();
    expect(await updateConversation(prisma, scopeBOtherFarm, id, thread("hijack", "pwned"))).toBeNull();
    expect(await updateConversation(prisma, scopeBForeign, id, thread("hijack", "pwned"))).toBeNull();

    // The owner's thread is byte-for-byte unchanged after the failed cross-tenant writes.
    const after = await getConversation(prisma, scopeA, id);
    expect(after).not.toBeNull();
    expect(after!.messages[0]!.parts[0]!.text).toBe("before");
    expect(after!.title).toBe("before");

    // The owner CAN update its own thread (proving the WHERE is the only thing that blocked B).
    const updated = await updateConversation(prisma, scopeA, id, thread("after", "new answer"));
    expect(updated).not.toBeNull();
    const reread = await getConversation(prisma, scopeA, id);
    expect(reread!.messages[0]!.parts[0]!.text).toBe("after");
  });

  it("deleteConversation: a non-owning scope cannot delete the thread (false, row survives)", async () => {
    const created = await createConversation(prisma, scopeA, thread("keep me", "answer"));
    expect(created).not.toBeNull();
    const id = created!.id;

    // No foreign scope can delete it.
    expect(await deleteConversation(prisma, scopeBOtherUser, id)).toBe(false);
    expect(await deleteConversation(prisma, scopeBOtherFarm, id)).toBe(false);
    expect(await deleteConversation(prisma, scopeBForeign, id)).toBe(false);

    // It still exists for the owner.
    expect(await getConversation(prisma, scopeA, id)).not.toBeNull();

    // The owner CAN delete its own thread; a second delete is a no-op (already gone).
    expect(await deleteConversation(prisma, scopeA, id)).toBe(true);
    expect(await deleteConversation(prisma, scopeA, id)).toBe(false);
    expect(await getConversation(prisma, scopeA, id)).toBeNull();
  });

  it("deleteConversation: a crafted / nonexistent id returns false, never deletes another row", async () => {
    const survivor = await createConversation(prisma, scopeA, thread("survivor", "answer"));
    expect(survivor).not.toBeNull();

    expect(await deleteConversation(prisma, scopeA, "made-up-id")).toBe(false);
    expect(await deleteConversation(prisma, scopeBForeign, "made-up-id")).toBe(false);

    // The unrelated real thread is untouched.
    expect(await getConversation(prisma, scopeA, survivor!.id)).not.toBeNull();
  });
});
