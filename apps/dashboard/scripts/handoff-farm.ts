// Hand a pre-built farm over to a customer. The ownership machinery already lives in
// src/lib/auth (FarmMembership is the access gate; transferOwnership flips it). This script just
// drives that machinery from the command line so the contract-signing handoff is a few commands
// instead of clicking through /account/team under pressure.
//
// THE STORY this script automates (see the three modes below):
//   1. We build the farm owned by a Terra STAFF account (the "Guggenbot" builder).
//   2. provision -> guarantee that staff owner membership exists, then invite the CUSTOMER.
//      A pending invite ALSO unlocks the customer's sign-in (no ACCESS_ALLOWLIST edit needed) and
//      auto-converts to a membership the first time they log in.
//   3. transfer  -> once the customer has signed in, promote them to owner. transferOwnership
//      automatically DEMOTES staff to manager, which is the "retain as manager for support" posture.
//
// WHICH DATABASE: this talks to whatever DATABASE_URL points at. For a REAL handoff that the
// customer can log into at app.tryterra.ai, that must be the Neon PROD url. The script prints the
// host it connected to so you never run a prod handoff against your laptop by accident.
//   Local dry-run:  (uses .env.local DATABASE_URL)            tsx scripts/handoff-farm.ts status <farmId>
//   Against prod:   DATABASE_URL="<neon-prod-url>" tsx scripts/handoff-farm.ts provision ...
//
// USAGE
//   tsx scripts/handoff-farm.ts status    <farmId>
//   tsx scripts/handoff-farm.ts provision <farmId> <staffEmail> <customerEmail> [--role manager|viewer] [--send]
//   tsx scripts/handoff-farm.ts transfer  <farmId> <staffEmail> <customerEmail>
//
// Both staffEmail and customerEmail must be people who have signed in at least once for `transfer`
// (the customer's User row is created by the auth adapter on first login, then the invite claims).
// For `provision`, only the STAFF account must already exist (sign in once at /login first); the
// customer is invited by email and does not need an account yet.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type FarmRole, PrismaClient } from "@prisma/client";
import { normalizeEmail } from "@/lib/email-normalize";
import { inviteExpiry } from "@/lib/auth/invite";
import { transferOwnership } from "@/lib/auth/team-ops";
import { sendFarmInvite } from "@/lib/email";

/** Load KEY=VALUE pairs from an env file into process.env (does not overwrite existing). */
function loadEnv(file: string): void {
  try {
    const text = readFileSync(join(process.cwd(), file), "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      const key = match?.[1];
      if (key && !(key in process.env)) {
        process.env[key] = (match[2] ?? "").replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // file absent is fine
  }
}

function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(no DATABASE_URL)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

function baseUrl(): string {
  return (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://app.tryterra.ai").replace(/\/+$/, "");
}

function die(msg: string): never {
  console.error(`[handoff] ${msg}`);
  process.exit(1);
}

/** Resolve an existing User by (normalized) email, or fail loudly - we never create auth users by
 *  hand (a hand-made User would not link to a later Google/magic-link sign-in -> orphaned access). */
async function requireUser(
  prisma: PrismaClient,
  rawEmail: string,
  label: string,
): Promise<{ id: string; email: string | null; name: string | null }> {
  const email = normalizeEmail(rawEmail);
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    die(
      `${label} ${email} has no account yet. Have them sign in once at ${baseUrl()}/login, then re-run. ` +
        `(We never create auth users by hand - it would not link to their real sign-in.)`,
    );
  }
  return user;
}

async function printStatus(prisma: PrismaClient, farmId: string): Promise<void> {
  const farm = await prisma.farm.findUnique({
    where: { id: farmId },
    select: { id: true, name: true, isDemo: true, userId: true },
  });
  if (!farm) die(`No farm ${farmId} on ${dbHost()}.`);
  const members = await prisma.farmMembership.findMany({
    where: { farmId },
    select: { role: true, status: true, user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const invites = await prisma.farmInvite.findMany({
    where: { farmId, status: "pending" },
    select: { invitedEmail: true, role: true, expiresAt: true },
  });
  console.log(`\n[handoff] farm "${farm!.name}" (${farm!.id})  isDemo=${farm!.isDemo}  advisoryOwner=${farm!.userId ?? "-"}`);
  console.log(`[handoff] members (${members.length}):`);
  for (const m of members) console.log(`   - ${m.user.email ?? "?"}  ${m.role}  [${m.status}]`);
  console.log(`[handoff] pending invites (${invites.length}):`);
  for (const i of invites) console.log(`   - ${i.invitedEmail}  ${i.role}  expires ${i.expiresAt.toISOString().slice(0, 10)}`);
  console.log("");
}

async function provision(
  prisma: PrismaClient,
  farmId: string,
  staffEmail: string,
  customerEmail: string,
  role: FarmRole,
  send: boolean,
): Promise<void> {
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { id: true, name: true } });
  if (!farm) die(`No farm ${farmId} on ${dbHost()}. Build/import it first.`);
  const staff = await requireUser(prisma, staffEmail, "Staff");
  const customer = normalizeEmail(customerEmail);

  // 1. Guarantee the staff OWNER membership (idempotent via the @@unique([farmId, userId])).
  //    A freshly-imported farm is otherwise unowned (the import scripts set no membership), which
  //    would be a dead end - nobody could log in, invite, or transfer.
  await prisma.farmMembership.upsert({
    where: { farmId_userId: { farmId, userId: staff.id } },
    create: { farmId, userId: staff.id, role: "owner", status: "active" },
    update: { role: "owner", status: "active", removedAt: null },
  });
  // Keep the advisory pointer + real flag honest.
  await prisma.farm.update({ where: { id: farmId }, data: { userId: staff.id, isDemo: false } });
  console.log(`[handoff] staff ${staff.email} is OWNER of "${farm.name}".`);

  // 2. Create the customer invite (idempotent: skip if already an active member or pending invite).
  const alreadyMember = await prisma.farmMembership.findFirst({
    where: { farmId, status: "active", user: { email: customer } },
    select: { id: true },
  });
  if (alreadyMember) {
    console.log(`[handoff] ${customer} is already an active member - skipping invite.`);
  } else {
    const pending = await prisma.farmInvite.findFirst({
      where: { farmId, invitedEmail: customer, status: "pending" },
      select: { id: true },
    });
    if (pending) {
      console.log(`[handoff] ${customer} already has a pending invite - skipping create.`);
    } else {
      await prisma.farmInvite.create({
        data: {
          farmId,
          invitedEmail: customer,
          role,
          invitedById: staff.id,
          expiresAt: inviteExpiry(new Date()),
        },
      });
      console.log(`[handoff] invited ${customer} as ${role} (expires in 14 days).`);
    }
    if (send) {
      await sendFarmInvite({
        to: customer,
        farmName: farm.name,
        inviterName: staff.name?.trim() || staff.email || "Terra",
        url: `${baseUrl()}/login?invited=1`,
      });
      console.log(`[handoff] emailed the invite to ${customer}.`);
    } else {
      console.log(`[handoff] (no email sent - pass --send to email it). They can sign in at ${baseUrl()}/login`);
    }
  }
  await printStatus(prisma, farmId);
  console.log(
    `[handoff] NEXT: ${customer} signs in at ${baseUrl()}/login -> the invite auto-claims and they ` +
      `see the finished farm. Then run:  tsx scripts/handoff-farm.ts transfer ${farmId} ${staffEmail} ${customerEmail}`,
  );
}

async function transfer(
  prisma: PrismaClient,
  farmId: string,
  staffEmail: string,
  customerEmail: string,
): Promise<void> {
  const staff = await requireUser(prisma, staffEmail, "Staff");
  const customer = await requireUser(prisma, customerEmail, "Customer");
  const membership = await prisma.farmMembership.findUnique({
    where: { farmId_userId: { farmId, userId: customer.id } },
    select: { id: true, status: true },
  });
  if (!membership || membership.status !== "active") {
    die(
      `${customer.email} is not an active member of ${farmId} yet. Have them sign in once at ` +
        `${baseUrl()}/login to claim the invite, then re-run transfer.`,
    );
  }
  const result = await transferOwnership(prisma, staff.id, membership!.id);
  if (!result.ok) die(`transfer failed: ${result.error}`);
  console.log(`[handoff] ${customer.email} is now OWNER; ${staff.email} demoted to manager (support access retained).`);
  await printStatus(prisma, farmId);
}

async function main(): Promise<void> {
  loadEnv(".env");
  loadEnv(".env.local");

  const argv = process.argv.slice(2);
  const mode = argv[0];
  const positional = argv.slice(1).filter((a) => !a.startsWith("--"));
  const flags = new Set(argv.filter((a) => a.startsWith("--") && !a.includes("=")));
  const roleArg = argv.find((a) => a.startsWith("--role="))?.split("=")[1] ?? (argv[argv.indexOf("--role") + 1]);
  const role: FarmRole = roleArg === "viewer" ? "viewer" : roleArg === "owner" ? "owner" : "manager";
  const send = flags.has("--send");

  console.log(`[handoff] DB host: ${dbHost()}`);

  const prisma = new PrismaClient();
  try {
    if (mode === "status") {
      const [farmId] = positional;
      if (!farmId) die("usage: handoff-farm.ts status <farmId>");
      await printStatus(prisma, farmId!);
    } else if (mode === "provision") {
      const [farmId, staffEmail, customerEmail] = positional;
      if (!farmId || !staffEmail || !customerEmail) {
        die("usage: handoff-farm.ts provision <farmId> <staffEmail> <customerEmail> [--role manager|viewer] [--send]");
      }
      await provision(prisma, farmId!, staffEmail!, customerEmail!, role, send);
    } else if (mode === "transfer") {
      const [farmId, staffEmail, customerEmail] = positional;
      if (!farmId || !staffEmail || !customerEmail) {
        die("usage: handoff-farm.ts transfer <farmId> <staffEmail> <customerEmail>");
      }
      await transfer(prisma, farmId!, staffEmail!, customerEmail!);
    } else {
      die("modes: status | provision | transfer  (run with no args for usage)");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("[handoff] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
