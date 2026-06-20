import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { DotPattern } from "@/components/ui/dot-pattern";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { loadTrackedResults } from "@/lib/dashboard/results";
import { loadSolarFarmProvenance } from "@/lib/onboarding/farm";
import { verificationFor } from "@/lib/dashboard/drawer";
import type { BillVerification } from "@/lib/energy/bill-verify";
import { loadRateCard } from "@/lib/pge/rate-card";
import { resolveActiveFarmId, resolveFarm, resolveFindings, resolveMeters } from "../(dashboard)/_data";
import { farmRole } from "@/lib/auth/access";
import { Reveal } from "./shell/reveal";
import { MeterDrawer } from "./meter-drawer";
import { FindingsRail } from "./shell/findings-rail";
import { FindingsSheet } from "./shell/findings-sheet";
import { SolarSurface } from "./solar/solar-surface";
import { StatementUpload } from "./solar/statement-upload";

// The Solar tab data hero (A-1). A composition SIBLING of EnergyDashboard, not a fork: it renders
// the same three-zone OS shell (the agent rail / mobile bottom tabs come from the surrounding
// layout; this component owns the data-hero center column and the findings rail on the right),
// scoped to the active farm via resolveActiveFarmId -> resolveFarm. At this story the data hero is
// empty-but-structured (the four solar lenses, the KPI strip, and the filter bar arrive in A-2
// onward, the shared drawer is mounted in A-5); it must never render a crash or a blank shell.
// demoOnly (the public Tour)
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

  // The request-cached MeterView[] for this farm. The solar dataset is assembled in the client
  // SolarSurface (A-7) so the five filter dimensions (entity / ranch / rate / account / program)
  // narrow the KPI counts and every lens CONSISTENTLY off one narrowed fleet. The "now" month is
  // read at this server page edge (1-12) and INJECTED so the pure builder stays clock-free (NFR1);
  // the dataset reads per-cycle summaries only, never the interval series (NFR4).
  const meters = await resolveMeters(farm.id);
  // Read "now" ONCE at this server page edge and inject it (the month for the calendar/KPI, the ISO
  // instant for the F-1 grandfather countdown) so every pure builder downstream stays clock-free
  // (NFR1). The grandfather countdown is honest-unknown at launch regardless (no PTO date on file).
  const now = new Date();
  const nowMonth = now.getMonth() + 1;
  const nowIso = now.toISOString();

  // The farm-level solar provenance the dataset needs that does not live on a meter (C-1, FR6),
  // read in one query at this server edge and injected so the pure builder stays IO-free (NFR1):
  //  - DM4 nameplateVerified (`Farm.solarLayoutVerifiedAt != null`): false renders the populated
  //    nameplate CAUTIOUSLY (with an "unverified layout" qualifier) until a human confirms it,
  //    never presenting an unverified figure as confirmed.
  //  - unlinkedNemaCodes: the array codes meters referenced but no generating meter defined, which
  //    importInventory persisted onto the Farm. Re-reading them HERE is what makes the needs-review
  //    surfacing reach the page; without this runtime source the signal would vanish after import.
  // Fail-closed: a missing farm / absent flag reads as unverified, and a malformed JSON value
  // coerces to an empty code list (loadSolarFarmProvenance does the honest coercion).
  const { nameplateVerified, unlinkedNemaCodes } = await loadSolarFarmProvenance(prisma, farm.id);

  // G-3 (FR37/NFR10): the true-up statement upload is a WRITE that settles a dollar, so it is gated
  // to owner/manager (parity with the layout's `canAttach` and the chat route). A viewer of a real
  // farm, and the public Tour, never see the affordance - they can read the honest-blank state but
  // not push a PDF in. The Server Action re-checks the role server-side regardless.
  const role = !demoOnly && userId ? await farmRole(prisma, farm.id, userId) : null;
  const canAttach = role === "owner" || role === "manager";

  // The shared drill-in for the Solar tab (A-5): the SAME MeterDrawer the Energy dashboard mounts,
  // reused not duplicated (architecture: "Shared sub-components ... the drawer ... are reused").
  // Tapping any Arrays-lens meter row (or, later, a map pin / table row) writes ?meter=<id> via the
  // SURFACE.meter nuqs key; the drawer matches on meters.find((m) => m.id === meterId) and opens to
  // that meter's solar section (its d.showSolar block already carries program / nameplate / array /
  // allocation-honest-blank; A-9 extends that section, A-5 just makes the open work). The drawer is
  // fed the request-cached MeterView[] + findings, and the same bill-accuracy verdict and tracked
  // results the Energy drawer receives, so an opened meter behaves identically on either tab.
  // verificationFor returns null for a solar meter (it never claims a bill match on solar), so the
  // solar rows simply carry no verification badge, which is correct. The rate card is fs-backed
  // (process.cwd()) and applied HERE; only the serializable verdict crosses to the client drawer.
  const card = loadRateCard();
  const verifications: Record<string, BillVerification | null> = {};
  for (const meter of meters) {
    verifications[meter.id] = verificationFor(meter, card);
  }
  const trackedResults = await loadTrackedResults(prisma, farm.id, meters);

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
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="type-label-caps text-primary">{en.solar.tab.eyebrow}</p>
                <h1 className="type-display-lg mt-1 text-on-surface">{farm.name}</h1>
              </div>
              {/* G-3: the true-up statement upload on-ramp, owner/manager only. The single way a
                  net-metering dollar flips from honest-blank to settled (FR37/FR28). */}
              {canAttach && (
                <div className="sm:max-w-xs">
                  <StatementUpload />
                </div>
              )}
            </header>

            {/* The filter-aware solar surface (A-7): the KPI strip (A-3, four calm tiles, no dollar
                tile), the filter bar (entity / ranch / rate / account / program), the lens toggle
                (Arrays / Calendar / Map / Table, default Arrays), and the active lens region - all
                narrowing CONSISTENTLY to the same matching meters when a filter is applied. The
                Arrays lens (A-5) is the default data hero; Calendar (D-2) renders the true-up
                heartbeat; Map (A-6) and Table (A-8) are live. The shared drawer is mounted below
                (A-5). Switching a lens writes only the `lens` key; a filter writes only its key;
                neither drops the other or the open `?meter=` drawer. */}
            <SolarSurface
              meters={meters}
              nowMonth={nowMonth}
              nowIso={nowIso}
              nameplateVerified={nameplateVerified}
              unlinkedNemaCodes={unlinkedNemaCodes}
            />
          </Reveal>

          {/* The shared drill-in (A-5). Outside the Reveal stagger so a deep-linked ?meter= drawer
              is not delayed by the entrance choreography (matches energy-dashboard.tsx). */}
          <MeterDrawer
            meters={meters}
            findings={findings}
            verifications={verifications}
            trackedResults={trackedResults}
            readOnly={demoOnly}
            solar
            nowIso={nowIso}
            canAttach={canAttach}
          />
        </div>

        <FindingsRail findings={findings} readOnly={demoOnly} />
      </div>

      <FindingsSheet findings={findings} readOnly={demoOnly} />
    </>
  );
}
