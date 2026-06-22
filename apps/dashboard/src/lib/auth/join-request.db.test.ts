import type { FarmRole, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { en } from "@/copy/en";
import { inviteExpiry } from "./invite";
import {
  approveJoinRequest,
  cancelJoinRequest,
  createJoinRequest,
  denyJoinRequest,
  getOrCreateJoinCode,
  resolveFarmByJoinCode,
  rotateJoinCode,
} from "./join-request";

// The request-to-join lifecycle (Phase 2), end to end against a throwaway Postgres: a logged-in
// stranger with the farm's join code asks to join; an admin (owner/manager) approves at a capped
// role or denies. The security rules mirror the invite path: the granted role is capped by the
// actor's role, a manager can never grant owner, and a denial starts a cooldown.
//
// NOTE: the partial-unique index "one OPEN request per (farmId,userId)" lives in raw migration SQL
// that `prisma db push` (the test harness) is blind to, so the DB-level race guard is NOT present
// here. The app-level findFirst pre-check still makes SEQUENTIAL re-requests idempotent, which is
// what these tests exercise; the concurrent race is the index's job in prod.

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
});

afterAll(async () => {
  await db?.cleanup();
});

async function farm(name: string): Promise<string> {
  const f = await prisma.farm.create({ data: { name, isDemo: false } });
  return f.id;
}

async function member(farmId: string, email: string, role: FarmRole): Promise<{ id: string; userId: string }> {
  const user = await prisma.user.create({ data: { email } });
  const m = await prisma.farmMembership.create({ data: { farmId, userId: user.id, role, status: "active" } });
  return { id: m.id, userId: user.id };
}

async function stranger(email: string): Promise<string> {
  const u = await prisma.user.create({ data: { email } });
  return u.id;
}

/** Set a known, deterministic join code so the request tests do not depend on the random generator. */
async function setCode(farmId: string, code: string): Promise<void> {
  await prisma.farm.update({ where: { id: farmId }, data: { joinCode: code } });
}

describe("getOrCreateJoinCode / rotateJoinCode", () => {
  it("an owner gets a code and the second call returns the same one (idempotent)", async () => {
    const farmId = await farm("Code Farm");
    const owner = await member(farmId, "o@code.com", "owner");
    const first = await getOrCreateJoinCode(prisma, owner.userId, farmId);
    expect(first.ok).toBe(true);
    const second = await getOrCreateJoinCode(prisma, owner.userId, farmId);
    expect(second).toEqual(first);
  });

  it("a viewer cannot get or rotate a code", async () => {
    const farmId = await farm("Code Gate Farm");
    const viewer = await member(farmId, "v@code.com", "viewer");
    expect((await getOrCreateJoinCode(prisma, viewer.userId, farmId)).ok).toBe(false);
    expect((await rotateJoinCode(prisma, viewer.userId, farmId)).ok).toBe(false);
  });

  it("a non-member cannot get a code", async () => {
    const farmId = await farm("Code NonMember Farm");
    const outsider = await stranger("nobody@code.com");
    expect((await getOrCreateJoinCode(prisma, outsider, farmId)).ok).toBe(false);
  });

  it("rotate invalidates the old code and issues a new working one", async () => {
    const farmId = await farm("Rotate Farm");
    const owner = await member(farmId, "o@rot.com", "owner");
    const first = await getOrCreateJoinCode(prisma, owner.userId, farmId);
    expect(first.ok).toBe(true);
    const rotated = await rotateJoinCode(prisma, owner.userId, farmId);
    expect(rotated.ok).toBe(true);
    if (!first.ok || !rotated.ok) return; // narrow for TS
    expect(rotated.code).not.toBe(first.code);
    expect(await resolveFarmByJoinCode(prisma, first.code)).toBeNull(); // old link dead
    expect(await resolveFarmByJoinCode(prisma, rotated.code)).toEqual({ farmId });
  });
});

describe("resolveFarmByJoinCode", () => {
  it("normalizes user-typed input (case, spaces, dashes) and never leaks on a miss", async () => {
    const farmId = await farm("Resolve Farm");
    await setCode(farmId, "ABCD2345");
    expect(await resolveFarmByJoinCode(prisma, "abcd-2345")).toEqual({ farmId });
    expect(await resolveFarmByJoinCode(prisma, "  abcd 2345 ")).toEqual({ farmId });
    expect(await resolveFarmByJoinCode(prisma, "ZZZZ9999")).toBeNull(); // no such farm -> uniform null
    expect(await resolveFarmByJoinCode(prisma, "")).toBeNull();
  });
});

describe("createJoinRequest", () => {
  it("a stranger with a valid code opens a request (default proposedRole viewer, email captured)", async () => {
    const farmId = await farm("Request Farm");
    await setCode(farmId, "JOIN0001");
    const uid = await stranger("ask@req.com");
    const res = await createJoinRequest(prisma, uid, "join-0001", "let me in please");
    expect(res.ok).toBe(true);
    const reqRow = await prisma.farmJoinRequest.findFirst({ where: { farmId, userId: uid } });
    expect(reqRow?.status).toBe("open");
    expect(reqRow?.proposedRole).toBe("viewer");
    expect(reqRow?.requestedEmail).toBe("ask@req.com");
    expect(reqRow?.message).toBe("let me in please");
  });

  it("a bad code returns a uniform not-found (no farm oracle)", async () => {
    const uid = await stranger("badcode@req.com");
    const res = await createJoinRequest(prisma, uid, "NOPENOPE");
    expect(res).toEqual({ ok: false, error: en.join.outcome.codeNotFound });
  });

  it("an existing active member is told they already have access", async () => {
    const farmId = await farm("Already Member Farm");
    await setCode(farmId, "JOIN0002");
    const m = await member(farmId, "member@req.com", "manager");
    const res = await createJoinRequest(prisma, m.userId, "JOIN0002");
    expect(res).toEqual({ ok: false, error: en.join.outcome.alreadyMember });
    expect(await prisma.farmJoinRequest.count({ where: { farmId } })).toBe(0);
  });

  it("a pending invite for that email routes them to the invite instead of opening a request", async () => {
    const farmId = await farm("Invited Already Farm");
    await setCode(farmId, "JOIN0003");
    const uid = await stranger("invited@req.com");
    await prisma.farmInvite.create({
      data: { farmId, invitedEmail: "invited@req.com", role: "viewer", expiresAt: inviteExpiry(new Date()) },
    });
    const res = await createJoinRequest(prisma, uid, "JOIN0003");
    expect(res).toEqual({ ok: false, error: en.join.outcome.invitePending });
    expect(await prisma.farmJoinRequest.count({ where: { farmId } })).toBe(0);
  });

  it("a second request while one is open is idempotent (still exactly one open row)", async () => {
    const farmId = await farm("Dup Request Farm");
    await setCode(farmId, "JOIN0004");
    const uid = await stranger("dup@req.com");
    expect((await createJoinRequest(prisma, uid, "JOIN0004")).ok).toBe(true);
    const again = await createJoinRequest(prisma, uid, "JOIN0004");
    expect(again).toEqual({ ok: true, message: en.join.outcome.alreadyRequested });
    expect(await prisma.farmJoinRequest.count({ where: { farmId, userId: uid, status: "open" } })).toBe(1);
  });

  it("a recent denial puts the requester on a cooldown for that farm", async () => {
    const farmId = await farm("Cooldown Farm");
    await setCode(farmId, "JOIN0005");
    const owner = await member(farmId, "o@cool.com", "owner");
    const uid = await stranger("denied@cool.com");
    const req = await prisma.farmJoinRequest.findFirst({ where: { farmId, userId: uid } }); // none yet
    expect(req).toBeNull();
    expect((await createJoinRequest(prisma, uid, "JOIN0005")).ok).toBe(true);
    const open = await prisma.farmJoinRequest.findFirst({ where: { farmId, userId: uid, status: "open" } });
    expect((await denyJoinRequest(prisma, owner.userId, open!.id)).ok).toBe(true);
    // Immediately re-asking the same farm is blocked by the cooldown.
    const res = await createJoinRequest(prisma, uid, "JOIN0005");
    expect(res).toEqual({ ok: false, error: en.join.outcome.denyCooldown });
  });

  it("rate-limits a single requester across farms after the per-hour cap", async () => {
    const uid = await stranger("sprayer@req.com");
    // The cap is 10/hour per requester; open 10 across 10 farms, then the 11th is blocked.
    for (let i = 0; i < 10; i++) {
      const fid = await farm(`Spray Farm ${i}`);
      const code = `SPRAY${String(i).padStart(3, "0")}`;
      await setCode(fid, code);
      expect((await createJoinRequest(prisma, uid, code)).ok).toBe(true);
    }
    const fid = await farm("Spray Farm 11");
    await setCode(fid, "SPRAY011");
    const res = await createJoinRequest(prisma, uid, "SPRAY011");
    expect(res).toEqual({ ok: false, error: en.join.outcome.rateLimited });
  });
});

describe("approveJoinRequest", () => {
  async function openRequest(farmId: string, email: string): Promise<{ requestId: string; userId: string }> {
    const userId = await stranger(email);
    const r = await prisma.farmJoinRequest.create({
      data: { farmId, userId, requestedEmail: email, proposedRole: "viewer", status: "open", expiresAt: inviteExpiry(new Date()) },
    });
    return { requestId: r.id, userId };
  }

  it("an owner approves at the granted role -> active membership, request marked approved", async () => {
    const farmId = await farm("Approve Farm");
    const owner = await member(farmId, "o@app.com", "owner");
    const { requestId, userId } = await openRequest(farmId, "grant@app.com");
    const res = await approveJoinRequest(prisma, owner.userId, requestId, "manager");
    expect(res.ok).toBe(true);
    const m = await prisma.farmMembership.findUnique({ where: { farmId_userId: { farmId, userId } } });
    expect(m?.status).toBe("active");
    expect(m?.role).toBe("manager");
    expect((await prisma.farmJoinRequest.findUnique({ where: { id: requestId } }))?.status).toBe("approved");
  });

  it("a manager cannot approve at the owner role (capped); no membership is created", async () => {
    const farmId = await farm("Approve Cap Farm");
    await member(farmId, "o@acap.com", "owner");
    const mgr = await member(farmId, "m@acap.com", "manager");
    const { requestId, userId } = await openRequest(farmId, "wannabe@acap.com");
    expect((await approveJoinRequest(prisma, mgr.userId, requestId, "owner")).ok).toBe(false);
    expect(await prisma.farmMembership.count({ where: { farmId, userId } })).toBe(0);
    expect((await prisma.farmJoinRequest.findUnique({ where: { id: requestId } }))?.status).toBe("open");
  });

  it("re-admits a previously removed member at the chosen role", async () => {
    const farmId = await farm("Approve Re-admit Farm");
    const owner = await member(farmId, "o@readmit.com", "owner");
    const { requestId, userId } = await openRequest(farmId, "wasremoved@readmit.com");
    // They had a removed membership from before.
    await prisma.farmMembership.create({
      data: { farmId, userId, role: "viewer", status: "removed", removedAt: new Date() },
    });
    expect((await approveJoinRequest(prisma, owner.userId, requestId, "manager")).ok).toBe(true);
    const m = await prisma.farmMembership.findUnique({ where: { farmId_userId: { farmId, userId } } });
    expect(m?.status).toBe("active");
    expect(m?.role).toBe("manager");
    expect(m?.removedAt).toBeNull();
  });

  it("rejects an expired request", async () => {
    const farmId = await farm("Approve Expired Farm");
    const owner = await member(farmId, "o@exp.com", "owner");
    const userId = await stranger("expired@exp.com");
    const r = await prisma.farmJoinRequest.create({
      data: { farmId, userId, requestedEmail: "expired@exp.com", proposedRole: "viewer", status: "open", expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await approveJoinRequest(prisma, owner.userId, r.id, "viewer");
    expect(res).toEqual({ ok: false, error: en.join.outcome.requestGone });
    expect(await prisma.farmMembership.count({ where: { farmId, userId } })).toBe(0);
  });

  it("a non-member cannot approve a request", async () => {
    const farmId = await farm("Approve NonMember Farm");
    const outsider = await stranger("outsider@app.com");
    const { requestId } = await openRequest(farmId, "x@app.com");
    expect((await approveJoinRequest(prisma, outsider, requestId, "viewer")).ok).toBe(false);
  });
});

describe("denyJoinRequest / cancelJoinRequest", () => {
  it("an owner denies an open request (terminal)", async () => {
    const farmId = await farm("Deny Farm");
    const owner = await member(farmId, "o@deny.com", "owner");
    const userId = await stranger("denyme@deny.com");
    const r = await prisma.farmJoinRequest.create({
      data: { farmId, userId, requestedEmail: "denyme@deny.com", proposedRole: "viewer", status: "open", expiresAt: inviteExpiry(new Date()) },
    });
    expect((await denyJoinRequest(prisma, owner.userId, r.id)).ok).toBe(true);
    expect((await prisma.farmJoinRequest.findUnique({ where: { id: r.id } }))?.status).toBe("denied");
  });

  it("the requester can cancel their own open request, but not someone else's", async () => {
    const farmId = await farm("Cancel Farm");
    const mine = await stranger("mine@cancel.com");
    const other = await stranger("other@cancel.com");
    const r = await prisma.farmJoinRequest.create({
      data: { farmId, userId: mine, requestedEmail: "mine@cancel.com", proposedRole: "viewer", status: "open", expiresAt: inviteExpiry(new Date()) },
    });
    // Another user cannot cancel it.
    expect((await cancelJoinRequest(prisma, other, r.id)).ok).toBe(false);
    expect((await prisma.farmJoinRequest.findUnique({ where: { id: r.id } }))?.status).toBe("open");
    // The owner of the row can.
    expect((await cancelJoinRequest(prisma, mine, r.id)).ok).toBe(true);
    expect((await prisma.farmJoinRequest.findUnique({ where: { id: r.id } }))?.status).toBe("cancelled");
  });
});
