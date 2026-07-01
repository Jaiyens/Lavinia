// packer-table tool: the pounds-by-packer rows for the farm, optionally scoped to one crop year. A
// thin wrapper over the pure packerRows() view (Track D) — the numbers match the dashboard's
// by-packer table exactly because they come from the same function. The model never sees the farmId
// (captured from deps) and never produces a pound; it only optionally narrows to a crop year. An
// empty ledger / a year with no commitments returns the typed EMPTY result.

import { tool } from "ai";
import { z } from "zod";
import { recomputePositions } from "@/lib/crops/positions";
import { packerRows } from "@/lib/crops/views";
import type { CropLedger } from "@/lib/crops/types";
import type { CropToolDeps } from "./deps";
import type { PackerTableResult } from "./results";

/** Input the MODEL controls: an optional crop year to narrow the table to. */
export const packerTableInput = z.object({
  cropYear: z
    .number()
    .int()
    .optional()
    .describe("Optional crop year to limit the table to. Omit to show every season's commitments."),
});
export type PackerTableInput = z.infer<typeof packerTableInput>;

/**
 * The PURE tool core: given an already-loaded ledger and the optional year, return the typed packer
 * rows. recomputePositions feeds packerRows the per-cell gaps; packerRows owns every summed pound.
 * Filtering by year is a row selection, never an arithmetic. Exported for the tests.
 */
export function packerTableResult(ledger: CropLedger, input: PackerTableInput): PackerTableResult {
  const positions = recomputePositions(ledger);
  const allRows = packerRows(ledger, positions);
  const cropYear = input.cropYear ?? null;
  const rows = cropYear === null ? allRows : allRows.filter((row) => row.cropYear === cropYear);
  if (rows.length === 0) {
    return {
      kind: "empty",
      reason:
        cropYear === null
          ? "No packer commitments recorded for this farm yet."
          : `No packer commitments recorded for ${cropYear}.`,
    };
  }
  return { kind: "packerTable", cropYear, rows };
}

/** Build the AI SDK tool, closing over the session-scoped deps (farmId never reaches the model). */
export function packerTableTool(deps: CropToolDeps) {
  return tool({
    description:
      "Show committed pounds grouped by packer (buyer) for the grower, one row per crop year, " +
      "variety, and buyer, each tagged settled or estimate. Optionally limit to one crop year. " +
      "All pounds are computed from the ledger.",
    inputSchema: packerTableInput,
    execute: async (input: PackerTableInput): Promise<PackerTableResult> => {
      const ledger = await deps.loadLedger(deps.farmId);
      return packerTableResult(ledger, input);
    },
  });
}
