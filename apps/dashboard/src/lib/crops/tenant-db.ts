// The application edge for the crop ledger's Row Level Security. The three crop tables enforce
// Postgres RLS keyed on the per-transaction GUC `app.current_farm_id` (see the crop_ledger_rls
// migration). withFarmTenant pins that GUC for the duration of one transaction so the tables see
// ONLY this farm's rows — defense-in-depth on top of the application-level farmId scoping the rest
// of the app already does.
//
// Why SET LOCAL inside a transaction (via set_config(..., is_local = true)): the runtime uses
// Neon's pooled (PgBouncer transaction-mode) endpoint, where a plain `SET` would leak the GUC to
// the next request that reuses the pooled connection. SET LOCAL is transaction-scoped and auto-
// resets at COMMIT/ROLLBACK — the only pooler-safe way to set it. set_config is parameterized, so
// the farmId can never be SQL-injected.

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Run `fn` inside a transaction with `app.current_farm_id` pinned to `farmId`. Every crop-ledger
 * read/write must go through here (passing the `tx` it receives, not the bare client) so RLS is in
 * force. The pure functions (pound-gate, recomputePositions) never touch the DB and so never need
 * this — RLS is purely a DB-edge concern.
 */
export function withFarmTenant<T>(
  prisma: PrismaClient,
  farmId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_farm_id', ${farmId}, true)`;
    return fn(tx);
  });
}
