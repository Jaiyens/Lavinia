// The frozen vocabulary of the agent ledger. These string literal unions mirror the
// `kind` / `status` columns on AgentRun and AgentAction (the schema uses String, never a
// DB enum, per the project convention) so the TS layer is the source of truth for the
// allowed values. FROZEN after the foundation commit: a feature agent adds a NEW kind by
// extending AgentRunKind here (the one place), never by inventing an unlisted string.

/**
 * Which agent a run belongs to. The foundation ships only "refresh" (the built-in NO-LLM
 * re-pull + re-engine agent); the other four are reserved for the feature worktrees that
 * land in their own commits (bill dispute, rate switch, solar watch, rebate). A feature
 * agent registers under its reserved kind, it never adds a new literal at run time.
 */
export type AgentRunKind =
  | "refresh"
  | "bill_dispute"
  | "rate_switch"
  | "solar_watch"
  | "rebate"
  | "crop_scrape";

/**
 * The lifecycle of a run. Opens "running"; closes "succeeded" when the agent's work
 * completed without throwing, or "failed" when it threw (e.g. PG&E MFA expired the
 * authorization). There is no "cancelled": a run is short-lived and either finishes or
 * fails within one dispatch.
 */
export type AgentRunStatus = "running" | "succeeded" | "failed";

/**
 * The human-in-the-loop approval state machine for a single proposed action. A v1 agent
 * RECORDS a "proposed" action and never acts on its own; the farm OWNER approves
 * ("approved") or rejects ("rejected") it in the audit UI. On approval the same call
 * executes it ("executed") or records a failure ("failed"); v1 execution is
 * record-and-hand-off only (it makes no external/PG&E call). "rejected" and "failed" are
 * terminal; "executed" is terminal. The forward-only walk is enforced by an atomic
 * updateMany guarded on this column.
 */
export type AgentActionStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";
