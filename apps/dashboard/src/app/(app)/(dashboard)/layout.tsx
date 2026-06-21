import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveFarmAccess } from "@/lib/auth/access";
import { accessibleFarms } from "@/lib/onboarding/farm";
import type { FindingView } from "@/lib/dashboard/findings";
import { resolveActiveFarmId, resolveFarm, resolveFindings } from "./_data";
import { AgentRail } from "../_components/shell/agent-rail";
import { AgentTabBar } from "../_components/shell/agent-tabbar";
import { AlmondLauncher } from "../_components/almond/almond-launcher";
import { AlmondChatProvider } from "../_components/almond/almond-launcher-provider";
import { AlmondNudge } from "../_components/almond/almond-nudge";
import { TopoBackground } from "../_components/topo-background";
import { almondStarters } from "@/lib/almond/starters";
import { ALMOND_NUDGE_COOKIE, shouldShowAlmondNudge } from "@/lib/almond/nudge";

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
  const canAttach = access?.canManageData ?? false;
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
  // We still resolve the count here for Almond's opening prompt (request-cached, so no extra query).
  const findings: FindingView[] = await resolveFindings(resolved.farm.id);
  // First-run nudge gate (Story 10.2): owner-only and once-only. Decided server-side from the
  // dismissal cookie so a grower who already dismissed it never sees a flash of it.
  const dismissed = (await cookies()).has(ALMOND_NUDGE_COOKIE);
  const showNudge = shouldShowAlmondNudge({ dataKind: resolved.dataKind, dismissed });
  return (
    <NuqsAdapter>
      {/* The open/close state of the ONE Almond panel is shared here so the rail entry and the
          first-run nudge open the same panel as the floating launcher (Story 10.2). His Home redesign
          moved findings in-content (no shell-wide findings rail) and added the TopoBackground; Almond's
          provider, nudge, and capability-gated launcher are grafted back onto that structure. */}
      <AlmondChatProvider
        farmName={resolved.farm.name}
        starters={almondStarters({
          findingCount: findings.length,
          // Export/PDF starters surface for every resolved farm now — a connected owner AND the
          // badged demo fallback — matching the chat route, which hands the file skills on `canExport`
          // (true for both). Owner exports persist to Reports; demo exports are streamed, never stored.
          canExport: true,
        })}
        // Attachments are role-gated (owner/manager only), in parity with the chat route: a viewer
        // (or the demo fallback) cannot push file bytes in, but can still stream/download exports.
        canAttach={canAttach}
        // Saved history is per-user: any signed-in member (even a viewer) keeps their own threads,
        // scoped to this farm. The parent (app) layout already enforces auth, so userId is non-null.
        historyEnabled={userId != null}
      >
        <TopoBackground />
        <div className="flex min-h-dvh w-full text-on-surface">
          <AgentRail
            farms={farms}
            activeFarmId={resolved.farm.id}
            access={access}
            pendingRequests={pendingRequests}
          />
          <main className="min-w-0 flex-1 pb-32 lg:pb-12">{children}</main>
        </div>
        <AgentTabBar />
        <AlmondNudge show={showNudge} />
        <AlmondLauncher />
      </AlmondChatProvider>
    </NuqsAdapter>
  );
}
