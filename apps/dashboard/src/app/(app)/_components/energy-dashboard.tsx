import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { resolveFarmAccess } from "@/lib/auth/access";
import { showPendingPullBanner } from "@/lib/dashboard/connection";
import { loadTrackedResults } from "@/lib/dashboard/results";
import { verificationFor } from "@/lib/dashboard/drawer";
import type { BillVerification } from "@/lib/energy/bill-verify";
import { loadRateCard } from "@/lib/pge/rate-card";
import { loadMeterReadSchedule } from "@/lib/pge/schedule-load";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { resolveActiveFarmId, resolveFarm, resolveMeters, resolveFindings } from "../(dashboard)/_data";
import { Reveal } from "./shell/reveal";
import { KpiStrip } from "./kpi-strip";
import { LensToggle } from "./lens-toggle";
import { LensRegion } from "./lens-region";
import { FilterBar } from "./filter-bar";
import { MeterDrawer } from "./meter-drawer";
import { FindingsRail } from "./shell/findings-rail";
import { FindingsSheet } from "./shell/findings-sheet";

// The center data hero (Home == Energy dashboard today). Server Component: reads the dashboard
// farm from the DB (the real reconciled account when connected, else the badged representative
// seed), then stacks the reveal-wrapped sections: farm header -> [KPI strip, Story 2.3] ->
// lens toggle -> active lens. The KPI strip and lens content land in later stories; this story
// composes the slots. Each Reveal child is an intrinsic element so the staggered reveal applies.
export async function EnergyDashboard({ demoOnly = false }: { demoOnly?: boolean } = {}) {
  // demoOnly (the public Tour, Story 5.3) pins the data to the demo farm, never the real
  // connected one, so a real grower's financials can never leak to an unauthenticated visitor.
  // Otherwise owner-scope on the signed-in operator so they see their OWN farm (never
  // another grower's). The Tour skips the session read entirely - it is a public surface.
  const userId = demoOnly ? null : await sessionUserId();
  const activeId = demoOnly ? null : await resolveActiveFarmId(userId);
  // Request-cached resolvers (shared with the (dashboard) layout): on a real navigation the
  // farm/meters/findings are fetched once for the whole request, not re-queried per component
  // against the remote database (part of the Home<->Energy latency fix).
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
  // A signed-in VIEWER is read-only: the one-tap finding responses require manager+, so hide them
  // (the same mechanism the public Tour uses via demoOnly). Owners/managers keep the actions.
  const access = !demoOnly && userId ? await resolveFarmAccess(prisma, farm.id, userId) : null;
  const findingsReadOnly = demoOnly || !(access?.canManageData ?? false);
  const meters = await resolveMeters(farm.id);
  // AC3 (Story 5.3): when a real farm's live PG&E pull is still pending but RECONCILED bills
  // are already in, the dashboard keeps working off those bills and shows an honest
  // "connecting" banner. Never for the demo (the query is skipped) or a fully-active farm.
  // hasBills requires `reconciled` (not merely "has a bill row"), so the banner's promise
  // ("your bills are already in") is only made when there are usable figures.
  const pgeConnections =
    dataKind === "real"
      ? await prisma.connection.findMany({
          where: { farmId: farm.id, type: "pge_smd" },
          select: { type: true, status: true },
        })
      : [];
  const pendingPull = showPendingPullBanner({
    dataKind,
    connections: pgeConnections,
    hasBills: meters.some((m) => m.coverageState === "reconciled"),
  });
  // The farm's pending findings; the drawer filters to its own meter (Story 3.1).
  const findings = await resolveFindings(farm.id);
  // Accepted recommendations' predicted-vs-realized results (Story 4.2, FR-20),
  // grouped by meter for the drawer's "What happened" section. Reads "pending" until
  // a bill posts after acceptance (by design in v1).
  const trackedResults = await loadTrackedResults(prisma, farm.id, meters);
  // The committed 2026 read schedule (fs read, server-only) + "today" as the
  // GROWER's calendar date for the Calendar lens (Story 3.5). Bills and the
  // farm are Pacific (architecture: one timezone); a UTC date would tip into
  // tomorrow every California evening and shift the default month at month end.
  const schedule = loadMeterReadSchedule();
  const todayIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(new Date());

  // Bill-accuracy verification (Story 4.1, FR-19): recompute each meter's latest
  // bill server-side and pass the small verdict map to the (client) drawer. The
  // rate card is fs-backed (process.cwd()), so it is loaded and applied HERE and
  // never crosses to the client - the drawer receives only the serializable result.
  const card = loadRateCard();
  const verifications: Record<string, BillVerification | null> = {};
  for (const meter of meters) {
    verifications[meter.id] = verificationFor(meter, card);
  }

  return (
    <>
      {/* Energy keeps the persistent findings rail (now attached here, not the shell): a
          content column on the left, the 320px findings rail flush on the right. */}
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

          {pendingPull && (
            <div className="mb-4 rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-low px-4 py-3 type-body-sm text-on-surface-variant">
              {en.shell.pendingPull}
            </div>
          )}

          <Reveal>
            <header className="mb-8">
              <p className="type-label-caps text-primary">{en.shell.farmEyebrow}</p>
              <h1 className="type-display-lg mt-1 text-on-surface">{farm.name}</h1>
            </header>

            <div className="mb-6">
              <KpiStrip meters={meters} />
            </div>

            <div className="mb-6">
              <LensToggle />
            </div>

            <div className="mb-4">
              <FilterBar meters={meters} />
            </div>

            <div>
              <LensRegion meters={meters} schedule={schedule} todayIso={todayIso} />
            </div>
          </Reveal>

          {/* The shared drill-in (Story 2.5). Outside the Reveal stagger so a deep-linked
              ?meter= drawer is not delayed by the entrance choreography. */}
          <MeterDrawer
            meters={meters}
            findings={findings}
            verifications={verifications}
            trackedResults={trackedResults}
            card={card}
            readOnly={findingsReadOnly}
          />
        </div>

        <FindingsRail findings={findings} readOnly={findingsReadOnly} />
      </div>

      <FindingsSheet findings={findings} readOnly={findingsReadOnly} />
    </>
  );
}
