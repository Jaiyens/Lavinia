"use client";

// The live grower-extraction view. Streams the packer-statement rows as Claude fills them in (over
// the ZDR route at /api/crop/extract/stream) and renders them into a table with a coverage badge.
//
// This component does NO pound arithmetic and certifies NOTHING. It renders exactly what streams in,
// plus an "uncertified" badge while the stream is live — the trustworthy reconciled/needs_review
// verdict comes from the server-side pound-gate after the stream completes, never from anything
// computed here. Keeping the gate off the client is what makes "no model number becomes a pound
// figure on its own word" hold all the way to the screen.

import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PoundExtractionSchema } from "@/lib/crops/extract/schema";

export function CropExtractLive({ page }: { page: string }) {
  const { object, submit, isLoading, error } = useObject({
    api: "/api/crop/extract/stream",
    schema: PoundExtractionSchema,
  });

  const rows = object?.rows ?? [];
  const controlTotal = object?.controlTotalPounds;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Extraction preview</h3>
        <div className="flex items-center gap-2">
          {/* Always "uncertified" on the client: the pound-gate runs server-side. */}
          <Badge variant="outline">Uncertified preview</Badge>
          <Button
            type="button"
            size="sm"
            disabled={isLoading}
            onClick={() => submit({ page })}
          >
            {isLoading ? "Reading..." : "Read statement"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Could not read this statement. Try again.</p>
      ) : null}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 font-medium">Variety</th>
            <th className="py-1 text-right font-medium">Pounds</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2} className="py-2 text-muted-foreground">
                {isLoading ? "Reading the statement..." : "No rows yet."}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={index} className="border-t border-border">
                <td className="py-1">{row?.variety ?? ""}</td>
                <td className="py-1 text-right tabular-nums">
                  {typeof row?.pounds === "number" ? row.pounds.toLocaleString() : ""}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {typeof controlTotal === "number" ? (
          <tfoot>
            <tr className="border-t border-border font-medium">
              <td className="py-1">Stated total</td>
              <td className="py-1 text-right tabular-nums">{controlTotal.toLocaleString()}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
