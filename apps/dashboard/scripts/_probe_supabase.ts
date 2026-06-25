// TEMP probe: confirm we're pointed at Supabase (not terra_batth/Neon), the 28-model
// schema is pushed, and the DB is empty/safe to seed. Reads DATABASE_URL_UNPOOLED
// straight from apps/dashboard/.env (the designated Supabase CLI target, port 5432).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

function unpooledFromEnvFile(): string {
  const txt = readFileSync(join(process.cwd(), ".env"), "utf8");
  const m = txt.match(/^DATABASE_URL_UNPOOLED="?([^"\n]+)"?/m);
  if (!m) throw new Error("DATABASE_URL_UNPOOLED not found in apps/dashboard/.env");
  return m[1]!;
}

async function main() {
  const url = unpooledFromEnvFile();
  const host = url.replace(/:[^:@/]+@/, ":***@");
  console.log("target:", host);
  if (!/supabase\.com/.test(url)) throw new Error("REFUSING: target is not Supabase");
  if (/:6543/.test(url)) throw new Error("REFUSING: pooled 6543 endpoint");
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const ver = await prisma.$queryRawUnsafe<{ version: string }[]>("select version()");
    console.log("server:", ver[0]?.version?.slice(0, 60));
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      "select table_name from information_schema.tables where table_schema='public' order by table_name",
    );
    console.log(`public tables (${tables.length}):`, tables.map((t) => t.table_name).join(", "));
    const counts: Record<string, number> = {};
    for (const model of ["Farm", "Entity", "Account", "Pump", "Ranch", "Crop", "SolarArray", "BillingPeriod", "BillingLineItem", "UsageInterval", "Recommendation", "NemPeriod", "Person"]) {
      try {
        const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`select count(*)::bigint as n from "${model}"`);
        counts[model] = Number(r[0]!.n);
      } catch (e) {
        counts[model] = -1; // table missing
      }
    }
    console.log("row counts:", JSON.stringify(counts));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error("PROBE FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
