/*
 * Seed Gagan's real worksheet SPINE from the master CSV: entities, blocks (with owning entity), per-
 * block-variety acreage, the Almond Logic field->block map, and Total Good Meats (as MANUAL_ENTRY, the
 * CSV's authoritative manual/Blue-Diamond figure). Also persists the huller runs (CropRun) from the
 * scraped snapshots. Structure + acreage + TGM only — field/huller WEIGHTS come from the scrape, never
 * the CSV. Tenant-scoped (withFarmTenant), idempotent (find-or-create by name; upserts).
 *
 * Run (local):  npx tsx --env-file=.env.local scripts/seed-batth-worksheet.ts
 * Run (prod):   read -r "U?Paste prod DB URL: " && DATABASE_URL="$U" DATABASE_URL_UNPOOLED="$U" \
 *                 npx tsx scripts/seed-batth-worksheet.ts
 * Override CSV path with BATTH_WORKSHEET_CSV (defaults to the committed fixture).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { withFarmTenant } from "@/lib/crops/tenant-db";
import { parseBatthWorksheet } from "@/lib/crops/parse-batth-worksheet";
import { writeCropRuns } from "@/lib/crops/run-load";

const CSV_PATH = process.env.BATTH_WORKSHEET_CSV ?? join(process.cwd(), "fixtures/batth-worksheet-2025.csv");
const SEED_YEAR = 2025;

/** Minimal RFC-4180-ish CSV tokenizer: handles quoted fields containing commas + escaped quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c === "\r") { /* skip */ }
    else cell += c;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

async function main(): Promise<void> {
  const farm = await prisma.farm.findFirst({ select: { id: true, name: true } });
  if (!farm) throw new Error("no farm found");

  const parsed = parseBatthWorksheet(parseCsv(readFileSync(CSV_PATH, "utf8")).slice(1));
  if (parsed.length === 0) throw new Error(`no worksheet rows parsed from ${CSV_PATH}`);

  await withFarmTenant(prisma, farm.id, async (tx) => {
    // Entities (find-or-create by name; no unique constraint, so look up first).
    const entityId = new Map<string, string>();
    for (const name of new Set(parsed.map((p) => p.entity))) {
      const existing = await tx.entity.findFirst({ where: { farmId: farm.id, name }, select: { id: true } });
      entityId.set(
        name,
        existing?.id ?? (await tx.entity.create({ data: { farmId: farm.id, name }, select: { id: true } })).id,
      );
    }

    // Blocks (name = BLK; one per distinct block, owning entity from its first row) + the field->block
    // map (the Almond Logic delivery `field` is the block number for Batth). Upsert overwrites the
    // placeholder demo mapping.
    const blockId = new Map<string, string>();
    const blockOwner = new Map<string, string>();
    for (const p of parsed) if (!blockOwner.has(p.block)) blockOwner.set(p.block, p.entity);
    for (const [block, owner] of blockOwner) {
      const owningEntityId = entityId.get(owner)!;
      const existing = await tx.block.findFirst({ where: { farmId: farm.id, name: block }, select: { id: true } });
      const id = existing
        ? (await tx.block.update({ where: { id: existing.id }, data: { entityId: owningEntityId }, select: { id: true } })).id
        : (await tx.block.create({ data: { farmId: farm.id, name: block, entityId: owningEntityId }, select: { id: true } })).id;
      blockId.set(block, id);
      await tx.cropFieldBlock.upsert({
        where: { farmId_field: { farmId: farm.id, field: block } },
        create: { farmId: farm.id, field: block, blockId: id },
        update: { blockId: id },
      });
    }

    // Per-block-variety acreage + TGM (MANUAL_ENTRY, the CSV's manual/Blue-Diamond figure).
    let tgmRows = 0;
    const acresByBlock = new Map<string, number>(); // block id -> total planted acres (for Block.acreage)
    for (const p of parsed) {
      const id = blockId.get(p.block)!;
      acresByBlock.set(id, (acresByBlock.get(id) ?? 0) + p.acres);
      await tx.blockPlanting.upsert({
        where: { farmId_blockId_variety_cropYear: { farmId: farm.id, blockId: id, variety: p.variety, cropYear: SEED_YEAR } },
        create: { farmId: farm.id, blockId: id, variety: p.variety, acres: p.acres, cropYear: SEED_YEAR },
        update: { acres: p.acres },
      });
      if (p.tgm2025 != null && p.tgm2025 > 0) {
        // Establish the INITIAL good-meats figure only if none exists yet for this key. Find-or-create
        // (never delete-and-recreate): a real Blue Diamond statement or manual entry may have since
        // SUPERSEDED the seed figure, and re-running the seed must never clobber the customer's newer
        // number — nor fail on the supersede FK when a superseding row references the seed row.
        const existing = await tx.tgmRecord.findFirst({
          where: { farmId: farm.id, cropYear: SEED_YEAR, blockId: id, variety: p.variety },
          select: { id: true },
        });
        if (!existing) {
          await tx.tgmRecord.create({
            data: {
              farmId: farm.id, cropYear: SEED_YEAR, blockId: id, variety: p.variety,
              tgmLbs: p.tgm2025, source: "MANUAL_ENTRY", coverageState: "reconciled",
              supersededReason: "batth worksheet seed",
            },
          });
          tgmRows += 1;
        }
      }
    }
    // Block.acreage = sum of the block's planted acres, so the cost-per-pound engine can split each
    // serving meter's energy across the blocks it serves by acreage (the per-variety detail lives in
    // BlockPlanting; Block.acreage is the rollup the energy allocation needs).
    for (const [id, acres] of acresByBlock) {
      await tx.block.update({ where: { id }, data: { acreage: acres } });
    }
    console.log(
      `seeded ${entityId.size} entities, ${blockId.size} blocks, ${parsed.length} plantings, ${tgmRows} TGM rows for ${farm.name}`,
    );
  });

  const { runs } = await writeCropRuns(prisma, farm.id);
  console.log(`persisted ${runs} huller runs (CropRun)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
