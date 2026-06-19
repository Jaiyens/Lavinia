import type { ReactNode } from "react";
import Link from "next/link";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { FindingView } from "@/lib/dashboard/findings";
import { resolveFarm, resolveFindings } from "@/app/(app)/(dashboard)/_data";
import { AgentRail } from "@/app/(app)/_components/shell/agent-rail";
import { AgentTabBar } from "@/app/(app)/_components/shell/agent-tabbar";
import { AlmondLauncher } from "@/app/(app)/_components/almond/almond-launcher";
import { AlmondChatProvider } from "@/app/(app)/_components/almond/almond-launcher-provider";
import { TopoBackground } from "@/app/(app)/_components/topo-background";
import { almondStarters } from "@/lib/almond/starters";
import { Button } from "@/components/ui";
import { en } from "@/copy/en";

// The public Tour now renders the SAME three-zone OS shell as the signed-in app (agent rail -
// data hero - findings rail + Almond), just pinned to the badged demo farm and read-only. This
// is what makes the tour and the real product look identical: Home (/tour) -> Energy
// (/tour/energy), the findings rail, and Almond, all on representative data. It lives OUTSIDE
// the (app) group, so it is not auth-gated (/tour/* is allowlisted in auth.config.ts), and
// nothing here can leak a real grower's data (demoFarm is isDemo-only). Read-only: the findings
// one-tap responses are hidden, and the rail footer is a "Sign in" CTA instead of account.
export const dynamic = "force-dynamic";

export default async function TourLayout({ children }: { children: ReactNode }) {
  // Pin to the demo farm (resolveFarm(_, demoOnly=true)); never a real connected farm.
  const resolved = await resolveFarm(null, true);
  const findings: FindingView[] = resolved ? await resolveFindings(resolved.farm.id) : [];
  return (
    <NuqsAdapter>
      {/* Shared Almond panel open-state so the rail entry can open the launcher on the Tour too
          (Story 10.2). The first-run nudge is NOT mounted here: a Tour prospect is not a grower's
          first run, and the Tour already carries its own connect CTA. His redesign added the
          TopoBackground and moved findings in-content (no shell findings rail); Almond's provider and
          the capability-gated launcher (canExport: false on the demo) are grafted back onto it. */}
      <AlmondChatProvider
        farmName={resolved?.farm.name ?? "the demo farm"}
        // The Tour is always the badged demo farm (never a real owner), so the owner-only export/PDF
        // starters are withheld (`canExport: false`) and attachments are off (`canAttach: false`).
        // Mirrors the chat route withholding those capabilities from the public actor.
        starters={almondStarters({ findingCount: findings.length, canExport: false })}
        canAttach={false}
      >
        <TopoBackground />
        <div className="flex min-h-dvh w-full text-on-surface">
          <AgentRail demo />
          <main className="min-w-0 flex-1 pb-32 lg:pb-12">
            {/* Representative-data banner with a connect CTA, on every tour screen. Padded to the
                content gutter since the surrounding main no longer pads (pages own their gutters). */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-5 py-4 lg:px-12">
              <p className="type-body-sm text-on-surface-variant">{en.tour.connectNote}</p>
              <Link href="/login">
                <Button size="sm" variant="primary">
                  {en.tour.connectCta}
                </Button>
              </Link>
            </div>
            {children}
          </main>
        </div>
        <AgentTabBar demo />
        <AlmondLauncher />
      </AlmondChatProvider>
    </NuqsAdapter>
  );
}
