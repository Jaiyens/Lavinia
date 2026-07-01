// yoy-chart tool: the year-over-year bars — produced / committed / pool / unsold pounds per crop
// year, rolled across varieties. A thin wrapper over the pure cropYearBars() view (Track D), so the
// chart's numbers match the dashboard's year-over-year chart exactly. The model never sees the
// farmId and produces no pound; this tool takes no model-controlled figures at all. An empty ledger
// returns the typed EMPTY result.

import { tool } from "ai";
import { z } from "zod";
import { recomputePositions } from "@/lib/crops/positions";
import { cropYearBars } from "@/lib/crops/views";
import type { CropLedger } from "@/lib/crops/types";
import type { CropToolDeps } from "./deps";
import type { YoYChartResult } from "./results";

/** No model-controlled inputs: the chart always rolls every season the ledger holds. */
export const yoyChartInput = z.object({});
export type YoYChartInput = z.infer<typeof yoyChartInput>;

/**
 * The PURE tool core: given an already-loaded ledger, return the typed year-over-year bars.
 * cropYearBars owns every summed pound. Exported for the tests.
 */
export function yoyChartResult(ledger: CropLedger): YoYChartResult {
  const bars = cropYearBars(recomputePositions(ledger));
  if (bars.length === 0) {
    return { kind: "empty", reason: "No seasons to compare for this farm yet." };
  }
  return { kind: "yoyChart", bars };
}

/** Build the AI SDK tool, closing over the session-scoped deps (farmId never reaches the model). */
export function yoyChartTool(deps: CropToolDeps) {
  return tool({
    description:
      "Show the grower's year-over-year crop pounds: produced, committed, in pool, and unsold per " +
      "crop year as a grouped bar chart. All pounds are computed from the ledger.",
    inputSchema: yoyChartInput,
    execute: async (): Promise<YoYChartResult> => {
      const ledger = await deps.loadLedger(deps.farmId);
      return yoyChartResult(ledger);
    },
  });
}
