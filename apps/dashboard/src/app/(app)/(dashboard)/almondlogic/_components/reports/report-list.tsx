import Link from "next/link";
import { FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui";

// The Almond Logic Reports index, re-skinned: every grower report the portal exposes, as a grid of
// cards. The status of each card is DATA-DRIVEN (passed in `views`), not hardcoded: a report is either
// rendered on this screen (an anchor to its table), viewable on another synced tab (a link, e.g.
// "Field Ticket Deliveries" -> the Deliveries tab), or genuinely not synced yet. This fixes the old
// bug where a synced report (backed by real data on another tab) was mislabeled "Not synced yet".

const DESCRIPTIONS: Record<string, string> = {
  "Turnout by Grower/Field/Variety": "Average turnout by field and variety",
  "Turnout by Run": "Turnout for each validated run",
  "Run Summary Report": "Bins, weights, and turnout per run",
  "Field Ticket Deliveries": "Every delivery by field ticket",
  "Grower Manifest Summary": "Loads rolled up for the grower",
  "Delivery Commitment By Handler": "Committed pounds by handler",
  "Delivery Commitment Summary": "Commitments across handlers",
  "Stockpile History": "Movement in and out of stockpile",
  "Stockpile Inventory": "Current stockpile on hand",
  "UnCommitted Product": "Product not yet committed",
};

/** How a report can be viewed: rendered on this screen (anchor), or on another synced tab (link). */
export type ReportView =
  | { kind: "anchor"; anchor: string }
  | { kind: "link"; href: string; label: string };

export function ReportList({
  reports,
  views,
}: {
  reports: readonly string[];
  views: Record<string, ReportView | undefined>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {reports.map((name) => {
        const view = views[name];
        const description = DESCRIPTIONS[name] ?? "Grower report";
        const active = view != null;
        const status =
          view == null
            ? "Not synced yet"
            : view.kind === "anchor"
              ? "View on this screen"
              : view.label;

        const inner = (
          <CardHeader>
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
                  active ? "bg-primary/10 text-primary" : "bg-surface-container-high text-on-surface-variant",
                )}
              >
                <FileText size={16} aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-on-surface">{name}</CardTitle>
                <CardDescription className="mt-1 text-on-surface-variant">{description}</CardDescription>
                <p
                  className={cn(
                    "type-label-caps mt-2",
                    active ? "text-primary" : "text-on-surface-variant/70",
                  )}
                >
                  {status}
                </p>
              </div>
            </div>
          </CardHeader>
        );

        // Rendered report -> anchor (native scroll). Synced-elsewhere -> Link to that tab. Neither ->
        // inert card (no role=button, no pointer) so it never reads as a dead click.
        if (view?.kind === "anchor") {
          return (
            <a
              key={name}
              href={`#${view.anchor}`}
              aria-label={`View ${name} on this screen`}
              className="rounded-[var(--radius-lg)] outline-none transition-shadow hover:shadow-e1 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Card className="cursor-pointer hover:ring-primary/30">{inner}</Card>
            </a>
          );
        }
        if (view?.kind === "link") {
          return (
            <Link
              key={name}
              href={view.href}
              aria-label={`${name}: ${view.label}`}
              className="rounded-[var(--radius-lg)] outline-none transition-shadow hover:shadow-e1 focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Card className="cursor-pointer hover:ring-primary/30">{inner}</Card>
            </Link>
          );
        }
        return (
          <Card key={name} aria-label={`${name} (not synced yet)`} className="opacity-70">
            {inner}
          </Card>
        );
      })}
    </div>
  );
}
