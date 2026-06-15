// Builder for the Recommendation grammar. Keeps every tool emitting the exact
// same shape with the same defaults (status "pending", optional fields omitted
// rather than set to undefined so equality checks stay clean). Pure: no clock,
// no id generation, the caller passes `createdAt`, the DB assigns the id later.

import type {
  DraftRecommendation,
  RecommendationAction,
  RecommendationResult,
  RecStatus,
  Severity,
} from "./types";

export type DraftRecommendationInput = {
  farmId: string;
  tool: string;
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

/** Assemble a DraftRecommendation, omitting optional fields that weren't given. */
export function draftRecommendation(
  input: DraftRecommendationInput,
): DraftRecommendation {
  const draft: DraftRecommendation = {
    farmId: input.farmId,
    tool: input.tool,
    situation: input.situation,
    action: input.action,
    severity: input.severity,
    status: input.status ?? "pending",
    createdAt: input.createdAt,
  };
  if (input.impactUsd !== undefined) draft.impactUsd = input.impactUsd;
  if (input.impactNote !== undefined) draft.impactNote = input.impactNote;
  if (input.resolvedAt !== undefined) draft.resolvedAt = input.resolvedAt;
  if (input.result !== undefined) draft.result = input.result;
  return draft;
}
