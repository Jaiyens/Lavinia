import Link from "next/link";
import { ArrowRight, CalendarDays, Sprout, Sun } from "lucide-react";
import { sessionUserId } from "@/lib/auth";
import { en, num } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import { cardClass } from "@/components/ui";
import { computeKpiStrip, spendByMonth } from "@/lib/dashboard/kpi";
import { scanRefunds } from "@/lib/dashboard/refunds";
import { scanBills } from "@/lib/dashboard/bills";
import { getFarmWeather } from "@/lib/weather/forecast";
import type { MeterView } from "@/lib/dashboard/load";
import type { FindingView } from "@/lib/dashboard/findings";
import { resolveFarm, resolveFindings, resolveMeters } from "../(dashboard)/_data";
import { Reveal } from "./shell/reveal";
import { HomeMap } from "./home-map";
import { SpendHero } from "./spend-hero";
import { WeatherCard } from "./home-weather";
import { RateFixCard } from "./rate-fix-card";
import { RefundCard } from "./refund-card";
import { BillsCard } from "./bills-card";

// HOME: the farm at a glance (the Carson/Maya/Sally relay). The conversion hero leads - the Rate
// Fix card: one named pump, one dollar, "nothing changes." Then the money-found band, the spend
// area-chart, and the live meter map. A right rail carries context: farm profile, the remaining
// findings, spend-by-entity bars, solar, weather. Terra's warm palette and elements throughout.

const LA_TZ = "America/Los_Angeles";

export async function HomeOverview({ demoOnly = false }: { demoOnly?: boolean } = {}) {
  const userId = demoOnly ? null : await sessionUserId();
  const resolved = await resolveFarm(userId, demoOnly);
  if (!resolved) {
    return (
      <div className="mx-auto max-w-md px-5 py-24 text-center lg:px-12">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{en.shell.noFarmBody}</p>
      </div>
    );
  }

  const { farm } = resolved;
  const [meters, findings] = await Promise.all([
    resolveMeters(farm.id),
    resolveFindings(farm.id),
  ]);
  const weather = await getFarmWeather(meters);

  const meterCount = meters.length;
  const accountCount = new Set(
    meters.map((m) => m.accountNumber).filter((n): n is string => n !== null),
  ).size;
  const entityCount = new Set(
    meters.map((m) => m.entityName).filter((n): n is string => n !== null),
  ).size;
  const savingsDollars = findings.reduce((acc, f) => acc + (f.impactUsd ?? 0), 0);
  const savingsCents = Math.round(savingsDollars * 100);

  // The Rate Fix hero shows the single rate-optimization finding (the wedge); the prioritized list
  // shows the rest. If there is no rate finding, the hero renders "every pump on its best rate".
  const rateFinding = findings.find((f) => f.tool === "rate-optimization") ?? null;
  const listFindings = rateFinding ? findings.filter((f) => f.id !== rateFinding.id) : findings;
  // Opportunities = the dollar-bearing findings that sum to the total (so the count and the total
  // reconcile). The refund below is kept entirely separate (money owed back, not forward savings).
  const opportunityCount = findings.filter((f) => (f.impactUsd ?? 0) > 0).length;
  const refund = scanRefunds(meters);
  // Bills surface (top card): upcoming PG&E due dates/amounts from the connected account, by the
  // farm's Pacific calendar date. Always shown - three states (overdue / due this week / current).
  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: LA_TZ }).format(new Date());
  const bills = scanBills(meters, todayIso);

  const { spend } = computeKpiStrip(meters);
  const series = spendByMonth(meters);
  const entitySpend = spendByEntityTop(meters);

  const now = new Date();
  const laHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: LA_TZ, hour: "numeric", hourCycle: "h23" }).format(
      now,
    ),
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

  return (
    <div className="px-5 py-6 lg:px-12 lg:py-10">
      <Reveal>
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="type-display-lg text-on-surface">{greeting}</h1>
            <p className="type-body-md mt-1 text-on-surface-variant">{en.home.greetingSub}</p>
          </div>
          <div
            className={cardClass({ className: "flex items-center gap-2.5 px-4 py-2.5" })}
            aria-hidden
          >
            <CalendarDays size={18} className="text-on-surface-variant" />
            <span className="type-body-sm tnum text-on-surface">{dateStr}</span>
          </div>
        </header>
      </Reveal>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {/* 1+2. Bills due (time-sensitive money) and the refund hook, side by side on one row -
              they stack on phones, sit shoulder to shoulder at equal height from sm up. Bills is
              always shown (3 states); when there is no refund it fills the row on its own. */}
          <Reveal>
            <div className="flex flex-col gap-6 sm:flex-row sm:items-stretch">
              <div className="flex min-w-0 flex-1 [&>section]:w-full">
                <BillsCard scan={bills} energyHref={energyHref} />
              </div>
              {refund && (
                <div className="flex min-w-0 flex-1 [&>section]:w-full">
                  <RefundCard scan={refund} energyHref={energyHref} />
                </div>
              )}
            </div>
          </Reveal>

          {/* 2. Total found across the operation, with the count (a partial list reads as partial). */}
          <Reveal>
            <MoneyFoundBand
              savingsCents={savingsCents}
              opportunityCount={opportunityCount}
              energyHref={energyHref}
            />
          </Reveal>

          {/* 3. The biggest single fix (the hero). */}
          <Reveal>
            <RateFixCard finding={rateFinding} energyHref={energyHref} readOnly={demoOnly} />
          </Reveal>

          {/* 4. The prioritized list, each row a plain one-line story with a type tag. */}
          <Reveal>
            <FindingsCard findings={listFindings} energyHref={energyHref} />
          </Reveal>

          {/* 5. The spend trend, with the fixed (non-alarming) framing. */}
          <Reveal>
            <SpendHero
              series={series}
              latestCents={spend.cents}
              foundToCutCents={savingsCents}
              coverageLoaded={spend.coverage.loaded}
            />
          </Reveal>

          {/* 6. The farm on the map. */}
          <Reveal>
            <section className={cardClass({ radius: "2xl", className: "flex flex-col p-6" })}>
              <h2 className="type-label-caps mb-3 text-on-surface-variant">{en.shell.map.caption}</h2>
              <HomeMap meters={meters} energyHref={energyHref} />
            </section>
          </Reveal>

          {/* 7. The trust line: the meter count, demoted from a headline to a quiet reassurance. */}
          <p className="type-body-sm text-center text-on-surface-variant">
            {en.home.trustLine(meterCount)}
          </p>
        </div>

        {/* Right rail: secondary context - farm profile, spend-by-entity bars, solar, weather. */}
        <Reveal>
          <aside className="flex w-full flex-col gap-4 lg:w-[360px] lg:shrink-0 lg:sticky lg:top-6">
            <ProfileCard
              farmName={farm.name}
              ownerFirst={ownerFirst}
              meterCount={meterCount}
              accountCount={accountCount}
              entityCount={entityCount}
            />
            <SpendByEntityCard rows={entitySpend} />
            <SolarCard meters={meters} />
            <WeatherCard weather={weather} />
          </aside>
        </Reveal>
      </div>
    </div>
  );
}

// Top entities by latest reconciled bill (for the right-rail progress bars).
function spendByEntityTop(meters: MeterView[]): { name: string; cents: number }[] {
  const byEntity = new Map<string, number>();
  for (const m of meters) {
    if (m.coverageState !== "reconciled" || m.entityName === null) continue;
    const latest = m.periods[m.periods.length - 1];
    if (latest?.printedTotalCents != null) {
      byEntity.set(m.entityName, (byEntity.get(m.entityName) ?? 0) + latest.printedTotalCents);
    }
  }
  return [...byEntity.entries()]
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 5);
}

// The farm profile card (reference's profile card): a leaf badge, the farm + owner, and chips.
function ProfileCard({
  farmName,
  ownerFirst,
  meterCount,
  accountCount,
  entityCount,
}: {
  farmName: string;
  ownerFirst: string | null;
  meterCount: number;
  accountCount: number;
  entityCount: number;
}) {
  return (
    <section className={cardClass({ radius: "2xl", className: "flex flex-col items-center p-6 text-center" })}>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
        <Sprout size={26} aria-hidden />
      </span>
      <p className="type-title mt-3 text-on-surface">{farmName}</p>
      <p className="type-caption text-on-surface-variant">{ownerFirst ?? en.home.profile.ownerRole}</p>
      <div className="mt-4 flex w-full items-stretch gap-2">
        <Chip value={meterCount} label={en.home.profile.meters} />
        <Chip value={accountCount} label={en.home.profile.accounts} />
        <Chip value={entityCount} label={en.home.profile.entities} />
      </div>
    </section>
  );
}

function Chip({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-xl border border-outline-variant bg-surface-container-low px-1 py-2">
      <span className="type-body-md tnum font-semibold text-on-surface">{value}</span>
      <span className="type-caption text-on-surface-variant">{label}</span>
    </div>
  );
}

// The money-found band: the top-level total across the whole operation, with the opportunity count
// so a partial list reads as partial. The biggest single item (the hero) sits just below it; the
// total always equals the hero plus the list. Refunds are NEVER summed in here. Honest empty.
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

// The prioritized "what needs a look" list: each row a plain one-line story (no mid-word truncation)
// with a type tag (Rate fix / Spike / Solar / Bill check) and its dollar amount.
function FindingsCard({ findings, energyHref }: { findings: FindingView[]; energyHref: string }) {
  return (
    <section className={cardClass({ radius: "2xl", className: "flex flex-col p-6" })}>
      <h2 className="type-label-caps mb-3 text-on-surface-variant">{en.home.findingsTitle}</h2>
      {findings.length === 0 ? (
        <p className="type-body-md text-on-surface-variant">{en.home.findingsEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
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
                      <span className="truncate type-caption text-on-surface-variant">
                        {f.meterName}
                      </span>
                    )}
                  </div>
                  {/* The full plain-language story; wraps to two lines, never truncated mid-word. */}
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

// Spend by entity as labeled progress bars (reference's "Developed areas").
function SpendByEntityCard({ rows }: { rows: { name: string; cents: number }[] }) {
  const max = rows.reduce((m, r) => Math.max(m, r.cents), 0);
  return (
    <section className={cardClass({ radius: "2xl", className: "flex flex-col p-6" })}>
      <h2 className="type-label-caps text-on-surface-variant">{en.home.byEntity.title}</h2>
      {rows.length === 0 ? (
        <p className="type-body-md mt-4 text-on-surface-variant">{en.home.byEntity.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate type-body-sm text-on-surface">{r.name}</span>
                <span className="shrink-0 type-caption tnum text-on-surface-variant">
                  {formatUsdWhole(r.cents)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${max > 0 ? Math.max((r.cents / max) * 100, 4) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The solar / NEM snapshot card: solar meter count, installed nameplate, and the nearest true-up.
function SolarCard({ meters }: { meters: MeterView[] }) {
  const solar = meters.filter((m) => m.isSolar);
  const kwTotal = solar.reduce((acc, m) => acc + (m.solarKw ?? 0), 0);
  const trueUpMonths = solar
    .map((m) => m.trueUpMonth)
    .filter((n): n is number => n !== null && n >= 1 && n <= 12);

  let nextTrueUp: string | null = null;
  if (trueUpMonths.length > 0) {
    const laMonth = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: LA_TZ, month: "numeric" }).format(new Date()),
    );
    const soonest = [...trueUpMonths].sort(
      (a, b) => ((a - laMonth + 12) % 12) - ((b - laMonth + 12) % 12),
    )[0];
    if (soonest !== undefined) {
      nextTrueUp = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
        new Date(2000, soonest - 1, 1),
      );
    }
  }

  return (
    <section className={cardClass({ radius: "2xl", className: "flex flex-col p-6" })}>
      <div className="flex items-center gap-2">
        <Sun size={18} className="text-gold" aria-hidden />
        <h2 className="type-label-caps text-on-surface-variant">{en.home.solarTitle}</h2>
      </div>
      {solar.length === 0 ? (
        <p className="type-body-md mt-4 text-on-surface-variant">{en.home.solarNone}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1">
          <p className="type-headline tnum text-on-surface">{en.home.solarMeters(solar.length)}</p>
          {kwTotal > 0 && (
            <p className="type-body-md text-on-surface-variant">
              {en.home.solarNameplate(num(kwTotal))}
            </p>
          )}
          {nextTrueUp && (
            <p className="type-body-md text-on-surface-variant">{en.home.solarTrueUp(nextTrueUp)}</p>
          )}
        </div>
      )}
    </section>
  );
}
