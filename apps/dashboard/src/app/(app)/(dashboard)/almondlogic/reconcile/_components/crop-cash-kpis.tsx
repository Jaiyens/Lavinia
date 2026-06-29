import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { en, usd } from "@/copy/en";
import type { CashSummary } from "@/lib/crops/collection";

// The cash KPI strip on the pound-gate page (WS2b): three tiles for the commitment ledger's money
// side — committed dollars (the contracts' total value), collected (cash received), and outstanding
// (still owed). Every figure is a field of the CashSummary (summed by cashSummary in collection.ts,
// never here); this Server Component only FORMATS integer cents with usd() and lays out, mirroring
// the crop-kpis tile look. Outstanding reads an honest "overpaid" note when negative (never clamped).

const t = en.crops.ledger.cash;

function KpiTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card className="min-h-[6rem] justify-start gap-0 overflow-visible rounded-[var(--radius-control)] p-4">
      <span className="type-label-caps text-on-surface-variant">{label}</span>
      {children}
    </Card>
  );
}

export function CropCashKpis({ summary }: { summary: CashSummary }) {
  const overpaid = summary.outstandingCents < 0;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <KpiTile label={t.committedLabel}>
        <span className="type-headline mt-1 tnum text-on-surface">{usd(summary.committedCents / 100)}</span>
      </KpiTile>

      <KpiTile label={t.collectedLabel}>
        <span className="type-headline mt-1 tnum text-on-surface">{usd(summary.collectedCents / 100)}</span>
      </KpiTile>

      <KpiTile label={t.outstandingLabel}>
        <span className={`type-headline mt-1 tnum ${overpaid ? "text-alert" : "text-on-surface"}`}>
          {usd(summary.outstandingCents / 100)}
        </span>
        {overpaid && <span className="mt-1.5 type-caption text-alert">{t.overpaid}</span>}
      </KpiTile>
    </div>
  );
}
