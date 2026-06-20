"use client";

// The member + pending-invite lists with role-gated controls. The buttons shown here mirror the
// server guards (a manager never sees controls on an owner; only an owner sees "Make owner"), but
// the team-ops actions re-authorize everything, so the UI gating is convenience, not the gate.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FarmRole } from "@prisma/client";
import { en } from "@/copy/en";
import type { TeamActionResult } from "@/lib/auth/team";
import {
  changeRoleAction,
  leaveFarmAction,
  removeMemberAction,
  resendInviteAction,
  revokeInviteAction,
  transferOwnershipAction,
} from "../actions";

export type MemberRow = {
  membershipId: string;
  name: string;
  email: string;
  role: FarmRole;
  isYou: boolean;
  addedBy: string | null;
};

export type InviteRow = { id: string; email: string; role: FarmRole; addedBy: string | null };

function RolePill({ role }: { role: FarmRole }) {
  const label = en.team.roles[role].label;
  const tone =
    role === "owner"
      ? "bg-primary-container text-on-primary-container"
      : "bg-surface-container text-on-surface-variant";
  return <span className={`rounded-full px-2.5 py-0.5 type-label-caps ${tone}`}>{label}</span>;
}

export function TeamList({
  farmId,
  members,
  invites,
  viewerRole,
  canManage,
}: {
  farmId: string;
  members: MemberRow[];
  invites: InviteRow[];
  viewerRole: FarmRole;
  canManage: boolean;
}) {
  const router = useRouter();
  const t = en.team;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isOwnerViewer = viewerRole === "owner";
  const roleOptions: FarmRole[] = isOwnerViewer ? ["owner", "manager", "viewer"] : ["manager", "viewer"];

  function run(fn: () => Promise<TeamActionResult>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  // A manager may act on viewers/managers but never an owner; an owner may act on anyone.
  function canActOn(target: FarmRole): boolean {
    if (!canManage) return false;
    if (target === "owner") return isOwnerViewer;
    return true;
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="type-label-caps mb-3 text-on-surface-variant">{t.membersHeading}</h2>
        <ul className="flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.membershipId}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate type-body-md text-on-surface">
                  {m.name}
                  {m.isYou ? <span className="ml-2 type-caption text-on-surface-variant">({t.you})</span> : null}
                </p>
                <p className="truncate type-caption text-on-surface-variant">{m.email}</p>
                {m.addedBy ? (
                  <p className="truncate type-caption text-on-surface-variant/70">{t.addedBy(m.addedBy)}</p>
                ) : null}
              </div>

              {/* Controls. Self -> Leave; others -> role select + remove (+ transfer for an owner). */}
              {m.isYou ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(t.leaveConfirm)) run(() => leaveFarmAction(farmId));
                  }}
                  className="type-body-sm text-on-surface-variant underline-offset-4 transition-colors hover:text-alert hover:underline disabled:opacity-50"
                >
                  {t.leave}
                </button>
              ) : canActOn(m.role) ? (
                <div className="flex items-center gap-2">
                  <select
                    aria-label={t.changeRole}
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => {
                      const next = e.target.value as FarmRole;
                      if (next !== m.role) run(() => changeRoleAction(m.membershipId, next));
                    }}
                    className="rounded-lg border border-outline-variant bg-surface-container-low px-2 py-1 type-body-sm text-on-surface"
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {t.roles[r].label}
                      </option>
                    ))}
                  </select>
                  {isOwnerViewer && m.role !== "owner" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => transferOwnershipAction(m.membershipId))}
                      className="type-body-sm text-on-surface-variant underline-offset-4 transition-colors hover:text-on-surface hover:underline disabled:opacity-50"
                    >
                      {t.transfer}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(t.removeConfirm(m.name))) run(() => removeMemberAction(m.membershipId));
                    }}
                    className="type-body-sm text-on-surface-variant underline-offset-4 transition-colors hover:text-alert hover:underline disabled:opacity-50"
                  >
                    {t.remove}
                  </button>
                </div>
              ) : (
                <RolePill role={m.role} />
              )}
            </li>
          ))}
        </ul>
      </section>

      {canManage && invites.length > 0 ? (
        <section>
          <h2 className="type-label-caps mb-3 text-on-surface-variant">{t.invitesHeading}</h2>
          <ul className="flex flex-col gap-2">
            {invites.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate type-body-md text-on-surface">{i.email}</p>
                  <p className="truncate type-caption text-on-surface-variant">{t.statusInvited}</p>
                </div>
                <RolePill role={i.role} />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => resendInviteAction(i.id))}
                    className="type-body-sm text-on-surface-variant underline-offset-4 transition-colors hover:text-on-surface hover:underline disabled:opacity-50"
                  >
                    {t.resend}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => revokeInviteAction(i.id))}
                    className="type-body-sm text-on-surface-variant underline-offset-4 transition-colors hover:text-alert hover:underline disabled:opacity-50"
                  >
                    {t.cancelInvite}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="type-body-sm text-alert">{error}</p> : null}
    </div>
  );
}
