import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui";
import { formatUsdWhole } from "@/lib/format/money";
import type { BillsScan } from "@/lib/dashboard/bills";

// The bills surface: the TOP card of the landing (time-sensitive money leads). Three states:
//  - overdue: most urgent, clay edge + disconnection-risk line;
//  - due:     this week's rolled-up amount + soonest due date;
//  - current: the calm all-clear with the next due date.
// Always rendered (never blank/hidden) - the most prominent spot always says something honest.

const t = en.home.bills;
const LA_TZ = "America/Los_Angeles";

const fmtDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: LA_TZ, month: "short", day: "numeric" }).format(
    new Date(`${iso}T12:00:00`),
  );

export function BillsCard({ scan, energyHref }: { scan: BillsScan; energyHref: string }) {
  const amount = formatUsdWhole(scan.totalCents);
  const overdue = scan.state === "overdue";

  // Group the bills by due DATE (a real farm has many accounts closing on the same cycle, so
  // the raw list would repeat a date). One row per date: total owed + how many bills land then.
  const byDate = new Map<string, { cents: number; count: number; overdue: boolean }>();
  for (const b of scan.upcoming) {
    const cur = byDate.get(b.dueIso);
    if (cur) {
      cur.cents += b.cents;
      cur.count += 1;
      cur.overdue = cur.overdue || b.overdue;
    } else {
      byDate.set(b.dueIso, { cents: b.cents, count: 1, overdue: b.overdue });
    }
  }
  const dateRows = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 6);

  return (
    <section
      className={cardClass({
        radius: "2xl",
        className: cn("flex flex-col p-6", overdue && "border-l-4 border-l-alert"),
      })}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg",
            overdue
              ? "bg-alert-container text-on-alert-container"
              : scan.state === "due"
                ? "bg-primary-container text-on-primary-container"
                : "bg-primary-container text-on-primary-container",
          )}
        >
          {overdue ? (
            <TriangleAlert size={16} aria-hidden />
          ) : scan.state === "due" ? (
            <CalendarClock size={16} aria-hidden />
          ) : (
            <CheckCircle2 size={16} aria-hidden />
          )}
        </span>
        <span className="type-label-caps text-on-surface-variant">{t.eyebrow}</span>
      </div>

      {scan.state === "current" ? (
        <>
          <p className="type-headline mt-3 text-on-surface">{t.allCurrent}</p>
          {scan.soonestDueIso ? (
            <p className="type-body-md mt-1 text-on-surface-variant">
              {t.nextDue(fmtDate(scan.soonestDueIso), amount)}
            </p>
          ) : (
            <p className="type-body-md mt-1 text-on-surface-variant">{t.noneCurrent}</p>
          )}
        </>
      ) : (
        <>
          <p
            className={cn(
              "type-money-hero mt-2 tnum",
              overdue ? "text-alert" : "text-on-surface",
            )}
          >
            {amount}
          </p>
          <p className="type-body-md text-on-surface-variant">
            {overdue ? t.overdue(amount, scan.count) : t.dueThisWeek(amount, scan.count)}
          </p>
          {scan.soonestDueIso && (
            <p className="type-caption mt-1 text-on-surface-variant">
              {t.soonest(fmtDate(scan.soonestDueIso))}
            </p>
          )}
          {overdue && (
            <p className="type-body-sm mt-2 font-medium text-alert">{t.disconnectionRisk}</p>
          )}
        </>
      )}

      {/* The dates list: WHEN each PG&E bill is due and how much. The thing growers ask to see
          first; soonest at top, overdue rows in clay (paired with an "overdue" word, not color
          alone). Due dates are derived from the cycle close (~21 days), not OCR. */}
      {dateRows.length > 0 ? (
        <div className="mt-4 border-t border-outline-variant pt-3">
          <p className="type-label-caps text-on-surface-variant">{t.upcomingHeading}</p>
          <ul className="mt-1 flex flex-col">
            {dateRows.map(([dueIso, row]) => (
              <li
                key={dueIso}
                className="flex items-baseline justify-between gap-3 border-t border-outline-variant py-2 first:border-t-0"
              >
                <span
                  className={cn("type-body-md", row.overdue ? "text-alert" : "text-on-surface")}
                >
                  {fmtDate(dueIso)}
                  {row.count > 1 && (
                    <span className="type-caption ml-2 text-on-surface-variant">
                      {t.dueCount(row.count)}
                    </span>
                  )}
                  {row.overdue && (
                    <span className="type-caption ml-2 text-alert">{t.overdueTag}</span>
                  )}
                </span>
                <span className="type-body-md tnum text-on-surface">
                  {formatUsdWhole(row.cents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="type-body-md mt-4 text-on-surface-variant">{t.noDates}</p>
      )}

      <Link
        href={energyHref}
        className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 type-body-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        {t.cta}
        <ArrowRight size={16} aria-hidden />
      </Link>
    </section>
  );
}
