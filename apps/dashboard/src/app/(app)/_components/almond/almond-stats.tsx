import { en } from "@/copy/en";
import { cn } from "@/lib/cn";
import { centsFromDollars, formatUsdWhole } from "@/lib/format/money";
import type { LandingStats } from "@/lib/almond/landing-stats";

const t = en.shell.almond.stats;

/**
 * The Almond landing command center's KPI row: four Palantir-style stat cards (a bordered card with a
 * small-caps label, one big tabular figure, and a muted hint line). Every figure is REAL, computed
 * from the farm's own reconciled data (src/lib/almond/landing-stats.ts) and threaded in from the
 * server page; a money figure with nothing on file renders the honest "Not on file" placeholder
 * instead of a fabricated $0 (AR-15, apps/dashboard/CLAUDE.md honesty law).
 *
 * No hooks: this renders the same whether the page is the authed full page or (via no stats) absent
 * entirely, so it stays a pure presentational module the (client) AlmondPage can drop in.
 */
export function AlmondStats({ stats }: { stats: LandingStats }) {
  // Money cards normalize to "Not on file" when the underlying reconciled data is absent: a savings
  // opportunity of $0 (no open findings) and a null last-month spend are both honest blanks, never a
  // screaming zero. Counts render their integer (0 is a true count, not a withheld figure).
  const savings =
    stats.savingsUsd > 0 ? formatUsdWhole(centsFromDollars(stats.savingsUsd)) : t.empty;
  const lastMonthSpend =
    stats.lastMonthSpendCents !== null ? formatUsdWhole(stats.lastMonthSpendCents) : t.empty;

  const cards: { label: string; value: string; hint: string }[] = [
    { label: t.savings, value: savings, hint: t.savingsHint },
    { label: t.metersAtRisk, value: String(stats.metersAtRisk), hint: t.metersAtRiskHint },
    { label: t.lastMonthSpend, value: lastMonthSpend, hint: t.lastMonthSpendHint },
    { label: t.activeAlerts, value: String(stats.activeAlerts), hint: t.activeAlertsHint },
  ];

  return (
    <dl className="grid w-full grid-cols-2 gap-2.5 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            "flex flex-col gap-2 rounded-[var(--radius-lg)] border border-outline-variant bg-white p-4 text-left",
            "transition-colors hover:border-outline",
          )}
        >
          <dt className="type-label-caps text-on-surface-variant">{card.label}</dt>
          <dd className="figure tnum text-2xl leading-none text-on-surface lg:text-3xl">{card.value}</dd>
          <p className="type-caption text-on-surface-variant">{card.hint}</p>
        </div>
      ))}
    </dl>
  );
}
