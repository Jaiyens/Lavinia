// Dev smoke test for the from-scratch Excel codegen via the LOCAL python runtime. It exercises the REAL
// path: the model writes openpyxl python over the farm snapshot, local-run.ts executes it, and the
// number guard verifies the produced .xlsx. Writes the result to /tmp/almond-test.xlsx so you can open it.
//
// Run from apps/dashboard (loads .env.local for DATABASE_URL + the AI gateway key):
//   npx tsx scripts/test-codegen-local.ts ["your styling request in plain words"]
//
// Read-only on the DB; spends one Sonnet codegen call. Needs python3 with openpyxl on PATH.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Load .env.local verbatim (the Neon URL has &/?; read the whole RHS as-is) BEFORE importing db.
for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m || !m[1]) continue;
  const key = m[1];
  let v = m[2] ?? "";
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[key] === undefined) process.env[key] = v;
}
// Turn on the local runtime for this run.
process.env.ALMOND_CODEGEN_LOCAL = "true";

async function main() {
// Dynamic imports AFTER env is set, so the Prisma client + gateway read the loaded vars.
const { prisma } = await import("@/lib/db");
const { runCodegenWorkbook } = await import("@/lib/almond/skills/codegen-workbook");
const { hasGatewayKey } = await import("@/lib/ai/gateway");
const { codegenRuntime } = await import("@/lib/almond/codegen/flags");

console.log("gateway key present:", hasGatewayKey());
console.log("codegen runtime:", codegenRuntime());

// Pick the farm with the most meters so the workbook has real content to style.
const byFarm = await prisma.pump.groupBy({ by: ["farmId"], _count: { _all: true } });
byFarm.sort((a, b) => b._count._all - a._count._all);
const top = byFarm[0];
if (!top) {
  console.error("No meters in this database; nothing to generate over.");
  process.exit(1);
}
const farm = await prisma.farm.findUniqueOrThrow({ where: { id: top.farmId }, select: { id: true, name: true } });
console.log(`Farm: ${farm.name} (${top._count._all} meters)`);

const request =
  process.argv[2] ??
  "Make me an Excel workbook of all my meters with their rate and latest cost. Make the header row a bold gold (#F2C14E) fill with dark text, freeze the header, zebra-stripe the rows, and add a second tab listing the rate-savings opportunities with a bar chart of the savings. Use openpyxl.";
console.log(`\nRequest: ${request}\n`);

const t0 = Date.now();
const result = await runCodegenWorkbook(
  { prisma, farmId: farm.id, farmName: farm.name, meterUserId: null },
  { request },
);
const ms = Date.now() - t0;

if (result.kind === "file") {
  const fromFallback = "fromFallback" in result && result.fromFallback === true;
  console.log(`kind=file  file=${result.fileName}  meters=${result.meterCount}  bytes=${result.bytes.length}  ${ms}ms`);
  console.log(
    fromFallback
      ? ">>> fromFallback=true  (the runtime was unavailable, so this is the DETERMINISTIC builder, NOT model-authored)"
      : ">>> fromFallback=false  (this IS the from-scratch, model-authored, number-verified workbook)",
  );
  writeFileSync("/tmp/almond-test.xlsx", Buffer.from(result.bytes));
  console.log("Wrote /tmp/almond-test.xlsx  — open it to see the styling.");
} else {
  console.log(`kind=${result.kind}  message=${"message" in result ? result.message : ""}  ${ms}ms`);
  console.log(">>> No file. (An honest error means the model could not produce a number-verifiable sheet with the runtime up.)");
}

await prisma.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
