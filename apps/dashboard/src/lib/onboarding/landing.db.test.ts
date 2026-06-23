import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/test/pg-harness";
import { resolveLanding } from "./landing";

// Integration test for the post-login routing brain. Exercises each branch the /start fork sorts:
// a ready member -> dashboard, an owner mid-onboarding -> resume, a stray pending invite -> invite,
// and a brand-new user -> the choice screen, plus the explicit "add another farm" bypass. Runs
// against a throwaway Postgres on the local test cluster (no network, never the dev/prod db).

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDb();
  prisma = db.prisma;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

async function makeUser(email: string): Promise<{ id: string; email: string }> {
  const u = await prisma.user.create({ data: { email }, select: { id: true, email: true } });
  return { id: u.id, email: u.email ?? email };
}

/** A finalized farm the user is an active member of (active membership + active pge_smd). */
async function makeReadyFarm(userId: string, name = "Ready"): Promise<{ id: string }> {
  return prisma.farm.create({
    data: {
      name,
      userId,
      isDemo: false,
      connections: { create: [{ type: "pge_smd", status: "active" }] },
      memberships: { create: [{ userId, role: "owner", status: "active" }] },
    },
    select: { id: true },
  });
}

/** An in-progress farm the user owns: a pending pge_smd, none active (the resume signal). The
 *  resume gate keys on the active owner membership (the team-access model), not Farm.userId, so the
 *  fixture must build the farm the way the product does (matches makeReadyFarm + resume.db.test). */
async function makePendingFarm(userId: string, name = "Pending"): Promise<{ id: string }> {
  return prisma.farm.create({
    data: {
      name,
      userId,
      isDemo: false,
      connections: { create: [{ type: "pge_smd", status: "pending" }] },
      memberships: { create: [{ userId, role: "owner", status: "active" }] },
    },
    select: { id: true },
  });
}

/** A bare farm (no membership for the test user) to attach a join request to. */
async function makeBareFarm(name = "Other Farm"): Promise<{ id: string }> {
  const owner = await prisma.user.create({ data: { email: `owner-${name.replace(/\W/g, "")}@x.com` } });
  return prisma.farm.create({ data: { name, userId: owner.id, isDemo: false }, select: { id: true } });
}

describe("resolveLanding", () => {
  it("sends a signed-out caller to the choice screen", async () => {
    expect(await resolveLanding(prisma, { userId: null, email: null })).toEqual({ kind: "choose" });
  });

  it("sends a brand-new user (no farm, no invite) to the choice screen", async () => {
    const u = await makeUser("brandnew@example.com");
    expect(await resolveLanding(prisma, { userId: u.id, email: u.email })).toEqual({ kind: "choose" });
  });

  it("sends a ready member to the dashboard", async () => {
    const u = await makeUser("ready@example.com");
    await makeReadyFarm(u.id);
    expect(await resolveLanding(prisma, { userId: u.id, email: u.email })).toEqual({ kind: "dashboard" });
  });

  it("resumes an owner who is mid-onboarding", async () => {
    const u = await makeUser("resuming@example.com");
    const f = await makePendingFarm(u.id);
    expect(await resolveLanding(prisma, { userId: u.id, email: u.email })).toEqual({
      kind: "resume",
      farmId: f.id,
    });
  });

  it("surfaces a stray, unclaimed invite (self-heal) for a user with no farm", async () => {
    const owner = await makeUser("inviteowner@example.com");
    const farm = await makeReadyFarm(owner.id, "Owner Farm");
    const invitee = await makeUser("invitee@example.com");
    await prisma.farmInvite.create({
      data: {
        farmId: farm.id,
        invitedEmail: invitee.email, // already lowercase; resolveLanding normalizes the lookup
        role: "viewer",
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    expect(await resolveLanding(prisma, { userId: invitee.id, email: invitee.email })).toEqual({
      kind: "invite",
      count: 1,
    });
  });

  it("ignores an expired invite (falls through to choose)", async () => {
    const owner = await makeUser("expowner@example.com");
    const farm = await makeReadyFarm(owner.id, "Exp Farm");
    const invitee = await makeUser("expinvitee@example.com");
    await prisma.farmInvite.create({
      data: {
        farmId: farm.id,
        invitedEmail: invitee.email,
        role: "viewer",
        status: "pending",
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });
    expect(await resolveLanding(prisma, { userId: invitee.id, email: invitee.email })).toEqual({
      kind: "choose",
    });
  });

  it("prefers the dashboard over a stray invite when the user is already a ready member", async () => {
    const u = await makeUser("both@example.com");
    await makeReadyFarm(u.id, "My Farm");
    const otherOwner = await makeUser("otherowner@example.com");
    const otherFarm = await makeReadyFarm(otherOwner.id, "Other Farm");
    await prisma.farmInvite.create({
      data: {
        farmId: otherFarm.id,
        invitedEmail: u.email,
        role: "viewer",
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    expect(await resolveLanding(prisma, { userId: u.id, email: u.email })).toEqual({ kind: "dashboard" });
  });

  it("shows the fork (not the dashboard) when the user explicitly asks to add another farm", async () => {
    const u = await makeUser("adder@example.com");
    await makeReadyFarm(u.id);
    expect(
      await resolveLanding(prisma, { userId: u.id, email: u.email, addIntent: true }),
    ).toEqual({ kind: "choose" });
  });

  it("shows the waiting screen for a user with an open join request and no farm", async () => {
    const u = await makeUser("waiter@example.com");
    const farm = await makeBareFarm("Waiting Farm");
    const req = await prisma.farmJoinRequest.create({
      data: {
        farmId: farm.id,
        userId: u.id,
        requestedEmail: u.email,
        status: "open",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    expect(await resolveLanding(prisma, { userId: u.id, email: u.email })).toEqual({
      kind: "waiting",
      requestId: req.id,
      farmName: "Waiting Farm",
    });
  });

  it("prefers the dashboard over a pending request when the user is already a ready member", async () => {
    const u = await makeUser("memberwithreq@example.com");
    await makeReadyFarm(u.id, "Home Farm");
    const other = await makeBareFarm("Some Other Farm");
    await prisma.farmJoinRequest.create({
      data: {
        farmId: other.id,
        userId: u.id,
        requestedEmail: u.email,
        status: "open",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    expect(await resolveLanding(prisma, { userId: u.id, email: u.email })).toEqual({ kind: "dashboard" });
  });

  it("shows the fork with a declined notice after a recent denial", async () => {
    const u = await makeUser("declined@example.com");
    const farm = await makeBareFarm("Declined Farm");
    await prisma.farmJoinRequest.create({
      data: {
        farmId: farm.id,
        userId: u.id,
        requestedEmail: u.email,
        status: "denied",
        decidedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    expect(await resolveLanding(prisma, { userId: u.id, email: u.email })).toEqual({
      kind: "declined",
      farmName: "Declined Farm",
    });
  });

  it("ages out the declined notice (old denial falls through to choose)", async () => {
    const u = await makeUser("olddeclined@example.com");
    const farm = await makeBareFarm("Old Declined Farm");
    await prisma.farmJoinRequest.create({
      data: {
        farmId: farm.id,
        userId: u.id,
        requestedEmail: u.email,
        status: "denied",
        decidedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago, past the notice window
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect(await resolveLanding(prisma, { userId: u.id, email: u.email })).toEqual({ kind: "choose" });
  });
});
