"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, FileText, LogOut, Users, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import type { FarmAccess } from "@/lib/auth/access";
import { Wordmark } from "@/components/logo";
import { signOutAction } from "../../actions";
import { AlmondAvatar } from "../almond/almond-avatar";
import { useAlmondUnread } from "../almond/almond-launcher-provider";
import { FarmSwitcher } from "./farm-switcher";
import { RolePill } from "./role-pill";
import { AGENTS, agentHref, isAgentActive } from "./agents";

// Desktop left rail (240px). Lists agents; the active live agent is primary, future agents are
// dimmed + non-interactive with a "coming" tag. Mobile uses AgentTabBar instead. `demo` (the
// public Tour) points the nav at the /tour routes and swaps the account/sign-out footer for a
// single "Sign in" CTA, since a prospect on the tour has no session. `farms`/`activeFarmId` drive
// the farm switcher under the wordmark (omitted on the demo tour).
export function AgentRail({
  demo = false,
  farms = [],
  activeFarmId = null,
  access = null,
  pendingRequests = 0,
}: {
  demo?: boolean;
  farms?: { id: string; name: string }[];
  activeFarmId?: string | null;
  // The signed-in member's capability set on the active farm (null on the public Tour). Drives the
  // role pill and the admin-only Team entry. Server-resolved and passed in - never derived here.
  access?: FarmAccess | null;
  // Open join requests awaiting a decision (Phase 2): the count badge on the Team entry. Resolved
  // server-side; a viewer never receives it (they never see the Team entry).
  pendingRequests?: number;
} = {}) {
  const pathname = usePathname();
  // Finished background-built files the grower has not seen yet (Almond v2 Phase 2). The rail renders
  // INSIDE the AlmondChatProvider (both the dashboard and the tour layout), so it reads the unread
  // count straight from the provider's single poll — no second fetch, no client island. The count
  // drives a small RED badge on the Almond entry, mirroring the Team pending-requests badge below but
  // in the reserved risk red (the brand-green count badge means "to manage", red means "ready for you").
  const almondUnread = useAlmondUnread();
  return (
    <aside
      aria-label={en.shell.agentsLabel}
      className="sticky top-0 hidden h-dvh w-40 shrink-0 flex-col overflow-y-auto border-r border-outline-variant bg-paper px-2.5 py-5 lg:flex"
    >
      <div className="px-3 pb-4">
        <Wordmark className="text-on-surface" />
      </div>
      {demo ? null : <FarmSwitcher farms={farms} activeFarmId={activeFarmId} />}
      {/* The member's role on the active farm, always in view so a viewer knows they are read-only. */}
      {!demo && access ? (
        <div className="px-3 pb-4">
          <RolePill role={access.role} />
        </div>
      ) : null}
      <p className="px-3 pb-2 type-label-caps text-on-surface-variant/70">{en.shell.navTrack}</p>
      <nav className="flex flex-col gap-1">
        {AGENTS.map((agent) => {
          const Icon = agent.icon;
          if (!agent.live || agent.href === null) {
            return (
              <span
                key={agent.key}
                aria-disabled="true"
                className="flex h-11 cursor-not-allowed select-none items-center gap-3 rounded-xl px-3 text-on-surface-variant/50"
              >
                <Icon size={18} aria-hidden />
                <span className="type-body-md">{agent.label}</span>
                <span className="type-label-caps ml-auto text-on-surface-variant/60">
                  {en.shell.comingTag}
                </span>
              </span>
            );
          }
          const active = isAgentActive(agent, pathname, demo);
          const href = agentHref(agent, demo) ?? agent.href;
          // Active item = a soft white pill with a hairline + gentle shadow and the brand green
          // on the icon and label (the reference's selected-nav treatment, in Terra's palette).
          return (
            <Link
              key={agent.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 type-body-md transition-colors",
                active
                  ? "border border-outline-variant bg-surface-container-lowest font-semibold text-primary shadow-[var(--shadow-soft)]"
                  : "text-on-surface hover:bg-surface-container-low",
              )}
            >
              {/* Fixed-width icon slot so every label lines up at the same x, even though Almond's
                  mascot face is larger than the lucide icons. Almond sits under Home with its own
                  face instead of a lucide icon (its `icon` is only a fallback) so it reads as the assistant. */}
              <span aria-hidden className="flex w-7 shrink-0 items-center justify-center">
                {agent.key === "almond" ? (
                  <AlmondAvatar size={28} />
                ) : (
                  <Icon size={18} className={active ? "text-primary" : undefined} />
                )}
              </span>
              <span>{agent.label}</span>
              {/* RED unread badge on the Almond entry: a finished background-built file is waiting
                  (Almond v2 Phase 2). Mirrors the Team pending-requests badge shape/size below, but in
                  the reserved risk red (not the brand-green count) so "ready for you" reads distinctly. */}
              {agent.key === "almond" && almondUnread > 0 ? (
                <span
                  aria-label={en.shell.almond.generation.unreadAria(almondUnread)}
                  className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-risk px-1.5 py-0.5 type-label-caps tnum text-white"
                >
                  {almondUnread}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {/* Footer. Signed-in: account + sign out. The public Tour has no session, so it shows a
          single "Sign in" CTA that leads into the real onboarding instead. */}
      <div className="mt-auto flex flex-col gap-1 pt-4">
        {demo ? null : (
          <>
            <Link
              href="/agents"
              aria-current={pathname === "/agents" ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 type-body-md transition-colors",
                pathname === "/agents"
                  ? "bg-primary-container font-semibold text-on-primary-container"
                  : "text-on-surface hover:bg-surface-container-low",
              )}
            >
              <Bot size={18} aria-hidden />
              <span>{en.agents.navLabel}</span>
            </Link>
            <Link
              href="/reports"
              aria-current={pathname === "/reports" ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 type-body-md transition-colors",
                pathname === "/reports"
                  ? "bg-primary-container font-semibold text-on-primary-container"
                  : "text-on-surface hover:bg-surface-container-low",
              )}
            >
              <FileText size={18} aria-hidden />
              <span>{en.reports.navLabel}</span>
            </Link>
            {/* Team: admin-only (owner/manager). A viewer never sees it - they have nothing to
                manage and reach the read-only member list through Account if they want it. */}
            {access?.canManageTeam ? (
              <Link
                href="/account/team"
                aria-current={pathname === "/account/team" ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3 type-body-md transition-colors",
                  pathname === "/account/team"
                    ? "border border-outline-variant bg-surface-container-lowest font-semibold text-primary shadow-[var(--shadow-soft)]"
                    : "text-on-surface hover:bg-surface-container-low",
                )}
              >
                <Users
                  size={18}
                  aria-hidden
                  className={pathname === "/account/team" ? "text-primary" : undefined}
                />
                <span>{en.team.navLabel}</span>
                {pendingRequests > 0 ? (
                  <span
                    aria-label={en.team.pendingBadge(pendingRequests)}
                    className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary-container px-1.5 py-0.5 type-label-caps text-on-primary-container"
                  >
                    {pendingRequests}
                  </span>
                ) : null}
              </Link>
            ) : null}
            <Link
              href="/account"
              aria-current={pathname === "/account" ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-3 rounded-xl px-3 type-body-md transition-colors",
                pathname === "/account"
                  ? "border border-outline-variant bg-surface-container-lowest font-semibold text-primary shadow-[var(--shadow-soft)]"
                  : "text-on-surface hover:bg-surface-container-low",
              )}
            >
              <UserRound
                size={18}
                aria-hidden
                className={pathname === "/account" ? "text-primary" : undefined}
              />
              <span>{en.account.navLabel}</span>
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex h-11 w-full items-center gap-3 rounded-xl px-3 type-body-md text-on-surface-variant transition-colors hover:bg-surface-container-low"
              >
                <LogOut size={18} aria-hidden />
                <span>{en.auth.signOut}</span>
              </button>
            </form>
          </>
        )}
      </div>
    </aside>
  );
}
