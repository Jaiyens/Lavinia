import Link from "next/link";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { EnergyDashboard } from "@/app/(app)/_components/energy-dashboard";
import { Button } from "@/components/ui";
import { en } from "@/copy/en";

// Story 5.3, AC1: "Tour a sample" - the badged representative dashboard, public and with
// zero commitment (no sign-in, no connect). It lives OUTSIDE the (app) group, so it is not
// auth-gated (/tour is allowlisted in auth.config.ts), and renders the EnergyDashboard hero
// pinned to the DEMO farm (demoOnly), so a real grower's financials can never leak here
// (AC2). Read-only: no agent rail, no findings-resolution actions. NuqsAdapter supplies the
// lens/drawer URL state the hero's client islands need.
export const dynamic = "force-dynamic";

export default function TourPage() {
  return (
    <NuqsAdapter>
      <div className="min-h-dvh w-full bg-paper text-on-surface">
        <div className="mx-auto max-w-6xl px-5 lg:px-12">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant py-4">
            <p className="type-body-sm text-on-surface-variant">{en.tour.connectNote}</p>
            <Link href="/login">
              <Button size="sm" variant="primary">
                {en.tour.connectCta}
              </Button>
            </Link>
          </div>
          <EnergyDashboard demoOnly />
        </div>
      </div>
    </NuqsAdapter>
  );
}
