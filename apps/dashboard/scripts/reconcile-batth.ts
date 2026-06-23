// G6 reconcile pass for the Batth load — idempotent post-processing that protects accuracy
// and legibility. Run standalone or called by load-batth-full.ts. LOCAL DB only.
//
//  1. Suppress findings on UNMAPPED off-spine meters (they have no master identity).
//  2. Suppress bill-audit findings on solar/NEM meters: an annual NEM true-up legitimately
//     spikes one month, which the audit misreads as an anomaly (the P031 $62k landmine - the
//     reconciled ledger says it is NEVER banked).
//  3. Merge fragmented Account rows (same PG&E account stored as "4699664587" / "4699664587-8" /
//     "0096005793" by different feeds) into one per canonical number, repoint pumps, keep the
//     PG&E-formatted (dashed) display number and any entity link, delete the empties.
//
// Run: DATABASE_URL=...terra_batth npx tsx scripts/reconcile-batth.ts

import { PrismaClient } from "@prisma/client";
import { normalizeAccountNumber } from "@/lib/normalize/sa-id";

export type ReconcileResult = {
  findingsOnUnmappedDeleted: number;
  unreliableOnNemDeleted: number;
  accountsBefore: number;
  accountsAfter: number;
  accountsMerged: number;
};

export async function reconcileFarm(prisma: PrismaClient, farmId: string): Promise<ReconcileResult> {
  // ---- 1 + 2: finding suppression ----
  const unmapped = new Set(
    (await prisma.pump.findMany({ where: { farmId, status: "UNMAPPED" }, select: { id: true } })).map((p) => p.id),
  );
  const nemIds = new Set(
    (
      await prisma.pump.findMany({
        where: {
          farmId,
          OR: [{ nemType: { not: null } }, { solarKw: { not: null } }, { trueUpMonth: { not: null } }, { isSolar: true }],
        },
        select: { id: true },
      })
    ).map((p) => p.id),
  );

  const recs = await prisma.recommendation.findMany({ where: { farmId }, select: { id: true, tool: true, action: true } });
  const pumpIdOf = (action: unknown): string | null => {
    const a = action as { params?: { pumpId?: unknown } } | null;
    const v = a?.params?.pumpId;
    return typeof v === "string" ? v : null;
  };
  // bill-audit AND rate-optimization are both unreliable on a solar/NEM meter: an annual
  // true-up spikes one month (the P031 $62k bill-audit landmine), and solar distorts the net
  // usage profile rate-opt models from (the AG-5C solar "savings" the methodology holds at $0).
  // The engines' own solar gate keys off solarKw, which is null on meters whose nameplate is not
  // on file, so they leak through; suppress them here by the broader isSolar/nemType signal.
  const UNRELIABLE_ON_NEM = new Set(["bill-audit", "rate-optimization"]);
  const onUnmapped: string[] = [];
  const unreliableOnNem: string[] = [];
  for (const r of recs) {
    const pid = pumpIdOf(r.action);
    if (pid && unmapped.has(pid)) onUnmapped.push(r.id);
    else if (pid && UNRELIABLE_ON_NEM.has(r.tool) && nemIds.has(pid)) unreliableOnNem.push(r.id);
  }
  if (onUnmapped.length) await prisma.recommendation.deleteMany({ where: { id: { in: onUnmapped } } });
  if (unreliableOnNem.length) await prisma.recommendation.deleteMany({ where: { id: { in: unreliableOnNem } } });

  // ---- 3: account merge ----
  const accounts = await prisma.account.findMany({
    where: { farmId },
    select: { id: true, number: true, entityId: true, coverageState: true, pumps: { select: { id: true } } },
  });
  const accountsBefore = accounts.length;
  const groups = new Map<string, typeof accounts>();
  for (const a of accounts) {
    const key = normalizeAccountNumber(a.number) ?? a.number;
    const g = groups.get(key) ?? [];
    g.push(a);
    groups.set(key, g);
  }
  let accountsMerged = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    // Canonical: prefer the dashed PG&E-printed format, else the most-pumps row, else any.
    const canonical =
      group.find((a) => a.number.includes("-")) ??
      [...group].sort((a, b) => b.pumps.length - a.pumps.length)[0]!;
    const entityId = canonical.entityId ?? group.find((a) => a.entityId)?.entityId ?? null;
    const reconciled = group.some((a) => a.coverageState === "reconciled");
    for (const a of group) {
      if (a.id === canonical.id) continue;
      if (a.pumps.length) {
        await prisma.pump.updateMany({ where: { accountId: a.id }, data: { accountId: canonical.id } });
      }
      await prisma.account.delete({ where: { id: a.id } });
      accountsMerged += 1;
    }
    await prisma.account.update({
      where: { id: canonical.id },
      data: { entityId: entityId ?? undefined, ...(reconciled ? { coverageState: "reconciled" } : {}) },
    });
  }

  const accountsAfter = await prisma.account.count({ where: { farmId } });
  return {
    findingsOnUnmappedDeleted: onUnmapped.length,
    unreliableOnNemDeleted: unreliableOnNem.length,
    accountsBefore,
    accountsAfter,
    accountsMerged,
  };
}

// Standalone entry: reconcile the local "Batth Farms" farm.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!(/(127\.0\.0\.1|localhost)/.test(url) && /terra_batth/.test(url))) {
    throw new Error("REFUSING: DATABASE_URL is not local terra_batth.");
  }
  const prisma = new PrismaClient();
  const farm = await prisma.farm.findFirstOrThrow({ where: { name: "Batth Farms" }, select: { id: true } });
  const res = await reconcileFarm(prisma, farm.id);
  console.log(JSON.stringify(res, null, 1));
  await prisma.$disconnect();
}

// Run only when invoked directly (not when imported by the orchestrator).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
