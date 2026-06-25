"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { en } from "@/copy/en";
import type { FarmAccess } from "@/lib/auth/access";
import { Wordmark } from "@/components/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui";
import { FarmSwitcher } from "./farm-switcher";
import { RolePill } from "./role-pill";
import { NAV_SECTIONS, agentHref, isAgentActive, type AgentItem } from "./agents";

// Desktop left rail, built on the shadcn Sidebar (collapsible="none": always expanded, desktop-only;
// mobile keeps AgentTabBar). The panel is the dark-green theme (--ds-green-100 -> --sidebar) with
// light text; SidebarMenuButton carries the active/hover states from the sidebar tokens. Lists the
// agents grouped into OPERATIONS / INTELLIGENCE / ORGANIZATION; not-yet-shipped agents are disabled
// with a Coming/Beta badge. `demo` (the public Tour) points the nav at /tour routes and hides
// app-only items. `farms`/`activeFarmId` drive the farm switcher; `access` gates the admin-only Team
// entry and the role pill; `pendingRequests` is the Team badge count.
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
  access?: FarmAccess | null;
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
    // Not yet shipped: a disabled button with a Coming/Beta badge.
    if (!agent.live || agent.href === null) {
      return (
        <SidebarMenuItem key={agent.key}>
          <SidebarMenuButton disabled aria-disabled className="opacity-50">
            <Icon aria-hidden />
            <span>{agent.label}</span>
          </SidebarMenuButton>
          <SidebarMenuBadge className="text-sidebar-foreground/60">
            {agent.tag === "beta" ? en.shell.betaTag : en.shell.comingTag}
          </SidebarMenuBadge>
        </SidebarMenuItem>
      );
    }
    const active = isAgentActive(agent, pathname, demo);
    const href = agentHref(agent, demo) ?? agent.href;
    return (
      <SidebarMenuItem key={agent.key}>
        <SidebarMenuButton asChild isActive={active}>
          <Link href={href} aria-current={active ? "page" : undefined}>
            <Icon aria-hidden />
            <span>{agent.label}</span>
          </Link>
        </SidebarMenuButton>
        {/* Open join-request count on the Team entry (admin-only). */}
        {agent.key === "team" && pendingRequests > 0 ? (
          <SidebarMenuBadge aria-label={en.team.pendingBadge(pendingRequests)}>
            {pendingRequests}
          </SidebarMenuBadge>
        ) : null}
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar
      collapsible="none"
      aria-label={en.shell.agentsLabel}
      // z-10 + a soft shadow on the right edge so the dark-green panel casts a drop shadow over the
      // content area beside it.
      className="sticky top-0 z-10 hidden h-dvh shadow-[8px_0_24px_-6px_rgba(20,25,15,0.25)] lg:flex"
    >
      <SidebarHeader className="gap-3 p-3">
        <Wordmark className="px-1 text-sidebar-foreground" />
        {demo ? null : <FarmSwitcher farms={farms} activeFarmId={activeFarmId} />}
        {!demo && access ? (
          <div className="px-1">
            <RolePill role={access.role} />
          </div>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={section.key}>
              <SidebarGroupLabel className="text-sidebar-foreground/60">
                {section.title}
              </SidebarGroupLabel>
              <SidebarMenu>{items.map(renderItem)}</SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
