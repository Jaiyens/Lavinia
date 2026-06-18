import type { ReactNode } from "react";
import Link from "next/link";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { FindingView } from "@/lib/dashboard/findings";
import { resolveFarm, resolveFindings } from "@/app/(app)/(dashboard)/_data";
import { AgentRail } from "@/app/(app)/_components/shell/agent-rail";
import { AgentTabBar } from "@/app/(app)/_components/shell/agent-tabbar";
import { FindingsRail } from "@/app/(app)/_components/shell/findings-rail";
import { FindingsSheet } from "@/app/(app)/_components/shell/findings-sheet";
import { AlmondLauncher } from "@/app/(app)/_components/almond/almond-launcher";
import { AlmondLauncherProvider } from "@/app/(app)/_components/almond/almond-launcher-provider";
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
          first run, and the Tour already carries its own connect CTA. */}
      <AlmondLauncherProvider>
        <div className="flex min-h-dvh w-full bg-paper text-on-surface">
          <AgentRail demo />
          <main className="min-w-0 flex-1 px-5 pb-32 lg:px-12 lg:pb-12">
            {/* Representative-data banner with a connect CTA, on every tour screen. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant py-4">
              <p className="type-body-sm text-on-surface-variant">{en.tour.connectNote}</p>
              <Link href="/login">
                <Button size="sm" variant="primary">
                  {en.tour.connectCta}
                </Button>
              </Link>
            </div>
            {children}
          </main>
          <FindingsRail findings={findings} readOnly />
        </div>
        <FindingsSheet findings={findings} readOnly />
        <AgentTabBar demo />
        {resolved && (
          <AlmondLauncher
            farmName={resolved.farm.name}
            // The Tour is always the badged demo farm (never a real owner), so the owner-only export/PDF
            // starters are withheld: `canExport: false`. Mirrors the chat route withholding those skills
            // from the public actor (dataKind "representative" here, never "real").
            starters={almondStarters({ findingCount: findings.length, canExport: false })}
          />
        )}
      </AlmondLauncherProvider>
    </NuqsAdapter>
  );
}
