// PROOF: recompute the cost buckets over the 183 master-spine meters ONLY (off-spine unmapped
// bucket separately), using the dashboard's ACTUAL costSource (loadMetersForFarm). Asserts the
// spine sums to exactly 183, buckets are mutually exclusive, and the BILLED set is provably clean
// (every BILLED meter reconciled; no needs_review/demand-flagged SA). Emits the explicit BILLED
// master list (the only set allowed to display as real PG&E cost). LOCAL DB only. Read-only.

import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { loadMetersForFarm, type MeterView } from "@/lib/dashboard/load";
import { canonSaId } from "@/lib/normalize/sa-id";

const RECON = "/Users/panda/Lavinia/batth-ingestion/dist/_recon.json";
const OUT = "/Users/panda/Lavinia/batth-ingestion/reports/cost_buckets.md";
// The 7 master SAs with a needs_review demand period in account 4699664587 (must be REVIEW).
const NEEDS_REVIEW_7 = ["4694038660", "4695237170", "4695719808", "4697755484", "4698660251", "4699664088", "4699664743"];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!(/(127\.0\.0\.1|localhost)/.test(url) && /terra_batth/.test(url))) throw new Error("not local terra_batth");
  const prisma = new PrismaClient();
  const farm = await prisma.farm.findFirstOrThrow({ where: { name: "Batth Farms" }, select: { id: true } });
  const master = new Set<string>((JSON.parse(readFileSync(RECON, "utf8")).master_sa as string[]).map(canonSaId));
  const meters = await loadMetersForFarm(prisma, farm.id);

  const sa = (m: MeterView) => (m.serviceId ? canonSaId(m.serviceId) : "");
  const spine = meters.filter((m) => master.has(sa(m)));
  const offspine = meters.filter((m) => !master.has(sa(m)));

  type Buckets = { BILLED: MeterView[]; MODELED: MeterView[]; REVIEW: MeterView[]; NONE: MeterView[] };
  const bucket = (ms: MeterView[]): Buckets => {
    const b: Buckets = { BILLED: [], MODELED: [], REVIEW: [], NONE: [] };
    for (const m of ms) b[(m.costSource ?? "NONE") as keyof Buckets].push(m);
    return b;
  };
  const sB = bucket(spine);
  const oB = bucket(offspine);
  const counts = (b: Buckets) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.length]));

  // ---- assertions ----
  const problems: string[] = [];
  // 1) spine sums to exactly 183
  if (spine.length !== 183) problems.push(`spine has ${spine.length} meters, expected 183`);
  const spineSum = Object.values(sB).reduce((a, v) => a + v.length, 0);
  if (spineSum !== 183) problems.push(`spine buckets sum to ${spineSum}, expected 183`);
  // 2) mutual exclusivity: each spine meter in exactly one bucket (by id)
  const seen = new Map<string, string>();
  for (const [name, vs] of Object.entries(sB))
    for (const m of vs) {
      if (seen.has(m.id)) problems.push(`meter ${m.id} in TWO buckets: ${seen.get(m.id)} + ${name}`);
      seen.set(m.id, name);
    }
  // 3) every BILLED meter is reconciled (coverageState) and not a needs_review SA
  for (const m of sB.BILLED) {
    if (m.coverageState !== "reconciled") problems.push(`BILLED ${sa(m)} coverageState=${m.coverageState} (not reconciled)`);
    if (NEEDS_REVIEW_7.includes(sa(m))) problems.push(`BILLED ${sa(m)} is a needs_review demand SA — must be REVIEW`);
  }
  // 4) all 7 needs_review SAs are present and classified REVIEW (or off-spine)
  for (const id of NEEDS_REVIEW_7) {
    const m = meters.find((x) => sa(x) === canonSaId(id));
    if (!m) problems.push(`needs_review SA ${id} not found as a pump`);
    else if (m.costSource !== "REVIEW") problems.push(`needs_review SA ${id} costSource=${m.costSource}, expected REVIEW`);
  }
  // 5) every master SA maps to exactly one spine pump (no missing / dup)
  const spineSAs = spine.map(sa);
  if (new Set(spineSAs).size !== spineSAs.length) problems.push("duplicate SA among spine pumps");
  const missing = [...master].filter((id) => !spineSAs.includes(id));
  if (missing.length) problems.push(`${missing.length} master SAs have no pump: ${missing.slice(0, 5).join(",")}`);

  // ---- BILLED master list (the only set allowed to show real PG&E cost) ----
  // Pull the real meter serial from the Pump table (MeterView does not carry it).
  const serialById = new Map(
    (await prisma.pump.findMany({ where: { farmId: farm.id }, select: { id: true, meterSerial: true } })).map((p) => [p.id, p.meterSerial]),
  );
  const billedList = sB.BILLED.map((m) => ({ sa: sa(m), meterSerial: serialById.get(m.id) ?? null, name: m.name, account: m.accountNumber }))
    .sort((a, b) => a.sa.localeCompare(b.sa));

  // ---- report ----
  const L: string[] = [];
  L.push("# Cost-bucket reconciliation (183 master spine)\n");
  L.push(`_Computed over the dashboard's actual \`costSource\` (loadMetersForFarm). Spine = the 183-row master meter list; the off-spine meters bucket separately and never count toward the spine totals._\n`);
  L.push(`\n## Spine (183 master meters) — MUST sum to 183`);
  L.push("```\n" + JSON.stringify(counts(sB), null, 1) + `\n  sum = ${spineSum}\n` + "```");
  L.push(`\n## Off-spine (${offspine.length} meters: master-extra + unmapped) — separate, excluded from spine totals`);
  L.push("```\n" + JSON.stringify(counts(oB), null, 1) + "```");
  L.push(`\n## Assertions`);
  L.push(problems.length ? "FAILED:\n- " + problems.join("\n- ") : "ALL PASS: spine=183, buckets mutually exclusive, BILLED provably clean, 7 needs_review SAs held at REVIEW.");
  L.push(`\n## REVIEW master meters (held out of cost; incl. the 7 demand SAs)`);
  for (const m of sB.REVIEW) L.push(`- ${sa(m)}  ${m.name}  (${m.coverageState})`);
  L.push(`\n## BILLED master meters — the ONLY set allowed to display real PG&E cost (${billedList.length})`);
  L.push("| SA id | meter | name | account |");
  L.push("|---|---|---|---|");
  for (const r of billedList) L.push(`| ${r.sa} | ${r.meterSerial ?? "-"} | ${r.name} | ${r.account ?? "-"} |`);
  writeFileSync(OUT, L.join("\n") + "\n");

  // ---- console ----
  console.log("SPINE (183):", counts(sB), "sum", spineSum);
  console.log("OFF-SPINE (" + offspine.length + "):", counts(oB));
  console.log(problems.length ? "ASSERTIONS FAILED:\n  " + problems.join("\n  ") : "ASSERTIONS: ALL PASS");
  console.log(`BILLED master meters: ${billedList.length} (list -> ${OUT})`);
  await prisma.$disconnect();
  if (problems.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
