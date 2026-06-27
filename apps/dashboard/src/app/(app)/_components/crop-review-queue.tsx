"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Badge, Button } from "@/components/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { en, lbs } from "@/copy/en";
import type { CropReviewKind, CropReviewRow } from "@/lib/crops/review";
import { resolveCropReviewAction } from "../(dashboard)/crops/actions";

// The reconciliation queue (Phase 6): the records the pound-gate could not certify (a mismatch, a
// missing control total). Each row shows its kind, its (year, variety, pounds) line carrying the
// SOURCE tag so an estimate is never read as a final, and a manual "Mark reconciled" action. The
// resolve clears the review FLAG only — it never recomputes or changes a pound — and is writer-gated
// server-side; a viewer simply never sees the buttons (readOnly). On success the revalidated shell
// re-renders without the row.

const t = en.crops.review;

const KIND_LABEL: Record<CropReviewKind, string> = {
  production: t.kindProduction,
  commitment: t.kindCommitment,
  pool: t.kindPool,
};

function ReviewRow({ row, readOnly }: { row: CropReviewRow; readOnly: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const resolve = () => {
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await resolveCropReviewAction(row.kind, row.id);
        if (!result.ok) setFailed(true);
      } catch {
        setFailed(true);
      }
    });
  };

  const settled = row.source === "PACKER_SETTLED";

  return (
    <Card className="gap-3 rounded-[var(--radius-control)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{KIND_LABEL[row.kind]}</Badge>
            <Badge variant={settled ? "default" : "outline"}>
              {settled ? en.crops.table.sourceSettled : en.crops.table.sourceEstimate}
            </Badge>
          </div>
          <p className="mt-1.5 type-num font-medium text-on-surface">
            {t.line(row.cropYear, row.variety, lbs(row.pounds))}
          </p>
          {row.party !== null && (
            <p className="type-caption text-on-surface-variant">{t.party(row.party)}</p>
          )}
        </div>
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={resolve}
            disabled={isPending}
            aria-label={t.resolveAria(row.cropYear, row.variety)}
            className="min-h-[44px] shrink-0"
          >
            {isPending ? t.resolving : t.resolve}
          </Button>
        )}
      </div>
      {failed && (
        <Alert variant="destructive">
          <AlertDescription>{t.resolveError}</AlertDescription>
        </Alert>
      )}
    </Card>
  );
}

export function CropReviewQueue({
  rows,
  readOnly,
}: {
  rows: CropReviewRow[];
  readOnly: boolean;
}) {
  return (
    <section aria-label={t.title}>
      <header className="mb-3">
        <h2 className="type-headline text-on-surface">{t.title}</h2>
        <p className="mt-1 type-body-sm text-on-surface-variant">{t.subtitle}</p>
      </header>
      {rows.length === 0 ? (
        <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-6">
          <p className="type-body-md text-on-surface-variant">{t.empty}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={`${row.kind}:${row.id}`}>
              <ReviewRow row={row} readOnly={readOnly} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
