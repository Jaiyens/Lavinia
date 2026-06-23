import Link from "next/link";
<<<<<<< HEAD
import { cookies } from "next/headers";
=======
import type { Feature, FeatureCollection } from "geojson";
>>>>>>> origin/main
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { sessionUserId } from "@/lib/auth";
import { resolveFarmAccess } from "@/lib/auth/access";
import { MEMBER_WELCOME_COOKIE, shouldShowMemberWelcome } from "@/lib/member-welcome";
import { en } from "@/copy/en";
import { MemberWelcome } from "./member-welcome";
import { formatUsdWhole } from "@/lib/format/money";
import { cardClass } from "@/components/ui";
import { upcomingCloses } from "@/lib/dashboard/calendar";
import { loadMeterReadSchedule } from "@/lib/pge/schedule-load";
import { closeDateShort } from "@/lib/format/date";
import { scanBills } from "@/lib/dashboard/bills";
import { computeKpiStrip, spendByMonth } from "@/lib/dashboard/kpi";
import type { FindingView } from "@/lib/dashboard/findings";
<<<<<<< HEAD
import { resolveActiveFarmId, resolveFarm, resolveFindings, resolveMeters } from "../(dashboard)/_data";
=======
import { loadRepresentativeFarm } from "@/lib/parcel/farm/seed";
import { colorForParcel } from "@/lib/parcel/farm/color";
import type { FarmParcel } from "@/lib/parcel/farm/types";
import { resolveFarm, resolveFindings, resolveMeters } from "../(dashboard)/_data";
>>>>>>> origin/main
import { CalendarLens } from "./calendar-lens";
import { DashboardTile } from "./dashboard-tile";
import { ExpandablePanel } from "./expandable-panel";
import { type BentoItem } from "./bento-grid";
import { HomeBoard } from "./home-board";
import { BillingClosesCard } from "./billing-closes-card";
import { RateFixCard } from "./rate-fix-card";
import { BillsCard } from "./bills-card";
import { ParcelsPreview, type ParcelsPreviewData } from "./parcels-preview";
import { SpendHero } from "./spend-hero";

// HOME: a no-scroll BENTO of rich, Apple-widget-style panels - each shows its real data at a glance
// (no click required). The satellite map, the spend graph, and the "what needs a look" list are live
// inline; the calendar is one widget among many; the small money panels show the key number and
// enlarge on tap for the full detail. Everything visible on one screen.

const LA_TZ = "America/Los_Angeles";

export async function HomeOverview({ demoOnly = false }: { demoOnly?: boolean } = {}) {
  const userId = demoOnly ? null : await sessionUserId();
  const activeId = demoOnly ? null : await resolveActiveFarmId(userId);
  const resolved = await resolveFarm(userId, activeId, demoOnly);
  if (!resolved) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center lg:px-12">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{en.shell.noFarmBody}</p>
      </div>
    );
  }

  const { farm } = resolved;
  // A signed-in VIEWER is read-only: the one-tap finding responses require manager+, so hide them
  // (the same mechanism the public Tour uses via demoOnly). Owners/managers keep the actions.
  const access = !demoOnly && userId ? await resolveFarmAccess(prisma, farm.id, userId) : null;
  const findingsReadOnly = demoOnly || !(access?.canManageData ?? false);
  // An invited member (added by someone else) gets a one-time welcome on Home; the owner who
  // created the farm never does. Decided server-side with the dismissal cookie so it never flashes.
  let showMemberWelcome = false;
  if (!demoOnly && userId) {
    const membership = await prisma.farmMembership.findUnique({
      where: { farmId_userId: { farmId: farm.id, userId } },
      select: { invitedById: true },
    });
    const dismissed = (await cookies()).has(MEMBER_WELCOME_COOKIE);
    showMemberWelcome = shouldShowMemberWelcome({
      wasInvited: membership?.invitedById != null,
      dismissed,
    });
  }
  const [meters, findings] = await Promise.all([resolveMeters(farm.id), resolveFindings(farm.id)]);

  const savingsCents = Math.round(findings.reduce((acc, f) => acc + (f.impactUsd ?? 0), 0) * 100);
  const rateFinding = findings.find((f) => f.tool === "rate-optimization") ?? null;
  const listFindings = rateFinding ? findings.filter((f) => f.id !== rateFinding.id) : findings;
  const opportunityCount = findings.filter((f) => (f.impactUsd ?? 0) > 0).length;
  // The Rate Fix empty state must not assert "every pump is on its best rate" until the rate
  // engine actually had data to evaluate. It only prices meters whose bills reconciled, so a
  // freshly connected farm (no reconciled bills yet) gets a null rateFinding because nothing was
  // checked, not because everything is optimal. Gate the affirmative copy on real analysis having
  // been possible; otherwise show the honest "still loading" state.
  const rateAnalyzed = meters.some((m) => m.coverageState === "reconciled");

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: LA_TZ }).format(new Date());
  const bills = scanBills(meters, todayIso);
  const schedule = loadMeterReadSchedule();
  const nextClose = upcomingCloses(meters, schedule, todayIso)[0] ?? null;
  const { spend } = computeKpiStrip(meters);
  const series = spendByMonth(meters);

  const now = new Date();
  const laHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: LA_TZ, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  const greetingWord =
    laHour < 12
      ? en.home.greetingMorning
      : laHour < 18
        ? en.home.greetingAfternoon
        : en.home.greetingEvening;
  const ownerFirst =
    (farm.people.find((p) => p.role === "owner")?.name ?? "").trim().split(/\s+/)[0] || null;
  const greeting = ownerFirst ? `${greetingWord}, ${ownerFirst}` : greetingWord;
  const dateStr = new Intl.DateTimeFormat("en-US", {
    timeZone: LA_TZ,
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);

  const energyHref = demoOnly ? "/tour/energy" : "/energy";
  const parcelsHref = demoOnly ? "/tour/parcels" : "/parcels";
  // The Home "Your parcels" tile: a satellite preview of the operation's land that links to the
  // full Parcels surface. Built from the seeded representative farm (same source as /parcels), so
  // the preview shows the grower's actual blocks, not a static image.
  const parcelsPreview = buildParcelsPreview(loadRepresentativeFarm(todayIso).parcels);

  // The bento widgets, in default order. The BentoGrid lets the grower drag them into any order
  // (saved per browser); spans/sizes are fixed here so the one-screen layout always holds.
  const bentoItems: BentoItem[] = [
    {
      id: "calendar",
      className: "min-h-0 overflow-hidden col-span-2 row-span-4",
      node: (
        <ExpandablePanel
          label={en.shell.calendar.heading}
          className="h-full overflow-auto"
          modal={<CalendarLens meters={meters} schedule={schedule} todayIso={todayIso} />}
        >
          <CalendarLens meters={meters} schedule={schedule} todayIso={todayIso} />
        </ExpandablePanel>
      ),
    },
    {
      // The parcels preview: a clickable satellite thumbnail of the operation's land that navigates
      // to the full Parcels surface (no expand-to-modal; the whole tile is one click-through).
      id: "map",
      className: "min-h-0 col-span-2 row-span-2",
      node: <ParcelsPreview data={parcelsPreview} href={parcelsHref} />,
    },
    {
      id: "spend",
      className: "min-h-0 overflow-hidden col-span-2 row-span-2",
      node: (
        <ExpandablePanel
          label={en.home.spendHero.title}
          className="h-full overflow-auto"
          modal={
            <SpendHero
              series={series}
              latestCents={spend.cents}
              foundToCutCents={savingsCents}
              coverageLoaded={spend.coverage.loaded}
            />
          }
        >
          <SpendHero
            series={series}
            latestCents={spend.cents}
            foundToCutCents={savingsCents}
            coverageLoaded={spend.coverage.loaded}
          />
        </ExpandablePanel>
      ),
    },
    {
      id: "findings",
      className: "min-h-0 overflow-hidden col-span-2 row-span-2",
      node: (
        <ExpandablePanel
          label={en.home.findingsTitle}
          className="h-full"
          modal={
            <div className="h-[70vh]">
              <FindingsCard findings={listFindings} energyHref={energyHref} />
            </div>
          }
        >
          <FindingsCard findings={listFindings} energyHref={energyHref} />
        </ExpandablePanel>
      ),
    },
    {
      id: "closes",
      className: "col-span-1 row-span-1",
      node: (
        <DashboardTile
          className="h-full w-full"
          label={en.shell.calendar.cycle.closesEyebrow}
          detail={<BillingClosesCard closes={upcomingCloses(meters, schedule, todayIso)} energyHref={energyHref} />}
        >
          {nextClose ? (
            <>
              <p className="type-headline text-on-surface">{closeDateShort(nextClose.closeIso)}</p>
              <p className="type-body-sm mt-1 text-on-surface-variant">
                {en.shell.calendar.cycle.closesMeters(nextClose.meterCount)}
              </p>
            </>
          ) : (
            <p className="type-body-md text-on-surface-variant">{en.shell.calendar.cycle.closesNone}</p>
          )}
        </DashboardTile>
      ),
    },
    {
      id: "fix",
      className: "col-span-1 row-span-1",
      node: (
        <DashboardTile
          className="h-full w-full"
          label={en.home.rateFix.biggestEyebrow}
          detail={<RateFixCard finding={rateFinding} analyzed={rateAnalyzed} energyHref={energyHref} readOnly={findingsReadOnly} />}
        >
          {rateFinding ? (
            <>
              {rateFinding.impactUsd != null && rateFinding.impactUsd > 0 && (
                <p className="type-headline tnum text-money-positive">
                  ~{formatUsdWhole(Math.round(rateFinding.impactUsd * 100))}
                </p>
              )}
              <p className="truncate type-body-md mt-1 text-on-surface-variant">
                {rateFinding.meterName ?? "A pump"}
              </p>
            </>
          ) : (
            <p className="type-body-md text-on-surface-variant">
              {rateAnalyzed ? en.home.rateFix.emptyTitle : en.home.spendTrendEmpty}
            </p>
          )}
        </DashboardTile>
      ),
    },
    {
      id: "bills",
      className: "col-span-1 row-span-1",
      node: (
        <DashboardTile
          className="h-full w-full"
          label={en.home.bills.eyebrow}
          detail={<BillsCard scan={bills} energyHref={energyHref} />}
        >
          {bills.soonestDueIso ? (
            <>
              <p className="type-headline text-on-surface">{closeDateShort(bills.soonestDueIso)}</p>
              <p className="type-body-sm tnum mt-1 text-on-surface-variant">{formatUsdWhole(bills.totalCents)}</p>
            </>
          ) : (
            <p className="type-body-md text-on-surface-variant">{en.home.bills.noneCurrent}</p>
          )}
        </DashboardTile>
      ),
    },
    {
      id: "savings",
      className: "col-span-1 row-span-1",
      node: (
        <DashboardTile
          className="h-full w-full"
          label={en.home.savingsCard.eyebrow}
          detail={
            <div className="flex flex-col gap-4">
              <MoneyFoundBand savingsCents={savingsCents} opportunityCount={opportunityCount} energyHref={energyHref} />
              <FindingsCard findings={listFindings} energyHref={energyHref} />
            </div>
          }
        >
          <p className="type-headline tnum text-on-surface">{formatUsdWhole(savingsCents)}</p>
          <p className="type-body-sm mt-1 text-on-surface-variant">{en.home.savingsCard.count(opportunityCount)}</p>
        </DashboardTile>
      ),
    },
  ];

  return (
<<<<<<< HEAD
    <div className="flex flex-col gap-3 p-3 lg:h-[calc(100dvh-120px)] lg:overflow-hidden lg:p-4">
      {/* One-time welcome for an invited member (shrinks to nothing once dismissed). */}
      <MemberWelcome show={showMemberWelcome} farmName={farm.name} />
=======
    // Capped to the viewport height at EVERY width (not just lg) so the bento keeps its fixed
    // 6x4 composition on smaller laptops instead of reflowing: the rows hold a defined height and
    // the board scrolls horizontally inside, rather than collapsing to a single column.
    <div className="flex h-[calc(100dvh-7.5rem)] flex-col gap-3 overflow-hidden p-3 lg:p-4">
>>>>>>> origin/main
      {/* Header (greeting + date + the "Edit tabs" lock) and the drag-to-rearrange bento. Capped to
          the viewport (minus the tour banner) so the whole farm stays on one screen. */}
      <HomeBoard greeting={greeting} dateStr={dateStr} items={bentoItems} />
    </div>
  );
}

// Build the Home parcels-preview payload from the operation's blocks: each block as a colored
// polygon (crop palette, same as the Parcels surface) plus the bounds that frame the whole farm.
// Server-side and serializable, so the client preview map just draws and fits.
function buildParcelsPreview(parcels: FarmParcel[]): ParcelsPreviewData {
  const features: Feature[] = parcels.map((p) => ({
    type: "Feature",
    properties: { fill: colorForParcel(p, "crop", new Date().getUTCFullYear()) },
    geometry: p.geometry,
  }));
  const collection: FeatureCollection = { type: "FeatureCollection", features };

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const p of parcels) {
    if (p.centroid_lon < minLng) minLng = p.centroid_lon;
    if (p.centroid_lat < minLat) minLat = p.centroid_lat;
    if (p.centroid_lon > maxLng) maxLng = p.centroid_lon;
    if (p.centroid_lat > maxLat) maxLat = p.centroid_lat;
  }
  const bounds: ParcelsPreviewData["bounds"] = Number.isFinite(minLng)
    ? [
        [minLng, minLat],
        [maxLng, maxLat],
      ]
    : null;

  return { features: collection, bounds };
}

// The money-found band: the top-level total across the whole operation, with the opportunity count.
function MoneyFoundBand({
  savingsCents,
  opportunityCount,
  energyHref,
}: {
  savingsCents: number;
  opportunityCount: number;
  energyHref: string;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-[var(--radius-lg)] p-6 text-on-primary"
      style={{ backgroundImage: "linear-gradient(135deg, var(--green-deep), var(--primary))" }}
    >
      <p className="type-label-caps text-on-primary/80">{en.home.savingsCard.eyebrow}</p>
      {savingsCents > 0 ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="type-money-hero tnum">{formatUsdWhole(savingsCents)}</p>
            <Link
              href={energyHref}
              className="inline-flex min-h-[44px] items-center gap-1.5 type-body-sm font-semibold underline-offset-4 hover:underline"
            >
              {en.home.savingsCard.cta}
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <p className="type-body-sm mt-1 text-on-primary/85">
            {en.home.savingsCard.across} · {en.home.savingsCard.count(opportunityCount)}
          </p>
        </>
      ) : (
        <p className="type-body-md mt-2 text-on-primary/90">{en.home.savingsCard.zero}</p>
      )}
    </section>
  );
}

// The type tag on each "what needs a look" row, from the finding's engine tool.
function TypeTag({ tool }: { tool: string }) {
  const label = en.home.tags[tool] ?? en.home.tags["rate-optimization"];
  return (
    <span className="type-label-caps inline-flex shrink-0 items-center rounded-[var(--radius-control)] bg-surface-container px-2 py-0.5 text-on-surface-variant">
      {label}
    </span>
  );
}

// The prioritized "what needs a look" list: each row a plain one-line story with a type tag.
function FindingsCard({ findings, energyHref }: { findings: FindingView[]; energyHref: string }) {
  return (
    <section className={cardClass({ radius: "2xl", className: "flex h-full min-h-0 flex-col overflow-hidden p-5" })}>
      <h2 className="type-label-caps mb-3 shrink-0 text-on-surface-variant">{en.home.findingsTitle}</h2>
      {findings.length === 0 ? (
        <p className="type-body-md text-on-surface-variant">{en.home.findingsEmpty}</p>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {findings.map((f) => (
            <li key={f.id}>
              <Link
                href={f.meterId ? `${energyHref}?meter=${f.meterId}` : energyHref}
                className="flex items-start justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 transition-colors hover:bg-surface-container"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <TypeTag tool={f.tool} />
                    {f.meterName && (
                      <span className="truncate type-caption text-on-surface-variant">{f.meterName}</span>
                    )}
                  </div>
                  <p className="type-body-md text-on-surface">{f.situation}</p>
                </div>
                {f.impactUsd != null && f.impactUsd > 0 && (
                  <span className="shrink-0 type-num font-semibold text-money-positive">
                    {formatUsdWhole(Math.round(f.impactUsd * 100))}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
