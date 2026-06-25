// One-off: grant an existing account OWNER access to the data farm so the Almond chat (which gates
// from-scratch codegen + persistence on owner/manager) can be tested on localhost. Targets whatever
// DATABASE_URL is in .env.local. Reversible: delete the one FarmMembership row to undo.
//   npx tsx scripts/grant-test-access.ts [email] [farmName]

import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m || !m[1]) continue;
  const key = m[1];
  let v = m[2] ?? "";
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[key] === undefined) process.env[key] = v;
}

async function main() {
  const { prisma } = await import("@/lib/db");
  const email = process.argv[2] ?? "jaiyen_shetty@berkeley.edu";
  const farmName = process.argv[3] ?? "Batth Farms";

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: email.split("@")[0] },
  });
  const farm = await prisma.farm.findFirst({ where: { name: farmName }, select: { id: true } });
  if (!farm) throw new Error(`no farm named "${farmName}"`);

  await prisma.farmMembership.upsert({
    where: { farmId_userId: { farmId: farm.id, userId: user.id } },
    update: { role: "owner", status: "active" },
    create: { farmId: farm.id, userId: user.id, role: "owner", status: "active" },
  });
  console.log(`[grant] ${email} is now OWNER of ${farmName} (active). Sign in with this email to land on it.`);
  await prisma.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
