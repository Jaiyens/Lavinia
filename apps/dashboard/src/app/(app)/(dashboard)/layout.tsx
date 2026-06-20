import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { farmRole } from "@/lib/auth/access";
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

// Where a signed-in user with no farm yet is sent (Story 5.1 AC4 / Story 5.2): the
// connect-a-source onboarding, so they never land on a blank shell.
const CONNECT_SOURCE_PATH = "/onboarding";

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
  if (resolved === null) redirect(CONNECT_SOURCE_PATH);
  // Capability is derived from the caller's ROLE, never from dataKind: a viewer of a real farm
  // is read-only (can stream/download an export, but never attach files or persist), while an
  // owner/manager can attach. The Almond chat route applies the same role-derived gate.
  const role = userId ? await farmRole(prisma, resolved.farm.id, userId) : null;
  const canAttach = role === "owner" || role === "manager";
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
      >
        <TopoBackground />
        <div className="flex min-h-dvh w-full text-on-surface">
          <AgentRail />
          <main className="min-w-0 flex-1 pb-32 lg:pb-12">{children}</main>
        </div>
        <AgentTabBar />
        <AlmondNudge show={showNudge} />
        <AlmondLauncher />
      </AlmondChatProvider>
    </NuqsAdapter>
  );
}
