import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui";
import type { FindReportResult } from "@/lib/almond/tools/results";
import { EmptyResult } from "./empty-result";

// The FindReport generative-UI result: retrieved document snippets rendered in chat. Three honest
// states, no fabrication: `unavailable` (the capability is off — no live call was made), `empty`
// (retrieval ran, matched nothing), and `reports` (the hits, each with its source and score). It only
// formats what the tool returned; the score is a tool field, not computed here.

function scorePct(score: number): string {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

export function FindReport({ result }: { result: FindReportResult }) {
  if (result.kind === "empty") return <EmptyResult reason={result.reason} />;
  if (result.kind === "unavailable") return <EmptyResult reason={result.reason} />;

  return (
    <div className="flex flex-col gap-2">
      {result.hits.map((hit) => (
        <Card key={hit.id} className="gap-2 rounded-[var(--radius-lg)] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 type-caption text-on-surface-variant">
              <FileText size={14} className="shrink-0" aria-hidden />
              <span className="truncate">{hit.r2Key}</span>
            </span>
            <Badge variant="outline" className="tnum shrink-0">
              {scorePct(hit.score)}
            </Badge>
          </div>
          <p className="type-body-md text-on-surface">{hit.snippet}</p>
        </Card>
      ))}
    </div>
  );
}
