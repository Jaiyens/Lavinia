// Rebuild the demo account in the DB from the COMMITTED reconciled fixture - zero external
// calls (Story 1.8 / AC4). This is how dev/CI/Vercel populate the real reconciled demo
// without re-running the paid live Gateway import: `npm run db:import-fixture`. Run it after
// `db:seed` if you want the real reconciled account to outrank the synthetic seed in the
// dashboard (the seed clears farms, so the real account must be re-applied after seeding).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { type ExtractionResult, persistExtraction, type toFixture } from "@/lib/extract/import";
import { runRateLever } from "@/lib/recommendations/run-rate-lever";
import { runSolarInsight } from "@/lib/recommendations/run-solar-insight";

const FIXTURE_PATH = "fixtures/extract/batth-account-4699664587.json";
const ACCOUNT_NUMBER = "4699664587-8";

function loadEnv(file: string): void {
  try {
    for (const rawLine of readFileSync(join(process.cwd(), file), "utf8").split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      const key = match?.[1];
      if (key && !(key in process.env)) process.env[key] = (match[2] ?? "").replace(/^["']|["']$/g, "");
    }
  } catch {
    // file absent is fine
  }
}

async function main(): Promise<void> {
  loadEnv(".env");
  const fixture = JSON.parse(
    readFileSync(join(process.cwd(), FIXTURE_PATH), "utf8"),
  ) as ReturnType<typeof toFixture>;

  const result: ExtractionResult = {
    pages: fixture.pages,
    accountNumber: fixture.account.number,
    accountPrintedTotalCents: fixture.account.printedTotalCents,
    bills: fixture.bills,
    nem: fixture.nem,
    needsReview: fixture.needsReview,
    reconciledCount: fixture.reconciledCount,
    escalatedCount: fixture.escalatedCount,
  };

  const prisma = new PrismaClient();
  try {
    const counts = await persistExtraction(result, prisma, {
      farmName: "Batth Farms",
      accountNumber: result.accountNumber ?? ACCOUNT_NUMBER,
      isDemo: false,
    });

    // The real account is the dashboard farm only when it reads as a connected, real
    // farm (project-context: isDemo:false + an active PG&E SMD connection; dashboardFarm
    // / currentFarm gate on that). The committed bill is this account's authorized data
    // source, so mark the farm connected here (idempotent) - otherwise db:import-fixture
    // would not actually make the reconciled account the dashboard farm (its whole point),
    // and the synthetic seed would keep winning.
    const farmId = `real-${result.accountNumber ?? ACCOUNT_NUMBER}`;
    const existing = await prisma.connection.findFirst({
      where: { farmId, type: "pge_smd" },
    });
    if (!existing) {
      await prisma.connection.create({
        data: {
          farmId,
          type: "pge_smd",
          status: "active",
          // C4: this account is legible from an uploaded/extracted BILL, not a live
          // Share-My-Data authorization. type stays pge_smd so it is the dashboard farm,
          // but source records the true provenance so the LOA-upgrade flow is not misled
          // into thinking the grower already signed an SMD authorization.
          source: "bill_upload",
          externalRef: `bill-import-${ACCOUNT_NUMBER}`,
          authorizedAt: new Date(),
        },
      });
    }
    console.log("[fixture-import] persisted from committed fixture (zero external calls):", counts);

    // Owner the imported real account so it resolves on the authed dashboard. dashboardFarm
    // is now membership-scoped, so an un-owned real farm shows to nobody. Attach it (and an owner
    // FarmMembership, the actual access gate) to the most recently created User (the operator who
    // just signed in). If no user exists yet, leave it un-owned and say so: sign in once, then
    // re-run `npm run db:import-fixture`.
    const owner = await prisma.user.findFirst({ orderBy: { createdAt: "desc" } });
    if (owner) {
      await prisma.farm.update({ where: { id: farmId }, data: { userId: owner.id } });
      await prisma.farmMembership.upsert({
        where: { farmId_userId: { farmId, userId: owner.id } },
        update: { status: "active", role: "owner" },
        create: { farmId, userId: owner.id, role: "owner", status: "active" },
      });
      console.log(`[fixture-import] assigned real account to user ${owner.email ?? owner.id}`);
    } else {
      console.log(
        "[fixture-import] no user yet: the real account is un-owned and will NOT show on the " +
          "dashboard. Sign in once (the demo will show the representative seed), then re-run " +
          "`npm run db:import-fixture` to attach it to your account.",
      );
    }

    // Run the real levers so the imported account lands with its findings in the
    // rail (Story 3.3). Idempotent: pending rate findings are replaced, resolved
    // ones untouched.
    const asOf = new Date().toISOString();
    const levers = await runRateLever(prisma, farmId, asOf);
    console.log(
      `[fixture-import] rate lever: ${levers.created} findings (${levers.estimates} estimates, ${levers.qualitative} qualitative), ${levers.legacyFlagged} meters flagged legacy`,
    );
    const solar = await runSolarInsight(prisma, farmId, asOf);
    console.log(`[fixture-import] solar insight: ${solar.created} findings`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[fixture-import] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
