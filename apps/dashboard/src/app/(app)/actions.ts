"use server";

// Server Actions for the (app) shell (AR-11). Mutations return the discriminated
// ActionResult instead of throwing for expected failures (a stale id, a farm
// mismatch); unexpected errors still propagate to the error boundary. Reads stay in
// Server Components; this file owns writes only.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { auth, sessionUserId, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessFarm, requireRole } from "@/lib/auth/access";
import { ACTIVE_FARM_COOKIE, activeFarmId } from "@/lib/auth/active-farm";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { acceptanceResult } from "@/lib/recommendations/result";
import { importBillUpload } from "@/lib/onboarding/sources";
import { runSolarInsight } from "@/lib/recommendations/run-solar-insight";
import { ALMOND_NUDGE_COOKIE } from "@/lib/almond/nudge";
import { MEMBER_WELCOME_COOKIE } from "@/lib/member-welcome";
import { en } from "@/copy/en";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Same secure-cookie rule as the session cookie (auth.config.ts): __Secure on https, plain on
// the http e2e/local dev. Keeps the active-farm cookie's flags consistent with the session.
const useSecureCookies =
  Boolean(process.env.VERCEL) ||
  (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "").startsWith("https://");

/**
 * Set the active farm for a user who can open more than one. Validates membership BEFORE writing
 * the cookie (never echoes a farm the caller is not a member of), so the switcher can never be
 * used to widen access. The reader (activeFarmId) re-validates on every read too.
 */
export async function setActiveFarmAction(farmId: string): Promise<void> {
  const userId = await sessionUserId();
  if (!userId) return;
  if (!(await canAccessFarm(prisma, farmId, userId))) return;
  const store = await cookies();
  store.set(ACTIVE_FARM_COOKIE, farmId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: useSecureCookies,
  });
  revalidatePath("/", "layout");
}

/**
 * End the session and return to the sign-in page (Story 5.1). The shell renders a
 * sign-out control that posts to this action.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

/**
 * Mark the first-run Almond nudge as seen (Story 10.2). Sets an httpOnly cookie so the server gate
 * (`shouldShowAlmondNudge`) hides the nudge before render on every later view — it never reappears.
 * Re-checks `auth()` like the other shell actions (a Server Action is independently reachable). A
 * no-op for an unauthenticated caller (the nudge is owner-only); the client also self-hides at once,
 * so this write is fire-and-forget and never blocks the grower.
 */
export async function dismissAlmondNudgeAction(): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  const store = await cookies();
  store.set(ALMOND_NUDGE_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // one year — a one-time hint, remembered
  });
}

/**
 * Dismiss the invited-member welcome banner (a one-time "you have been added to {farm}" hint shown
 * on Home). Same fire-and-forget shape as the Almond nudge: re-checks auth, persists an httpOnly
 * cookie read server-side so the banner never flashes after dismissal, and the client self-hides.
 */
export async function dismissMemberWelcomeAction(): Promise<void> {
  const session = await auth();
  if (!session?.user) return;
  const store = await cookies();
  store.set(MEMBER_WELCOME_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // one year — a one-time hint, remembered
  });
}

/** The one-tap responses a finding card offers in v1 (records, never executes). */
export type FindingResponse = "done" | "dismissed";

/**
 * Record the grower's one-tap response to a finding (Story 3.1, AC2). Verifies the
 * recommendation belongs to the resolved dashboard farm (the id arrives from the
 * client) and that it is still pending, then stamps status + resolvedAt and
 * revalidates the shell so the rail, sheet, and drawer re-render without the card.
 */
export async function resolveFinding(
  id: string,
  response: FindingResponse,
): Promise<ActionResult<null>> {
  // AC3: a Server Action is a POST endpoint reachable independently of the page that
  // rendered it, so it re-checks the session itself rather than trusting the layout gate.
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: en.shell.findings.respondError };
  }
  // Runtime guards: both values cross the network, so neither is trusted. A malformed
  // payload returns the calm error instead of throwing into Prisma.
  if (typeof id !== "string" || (response !== "done" && response !== "dismissed")) {
    return { ok: false, error: en.shell.findings.respondError };
  }
  // Membership-scope on the same session: resolve only a farm THIS operator is a member of (the
  // one selected by the active-farm cookie), so a finding can never be matched against (or
  // resolved on) another grower's farm.
  const userId = session.user.id;
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (resolved === null) {
    return { ok: false, error: en.shell.findings.respondError };
  }
  // Responding to a finding is a WRITE: viewers are read-only, so require manager or owner.
  if (!(await requireRole(prisma, resolved.farm.id, userId, "manager"))) {
    return { ok: false, error: en.shell.findings.respondError };
  }
  // FR-20 AC1: on ACCEPTANCE (done), freeze the predicted impact into `result` in the
  // SAME write that resolves the finding, so a later engine re-run cannot rewrite the
  // number we showed the grower. Read impactUsd off the still-pending row first; a
  // dismissed response records nothing (the grower rejected it - no impact to track).
  let resultSnapshot: Prisma.InputJsonValue | undefined;
  if (response === "done") {
    const row = await prisma.recommendation.findFirst({
      where: { id, farmId: resolved.farm.id, status: "pending" },
      select: { impactUsd: true },
    });
    if (row !== null) {
      resultSnapshot = acceptanceResult({ impactUsd: row.impactUsd }) as Prisma.InputJsonValue;
    }
  }
  // Atomic: the farm-ownership and still-pending gates live in the WHERE itself, so two
  // card instances of the same finding (rail + drawer, or two tabs) cannot both pass a
  // separate check and overwrite each other's response - the first write wins.
  await prisma.recommendation.updateMany({
    where: { id, farmId: resolved.farm.id, status: "pending" },
    data: {
      status: response,
      resolvedAt: new Date(),
      ...(resultSnapshot !== undefined ? { result: resultSnapshot } : {}),
    },
  });
  // A zero-row update means the finding was already resolved (or was never this farm's): nothing
  // changed, and the refresh below clears any stale card. Treat it as settled rather
  // than alarming the grower with a failure for an outcome that already happened.
  // The findings load in the (app) LAYOUT, so revalidate the layout, not just "/" the
  // page - responding from /energy must refresh the rail/sheet/drawer too.
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

/** The state the true-up statement upload form reports back (G-3). `error` is shown inline (a bad
 *  file or a no-match); `settled` is the calm confirmation that a dollar flipped from honest-blank. */
export type StatementUploadState = { error?: string; settled?: boolean };

/**
 * Upload a true-up statement PDF and settle the dollar (G-3, FR37/FR28). Routes the PDF through the
 * EXISTING fail-closed extract pipeline (`importBillUpload` -> `runExtraction`/`persistExtraction`,
 * which persists `NemPeriod.amountCents` + `Pump.trueUpAmountCents`), so the PDF never touches the
 * repo, client, or anything the agent can read (NFR10) and the settle logic is inherited, not
 * re-implemented. Role-gated to owner/manager (`requireRole`). On an EXACT match the dollar surfaces
 * flip from honest-blank to settled (we re-run `runSolarInsight` so the F2 demand surface re-derives
 * over the now-settled facts); an unmatched or unreadable statement leaves every dollar honest-blank
 * and returns a needs-review note, never a partial or guessed figure. We detect a real settle by
 * comparing the count of settled NEM facts before and after - if nothing settled, we report
 * needs-review rather than claim a flip.
 */
export async function uploadTrueUpStatementAction(
  _prev: StatementUploadState,
  formData: FormData,
): Promise<StatementUploadState> {
  // A Server Action is independently reachable, so it re-checks the session and the role itself.
  const session = await auth();
  if (!session?.user) return { error: en.solar.statementUpload.denied };
  const userId = session.user.id;
  const activeId = await activeFarmId(userId);
  const resolved = await dashboardFarm(prisma, userId, activeId);
  if (resolved === null) return { error: en.solar.statementUpload.denied };
  const farmId = resolved.farm.id;
  // Uploading a statement is a WRITE that settles a dollar: viewers are read-only (owner/manager only).
  if (!(await requireRole(prisma, farmId, userId, "manager"))) {
    return { error: en.solar.statementUpload.denied };
  }

  // Require an actual file (a no-file submit must not re-run the import on nothing).
  const file = formData
    .getAll("statement")
    .find((f): f is File => f instanceof File && f.size > 0);
  if (!file) return { error: en.solar.statementUpload.error };

  // The count of settled true-up facts BEFORE the upload, to detect whether anything actually
  // settled (an exact match) vs the extract finding nothing matchable (needs-review).
  const settledBefore = await prisma.pump.count({
    where: { farmId, trueUpAmountCents: { not: null } },
  });

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    // The same fail-closed extract pipeline the bill upload uses. It persists NemPeriod +
    // trueUpAmountCents only where it matches a meter exactly; an unmatched/malformed extract
    // leaves the figures untouched (honest-blank stays honest-blank).
    await importBillUpload(prisma, farmId, bytes);
  } catch {
    return { error: en.solar.statementUpload.needsReview };
  }

  const settledAfter = await prisma.pump.count({
    where: { farmId, trueUpAmountCents: { not: null } },
  });

  if (settledAfter <= settledBefore) {
    // Nothing new settled: the statement did not match a meter exactly. Honest-blank stays, no guess.
    return { error: en.solar.statementUpload.needsReview };
  }

  // A real settle: re-derive the solar findings so the F2 demand surface reflects the settled facts,
  // then revalidate so every honest-blank cell that just flipped re-renders as settled.
  await runSolarInsight(prisma, farmId);
  revalidatePath("/", "layout");
  return { settled: true };
}
