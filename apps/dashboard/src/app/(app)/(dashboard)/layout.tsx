import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { sessionUserId } from "@/lib/auth";
import type { FindingView } from "@/lib/dashboard/findings";
import { resolveFarm, resolveFindings } from "./_data";
import { AgentRail } from "../_components/shell/agent-rail";
import { AgentTabBar } from "../_components/shell/agent-tabbar";
import { FindingsRail } from "../_components/shell/findings-rail";
import { FindingsSheet } from "../_components/shell/findings-sheet";
import { AlmondLauncher } from "../_components/almond/almond-launcher";
import { almondStarters } from "@/lib/almond/starters";

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
  // Owner-scope on the signed-in operator: they resolve their OWN farm, or the badged demo
  // when they own none (never another grower's farm). Auth itself is enforced by the parent
  // (app) layout; this passes the id along so the shell renders the right farm.
  const resolved = await resolveFarm(await sessionUserId(), false);
  if (resolved === null) redirect(CONNECT_SOURCE_PATH);
  const findings: FindingView[] = await resolveFindings(resolved.farm.id);
  return (
    <NuqsAdapter>
      <div className="flex min-h-dvh w-full bg-paper text-on-surface">
        <AgentRail />
        <main className="min-w-0 flex-1 px-5 pb-32 lg:px-12 lg:pb-12">{children}</main>
        <FindingsRail findings={findings} />
      </div>
      <FindingsSheet findings={findings} />
      <AgentTabBar />
      <AlmondLauncher
        farmName={resolved.farm.name}
        starters={almondStarters({
          findingCount: findings.length,
          // Owner-only export/PDF starters: gate on the SAME signal the chat route uses for
          // `authedOwner` (dataKind "real" = a connected owner; the badged demo fallback is not).
          canExport: resolved.dataKind === "real",
        })}
      />
    </NuqsAdapter>
  );
}
