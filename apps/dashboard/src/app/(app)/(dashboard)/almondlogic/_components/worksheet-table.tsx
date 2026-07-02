import { AlertTriangle } from "lucide-react";
import { en, num } from "@/copy/en";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import type { WorksheetGroup, WorksheetRow, WorksheetSubtotal } from "@/lib/crops/worksheet";
import { FullscreenPanel } from "./fullscreen-panel";

// Gagan's worksheet, rendered. Every figure here is formatted from the pure worksheetRows() result;
// this component computes nothing. Rows group by owning entity with an entity subtotal, then a farm
// total. Turnout / sellable are fractions from the engine (render x100); a null reads "insufficient
// data" rather than a fabricated zero. Reconciled rows (TGM settled) are visually distinct from
// pending (Almond Logic only) rows, and a two-source weight disagreement is flagged, not hidden.

const t = en.crops.worksheet.table;

/** Turnout / sellable fraction -> "17.3%", or the insufficient-data note when null. One decimal. */
function pctCell(fraction: number | null): string {
  if (fraction === null) return t.insufficient;
  return `${(fraction * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}

/** Whole pounds, exact (the grower reads this line by line), or a dash for a true zero-less cell. */
function lbCell(value: number | null): string {
  return value === null ? t.insufficient : num(value);
}

function TurnoutBadges({ row }: { row: WorksheetRow }): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-1.5">
      {row.reconciled ? (
        <Badge variant="secondary" className="border-primary/30 bg-primary/10 text-primary" title={en.crops.worksheet.reconciledAria}>
          {en.crops.worksheet.reconciled}
        </Badge>
      ) : row.tgmNeedsReview ? (
        <Badge variant="outline" className="border-destructive/40 text-destructive" title={en.crops.worksheet.needsReviewAria}>
          {en.crops.worksheet.needsReview}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-on-surface-variant" title={en.crops.worksheet.pendingAria}>
          {en.crops.worksheet.pending}
        </Badge>
      )}
      {row.sourceMismatch ? (
        <span
          className="inline-flex items-center gap-1 text-destructive"
          title={en.crops.worksheet.sourceMismatchAria}
        >
          <AlertTriangle size={13} aria-hidden />
          <span className="type-caption">{en.crops.worksheet.sourceMismatch}</span>
        </span>
      ) : null}
    </span>
  );
}

const NUM = "px-3 py-2 text-right tnum whitespace-nowrap";
const TXT = "px-3 py-2 text-left whitespace-nowrap";

export function WorksheetTable({
  groups,
  farmTotal,
}: {
  groups: readonly WorksheetGroup[];
  farmTotal: WorksheetSubtotal;
}) {
  return (
    <FullscreenPanel label={en.crops.worksheet.title}>
    <div className="overflow-x-auto rounded-[var(--radius-control)] border border-outline-variant">
      <table className="w-full border-collapse type-body-sm">
        <caption className="sr-only">{t.caption}</caption>
        <thead>
          <tr className="border-b border-outline-variant type-label-caps text-on-surface-variant">
            <th scope="col" className={TXT}>{t.columns.block}</th>
            <th scope="col" className={TXT}>{t.columns.variety}</th>
            <th scope="col" className={NUM}>{t.columns.acres}</th>
            <th scope="col" className={NUM}>{t.columns.fieldWeight}</th>
            <th scope="col" className={NUM}>{t.columns.turnout}</th>
            <th scope="col" className={NUM}>{t.columns.hullerWeight}</th>
            <th scope="col" className={NUM}>{t.columns.yoy}</th>
            <th scope="col" className={NUM}>{t.columns.tgm}</th>
            <th scope="col" className={NUM}>{t.columns.loss}</th>
            <th scope="col" className={NUM}>{t.columns.sellable}</th>
            <th scope="col" className={TXT}>&nbsp;</th>
          </tr>
        </thead>
        {groups.map((g) => (
          <tbody key={g.entityName} className="border-b border-outline-variant/60">
            {g.rows.map((r) => (
              <tr key={`${r.blockId} ${r.variety}`} className="border-b border-outline-variant/40 last:border-0">
                <th scope="row" className={cn(TXT, "type-label-md font-medium text-on-surface")}>{r.blockName}</th>
                <td className={cn(TXT, "text-on-surface-variant")}>{r.variety}</td>
                <td className={NUM}>{r.acres === null ? "-" : num(r.acres)}</td>
                <td className={NUM}>{lbCell(r.fieldWeightLb)}</td>
                <td className={NUM}>{pctCell(r.turnoutPct)}</td>
                <td className={NUM}>{lbCell(r.hullerWeightLb)}</td>
                <td className={cn(NUM, r.yoyFieldWeight != null && r.yoyFieldWeight < 1 && "text-on-surface-variant")}>
                  {r.yoyFieldWeight === null ? "-" : t.yoyValue(r.yoyFieldWeight)}
                </td>
                <td className={NUM}>{r.tgmLbs === null ? t.insufficient : num(r.tgmLbs)}</td>
                <td className={NUM}>{r.lossLb === null ? "-" : num(r.lossLb)}</td>
                <td className={NUM}>{pctCell(r.sellablePct)}</td>
                <td className={TXT}><TurnoutBadges row={r} /></td>
              </tr>
            ))}
            <tr className="bg-surface-container-low/60 type-label-md font-medium text-on-surface">
              <th scope="row" className={cn(TXT, "text-on-surface-variant")} colSpan={2}>{t.entityTotal(g.entityName)}</th>
              <td className={NUM}>{g.subtotal.acres === null ? "-" : num(g.subtotal.acres)}</td>
              <td className={NUM}>{num(g.subtotal.fieldWeightLb)}</td>
              <td className={NUM}>{pctCell(g.subtotal.turnoutPct)}</td>
              <td className={NUM}>{num(g.subtotal.hullerWeightLb)}</td>
              <td className={NUM} />
              <td className={NUM}>{g.subtotal.tgmLbs === null ? "-" : num(g.subtotal.tgmLbs)}</td>
              <td className={NUM} />
              <td className={NUM} />
              <td className={TXT} />
            </tr>
          </tbody>
        ))}
        <tfoot>
          <tr className="border-t-2 border-outline bg-surface-container-low type-label-md font-semibold text-on-surface">
            <th scope="row" className={cn(TXT)} colSpan={2}>{t.farmTotal}</th>
            <td className={NUM}>{farmTotal.acres === null ? "-" : num(farmTotal.acres)}</td>
            <td className={NUM}>{num(farmTotal.fieldWeightLb)}</td>
            <td className={NUM}>{pctCell(farmTotal.turnoutPct)}</td>
            <td className={NUM}>{num(farmTotal.hullerWeightLb)}</td>
            <td className={NUM} />
            <td className={NUM}>{farmTotal.tgmLbs === null ? "-" : num(farmTotal.tgmLbs)}</td>
            <td className={NUM} />
            <td className={NUM} />
            <td className={TXT} />
          </tr>
        </tfoot>
      </table>
    </div>
    </FullscreenPanel>
  );
}
