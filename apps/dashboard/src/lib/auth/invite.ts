import type { PrismaClient } from "@prisma/client";
import { normalizeEmail } from "@/lib/email-normalize";

// The invite-claim core: where a pending FarmInvite becomes a real FarmMembership. This is the
// ONLY place access is granted from an invite, and it runs only inside events.signIn (auth.ts) -
// i.e. AFTER the signIn callback has already proven the email is verified (Google email_verified
// is required there; a magic-link sign-in proves inbox control by construction). Matching is on
// the normalized email ONLY, so a sign-in as a different address can never claim someone else's
// invite. This is the "logins can never be combined" guarantee.

/** Invites live 14 days; the claim and the allowlist check both filter on expiry. */
export const INVITE_TTL_DAYS = 14;

export function inviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Whether this email has standing to sign in BEYOND the static allowlist: an active membership, or
 * a pending non-expired invite. Lets an invited teammate sign in during the pre-launch lockdown
 * (the user's chosen behavior) without auto-inserting them into the static allowlist (so a revoke
 * is total - no orphaned sign-in standing).
 */
export async function emailHasFarmAccess(
  prisma: PrismaClient,
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const [membership, invite] = await Promise.all([
    prisma.farmMembership.findFirst({
      where: { status: "active", user: { email: normalized } },
      select: { id: true },
    }),
    prisma.farmInvite.findFirst({
      where: { invitedEmail: normalized, status: "pending", expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
  ]);
  return membership !== null || invite !== null;
}

/**
 * Convert every pending, non-expired invite for this signed-in user's email into an active
 * membership, and mark each invite accepted. Idempotent: the membership upsert is keyed on the
 * unique (farmId, userId), and an already-claimed invite is no longer pending, so re-running on a
 * later sign-in is a no-op. Returns how many invites were newly claimed.
 *
 * The role written is the one RECORDED ON THE INVITE (capped at issue time by assertCanGrantRole),
 * never re-derived from any client input. If the user is already a member of that farm, their
 * existing role is kept (update: {}), so a stale invite can never silently change a role.
 */
export async function claimInvitesForUser(
  prisma: PrismaClient,
  user: { id: string; email: string | null | undefined },
): Promise<number> {
  if (!user.id || !user.email) return 0;
  const email = normalizeEmail(user.email);
  const invites = await prisma.farmInvite.findMany({
    where: { invitedEmail: email, status: "pending", expiresAt: { gt: new Date() } },
  });
  let claimed = 0;
  for (const inv of invites) {
    await prisma.$transaction(async (tx) => {
      await tx.farmMembership.upsert({
        where: { farmId_userId: { farmId: inv.farmId, userId: user.id } },
        update: {}, // already a member: keep their existing role, never downgrade/upgrade silently
        create: {
          farmId: inv.farmId,
          userId: user.id,
          role: inv.role,
          status: "active",
          invitedById: inv.invitedById,
        },
      });
      await tx.farmInvite.update({
        where: { id: inv.id },
        data: { status: "accepted", acceptedAt: new Date(), acceptedByUserId: user.id },
      });
    });
    claimed++;
  }
  return claimed;
}
