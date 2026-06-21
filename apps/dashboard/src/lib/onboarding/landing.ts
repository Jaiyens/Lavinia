import type { PrismaClient } from "@prisma/client";
import { normalizeEmail } from "@/lib/email-normalize";
import { currentFarm, resumableOnboardingFarm } from "@/lib/onboarding/farm";

// The single routing brain for a freshly-authenticated user: where do they go after sign-in?
// Today the dashboard layout collapses every farm-less state into one redirect to onboarding;
// this resolver splits that into the distinct states the /start fork sorts. It is the ONE place
// that decides the post-login destination, so the layout stays a dumb "no farm -> /start" and
// /start owns the fine sort. Pure-ish (takes an explicit PrismaClient, like every onboarding edge)
// so it is unit/db-testable.
//
// First match wins. The ordering is what makes the fork safe:
//  1. A ready, accessible farm always wins (so a ready member - including an invited teammate -
//     can never be stranded on the choice screen).
//  2. An owner mid-onboarding resumes their own in-progress farm rather than starting a new one.
//  3. A stray, unclaimed invite self-heals (the events.signIn claim normally already handled it).
//  4. Otherwise the brand-new user sees the Create-vs-Join fork.
//
// `addIntent` is the one deliberate bypass: a returning user who tapped "+ Add a farm" wants the
// fork even though they already have a ready farm, so we skip straight to "choose".

export type Landing =
  | { kind: "dashboard" } // has an accessible + ready farm -> render the dashboard / redirect to /
  | { kind: "resume"; farmId: string } // owner mid-onboarding -> resume /onboarding
  | { kind: "invite"; count: number } // pending unclaimed invite -> claim it, then /
  | { kind: "choose" }; // brand-new (or explicitly adding another) -> the fork
// Phase 2 extends this union with { kind: "waiting" } / { kind: "declined" } for request-to-join.

export async function resolveLanding(
  prisma: PrismaClient,
  opts: {
    userId: string | null | undefined;
    email: string | null | undefined;
    activeFarmId?: string | null;
    /** The user explicitly asked to start/join ANOTHER farm (e.g. "+ Add a farm"). */
    addIntent?: boolean;
  },
): Promise<Landing> {
  const { userId, email, activeFarmId = null, addIntent = false } = opts;
  if (!userId) return { kind: "choose" };

  // Deliberate bypass: a returning user adding another farm always sees the fork, never their
  // existing farm or a stray invite.
  if (addIntent) return { kind: "choose" };

  // 1. Ready, accessible farm wins (covers invited members, whose membership + the owner's
  //    finalized connection make currentFarm non-null).
  const ready = await currentFarm(prisma, userId, activeFarmId);
  if (ready) return { kind: "dashboard" };

  // 2. Owner mid-onboarding: resume their own in-progress farm. A brand-new user owns no such
  //    farm and falls through; a join-requester likewise owns none.
  const resume = await resumableOnboardingFarm(prisma, userId);
  if (resume) return { kind: "resume", farmId: resume.farmId };

  // 3. Stray, unclaimed invite. claimInvitesForUser runs in events.signIn and is normally already
  //    done; if that best-effort hook threw, a pending non-expired invite for this email exists
  //    with no membership. Surfacing it lets /start re-run the idempotent claim and self-heal.
  if (email) {
    const pending = await prisma.farmInvite.count({
      where: { invitedEmail: normalizeEmail(email), status: "pending", expiresAt: { gt: new Date() } },
    });
    if (pending > 0) return { kind: "invite", count: pending };
  }

  // 4. Brand-new: show the Create-vs-Join fork.
  return { kind: "choose" };
}
