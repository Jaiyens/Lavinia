import type { FarmRole, PrismaClient } from "@prisma/client";
import {
  RoleGrantError,
  assertCanGrantRole,
  assertCanManageMember,
  farmRole,
  roleAtLeast,
} from "@/lib/auth/access";
import { inviteExpiry } from "@/lib/auth/invite";
import { LastOwnerError, assertNotLastOwner, parseEmailList, type TeamActionResult } from "@/lib/auth/team";
import { sendFarmInvite } from "@/lib/email";
import { en } from "@/copy/en";

// The testable team-management logic. Each op takes `prisma` + the ACTOR's userId explicitly (the
// "use server" actions in account/team/actions.ts are thin wrappers that resolve the session and
// revalidate). Every op re-derives the tenant from the target row and authorizes the actor's role
// on THAT farm - a client-supplied id is never trusted as the authorization scope. "Owners AND
// managers manage the team", but a manager can never grant above manager nor act on an owner.

const VALID_ROLES: readonly FarmRole[] = ["owner", "manager", "viewer"];
const INVITE_CAP_PER_HOUR = 50;

function baseUrl(): string {
  return (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://app.tryterra.ai").replace(/\/+$/, "");
}

function mapGuardError(e: unknown): string {
  if (e instanceof LastOwnerError) return en.team.lastOwner;
  if (e instanceof RoleGrantError) return en.team.managerLimited;
  return "That did not work. Try again.";
}

async function inviterIdentity(prisma: PrismaClient, userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return u?.name?.trim() || u?.email || "A teammate";
}

async function farmDisplayName(prisma: PrismaClient, farmId: string): Promise<string> {
  const f = await prisma.farm.findUnique({ where: { id: farmId }, select: { name: true } });
  return f?.name?.trim() || "your farm";
}

export async function inviteMembers(
  prisma: PrismaClient,
  actorUserId: string,
  farmId: string,
  rawEmails: string,
  role: FarmRole,
): Promise<TeamActionResult> {
  const actorRole = await farmRole(prisma, farmId, actorUserId);
  if (!actorRole || !roleAtLeast(actorRole, "manager")) return { ok: false, error: en.team.managerLimited };
  if (!VALID_ROLES.includes(role)) return { ok: false, error: "Pick a role." };
  try {
    assertCanGrantRole(actorRole, null, role);
  } catch (e) {
    return { ok: false, error: mapGuardError(e) };
  }

  const { valid, invalid } = parseEmailList(rawEmails);
  const firstInvalid = invalid[0];
  if (firstInvalid !== undefined) return { ok: false, error: en.team.invalidEmail(firstInvalid) };
  if (valid.length === 0) return { ok: false, error: "Add at least one email." };

  const recent = await prisma.farmInvite.count({
    where: { farmId, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= INVITE_CAP_PER_HOUR) {
    return { ok: false, error: "Too many invites in the last hour. Try again later." };
  }

  const name = await farmDisplayName(prisma, farmId);
  const inviterName = await inviterIdentity(prisma, actorUserId);

  let sent = 0;
  for (const email of valid) {
    const member = await prisma.farmMembership.findFirst({
      where: { farmId, status: "active", user: { email } },
      select: { id: true },
    });
    if (member) continue;
    const pending = await prisma.farmInvite.findFirst({
      where: { farmId, invitedEmail: email, status: "pending" },
      select: { id: true },
    });
    if (pending) continue;
    try {
      await prisma.farmInvite.create({
        data: { farmId, invitedEmail: email, role, invitedById: actorUserId, expiresAt: inviteExpiry(new Date()) },
      });
    } catch {
      continue; // lost the partial-unique race -> already pending
    }
    await sendFarmInvite({ to: email, farmName: name, inviterName, url: `${baseUrl()}/login?invited=1` });
    sent++;
  }

  return { ok: true, message: sent === 0 ? en.team.alreadyOnTeam : en.team.added(sent) };
}

export async function resendInvite(
  prisma: PrismaClient,
  actorUserId: string,
  inviteId: string,
): Promise<TeamActionResult> {
  const invite = await prisma.farmInvite.findUnique({
    where: { id: inviteId },
    select: { farmId: true, invitedEmail: true, role: true, status: true },
  });
  if (!invite || invite.status !== "pending") return { ok: false, error: "That invite is no longer pending." };
  const actorRole = await farmRole(prisma, invite.farmId, actorUserId);
  if (!actorRole || !roleAtLeast(actorRole, "manager")) return { ok: false, error: en.team.managerLimited };
  try {
    assertCanGrantRole(actorRole, null, invite.role);
  } catch (e) {
    return { ok: false, error: mapGuardError(e) };
  }
  await sendFarmInvite({
    to: invite.invitedEmail,
    farmName: await farmDisplayName(prisma, invite.farmId),
    inviterName: await inviterIdentity(prisma, actorUserId),
    url: `${baseUrl()}/login?invited=1`,
  });
  return { ok: true, message: en.team.added(1) };
}

export async function revokeInvite(
  prisma: PrismaClient,
  actorUserId: string,
  inviteId: string,
): Promise<TeamActionResult> {
  const invite = await prisma.farmInvite.findUnique({
    where: { id: inviteId },
    select: { farmId: true, role: true },
  });
  if (!invite) return { ok: false, error: "That invite no longer exists." };
  const actorRole = await farmRole(prisma, invite.farmId, actorUserId);
  if (!actorRole || !roleAtLeast(actorRole, "manager")) return { ok: false, error: en.team.managerLimited };
  try {
    assertCanGrantRole(actorRole, null, invite.role);
  } catch (e) {
    return { ok: false, error: mapGuardError(e) };
  }
  await prisma.farmInvite.updateMany({ where: { id: inviteId, status: "pending" }, data: { status: "revoked" } });
  return { ok: true };
}

export async function changeRole(
  prisma: PrismaClient,
  actorUserId: string,
  membershipId: string,
  newRole: FarmRole,
): Promise<TeamActionResult> {
  if (!VALID_ROLES.includes(newRole)) return { ok: false, error: "Pick a role." };
  const target = await prisma.farmMembership.findUnique({
    where: { id: membershipId },
    select: { farmId: true, userId: true, role: true, status: true },
  });
  if (!target || target.status !== "active") return { ok: false, error: "That person is not on the team." };
  const actorRole = await farmRole(prisma, target.farmId, actorUserId);
  if (!actorRole || !roleAtLeast(actorRole, "manager")) return { ok: false, error: en.team.managerLimited };
  try {
    assertCanGrantRole(actorRole, target.role, newRole);
  } catch (e) {
    return { ok: false, error: mapGuardError(e) };
  }
  if (target.role === newRole) return { ok: true };
  try {
    await prisma.$transaction(
      async (tx) => {
        if (target.role === "owner" && newRole !== "owner") {
          await assertNotLastOwner(tx, target.farmId, target.userId);
        }
        await tx.farmMembership.update({ where: { id: membershipId }, data: { role: newRole } });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    return { ok: false, error: mapGuardError(e) };
  }
  return { ok: true };
}

export async function removeMember(
  prisma: PrismaClient,
  actorUserId: string,
  membershipId: string,
): Promise<TeamActionResult> {
  const target = await prisma.farmMembership.findUnique({
    where: { id: membershipId },
    select: { farmId: true, userId: true, role: true, status: true },
  });
  if (!target || target.status !== "active") return { ok: false, error: "That person is not on the team." };
  const actorRole = await farmRole(prisma, target.farmId, actorUserId);
  if (!actorRole || !roleAtLeast(actorRole, "manager")) return { ok: false, error: en.team.managerLimited };
  try {
    assertCanManageMember(actorRole, target.role);
  } catch (e) {
    return { ok: false, error: mapGuardError(e) };
  }
  try {
    await prisma.$transaction(
      async (tx) => {
        if (target.role === "owner") await assertNotLastOwner(tx, target.farmId, target.userId);
        await tx.farmMembership.update({
          where: { id: membershipId },
          data: { status: "removed", removedAt: new Date() },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    return { ok: false, error: mapGuardError(e) };
  }
  return { ok: true };
}

export async function leaveFarm(
  prisma: PrismaClient,
  actorUserId: string,
  farmId: string,
): Promise<TeamActionResult> {
  const mine = await prisma.farmMembership.findUnique({
    where: { farmId_userId: { farmId, userId: actorUserId } },
    select: { id: true, role: true, status: true },
  });
  if (!mine || mine.status !== "active") return { ok: false, error: "You are not on this team." };
  try {
    await prisma.$transaction(
      async (tx) => {
        if (mine.role === "owner") await assertNotLastOwner(tx, farmId, actorUserId);
        await tx.farmMembership.update({
          where: { id: mine.id },
          data: { status: "removed", removedAt: new Date() },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    return { ok: false, error: mapGuardError(e) };
  }
  return { ok: true };
}

export async function transferOwnership(
  prisma: PrismaClient,
  actorUserId: string,
  membershipId: string,
): Promise<TeamActionResult> {
  const target = await prisma.farmMembership.findUnique({
    where: { id: membershipId },
    select: { farmId: true, userId: true, status: true },
  });
  if (!target || target.status !== "active") return { ok: false, error: "That person is not on the team." };
  if (target.userId === actorUserId) return { ok: true };
  const actorRole = await farmRole(prisma, target.farmId, actorUserId);
  if (actorRole !== "owner") return { ok: false, error: en.team.cannotActOnOwner };
  await prisma.$transaction(
    async (tx) => {
      await tx.farmMembership.update({ where: { id: membershipId }, data: { role: "owner" } });
      await tx.farmMembership.updateMany({
        where: { farmId: target.farmId, userId: actorUserId, role: "owner", status: "active" },
        data: { role: "manager" },
      });
      await tx.farm.update({ where: { id: target.farmId }, data: { userId: target.userId } });
    },
    { isolationLevel: "Serializable" },
  );
  return { ok: true };
}
