// Pure show/hide logic for the dashboard's connection-state banner (Story 5.3, AC3).
// Kept out of the component so it is unit-tested without the DB or React.

export type ConnectionLike = { type: string; status: string };

export type PendingPullInput = {
  /** "real" = the grower's own farm; "representative" = the badged demo seed. */
  dataKind: "real" | "representative";
  connections: readonly ConnectionLike[];
  /** True when the farm already has at least one loaded bill to work from. */
  hasBills: boolean;
};

/**
 * Show "PG&E is connecting. Your bills are already in." only when a REAL farm's PG&E
 * connection is still pending AND bills are already loaded - so the message is honest about
 * the in-flight live pull while the dashboard keeps working on the uploaded bills (never
 * blocked on the LOA). Never shows for the demo (it is not "connecting") nor for a farm
 * whose PG&E connection is already active.
 */
export function showPendingPullBanner(input: PendingPullInput): boolean {
  if (input.dataKind !== "real") return false;
  if (!input.hasBills) return false;
  return input.connections.some((c) => c.type === "pge_smd" && c.status === "pending");
}
