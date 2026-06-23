// Dev-only helper: grant an email owner/member access to a farm in the LOCAL terra_batth DB so a
// teammate can sign in and view it. Refuses any non-local DB (a real grower's access is not a toy).
//
// Run from apps/dashboard:
//   DATABASE_URL=postgresql://panda@127.0.0.1:5432/terra_batth \
//   npx tsx scripts/grant-farm-access.ts <email> ["Farm Name"] [owner|manager|viewer]

import { PrismaClient } from "@prisma/client";

function assertLocalDb(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!(/(127\.0\.0\.1|localhost)/.test(url) && /terra_batth/.test(url))) {
    throw new Error("REFUSING: DATABASE_URL must be the local terra_batth DB.");
  }
}

async function main(): Promise<void> {
  assertLocalDb();
  const email = process.argv[2];
  const farmName = process.argv[3] ?? "Batth Farms";
  const role = process.argv[4] ?? "owner";
  if (!email) throw new Error("usage: grant-farm-access.ts <email> [farmName] [role]");

  const prisma = new PrismaClient();
  try {
    const farm = await prisma.farm.findFirst({ where: { name: farmName }, select: { id: true } });
    if (!farm) throw new Error(`no farm named "${farmName}"`);
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: email.split("@")[0] },
    });
    await prisma.farmMembership.upsert({
      where: { farmId_userId: { farmId: farm.id, userId: user.id } },
      update: { role, status: "active" },
      create: { farmId: farm.id, userId: user.id, role, status: "active" },
    });
    console.log(`[grant] ${email} -> ${farmName} (${role}/active). Sign in with this email to view it.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("[grant] failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
