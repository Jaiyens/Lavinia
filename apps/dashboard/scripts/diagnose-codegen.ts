// Diagnostic: WHY does the from-scratch xlsx fail on the real farm? Runs up to 3 model attempts with
// FULL per-step logging (render error vs verify reject + the offending reason), and times one model call.
// Run from apps/dashboard:  npx tsx scripts/diagnose-codegen.ts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}
process.env.ALMOND_CODEGEN_LOCAL = "true";

async function main() {
  const { prisma } = await import("@/lib/db");
  const { buildReportSnapshot } = await import("@/lib/almond/codegen/snapshot");
  const { renderXlsx } = await import("@/lib/almond/codegen/run");
  const { extractXlsxNumbers, verifyWorkbookArtifact, buildAllowlist } = await import("@/lib/almond/codegen/verify");
  const { createGatewayModel } = await import("@/lib/ai/gateway");
  const { generateText, stepCountIs, tool } = await import("ai");
  const { z } = await import("zod");

  const byFarm = await prisma.pump.groupBy({ by: ["farmId"], _count: { _all: true } });
  byFarm.sort((a, b) => b._count._all - a._count._all);
  const farm = await prisma.farm.findUniqueOrThrow({ where: { id: byFarm[0].farmId }, select: { id: true, name: true } });
  const deps = { prisma, farmId: farm.id, farmName: farm.name, meterUserId: null };

  const snapshot = await buildReportSnapshot(deps);
  const json = JSON.stringify(snapshot);
  console.log(`Farm: ${farm.name}  meters=${snapshot.meters.length}  opps=${snapshot.opportunities.length}`);
  console.log(`snapshot JSON size: ${(json.length / 1024).toFixed(1)} KB  (this is inlined in EVERY model call)`);
  const allow = buildAllowlist(snapshot);
  console.log(`allowlist size: ${allow.size} canonical number strings`);

  // Tokenizer copy (numberTokens/canon are not exported) so we can show WHICH output numbers are rejected.
  const tok = (t: string) => t.match(/(?<![A-Za-z0-9])-?\$?\d[\d,]*(?:\.\d+)?/g) ?? [];
  const canon = (t: string) => t.replace(/[$,]/g, "").replace(/\.$/, "");

  let attempt = 0;
  const captured: { bytes: Buffer | null } = { bytes: null };
  const renderWorkbook = tool({
    description: "Render the workbook to .xlsx. Pass the openpyxl `code` and a `manifest` of derived totals.",
    inputSchema: z.object({ code: z.string(), manifest: z.array(z.any()) }),
    execute: async ({ code, manifest }) => {
      attempt++;
      const t = Date.now();
      const out = await renderXlsx({ snapshot, code });
      if (out.exitCode !== 0 || out.xlsxBytes === null) {
        console.log(`\n[attempt ${attempt}] RENDER ERROR exit=${out.exitCode} (${Date.now() - t}ms)\n  stderr: ${out.stderr.slice(0, 400)}`);
        return { ok: false as const, error: out.stderr.slice(0, 400) };
      }
      const cellText = await extractXlsxNumbers(out.xlsxBytes);
      if (cellText === null) {
        console.log(`\n[attempt ${attempt}] EXTRACT NULL (a formula/opaque cell or oversized file) (${Date.now() - t}ms)`);
        return { ok: false as const, error: "the workbook had a formula or unreadable cell; write plain numbers." };
      }
      const verdict = verifyWorkbookArtifact(snapshot, manifest, cellText);
      if (verdict.ok) {
        captured.bytes = out.xlsxBytes;
        console.log(`\n[attempt ${attempt}] VERIFY PASS (${Date.now() - t}ms)`);
        return { ok: true as const };
      }
      // Show the first handful of OUTPUT numbers that are not in the allowlist (the rejection set).
      const rejected = [...new Set(tok(cellText).map(canon).filter((c) => !allow.has(c)))].slice(0, 25);
      console.log(`\n[attempt ${attempt}] VERIFY FAIL: ${verdict.reason} (${Date.now() - t}ms)`);
      console.log(`  output numbers NOT in allowlist (first 25): ${rejected.join(", ")}`);
      return { ok: false as const, error: verdict.reason };
    },
  });

  const sys = [
    "You build the grower's Excel workbook by WRITING a complete openpyxl Python 3 script. Your script",
    'MUST `import json`, load `json.load(open("snapshot.json"))`, build a Workbook, and `wb.save("out.xlsx")`.',
    "Full styling freedom (fills, fonts, borders, freeze, charts).",
    "NUMBERS: every number you write into a cell MUST come from the snapshot (a literal value, or a sum/",
    "count you compute from snapshot values). Money is INTEGER CENTS; divide by 100 to show dollars. Do NOT",
    "write live spreadsheet formulas; compute totals in python and write the number. Pass a manifest of any",
    "DERIVED totals you computed (each { kind:'derived', label, value, op:'sum'|'count', sourcePaths }).",
    "Use ONLY the standard library + openpyxl (pandas is NOT installed).",
    "",
    "SNAPSHOT (also available to your script as snapshot.json):",
    json,
  ].join("\n");

  const t0 = Date.now();
  await generateText({
    model: createGatewayModel("anthropic/claude-sonnet-4.6"),
    system: sys,
    prompt: "Build an Excel of all my meters: meter name, rate, and latest cost (skip meters with no posted cost). Style the header bold with a gold fill and freeze it. Keep it simple.",
    tools: { renderWorkbook },
    stopWhen: stepCountIs(3),
  });
  console.log(`\nTOTAL model loop: ${((Date.now() - t0) / 1000).toFixed(1)}s, ${attempt} render attempt(s)`);
  if (captured.bytes) {
    writeFileSync("/tmp/almond-diag.xlsx", captured.bytes);
    console.log("PASSED -> wrote /tmp/almond-diag.xlsx");
  } else {
    console.log("No verified file produced.");
  }
  await prisma.$disconnect();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
