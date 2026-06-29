import { FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui";

// The Almond Logic Reports panel, re-skinned: every grower report the portal exposes, as a grid of
// clickable report cards. The data-driven ones (turnout, delivery summary) are rendered below the
// grid on this same screen; the rest are the portal's printable PDFs, listed here as available. A few
// names get a short plain-English subtitle so the grid reads like an operator's index, not a dump.

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

const ON_SCREEN = new Set<string>([
  "Turnout by Grower/Field/Variety",
  "Delivery Commitment Summary",
]);

export function ReportList({ reports }: { reports: readonly string[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {reports.map((name) => {
        const onScreen = ON_SCREEN.has(name);
        return (
          <Card
            key={name}
            role="button"
            tabIndex={0}
            aria-label={name}
            className={cn(
              "cursor-pointer transition-shadow outline-none",
              "hover:ring-primary/30 hover:shadow-e1",
              "focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            <CardHeader>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
                  <FileText size={16} aria-hidden />
                </span>
                <div className="min-w-0">
                  <CardTitle className="text-on-surface">{name}</CardTitle>
                  <CardDescription className="mt-1 text-on-surface-variant">
                    {DESCRIPTIONS[name] ?? "Grower report"}
                  </CardDescription>
                  <p className="type-label-caps mt-2 text-primary">
                    {onScreen ? "On this screen" : "Available"}
                  </p>
                </div>
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
