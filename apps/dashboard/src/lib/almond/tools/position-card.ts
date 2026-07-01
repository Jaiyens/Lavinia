// position-card tool: the recomputed position for ONE crop year. A thin wrapper over the pure
// recomputePositions / cropYearSummary — the tool runs a farmId-scoped ledger load, then the
// deterministic core does ALL the arithmetic. The model NEVER sees the farmId (it is captured from
// deps) and NEVER produces a pound (only the crop year it wants to look at). An empty ledger / a
// year with no cells returns the typed EMPTY result, so the card renders an honest empty state.

import { tool } from "ai";
import { z } from "zod";
import { recomputePositions } from "@/lib/crops/positions";
import { cellsForYear, cropYearSummary, latestCropYear } from "@/lib/crops/views";
import type { CropLedger } from "@/lib/crops/types";
import type { CropToolDeps } from "./deps";
import type { PositionCardResult } from "./results";

/** Input the MODEL controls: only which crop year to look at (omit -> the latest/current season). */
export const positionCardInput = z.object({
  cropYear: z
    .number()
    .int()
    .optional()
    .describe("The crop year to show the position for. Omit to use the latest (current) season."),
});
export type PositionCardInput = z.infer<typeof positionCardInput>;

/**
 * The PURE tool core: given an already-loaded ledger and the requested year, return the typed
 * result. No DB, no model, no arithmetic of its own — recomputePositions + cropYearSummary own every
 * number. Exported for the tests so the result can be checked to the pound against recompute.
 */
export function positionCardResult(ledger: CropLedger, input: PositionCardInput): PositionCardResult {
  const positions = recomputePositions(ledger);
  const cropYear = input.cropYear ?? latestCropYear(positions);
  if (cropYear === null) {
    return { kind: "empty", reason: "No crop records for this farm yet." };
  }
  const summary = cropYearSummary(positions, cropYear);
  if (summary === null) {
    return { kind: "empty", reason: `No ${cropYear} position for this farm yet.` };
  }
  return {
    kind: "position",
    cropYear,
    cells: cellsForYear(positions, cropYear),
    summary: {
      producedPounds: summary.producedPounds,
      committedPounds: summary.committedPounds,
      poolPounds: summary.poolPounds,
      unsoldPounds: summary.unsoldPounds,
      allSettled: summary.allSettled,
      gapPounds: summary.gapPounds,
    },
  };
}

/** Build the AI SDK tool, closing over the session-scoped deps (farmId never reaches the model). */
export function positionCardTool(deps: CropToolDeps) {
  return tool({
    description:
      "Show the grower's crop position for a crop year: produced, committed, in pool, and unsold " +
      "pounds by variety, with the year roll-up and whether it is packer-settled or an estimate. " +
      "All figures are computed from the ledger; you only choose the year.",
    inputSchema: positionCardInput,
    execute: async (input: PositionCardInput): Promise<PositionCardResult> => {
      const ledger = await deps.loadLedger(deps.farmId);
      return positionCardResult(ledger, input);
    },
  });
}
