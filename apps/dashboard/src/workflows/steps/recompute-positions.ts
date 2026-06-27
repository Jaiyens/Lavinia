"use step";

// Workflow STEP: recomputePositions. On deploy the WDK build adapter makes this a durable step;
// locally it is a plain async function.
//
// Loads the farm's append-only ledger and runs the pure recomputePositions over it. This step owns
// NO arithmetic itself — recomputePositions is the single producer of every pound figure. Loading is
// reached through an injected boundary so tests run with a fake ledger and zero database. Persisting
// a position cache is a future concern; for now the recomputed position is returned (and logged at a
// coarse, number-free level) so the workflow has an observable terminal result.

import type { PrismaClient } from "@prisma/client";
import { loadCropLedger } from "@/lib/crops/load";
import { recomputePositions } from "@/lib/crops/positions";
import type { CropLedger, Positions } from "@/lib/crops/types";

/** The injected ledger-load boundary: return the full ledger for a farm. Backed by loadCropLedger. */
export type LoadLedger = (farmId: string) => Promise<CropLedger>;

/** Production default loader, backed by the real Prisma client (reads go through withFarmTenant). */
export function prismaLoadLedger(prisma: PrismaClient): LoadLedger {
  return (farmId) => loadCropLedger(prisma, farmId);
}

export type RecomputePositionsInput = {
  farmId: string;
};

export type RecomputePositionsOutput = {
  positions: Positions;
};

/**
 * Load the ledger and recompute the position. Pure core, injected I/O. Persistence is intentionally
 * a no-op for now (the position is always rebuildable from the ledger); the count is logged without
 * any pound value.
 */
export async function recomputePositionsStep(
  input: RecomputePositionsInput,
  loadLedger: LoadLedger,
): Promise<RecomputePositionsOutput> {
  const ledger = await loadLedger(input.farmId);
  const positions = recomputePositions(ledger);
  // Observable terminal result; logs a count, never a pound figure.
  console.info(`[crop ingest] recomputed ${positions.length} position cells for farm`);
  return { positions };
}
