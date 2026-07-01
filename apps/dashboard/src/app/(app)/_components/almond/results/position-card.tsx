import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui";
import { en, lbs } from "@/copy/en";
import type { PositionCardResult } from "@/lib/almond/tools/results";
import { EmptyResult } from "./empty-result";

// The PositionCard generative-UI result: the recomputed crop-year position rendered in chat. It is a
// pure FORMATTER — every pound it shows is a field of the tool result (produced by recomputePositions
// / cropYearSummary on the server); this component does NO arithmetic. Mirrors the dashboard's
// CropKpis so the chat and the tab read identically. An empty tool result renders the explicit empty
// state, never a blank or a zero. Warm palette + shadcn Card/Badge + tabular figures.

const t = en.crops.kpi;

function Tile({ label, value, tone }: { label: string; value: string; tone?: "alert" }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[var(--radius-control)] bg-surface-container-low p-3">
      <span className="type-label-caps text-on-surface-variant">{label}</span>
      <span className={`type-title tnum ${tone === "alert" ? "text-alert" : "text-on-surface"}`}>
        {value}
      </span>
    </div>
  );
}

export function PositionCard({ result }: { result: PositionCardResult }) {
  if (result.kind === "empty") return <EmptyResult reason={result.reason} />;

  const { summary, cells, cropYear } = result;
  const oversold = summary.unsoldPounds < 0;
  const gap = summary.gapPounds;

  return (
    <Card className="gap-3 overflow-hidden rounded-[var(--radius-lg)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="type-label-caps text-on-surface-variant">
          {en.crops.yearLabel(cropYear)}
        </span>
        <Badge variant={summary.allSettled ? "default" : "outline"}>
          {summary.allSettled ? t.settled : t.estimate}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={t.producedLabel} value={lbs(summary.producedPounds)} />
        <Tile label={t.committedLabel} value={lbs(summary.committedPounds)} />
        <Tile label={t.poolLabel} value={lbs(summary.poolPounds)} />
        <Tile
          label={t.unsoldLabel}
          value={lbs(summary.unsoldPounds)}
          tone={oversold ? "alert" : undefined}
        />
      </div>

      {gap !== null && (
        <p className="type-caption text-on-surface-variant">
          {t.gap(gap > 0 ? `+${lbs(gap)}` : lbs(gap))}
        </p>
      )}
      {oversold && <p className="type-caption text-alert">{t.oversold}</p>}

      {cells.length > 1 && (
        <ul className="flex flex-col gap-1 border-t border-outline-variant pt-2">
          {cells.map((cell) => (
            <li
              key={cell.variety}
              className="flex items-center justify-between gap-3 type-num text-on-surface-variant"
            >
              <span className="text-on-surface">{cell.variety}</span>
              <span className="tnum">{lbs(cell.producedPounds)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
