import type { Prisma } from "@prisma/client";
import { normalizeEmail } from "@/lib/email-normalize";

// Pure / DB helpers shared by the team-management server actions. Kept out of the "use server"
// actions file (whose every export must be a server action) so they can be unit/db tested directly.

export type TeamActionResult = { ok: true; message?: string } | { ok: false; error: string };

// Pragmatic email shape check: one @, a dot in the domain, no spaces. Validation is for catching a
// typo before a real stranger is invited; the real proof of identity is signing in to that inbox.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Split a pasted blob of addresses (commas, semicolons, spaces, or newlines) into normalized,
 * deduped valid emails and a list of the tokens that did not look like emails (surfaced so the
 * owner can fix a typo before sending).
 */
export function parseEmailList(raw: string): { valid: string[]; invalid: string[] } {
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const tok of tokens) {
    if (EMAIL_RE.test(tok)) valid.add(normalizeEmail(tok));
    else invalid.push(tok);
  }
  return { valid: [...valid], invalid };
}

/** Thrown when an action would leave a farm with no active owner. */
export class LastOwnerError extends Error {
  constructor() {
    super("a farm must keep at least one owner");
    this.name = "LastOwnerError";
  }
}

/**
 * Throw LastOwnerError if removing or demoting `leavingUserId` would leave the farm with zero
 * active owners. MUST be called inside a serializable transaction (and followed by the mutating
 * write in the same tx) so two concurrent demotes cannot both pass the check and orphan the farm.
 */
export async function assertNotLastOwner(
  tx: Prisma.TransactionClient,
  farmId: string,
  leavingUserId: string,
): Promise<void> {
  const owners = await tx.farmMembership.findMany({
    where: { farmId, role: "owner", status: "active" },
    select: { userId: true },
  });
  const remaining = owners.filter((o) => o.userId !== leavingUserId);
  if (remaining.length === 0) throw new LastOwnerError();
}
