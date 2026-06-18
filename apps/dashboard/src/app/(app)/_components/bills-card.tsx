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
