import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { sessionUserId } from "@/lib/auth";
import { en } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import { cardClass } from "@/components/ui";
import { upcomingCloses } from "@/lib/dashboard/calendar";
import { loadMeterReadSchedule } from "@/lib/pge/schedule-load";
import { closeDateShort } from "@/lib/format/date";
import { scanBills } from "@/lib/dashboard/bills";
import { computeKpiStrip, spendByMonth } from "@/lib/dashboard/kpi";
import type { FindingView } from "@/lib/dashboard/findings";
import { resolveActiveFarmId, resolveFarm, resolveFindings, resolveMeters } from "../(dashboard)/_data";
import { CalendarLens } from "./calendar-lens";
import { DashboardTile } from "./dashboard-tile";
import { ExpandablePanel } from "./expandable-panel";
import { type BentoItem } from "./bento-grid";
import { HomeBoard } from "./home-board";
import { ScaleToFit } from "./scale-to-fit";
import { BillingClosesCard } from "./billing-closes-card";
import { RateFixCard } from "./rate-fix-card";
import { BillsCard } from "./bills-card";
import { HomeMap } from "./home-map";
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
  const [meters, findings] = await Promise.all([resolveMeters(farm.id), resolveFindings(farm.id)]);

  const savingsCents = Math.round(findings.reduce((acc, f) => acc + (f.impactUsd ?? 0), 0) * 100);
  const rateFinding = findings.find((f) => f.tool === "rate-optimization") ?? null;
  const listFindings = rateFinding ? findings.filter((f) => f.id !== rateFinding.id) : findings;
  const opportunityCount = findings.filter((f) => (f.impactUsd ?? 0) > 0).length;

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

  // The bento widgets, in default order. The BentoGrid lets the grower drag them into any order
  // (saved per browser); spans/sizes are fixed here so the one-screen layout always holds.
  const bentoItems: BentoItem[] = [
    {
      id: "calendar",
      className: "min-h-0 overflow-hidden lg:col-span-2 lg:row-span-4",
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
      id: "map",
      className: "min-h-0 lg:col-span-2 lg:row-span-2",
      node: (
        <ExpandablePanel
          label={en.shell.map.caption}
          className="h-full"
          modal={
            <div className="h-[72vh]">
              <HomeMap meters={meters} energyHref={energyHref} heightClass="h-full" />
            </div>
          }
        >
          <section className={cardClass({ radius: "2xl", className: "flex h-full min-h-0 flex-col overflow-hidden p-3" })}>
            <h2 className="type-label-caps mb-2 px-1 text-on-surface-variant">{en.shell.map.caption}</h2>
            <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-control)]">
              <HomeMap meters={meters} energyHref={energyHref} heightClass="h-[260px] lg:h-full" />
            </div>
          </section>
        </ExpandablePanel>
      ),
    },
    {
      id: "spend",
      className: "min-h-0 overflow-hidden lg:col-span-2 lg:row-span-2",
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
      className: "min-h-0 overflow-hidden lg:col-span-2 lg:row-span-2",
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
      className: "lg:col-span-1 lg:row-span-1",
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
      className: "lg:col-span-1 lg:row-span-1",
      node: (
        <DashboardTile
          className="h-full w-full"
          label={en.home.rateFix.biggestEyebrow}
          detail={<RateFixCard finding={rateFinding} energyHref={energyHref} readOnly={demoOnly} />}
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
            <p className="type-body-md text-on-surface-variant">{en.home.rateFix.emptyTitle}</p>
          )}
        </DashboardTile>
      ),
    },
    {
      id: "bills",
      className: "lg:col-span-1 lg:row-span-1",
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
      className: "lg:col-span-1 lg:row-span-1",
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
    <div className="p-3 lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden lg:p-4">
      {/* The whole farm stays on ONE screen at any window size: the board is authored at a fixed design
          size and uniformly scaled to fit (ScaleToFit), so a smaller laptop shrinks it proportionally
          instead of crunching the tiles. Below lg the scaler is off and the bento stacks + scrolls. */}
      <ScaleToFit designWidth={1440} designHeight={820}>
        <div className="flex h-full w-full flex-col gap-3">
          <HomeBoard greeting={greeting} dateStr={dateStr} items={bentoItems} />
        </div>
      </ScaleToFit>
    </div>
  );
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
