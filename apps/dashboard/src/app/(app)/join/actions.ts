"use server";

// Thin "use server" wrappers over the requester-facing request-to-join ops. createJoinRequest is
// called from the /join code-entry page; cancelJoinRequest from the /start waiting screen. The
// session read is the only thing that happens here; the op re-derives the farm from the code / the
// request row and authorizes by ownership.

import { revalidatePath } from "next/cache";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as joinOps from "@/lib/auth/join-request";
import type { TeamActionResult } from "@/lib/auth/team";
import { en } from "@/copy/en";

const SIGNED_OUT: TeamActionResult = { ok: false, error: en.join.outcome.requestGone };

export async function createJoinRequestAction(
  rawCode: string,
  message?: string,
): Promise<TeamActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGNED_OUT;
  const result = await joinOps.createJoinRequest(prisma, userId, rawCode, message);
  // A new (or already-open) request flips /start to the waiting screen on the next navigation.
  if (result.ok) revalidatePath("/start");
  return result;
}

export async function cancelJoinRequestAction(requestId: string): Promise<TeamActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGNED_OUT;
  const result = await joinOps.cancelJoinRequest(prisma, userId, requestId);
  if (result.ok) revalidatePath("/start");
  return result;
}
