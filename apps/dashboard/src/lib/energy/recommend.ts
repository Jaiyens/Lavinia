// Pump-Timing's binding to the shared Recommendation grammar: every lever emits
// through here so the tool tag is set in one place and the rest of the OS reads
// it the same way. Thin wrapper over the generic builder.

import { draftRecommendation } from "@/lib/recommendations";
import type {
  DraftRecommendation,
  RecommendationAction,
  RecommendationResult,
  RecStatus,
  Severity,
} from "@/lib/recommendations";

/** The `tool` tag on every recommendation this module emits. */
export const PUMP_TIMING_TOOL = "pump-timing";

export type PumpTimingDraftInput = {
  farmId: string;
  situation: string;
  action: RecommendationAction;
  severity: Severity;
  createdAt: string;
  impactUsd?: number;
  impactNote?: string;
  status?: RecStatus;
  resolvedAt?: string;
  result?: RecommendationResult;
};

/** Emit a DraftRecommendation tagged with the Pump-Timing tool. */
export function pumpTimingDraft(
  input: PumpTimingDraftInput,
): DraftRecommendation {
  return draftRecommendation({ ...input, tool: PUMP_TIMING_TOOL });
}

/** Round dollars to the cent so impact figures compare cleanly. */
export function roundUsd(amount: number): number {
  return Math.round(amount * 100) / 100;
}
