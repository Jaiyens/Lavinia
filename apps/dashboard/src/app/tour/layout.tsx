import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AgentRail } from "@/app/(app)/_components/shell/agent-rail";
import { AgentTabBar } from "@/app/(app)/_components/shell/agent-tabbar";
import { AlmondLauncher } from "@/app/(app)/_components/almond/almond-launcher";
import { TopoBackground } from "@/app/(app)/_components/topo-background";
import { Button, SidebarProvider } from "@/components/ui";
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
  return (
    <NuqsAdapter>
      <TopoBackground />
      <SidebarProvider
        style={{ "--sidebar-width": "14rem" } as CSSProperties}
        className="min-h-dvh text-on-surface"
      >
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
      </SidebarProvider>
      <AgentTabBar demo />
      <AlmondLauncher />
    </NuqsAdapter>
  );
}
