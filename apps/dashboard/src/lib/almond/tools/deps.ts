// The crop responder's tool dependencies. The hard rule this track enforces: a tool's farmId comes
// from the SESSION (captured into these deps at construction), NEVER from the model — so it is not a
// tool input and cannot be steered by the prose. Every tool is a thin wrapper over a pure,
// farmId-scoped query; injecting the loader here is also what lets the pure tool cores be tested to
// the pound without a database (a fixture loader returns a fixture ledger).

import type { CropLedger } from "@/lib/crops/types";

/**
 * What every crop tool needs to run a scoped query. `farmId` is the session's active farm, pinned at
 * responder construction. `loadLedger` returns the full append-only ledger for that farm (the live
 * wiring calls loadCropLedger through the tenant transaction; tests inject a fixture loader).
 */
export type CropToolDeps = {
  readonly farmId: string;
  loadLedger(farmId: string): Promise<CropLedger>;
};
