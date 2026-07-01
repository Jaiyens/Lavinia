import { lbs } from "@/copy/en";
import { cn } from "@/lib/cn";
import {
  type TurnoutGroup,
  type DeliverySummaryRow,
  type DeliverySummaryTotal,
  turnoutPct,
} from "./aggregate";

// The two data-driven report tables on the Reports screen, both pure presentation: the page computes
// every figure in ./aggregate and these only format + lay them out. Server Components (no client JS),
// scoped to the active huller + crop year by the page before the rows ever reach here. Right-aligned
// numerics, tabular figures, lbs() for pounds, with an empty state per table.

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[10rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-8 text-center">
      <p className="type-body-md text-on-surface-variant">{children}</p>
    </div>
  );
}

const TABLE_WRAP =
  "overflow-x-auto rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest shadow-e1";
const TH_BASE = "whitespace-nowrap border-b border-outline-variant px-3 py-2.5 type-label-caps text-on-surface-variant";
const TD_BASE = "px-3 py-2.5 type-num";

/** "Turnout by Grower/Field/Variety": avg turnout + run count per (field, variety) group. */
export function TurnoutReportTable({ groups }: { groups: readonly TurnoutGroup[] }) {
  if (groups.length === 0) {
    return <EmptyState>No validated runs for this huller and crop year yet.</EmptyState>;
  }
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={cn(TH_BASE, "text-left")}>Field</th>
            <th scope="col" className={cn(TH_BASE, "text-left")}>Variety</th>
            <th scope="col" className={cn(TH_BASE, "text-right")}>Runs</th>
            <th scope="col" className={cn(TH_BASE, "text-right")}>Avg turnout</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr
              key={`${g.field} ${g.variety}`}
              className="border-t border-outline-variant first:border-t-0 hover:bg-surface-container-low/40"
            >
              <td className={cn(TD_BASE, "text-left text-on-surface")}>{g.field}</td>
              <td className={cn(TD_BASE, "text-left text-on-surface")}>{g.variety}</td>
              <td className={cn(TD_BASE, "tnum text-right text-on-surface-variant")}>{g.runs}</td>
              <td className={cn(TD_BASE, "tnum text-right font-medium text-on-surface")}>
                {turnoutPct(g.avgTurnout)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Delivery summary by variety": net pounds + load count per variety, with a total row. */
export function DeliverySummaryTable({
  rows,
  total,
}: {
  rows: readonly DeliverySummaryRow[];
  total: DeliverySummaryTotal;
}) {
  if (rows.length === 0) {
    return <EmptyState>No deliveries for this huller and crop year yet.</EmptyState>;
  }
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th scope="col" className={cn(TH_BASE, "text-left")}>Variety</th>
            <th scope="col" className={cn(TH_BASE, "text-right")}>Loads</th>
            <th scope="col" className={cn(TH_BASE, "text-right")}>Net delivered</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.variety}
              className="border-t border-outline-variant first:border-t-0 hover:bg-surface-container-low/40"
            >
              <td className={cn(TD_BASE, "text-left text-on-surface")}>{r.variety}</td>
              <td className={cn(TD_BASE, "tnum text-right text-on-surface-variant")}>{r.loads}</td>
              <td className={cn(TD_BASE, "tnum text-right font-medium text-on-surface")}>{lbs(r.netLb)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-outline-variant bg-surface-container-low/40">
            <td className={cn(TD_BASE, "text-left type-label-caps text-on-surface")}>Total</td>
            <td className={cn(TD_BASE, "tnum text-right font-medium text-on-surface")}>{total.loads}</td>
            <td className={cn(TD_BASE, "tnum text-right font-medium text-on-surface")}>{lbs(total.netLb)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
