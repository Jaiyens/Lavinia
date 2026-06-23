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
  // A farm that already has an ACTIVE pge_smd connection is finalized. A pending connection
  // alongside it is an "add another account" started from the Account page, not the first
  // connect still landing - so do NOT show the "PG&E is connecting" banner for it (otherwise
  // an abandoned add-account leaves the banner stuck on the dashboard forever, with no live
  // pull behind it). The banner is only honest while the FIRST connect is still in flight.
  if (input.connections.some((c) => c.type === "pge_smd" && c.status === "active")) return false;
  return input.connections.some((c) => c.type === "pge_smd" && c.status === "pending");
}
