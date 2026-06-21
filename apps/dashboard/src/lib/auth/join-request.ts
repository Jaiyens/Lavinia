import { randomBytes } from "node:crypto";
import type { FarmRole, PrismaClient } from "@prisma/client";
import { RoleGrantError, assertCanGrantRole, farmRole, roleAtLeast } from "@/lib/auth/access";
import { inviteExpiry } from "@/lib/auth/invite";
import type { TeamActionResult } from "@/lib/auth/team";
import { normalizeEmail } from "@/lib/email-normalize";
import { sendJoinRequest } from "@/lib/email";
import { en } from "@/copy/en";

// The testable request-to-join logic (Phase 2). Each op takes `prisma` + the ACTOR's userId
// explicitly; the "use server" wrappers in account/team/actions.ts resolve the session and
// revalidate. Authorization is re-derived from the target row's farm on every admin op, never from a
// client-supplied scope. The requester ops authorize by ownership of their own request row (they
// have no farm role yet). This file NEVER touches the invite-claim path - a join request is a
// distinct, human-approved grant.

// A new request expires in 14 days, like an invite (reuses inviteExpiry).
const DENY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // a denied requester waits a week before re-asking
const REQUEST_CAP_PER_HOUR = 10; // per requester, across all farms - anti-spray
const JOIN_CODE_LENGTH = 8;
// Phone-readable alphabet: no 0/O/1/I/L/U, so a code read aloud is unambiguous.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export type JoinCodeResult = { ok: true; code: string } | { ok: false; error: string };

function baseUrl(): string {
  return (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://app.tryterra.ai").replace(/\/+$/, "");
}

/** A fresh random join code (not a credential - access still requires admin approval). */
function newJoinCode(): string {
  const bytes = randomBytes(JOIN_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

/** Normalize user-typed code input: uppercase, strip spaces/dashes/punctuation. */
function normalizeJoinCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function mapGuardError(e: unknown): string {
  if (e instanceof RoleGrantError) return en.team.managerLimited;
  return "That did not work. Try again.";
}

/**
 * Resolve a farm by its join code. Returns a UNIFORM null on any miss (bad code, empty, no such
 * farm) so the endpoint can never be used as an oracle to probe which farms exist. The raw code is
 * never echoed back to a non-member.
 */
export async function resolveFarmByJoinCode(
  prisma: PrismaClient,
  rawCode: string,
): Promise<{ farmId: string } | null> {
  const code = normalizeJoinCode(rawCode ?? "");
  if (code.length === 0) return null;
  const farm = await prisma.farm.findUnique({ where: { joinCode: code }, select: { id: true } });
  return farm ? { farmId: farm.id } : null;
}

/** The farm's current join code, generating one on first request. Admin (manager+) only. */
export async function getOrCreateJoinCode(
  prisma: PrismaClient,
  actorUserId: string,
  farmId: string,
): Promise<JoinCodeResult> {
  const actorRole = await farmRole(prisma, farmId, actorUserId);
  if (!actorRole || !roleAtLeast(actorRole, "manager")) return { ok: false, error: en.team.managerLimited };
  const existing = await prisma.farm.findUnique({ where: { id: farmId }, select: { joinCode: true } });
  if (!existing) return { ok: false, error: "That farm no longer exists." };
  if (existing.joinCode) return { ok: true, code: existing.joinCode };
  return setFarmJoinCode(prisma, farmId);
}

/** Replace the join code with a fresh one, invalidating any old link. Admin (manager+) only. */
export async function rotateJoinCode(
  prisma: PrismaClient,
  actorUserId: string,
  farmId: string,
): Promise<JoinCodeResult> {
  const actorRole = await farmRole(prisma, farmId, actorUserId);
  if (!actorRole || !roleAtLeast(actorRole, "manager")) return { ok: false, error: en.team.managerLimited };
  return setFarmJoinCode(prisma, farmId);
}

/** Generate + persist a unique join code, retrying on the (rare) unique collision. */
async function setFarmJoinCode(prisma: PrismaClient, farmId: string): Promise<JoinCodeResult> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newJoinCode();
    try {
      await prisma.farm.update({ where: { id: farmId }, data: { joinCode: code } });
      return { ok: true, code };
    } catch {
      // Unique collision on joinCode (astronomically rare) -> try a different code.
      continue;
    }
  }
  return { ok: false, error: "Could not make a code. Try again." };
}

/**
 * A logged-in, non-invited user asks to join a farm by its code. Calm short-circuits (already a
 * member, already invited, already requested) never error - they explain. A recent denial is on a
 * cooldown; a per-requester rate limit blocks spraying codes. The row is the gate the admin acts on.
 */
export async function createJoinRequest(
  prisma: PrismaClient,
  actorUserId: string,
  rawCode: string,
  message?: string,
): Promise<TeamActionResult> {
  const resolved = await resolveFarmByJoinCode(prisma, rawCode);
  if (!resolved) return { ok: false, error: en.join.outcome.codeNotFound };
  const { farmId } = resolved;

  // Already an active member: nothing to do.
  if (await farmRole(prisma, farmId, actorUserId)) {
    return { ok: false, error: en.join.outcome.alreadyMember };
  }

  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { email: true },
  });
  const email = actor?.email ? normalizeEmail(actor.email) : null;

  // Already invited (by email): the invite auto-claims at sign-in, so route them there instead of
  // opening a competing request.
  if (email) {
    const pendingInvite = await prisma.farmInvite.findFirst({
      where: { farmId, invitedEmail: email, status: "pending", expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (pendingInvite) return { ok: false, error: en.join.outcome.invitePending };
  }

  // Already an open request: idempotent.
  const open = await prisma.farmJoinRequest.findFirst({
    where: { farmId, userId: actorUserId, status: "open" },
    select: { id: true },
  });
  if (open) return { ok: true, message: en.join.outcome.alreadyRequested };

  // Cooldown after a recent denial (anti-harassment): block re-asking the same farm for a week.
  const lastDenied = await prisma.farmJoinRequest.findFirst({
    where: { farmId, userId: actorUserId, status: "denied" },
    orderBy: { decidedAt: "desc" },
    select: { decidedAt: true },
  });
  if (lastDenied?.decidedAt && Date.now() - lastDenied.decidedAt.getTime() < DENY_COOLDOWN_MS) {
    return { ok: false, error: en.join.outcome.denyCooldown };
  }

  // Per-requester rate limit (across all farms): one user cannot spray every code they find.
  const recent = await prisma.farmJoinRequest.count({
    where: { userId: actorUserId, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= REQUEST_CAP_PER_HOUR) return { ok: false, error: en.join.outcome.rateLimited };

  try {
    await prisma.farmJoinRequest.create({
      data: {
        farmId,
        userId: actorUserId,
        requestedEmail: email ?? "",
        proposedRole: "viewer",
        status: "open",
        message: message?.trim() ? message.trim().slice(0, 500) : null,
        expiresAt: inviteExpiry(new Date()),
      },
    });
  } catch {
    // Lost the partial-unique race -> an open request already exists. Treat as success.
    return { ok: true, message: en.join.outcome.alreadyRequested };
  }

  await notifyAdminsOfRequest(prisma, farmId, actorUserId);
  return { ok: true, message: en.join.outcome.submitted };
}

/** Email the farm's admins (owner/manager) that someone asked to join. Best-effort, never throws. */
async function notifyAdminsOfRequest(
  prisma: PrismaClient,
  farmId: string,
  requesterUserId: string,
): Promise<void> {
  const [farm, requester, admins] = await Promise.all([
    prisma.farm.findUnique({ where: { id: farmId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: requesterUserId }, select: { name: true, email: true } }),
    prisma.farmMembership.findMany({
      where: { farmId, status: "active", role: { in: ["owner", "manager"] } },
      select: { user: { select: { email: true } } },
    }),
  ]);
  const farmName = farm?.name?.trim() || "your farm";
  const requesterName = requester?.name?.trim() || requester?.email || "Someone";
  const reviewUrl = `${baseUrl()}/account/team`;
  for (const a of admins) {
    const to = a.user?.email;
    if (to) await sendJoinRequest({ to, farmName, requesterName, reviewUrl });
  }
}

/**
 * An admin approves an open request, granting the chosen role (capped by assertCanGrantRole, default
 * the proposed viewer). Reuses the same conflict-safe membership write as the invite claim, with one
 * deliberate difference: a previously-REMOVED member is re-activated with the freshly chosen role
 * (the admin is re-deciding), while an already-ACTIVE member is never silently re-roled.
 */
export async function approveJoinRequest(
  prisma: PrismaClient,
  actorUserId: string,
  requestId: string,
  grantedRole: FarmRole,
): Promise<TeamActionResult> {
  const req = await prisma.farmJoinRequest.findUnique({
    where: { id: requestId },
    select: { farmId: true, userId: true, status: true, expiresAt: true },
  });
  if (!req || req.status !== "open") return { ok: false, error: en.join.outcome.requestGone };
  if (req.expiresAt.getTime() <= Date.now()) return { ok: false, error: en.join.outcome.requestGone };

  const actorRole = await farmRole(prisma, req.farmId, actorUserId);
  if (!actorRole || !roleAtLeast(actorRole, "manager")) return { ok: false, error: en.team.managerLimited };
  try {
    assertCanGrantRole(actorRole, null, grantedRole);
  } catch (e) {
    return { ok: false, error: mapGuardError(e) };
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const existing = await tx.farmMembership.findUnique({
          where: { farmId_userId: { farmId: req.farmId, userId: req.userId } },
          select: { id: true, status: true },
        });
        if (!existing) {
          await tx.farmMembership.create({
            data: {
              farmId: req.farmId,
              userId: req.userId,
              role: grantedRole,
              status: "active",
              invitedById: actorUserId,
            },
          });
        } else if (existing.status === "removed") {
          // Re-admit: the admin is deliberately re-deciding, so honor the chosen role.
          await tx.farmMembership.update({
            where: { id: existing.id },
            data: { status: "active", role: grantedRole, removedAt: null, invitedById: actorUserId },
          });
        }
        // existing && active -> keep their current role (never silently re-role an active member).
        await tx.farmJoinRequest.updateMany({
          where: { id: requestId, status: "open" },
          data: { status: "approved", decidedAt: new Date(), decidedByUserId: actorUserId },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch {
    return { ok: false, error: "That did not work. Try again." };
  }
  return { ok: true, message: en.team.requestApproved };
}

/** An admin declines an open request (terminal; triggers the requester's deny cooldown). */
export async function denyJoinRequest(
  prisma: PrismaClient,
  actorUserId: string,
  requestId: string,
): Promise<TeamActionResult> {
  const req = await prisma.farmJoinRequest.findUnique({
    where: { id: requestId },
    select: { farmId: true, status: true },
  });
  if (!req || req.status !== "open") return { ok: false, error: en.join.outcome.requestGone };
  const actorRole = await farmRole(prisma, req.farmId, actorUserId);
  if (!actorRole || !roleAtLeast(actorRole, "manager")) return { ok: false, error: en.team.managerLimited };
  await prisma.farmJoinRequest.updateMany({
    where: { id: requestId, status: "open" },
    data: { status: "denied", decidedAt: new Date(), decidedByUserId: actorUserId },
  });
  return { ok: true, message: en.team.requestDenied };
}

/** The requester cancels their own open request (no farm role needed - they own the row). */
export async function cancelJoinRequest(
  prisma: PrismaClient,
  actorUserId: string,
  requestId: string,
): Promise<TeamActionResult> {
  const res = await prisma.farmJoinRequest.updateMany({
    where: { id: requestId, userId: actorUserId, status: "open" },
    data: { status: "cancelled", decidedAt: new Date() },
  });
  if (res.count === 0) return { ok: false, error: en.join.outcome.requestGone };
  return { ok: true };
}
