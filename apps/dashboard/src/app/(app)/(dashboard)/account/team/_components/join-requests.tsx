"use client";

// The "Asked to join" section (Phase 2): people who submitted a join request via the farm's code.
// An admin picks the role to grant (default View only, capped to what they may grant) and approves,
// or declines. Mirrors the team-list mutation pattern (useTransition + router.refresh); the actions
// re-authorize server-side, so this UI gating is convenience, not the gate.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FarmRole } from "@prisma/client";
import { en } from "@/copy/en";
import type { TeamActionResult } from "@/lib/auth/team";
import { approveJoinRequestAction, denyJoinRequestAction } from "../actions";

export type JoinRequestRow = {
  id: string;
  name: string;
  email: string;
  proposedRole: FarmRole;
  message: string | null;
};

export function JoinRequests({
  requests,
  canGrantOwner,
}: {
  requests: JoinRequestRow[];
  canGrantOwner: boolean;
}) {
  const router = useRouter();
  const t = en.team;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The role to grant, per request (default View only - least privilege for an unvouched stranger).
  const [roles, setRoles] = useState<Record<string, FarmRole>>({});
  // Owner-first, matching add-people + team-list (the visual order; the safe default stays "viewer"
  // via the controlled `value` below, not the option order).
  const roleOptions: FarmRole[] = canGrantOwner ? ["owner", "manager", "viewer"] : ["manager", "viewer"];

  function run(fn: () => Promise<TeamActionResult>): void {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  if (requests.length === 0) return null;

  return (
    <section>
      <h2 className="type-label-caps mb-3 text-on-surface-variant">{t.requestsHeading}</h2>
      <ul className="flex flex-col gap-2">
        {requests.map((r) => {
          const chosen = roles[r.id] ?? "viewer";
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate type-body-md text-on-surface">{r.name}</p>
                <p className="truncate type-caption text-on-surface-variant">{r.email}</p>
                {r.message ? (
                  <p className="truncate type-caption text-on-surface-variant/70">
                    {t.requestNote(r.message)}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label={t.requestRoleLabel}
                  value={chosen}
                  disabled={pending}
                  onChange={(e) => setRoles((s) => ({ ...s, [r.id]: e.target.value as FarmRole }))}
                  className="rounded-lg border border-outline-variant bg-surface-container-low px-2 py-1 type-body-sm text-on-surface"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {t.roles[role].label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => approveJoinRequestAction(r.id, chosen))}
                  className="type-body-sm font-semibold text-primary underline-offset-4 transition-colors hover:underline disabled:opacity-50"
                >
                  {t.requestApprove}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => denyJoinRequestAction(r.id))}
                  className="type-body-sm text-on-surface-variant underline-offset-4 transition-colors hover:text-alert hover:underline disabled:opacity-50"
                >
                  {t.requestDeny}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-2 type-body-sm text-alert">{error}</p> : null}
    </section>
  );
}
