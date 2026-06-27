// The crop tool-result dispatcher: maps a crop tool name + its output to the typed result component.
// almond-chat.tsx calls renderCropToolResult() from its tool-part rendering switch. The contract this
// enforces end to end: the components RENDER tool-result data only — no arithmetic — and an
// unknown/unhandled/empty result falls back to the explicit EmptyResult, never a blank. Each branch
// narrows the opaque `output` to the matching result type via a small runtime guard (the stream
// delivers it as unknown JSON), so a malformed payload degrades to the empty state instead of
// throwing.

import type { ReactElement } from "react";
import { CROP_TOOL_NAMES } from "@/lib/almond/tools/names";
import type {
  FindReportResult,
  PackerTableResult,
  PositionCardResult,
  YoYChartResult,
} from "@/lib/almond/tools/results";
import { PositionCard } from "./position-card";
import { PackerTable } from "./packer-table";
import { YoYChart } from "./yoy-chart";
import { FindReport } from "./find-report";
import { EmptyResult } from "./empty-result";

/** The `tool-${name}` part types this dispatcher knows how to render. */
const CROP_TOOL_PART_TYPES = new Set<string>([
  `tool-${CROP_TOOL_NAMES.position}`,
  `tool-${CROP_TOOL_NAMES.packerTable}`,
  `tool-${CROP_TOOL_NAMES.yoyChart}`,
  `tool-${CROP_TOOL_NAMES.findReport}`,
]);

/** Whether a UI tool-part type is one of the crop result tools (so the chat routes it here). */
export function isCropToolPartType(type: string): boolean {
  return CROP_TOOL_PART_TYPES.has(type);
}

function hasKind(value: unknown): value is { kind: string } {
  return typeof value === "object" && value !== null && typeof (value as { kind?: unknown }).kind === "string";
}

const FALLBACK_EMPTY = "Nothing to show for that yet.";

/**
 * Render a crop tool result. `type` is the `tool-${name}` part type; `output` is the tool's structured
 * result (the deterministic data, delivered over the stream as unknown JSON). Anything unrecognized
 * or malformed renders the explicit empty state.
 */
export function renderCropToolResult(type: string, output: unknown): ReactElement {
  if (!hasKind(output)) return <EmptyResult reason={FALLBACK_EMPTY} />;

  switch (type) {
    case `tool-${CROP_TOOL_NAMES.position}`:
      return <PositionCard result={output as PositionCardResult} />;
    case `tool-${CROP_TOOL_NAMES.packerTable}`:
      return <PackerTable result={output as PackerTableResult} />;
    case `tool-${CROP_TOOL_NAMES.yoyChart}`:
      return <YoYChart result={output as YoYChartResult} />;
    case `tool-${CROP_TOOL_NAMES.findReport}`:
      return <FindReport result={output as FindReportResult} />;
    default:
      return <EmptyResult reason={FALLBACK_EMPTY} />;
  }
}
