import { sessionUserId } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { buildSolarDataset } from "@/lib/dashboard/solar";
import { resolveActiveFarmId, resolveFarm, resolveFindings, resolveMeters } from "../(dashboard)/_data";
import { Reveal } from "./shell/reveal";
import { FindingsRail } from "./shell/findings-rail";
import { FindingsSheet } from "./shell/findings-sheet";
import { SolarKpiStrip } from "./solar/solar-kpi-strip";
import { SolarLensToggle } from "./solar/solar-lens-toggle";
import { SolarLensRegion } from "./solar/solar-lens-region";

// The Solar tab data hero (A-1). A composition SIBLING of EnergyDashboard, not a fork: it renders
// the same three-zone OS shell (the agent rail / mobile bottom tabs come from the surrounding
// layout; this component owns the data-hero center column and the findings rail on the right),
// scoped to the active farm via resolveActiveFarmId -> resolveFarm. At this story the data hero is
// empty-but-structured (the four solar lenses, the KPI strip, the filter bar, and the drawer all
// arrive in A-2 onward); it must never render a crash or a blank shell. demoOnly (the public Tour)
// pins the data to the demo farm, never a real connected one, so a real grower's financials can
// never leak to an unauthenticated visitor.
export async function SolarDashboard({ demoOnly = false }: { demoOnly?: boolean } = {}) {
  // The Tour is a public surface: skip the session read entirely and pin to the demo farm.
  // Otherwise membership-scope on the signed-in operator so they see their OWN farm.
  const userId = demoOnly ? null : await sessionUserId();
  const activeId = demoOnly ? null : await resolveActiveFarmId(userId);
  // Request-cached resolvers (shared with the (dashboard) layout): the farm and findings are
  // fetched once for the whole request, not re-queried per component against the remote database.
  const resolved = await resolveFarm(userId, activeId, demoOnly);

  if (!resolved) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{en.shell.noFarmBody}</p>
      </div>
    );
  }

  const { farm, dataKind } = resolved;
  // The farm's pending findings: the solar-scoped rail filtering lands in a later epic (G/F).
  // For now the rail renders the farm's findings so the three-zone shell is structurally whole.
  const findings = await resolveFindings(farm.id);

  // Assemble the solar lens dataset (A-3) server-side from the request-cached MeterView[], so the
  // KPI counts paint with the legibility surface and the allocation math (Epic C) never blocks first
  // paint. The "now" month is read at this page edge (1-12) and INJECTED into the pure builder, which
  // stays clock-free (NFR1). The dataset reads per-cycle summaries only, never the interval series.
  const meters = await resolveMeters(farm.id);
  const nowMonth = new Date().getMonth() + 1;
  const solar = buildSolarDataset(meters, nowMonth);

  return (
    <>
      <div className="flex">
        <div className="relative min-w-0 flex-1 px-5 py-6 lg:px-12 lg:py-10">
          <DotPattern
            width={22}
            height={22}
            cr={1}
            className={cn(
              "pointer-events-none absolute inset-0 -z-10 h-[320px] text-primary/15",
              "[mask-image:radial-gradient(360px_circle_at_top,white,transparent)]",
            )}
          />
          {dataKind === "representative" && (
            <div className="mb-4 inline-flex items-center rounded-[var(--radius-control)] border border-outline-variant bg-surface-container px-2.5 py-1">
              <AnimatedShinyText
                className="type-label-caps text-on-surface-variant"
                shimmerWidth={80}
              >
                {en.shell.representativeBadge}
              </AnimatedShinyText>
            </div>
          )}

          <Reveal>
            <header className="mb-8">
              <p className="type-label-caps text-primary">{en.solar.tab.eyebrow}</p>
              <h1 className="type-display-lg mt-1 text-on-surface">{farm.name}</h1>
            </header>

            {/* The solar KPI strip (A-3): four calm tiles (solar meters | arrays | next true-up |
                needs review) above the lens set, no dollar tile. Then the solar lens set (A-2): the
                toggle (Arrays / Calendar / Map / Table, default Arrays) over the lens region, which
                renders the Arrays lens (A-5) as the default data hero; Map (A-6), Table (A-8), and
                Calendar (Epic D) fill in as their stories land. The filter bar and the drawer arrive
                in later stories. Switching a lens writes only the `lens` key and swaps the region
                below, never a crash or a blank shell. */}
            <div className="space-y-5">
              <SolarKpiStrip kpis={solar.kpis} />
              <SolarLensToggle />
              <SolarLensRegion dataset={solar} />
            </div>
          </Reveal>
        </div>

        <FindingsRail findings={findings} readOnly={demoOnly} />
      </div>

      <FindingsSheet findings={findings} readOnly={demoOnly} />
    </>
  );
}
