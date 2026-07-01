import { FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui";

// The Almond Logic Reports index, re-skinned: every grower report the portal exposes, as a grid of
// cards. The data-driven ones we render on this screen are real anchor links that scroll to their
// table; the rest are the portal's printable PDFs that need the report-PDF sync to be enabled, so
// they are shown as honest "not synced yet" cards (deliberately NOT clickable) rather than dead
// buttons that look clickable but do nothing.

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

// Reports we actually render on this screen -> the anchor id of their section. Clicking scrolls there.
const ON_SCREEN: Record<string, string> = {
  "Turnout by Grower/Field/Variety": "report-turnout",
};

export function ReportList({ reports }: { reports: readonly string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {reports.map((name) => {
        const anchor = ON_SCREEN[name];
        const description = DESCRIPTIONS[name] ?? "Grower report";

        const inner = (
          <CardHeader>
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)]",
                  anchor ? "bg-primary/10 text-primary" : "bg-surface-container-high text-on-surface-variant",
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
                    anchor ? "text-primary" : "text-on-surface-variant/70",
                  )}
                >
                  {anchor ? "View on this screen" : "Not synced yet"}
                </p>
              </div>
            </div>
          </CardHeader>
        );

        // Rendered reports are real anchor links (native scroll to the table). The rest are inert
        // cards (no role=button, no pointer) so they never read as a dead click.
        return anchor ? (
          <a
            key={name}
            href={`#${anchor}`}
            aria-label={`View ${name} on this screen`}
            className="rounded-[var(--radius-lg)] outline-none transition-shadow hover:shadow-e1 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Card className="cursor-pointer hover:ring-primary/30">{inner}</Card>
          </a>
        ) : (
          <Card key={name} aria-label={`${name} (not synced yet)`} className="opacity-70">
            {inner}
          </Card>
        );
      })}
    </div>
  );
}
