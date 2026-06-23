// One-off: transfer the local "Batth Farms" owner to a new email. LOCAL DB only.
import { PrismaClient } from "@prisma/client";

const NEW = "jaiyen_shetty@berkeley.edu";
const OLD = "gpt4shared@gmail.com";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!(/(127\.0\.0\.1|localhost)/.test(url) && /terra_batth/.test(url))) {
    throw new Error("REFUSING: not local terra_batth");
  }
  const prisma = new PrismaClient();
  const farm = await prisma.farm.findFirstOrThrow({ where: { name: "Batth Farms" }, select: { id: true } });
  const owner = await prisma.user.upsert({
    where: { email: NEW },
    update: {},
    create: { email: NEW, name: "Jaiyen Shetty (owner)" },
  });
  await prisma.farm.update({ where: { id: farm.id }, data: { userId: owner.id } });
  await prisma.farmMembership.upsert({
    where: { farmId_userId: { farmId: farm.id, userId: owner.id } },
    update: { role: "owner", status: "active" },
    create: { farmId: farm.id, userId: owner.id, role: "owner", status: "active" },
  });
  const old = await prisma.user.findUnique({ where: { email: OLD }, select: { id: true } });
  if (old) await prisma.farmMembership.deleteMany({ where: { farmId: farm.id, userId: old.id } });

  const mems = await prisma.farmMembership.findMany({
    where: { farmId: farm.id },
    include: { user: { select: { email: true } } },
  });
  console.log("Farm.userId ->", owner.email ?? owner.id);
  console.log("memberships:", mems.map((m) => `${m.user.email} (${m.role}/${m.status})`));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
