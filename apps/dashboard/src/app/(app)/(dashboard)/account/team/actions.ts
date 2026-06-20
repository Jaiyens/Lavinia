"use server";

// Thin "use server" wrappers over the testable team-management ops in src/lib/auth/team-ops.ts.
// Each resolves the signed-in actor, delegates the authorization + mutation to the op (which
// re-derives the tenant from the target row and gates on the actor's role), and revalidates the
// team page on success. The session read is the only thing that must happen here, not in the op.

import { revalidatePath } from "next/cache";
import type { FarmRole } from "@prisma/client";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as ops from "@/lib/auth/team-ops";
import type { TeamActionResult } from "@/lib/auth/team";
import { en } from "@/copy/en";

const TEAM_PATH = "/account/team";

const SIGNED_OUT: TeamActionResult = { ok: false, error: en.team.managerLimited };

export async function inviteMembersAction(
  farmId: string,
  rawEmails: string,
  role: FarmRole,
): Promise<TeamActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGNED_OUT;
  const result = await ops.inviteMembers(prisma, userId, farmId, rawEmails, role);
  if (result.ok) revalidatePath(TEAM_PATH);
  return result;
}

export async function resendInviteAction(inviteId: string): Promise<TeamActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGNED_OUT;
  return ops.resendInvite(prisma, userId, inviteId);
}

export async function revokeInviteAction(inviteId: string): Promise<TeamActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGNED_OUT;
  const result = await ops.revokeInvite(prisma, userId, inviteId);
  if (result.ok) revalidatePath(TEAM_PATH);
  return result;
}

export async function changeRoleAction(membershipId: string, newRole: FarmRole): Promise<TeamActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGNED_OUT;
  const result = await ops.changeRole(prisma, userId, membershipId, newRole);
  if (result.ok) revalidatePath(TEAM_PATH);
  return result;
}

export async function removeMemberAction(membershipId: string): Promise<TeamActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGNED_OUT;
  const result = await ops.removeMember(prisma, userId, membershipId);
  if (result.ok) revalidatePath(TEAM_PATH);
  return result;
}

export async function leaveFarmAction(farmId: string): Promise<TeamActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGNED_OUT;
  const result = await ops.leaveFarm(prisma, userId, farmId);
  if (result.ok) revalidatePath(TEAM_PATH);
  return result;
}

export async function transferOwnershipAction(membershipId: string): Promise<TeamActionResult> {
  const userId = await sessionUserId();
  if (!userId) return SIGNED_OUT;
  const result = await ops.transferOwnership(prisma, userId, membershipId);
  if (result.ok) revalidatePath(TEAM_PATH);
  return result;
}
