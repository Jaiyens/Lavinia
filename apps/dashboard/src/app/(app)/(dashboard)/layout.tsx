import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveFarmAccess } from "@/lib/auth/access";
import { accessibleFarms } from "@/lib/onboarding/farm";
import { resolveActiveFarmId, resolveFarm } from "./_data";
import { SidebarProvider } from "@/components/ui";
import { AgentRail } from "../_components/shell/agent-rail";
import { RailReopen } from "../_components/shell/rail-reopen";
import { AgentTabBar } from "../_components/shell/agent-tabbar";
import { AlmondLauncher } from "../_components/almond/almond-launcher";
import { TopoBackground } from "../_components/topo-background";

// The dashboard renders live DB data and reads URL search params via nuqs, so it is
// request-time dynamic, never statically prerendered.
export const dynamic = "force-dynamic";

// Where a signed-in user with no farm yet is sent: the post-login fork (/start), which itself
// sorts brand-new vs resume-onboarding vs claim-a-stray-invite, so they never land on a blank
// shell. Onboarding lives one hop past it (Create a farm).
const START_PATH = "/start";

// The three-zone OS shell (agent rail - data hero - findings rail) wrapping every
// DASHBOARD screen. Auth is already enforced by the parent (app) layout; this layer adds
// the farm requirement. Onboarding lives OUTSIDE this group (under (app) but not
// (dashboard)), so a farm-less user can render the onboarding flow without this layout's
// no-data redirect bouncing them - which is what avoids the redirect loop.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Membership-scope on the signed-in operator: they resolve a farm they are an active member
  // of (their own or one they were invited to), selected by the validated active-farm cookie.
  // Auth itself is enforced by the parent (app) layout; a member of no ready farm gets null.
  const userId = await sessionUserId();
  const activeId = await resolveActiveFarmId(userId);
  const resolved = await resolveFarm(userId, activeId, false);
  if (resolved === null) redirect(START_PATH);
  // Capability is derived from the caller's ROLE, never from dataKind: a viewer of a real farm
  // is read-only (can stream/download an export, but never attach files or persist), while an
  // owner/manager (an "admin") can attach + manage. Resolved once here into the FarmAccess object
  // and threaded to the rail, tab bar, Almond, and findings, so the admin line never drifts. The
  // Almond chat route applies the same role-derived gate.
  const access = userId ? await resolveFarmAccess(prisma, resolved.farm.id, userId) : null;
  // Open join requests awaiting an admin's decision (Phase 2): the count drives the Team nav badge.
  // Admin-only query (a viewer never sees the Team item, so never the count).
  const pendingRequests = access?.canManageTeam
    ? await prisma.farmJoinRequest.count({
        where: { farmId: resolved.farm.id, status: "open", expiresAt: { gt: new Date() } },
      })
    : 0;
  // The farms this user can switch between (the rail switcher). Single-farm users see a label.
  const farms = await accessibleFarms(prisma, userId);
  // Findings are no longer a shell-wide right rail (the Home overview is full-width like the
  // mockup, with findings shown in-content). The Energy surface renders its own findings rail.
  return (
    <NuqsAdapter>
      <TopoBackground />
      {/* SidebarProvider renders the flex shell (sidebar + content). The rail is always-expanded and
          desktop-only (collapsible="none" + hidden lg:flex); mobile keeps AgentTabBar. A narrower
          width than the shadcn default keeps the green panel tight. */}
      <SidebarProvider
        style={{ "--sidebar-width": "14rem" } as CSSProperties}
        className="min-h-dvh text-on-surface"
      >
        <AgentRail
          farms={farms}
          activeFarmId={resolved.farm.id}
          access={access}
          pendingRequests={pendingRequests}
        />
        <RailReopen />
        <main className="min-w-0 flex-1 pb-32 lg:pb-12">{children}</main>
      </SidebarProvider>
      <AgentTabBar />
      <AlmondLauncher />
    </NuqsAdapter>
  );
}
