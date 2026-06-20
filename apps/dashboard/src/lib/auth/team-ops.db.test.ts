import type { FarmRole, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import * as ops from "./team-ops";

// The team lifecycle, end to end against a throwaway Postgres. The security rules: owners AND
// managers manage the team, but a manager can never grant above manager nor act on an owner, and a
// farm can never drop to zero owners.

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

async function member(
  farmId: string,
  email: string,
  role: FarmRole,
  status: "active" | "removed" = "active",
): Promise<{ id: string; userId: string }> {
  const user = await prisma.user.create({ data: { email } });
  const m = await prisma.farmMembership.create({ data: { farmId, userId: user.id, role, status } });
  return { id: m.id, userId: user.id };
}

describe("inviteMembers", () => {
  it("an owner invites a manager (pending invite at that role)", async () => {
    const farmId = await farm("Invite Farm");
    const owner = await member(farmId, "owner@inv.com", "owner");
    const res = await ops.inviteMembers(prisma, owner.userId, farmId, "newmgr@inv.com", "manager");
    expect(res.ok).toBe(true);
    const inv = await prisma.farmInvite.findFirst({ where: { farmId, invitedEmail: "newmgr@inv.com" } });
    expect(inv?.status).toBe("pending");
    expect(inv?.role).toBe("manager");
  });

  it("a manager cannot invite at the owner role (capped at manager)", async () => {
    const farmId = await farm("Cap Farm");
    const mgr = await member(farmId, "mgr@cap.com", "manager");
    const res = await ops.inviteMembers(prisma, mgr.userId, farmId, "wannabe@cap.com", "owner");
    expect(res.ok).toBe(false);
    expect(await prisma.farmInvite.count({ where: { farmId } })).toBe(0);
  });

  it("a viewer cannot invite anyone", async () => {
    const farmId = await farm("Viewer Farm");
    const v = await member(farmId, "viewer@vw.com", "viewer");
    expect((await ops.inviteMembers(prisma, v.userId, farmId, "x@vw.com", "viewer")).ok).toBe(false);
  });

  it("skips an email already on the team (no duplicate invite)", async () => {
    const farmId = await farm("Skip Farm");
    const owner = await member(farmId, "owner@skip.com", "owner");
    await member(farmId, "existing@skip.com", "manager");
    const res = await ops.inviteMembers(prisma, owner.userId, farmId, "existing@skip.com", "manager");
    expect(res.ok).toBe(true);
    expect(await prisma.farmInvite.count({ where: { farmId, invitedEmail: "existing@skip.com" } })).toBe(0);
  });

  it("rejects a typo'd email before sending", async () => {
    const farmId = await farm("Typo Farm");
    const owner = await member(farmId, "owner@typo.com", "owner");
    expect((await ops.inviteMembers(prisma, owner.userId, farmId, "not-an-email", "manager")).ok).toBe(false);
  });
});

describe("changeRole", () => {
  it("an owner promotes a viewer to manager", async () => {
    const farmId = await farm("Role Farm");
    const owner = await member(farmId, "o@role.com", "owner");
    const viewer = await member(farmId, "v@role.com", "viewer");
    expect((await ops.changeRole(prisma, owner.userId, viewer.id, "manager")).ok).toBe(true);
    expect((await prisma.farmMembership.findUnique({ where: { id: viewer.id } }))?.role).toBe("manager");
  });

  it("a manager cannot grant owner, and cannot change an owner's role", async () => {
    const farmId = await farm("Role Cap Farm");
    const owner = await member(farmId, "o@rcap.com", "owner");
    const mgr = await member(farmId, "m@rcap.com", "manager");
    const viewer = await member(farmId, "v@rcap.com", "viewer");
    expect((await ops.changeRole(prisma, mgr.userId, viewer.id, "owner")).ok).toBe(false);
    expect((await ops.changeRole(prisma, mgr.userId, owner.id, "manager")).ok).toBe(false);
    expect((await prisma.farmMembership.findUnique({ where: { id: owner.id } }))?.role).toBe("owner");
  });

  it("cannot demote the last owner", async () => {
    const farmId = await farm("Demote Farm");
    const owner = await member(farmId, "o@demote.com", "owner");
    expect((await ops.changeRole(prisma, owner.userId, owner.id, "manager")).ok).toBe(false);
    expect((await prisma.farmMembership.findUnique({ where: { id: owner.id } }))?.role).toBe("owner");
  });
});

describe("removeMember", () => {
  it("a manager removes a viewer but never an owner", async () => {
    const farmId = await farm("Remove Farm");
    const owner = await member(farmId, "o@rem.com", "owner");
    const mgr = await member(farmId, "m@rem.com", "manager");
    const viewer = await member(farmId, "v@rem.com", "viewer");
    expect((await ops.removeMember(prisma, mgr.userId, viewer.id)).ok).toBe(true);
    expect((await prisma.farmMembership.findUnique({ where: { id: viewer.id } }))?.status).toBe("removed");
    expect((await ops.removeMember(prisma, mgr.userId, owner.id)).ok).toBe(false);
    expect((await prisma.farmMembership.findUnique({ where: { id: owner.id } }))?.status).toBe("active");
  });

  it("cannot remove the last owner", async () => {
    const farmId = await farm("Last Owner Farm");
    const owner = await member(farmId, "o@last.com", "owner");
    expect((await ops.removeMember(prisma, owner.userId, owner.id)).ok).toBe(false);
    expect((await prisma.farmMembership.findUnique({ where: { id: owner.id } }))?.status).toBe("active");
  });
});

describe("leaveFarm", () => {
  it("the sole owner cannot leave, but can once a second owner exists", async () => {
    const farmId = await farm("Leave Farm");
    const owner = await member(farmId, "o@leave.com", "owner");
    expect((await ops.leaveFarm(prisma, owner.userId, farmId)).ok).toBe(false);
    const owner2 = await member(farmId, "o2@leave.com", "owner");
    expect((await ops.leaveFarm(prisma, owner2.userId, farmId)).ok).toBe(true);
    expect((await prisma.farmMembership.findUnique({ where: { id: owner2.id } }))?.status).toBe("removed");
  });
});

describe("transferOwnership", () => {
  it("an owner hands off: target becomes owner, actor becomes manager, Farm.userId follows", async () => {
    const farmId = await farm("Transfer Farm");
    const owner = await member(farmId, "o@xfer.com", "owner");
    const mgr = await member(farmId, "m@xfer.com", "manager");
    expect((await ops.transferOwnership(prisma, owner.userId, mgr.id)).ok).toBe(true);
    expect((await prisma.farmMembership.findUnique({ where: { id: mgr.id } }))?.role).toBe("owner");
    expect((await prisma.farmMembership.findUnique({ where: { id: owner.id } }))?.role).toBe("manager");
    expect((await prisma.farm.findUnique({ where: { id: farmId } }))?.userId).toBe(mgr.userId);
  });

  it("a manager cannot transfer ownership", async () => {
    const farmId = await farm("No Transfer Farm");
    await member(farmId, "o@noxfer.com", "owner");
    const mgr = await member(farmId, "m@noxfer.com", "manager");
    const viewer = await member(farmId, "v@noxfer.com", "viewer");
    expect((await ops.transferOwnership(prisma, mgr.userId, viewer.id)).ok).toBe(false);
  });
});
