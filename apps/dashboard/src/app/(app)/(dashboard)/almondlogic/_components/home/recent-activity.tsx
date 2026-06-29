import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ActivityInfo } from "@/lib/almond-portal/data";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

// "Made on" style date: month-day-year, UTC, matching the rest of the portal so days read
// consistently. Activity dates arrive as raw strings from the snapshot; we parse defensively and
// fall back to the raw value if it is not a date we can format.
const ACTIVITY_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatActivityDate(date: string | null): string | null {
  if (!date) return null;
  const ms = Date.parse(date);
  if (Number.isNaN(ms)) return date;
  return ACTIVITY_FMT.format(ms);
}

// One line of grower/field/huller context, only rendering the parts the snapshot gave us so a sparse
// row never shows empty separators.
function contextLine(activity: ActivityInfo): string | null {
  const parts = [activity.grower, activity.field, activity.huller].filter(
    (p): p is string => p != null && p.trim() !== "",
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

// The "Recent Activity" rail of the Almond Logic home, re-skinned in Terra. One card per synced
// activity (date, grower/field/huller, and the label, e.g. "Run 772 Validated") with a View
// affordance into the Runs screen. Empty state stays faithful to the portal and gives the operator a
// next step.
export function RecentActivity({ activity }: { activity: ActivityInfo[] }) {
  return (
    <section aria-labelledby="recent-activity-heading" className="min-w-0">
      <h2 id="recent-activity-heading" className="type-title text-balance text-on-surface">
        Recent Activity
      </h2>

      {activity.length === 0 ? (
        <div className="mt-4 flex min-h-[8rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-outline-variant bg-surface-container-lowest p-6 text-center">
          <p className="type-body-md text-on-surface-variant">Recent activity appears here after a sync.</p>
          <Link
            href="/almondlogic/runs"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}
          >
            View runs
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {activity.map((item, i) => {
            const date = formatActivityDate(item.date);
            const context = contextLine(item);
            return (
              <li key={i}>
                <Card size="sm">
                  <CardContent className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      {date ? (
                        <p className="type-label-caps text-on-surface-variant tabular-nums">{date}</p>
                      ) : null}
                      <p className="type-body-md mt-0.5 font-medium text-pretty text-on-surface">
                        {item.label ?? "Activity"}
                      </p>
                      {context ? (
                        <p className="type-caption mt-1 text-pretty text-on-surface-variant">{context}</p>
                      ) : null}
                    </div>
                    <Link
                      href="/almondlogic/runs"
                      aria-label={`View ${item.label ?? "activity"}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}
                    >
                      View
                      <ChevronRight aria-hidden />
                    </Link>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
