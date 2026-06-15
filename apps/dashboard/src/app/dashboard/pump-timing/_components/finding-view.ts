// The view shape the dashboard feed and the onboarding reveal both render, plus the
// mapping from a persisted Recommendation row. Kept server-safe (no "use client") so both
// server pages and server actions can map rows into it. The card components re-render this
// shape; extra fields are additive, so existing importers (the onboarding reveal) keep
// working unchanged.

import type { Severity } from "@/lib/recommendations";
import { RATE_OPTIMIZATION_TOOL } from "@/lib/energy/rate-compare";
import { DEMAND_CHARGE_TOOL } from "@/lib/energy/retrospective";
import { BILL_AUDIT_TOOL } from "@/lib/energy/bill-audit";

/** Which hero a finding's dollars belong to, which also drives its color. */
export type Polarity = "save" | "risk" | "neutral";

export type FindingView = {
  id: string;
  tool: string;
  severity: Severity;
  situation: string;
  impactUsd: number | null;
  impactNote: string | null;
  actionLabel: string;
  /** Save (green, recurring) vs risk (red, this bill) vs neutral (no dollar framing). */
  polarity: Polarity;
  /** True when the dollar is a one-time exposure on a bill, not an annual saving. */
  oneTime: boolean;
  /** Bill-reproduction error (0..1), for the rate-finding trust line. */
  reproductionError: number | null;
};

/** The persisted Recommendation fields this mapper reads (a structural subset). */
type RecRow = {
  id: string;
  tool: string;
  severity: string;
  situation: string;
  impactUsd: number | null;
  impactNote: string | null;
  action: unknown;
};

type RecAction = { label?: string; params?: { reproductionError?: unknown } };

/** A finding's hero/color polarity from its tool tag. */
export function polarityOf(tool: string): Polarity {
  if (tool === RATE_OPTIMIZATION_TOOL) return "save";
  if (tool === DEMAND_CHARGE_TOOL || tool === BILL_AUDIT_TOOL) return "risk";
  return "neutral";
}

/** Map a stored Recommendation row to the finding view shape. */
export function recToFindingView(rec: RecRow): FindingView {
  const action = (rec.action ?? {}) as RecAction;
  const repro = action.params?.reproductionError;
  const polarity = polarityOf(rec.tool);
  return {
    id: rec.id,
    tool: rec.tool,
    severity: rec.severity as Severity,
    situation: rec.situation,
    impactUsd: rec.impactUsd,
    impactNote: rec.impactNote,
    actionLabel: action.label ?? "",
    polarity,
    oneTime: polarity === "risk",
    reproductionError: typeof repro === "number" ? repro : null,
  };
}
