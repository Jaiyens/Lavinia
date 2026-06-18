"use server";

// Server Actions for the (app) shell (AR-11). Mutations return the discriminated
// ActionResult instead of throwing for expected failures (a stale id, a farm
// mismatch); unexpected errors still propagate to the error boundary. Reads stay in
// Server Components; this file owns writes only.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dashboardFarm } from "@/lib/onboarding/farm";
import { acceptanceResult } from "@/lib/recommendations/result";
import { ALMOND_NUDGE_COOKIE } from "@/lib/almond/nudge";
import { en } from "@/copy/en";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

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
  // Owner-scope on the same session: resolve only THIS operator's farm, so a finding can
  // never be matched against (or resolved on) another grower's farm.
  const resolved = await dashboardFarm(prisma, session.user.id);
  if (resolved === null) {
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
