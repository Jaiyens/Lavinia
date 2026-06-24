"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import type { FarmAccess } from "@/lib/auth/access";
import { Wordmark } from "@/components/logo";
import { FarmSwitcher } from "./farm-switcher";
import { RolePill } from "./role-pill";
import { NAV_SECTIONS, agentHref, isAgentActive, type AgentItem } from "./agents";

// Desktop left rail. Lists agents grouped into OPERATIONS / INTELLIGENCE / ORGANIZATION sections
// (Palantir-style hierarchy); the active live agent is primary, not-yet-shipped agents are dimmed +
// non-interactive with a "Coming"/"Beta" tag. Mobile uses AgentTabBar instead. `demo` (the public
// Tour) points the nav at /tour routes and hides app-only items (To-do, Reports, account). The
// account/settings entry now lives in the ORGANIZATION section, and the sign-out lives on the Account
// page itself (not in the rail). `farms`/`activeFarmId` drive the farm switcher under the wordmark.
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
  // Open join requests awaiting a decision: the count badge on the Team entry. Resolved server-side;
  // a viewer never receives it (they never see the Team entry).
  pendingRequests?: number;
} = {}) {
  const pathname = usePathname();

  // Whether an item is shown to the current viewer: app-only items are hidden on the public tour, and
  // the admin-only Team entry is hidden from members who cannot manage the team.
  const visible = (item: AgentItem): boolean => {
    if (demo && item.appOnly) return false;
    if (item.adminOnly && !access?.canManageTeam) return false;
    return true;
  };

  const renderItem = (agent: AgentItem) => {
    const Icon = agent.icon;
    // Not yet shipped: grayed, non-interactive, with a Coming/Beta tag.
    if (!agent.live || agent.href === null) {
      return (
        <span
          key={agent.key}
          aria-disabled="true"
          className="flex h-11 cursor-not-allowed select-none items-center gap-3 rounded-xl px-3 text-on-surface-variant/50"
        >
          <span aria-hidden className="flex w-7 shrink-0 items-center justify-center">
            <Icon size={18} aria-hidden />
          </span>
          <span className="type-body-md">{agent.label}</span>
          <span className="ml-auto shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant/60">
            {agent.tag === "beta" ? en.shell.betaTag : en.shell.comingTag}
          </span>
        </span>
      );
    }
    const active = isAgentActive(agent, pathname, demo);
    const href = agentHref(agent, demo) ?? agent.href;
    // Active item = a soft white pill with a hairline + gentle shadow and the brand green on the icon
    // and label (the reference's selected-nav treatment, in Terra's palette).
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
        {/* Fixed-width icon slot so every label lines up at the same x. */}
        <span aria-hidden className="flex w-7 shrink-0 items-center justify-center">
          <Icon size={18} className={active ? "text-primary" : undefined} />
        </span>
        <span>{agent.label}</span>
        {/* Open join-request count on the Team entry (admin-only). */}
        {agent.key === "team" && pendingRequests > 0 ? (
          <span
            aria-label={en.team.pendingBadge(pendingRequests)}
            className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary-container px-1.5 py-0.5 type-label-caps text-on-primary-container"
          >
            {pendingRequests}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <aside
      aria-label={en.shell.agentsLabel}
      className="sticky top-0 hidden h-dvh w-48 shrink-0 flex-col overflow-y-auto border-r border-outline-variant bg-paper px-2.5 py-5 lg:flex"
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

      <nav className="flex flex-1 flex-col gap-5">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={section.key} className="flex flex-col gap-1">
              <p className="px-3 pb-1 type-label-caps text-on-surface-variant/70">{section.title}</p>
              {items.map(renderItem)}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
