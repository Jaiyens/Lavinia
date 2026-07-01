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
    for (const p of parsed) {
      const id = blockId.get(p.block)!;
      await tx.blockPlanting.upsert({
        where: { farmId_blockId_variety_cropYear: { farmId: farm.id, blockId: id, variety: p.variety, cropYear: SEED_YEAR } },
        create: { farmId: farm.id, blockId: id, variety: p.variety, acres: p.acres, cropYear: SEED_YEAR },
        update: { acres: p.acres },
      });
      if (p.tgm2025 != null && p.tgm2025 > 0) {
        // Replace any prior seed row for this key (append-only supersede is for statement updates; the
        // seed is a straight refresh of the manual figure).
        await tx.tgmRecord.deleteMany({
          where: { farmId: farm.id, cropYear: SEED_YEAR, blockId: id, variety: p.variety, source: "MANUAL_ENTRY", supersedesId: null },
        });
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
