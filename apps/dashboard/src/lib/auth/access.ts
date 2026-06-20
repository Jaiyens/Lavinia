import type { FarmRole, PrismaClient } from "@prisma/client";

// The ONE place the tenant access predicate lives. Every farm read/write authorizes through
// these helpers (replacing the old ad-hoc ownsFarm checks), so there is a single, auditable gate
// rather than a scatter of per-call-site queries that can drift.
//
// Access is a FarmMembership with status "active". The JWT carries only the user id, and these
// helpers hit the DB on every call, so removing a member or changing a role takes effect on their
// very next request - nothing is cached in the token that could bypass this.

// Strict superset ordering: owner ⊃ manager ⊃ viewer.
const RANK: Record<FarmRole, number> = { viewer: 0, manager: 1, owner: 2 };

/** Whether a (possibly null) role meets a minimum rank. */
export function roleAtLeast(role: FarmRole | null, min: FarmRole): boolean {
  return role !== null && RANK[role] >= RANK[min];
}

/** The signed-in user's effective role on a farm, or null when they have no active membership. */
export async function farmRole(
  prisma: PrismaClient,
  farmId: string,
  userId: string | null | undefined,
): Promise<FarmRole | null> {
  if (!userId) return null;
  const membership = await prisma.farmMembership.findUnique({
    where: { farmId_userId: { farmId, userId } },
    select: { role: true, status: true },
  });
  return membership && membership.status === "active" ? membership.role : null;
}

/** Any active membership of any role - the read gate. */
export async function canAccessFarm(
  prisma: PrismaClient,
  farmId: string,
  userId: string | null | undefined,
): Promise<boolean> {
  return (await farmRole(prisma, farmId, userId)) !== null;
}

/** True iff the caller holds an active role at least `min` on the farm - the write gate. */
export async function requireRole(
  prisma: PrismaClient,
  farmId: string,
  userId: string | null | undefined,
  min: FarmRole,
): Promise<boolean> {
  return roleAtLeast(await farmRole(prisma, farmId, userId), min);
}

/** Thrown when a member-management action would violate a role rule. */
export class RoleGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleGrantError";
  }
}

/**
 * Whether an actor may act on a target member (remove / change role / demote). Encodes the
 * owner-protection rule the product wants: owners AND managers manage the team, but a manager
 * may never touch an OWNER (only an owner can remove, demote, or promote past an owner). A
 * manager may act on viewers and other managers.
 */
export function canActOnMember(actorRole: FarmRole, targetCurrentRole: FarmRole | null): boolean {
  if (targetCurrentRole === "owner") return actorRole === "owner";
  return RANK[actorRole] >= RANK.manager;
}

/** Guard for removing/affecting a member; throws on violation. */
export function assertCanManageMember(
  actorRole: FarmRole,
  targetCurrentRole: FarmRole | null,
): void {
  if (!canActOnMember(actorRole, targetCurrentRole)) {
    throw new RoleGrantError("only an owner can manage an owner");
  }
}

/**
 * Guard for granting/changing a role (invite + change-role); throws on violation. You may never
 * grant a role above your own, only an owner may grant the owner role, and a manager may not act
 * on a current owner. (For a fresh invite, pass targetCurrentRole = null.)
 */
export function assertCanGrantRole(
  actorRole: FarmRole,
  targetCurrentRole: FarmRole | null,
  requestedRole: FarmRole,
): void {
  assertCanManageMember(actorRole, targetCurrentRole);
  if (RANK[requestedRole] > RANK[actorRole]) {
    throw new RoleGrantError("cannot grant a role above your own");
  }
  if (requestedRole === "owner" && actorRole !== "owner") {
    throw new RoleGrantError("only an owner can grant the owner role");
  }
}
