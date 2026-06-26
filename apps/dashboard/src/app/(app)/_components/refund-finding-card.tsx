// The misclassification-refund card (Feature D), distinct from a go-forward rate switch. A
// pump billed on a commercial rate it was never eligible for may be owed money back under
// PG&E Rule 17.1. The copy is careful: "up to", "may be owed", and the rule cited - never a
// promised payout, and never shown for a valid rate choice (the detector gates that out).

import { en } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import { Card, CardContent } from "@/components/ui/card";
import type { RefundFinding } from "@/lib/dashboard/refund-finding";

const t = en.refund;

export function RefundFindingCard({ finding }: { finding: RefundFinding }) {
  return (
    <Card className="gap-0 rounded-[var(--radius-lg)] border border-alert/40 bg-alert-container/40 ring-0">
      <CardContent>
        <p className="type-label-caps text-on-alert-container">{t.findingTitle}</p>
        <p className="type-body-md mt-2 text-on-surface">{t.situation(finding.billedTariff)}</p>

        <p className="type-headline tnum mt-3 text-on-surface">
          {t.impactNote(formatUsdWhole(finding.recoverableCents))}
        </p>

        <p className="type-body-md mt-3 text-on-surface">{t.action}</p>
        <p className="type-caption mt-2 text-on-surface-variant">{t.rule}</p>
      </CardContent>
    </Card>
  );
}
