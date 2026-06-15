// Loads the sample-farm fixture and seeds it into the database. Kept separate
// from seed.ts (the runnable entry) so tests can import the loader and the seed
// function without triggering a top-level run. No `@/` alias here: this module
// is executed by tsx (the seed) and vitest (the tests), and tsx does not resolve
// tsconfig paths, so imports stay relative.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import type {
  ConnectionType,
  Language,
  PersonRole,
} from "../src/lib/recommendations/types";

// Relations are wired by slug in the fixture; the seed resolves them to ids.
type CropInput = { slug: string; name: string; cropCoefficient: number };
type BlockInput = { slug: string; name: string; acreage: number; crop: string };
type PumpInput = {
  name: string;
  serviceId: string;
  meterSerial: string;
  rateSchedule: string;
  billingSerial: string;
  location: string;
  horsepower: number;
  blocks: string[];
};
type PersonInput = { name: string; role: PersonRole; language: Language };
type ConnectionInput = {
  type: ConnectionType;
  status: string;
  externalRef: string;
  authorizedAt: string;
};
type FarmInput = { name: string; timezone: string };

export type SampleFarmFixture = {
  farm: FarmInput;
  owner: PersonInput;
  connection: ConnectionInput;
  crops: CropInput[];
  blocks: BlockInput[];
  pumps: PumpInput[];
};

/**
 * Read and validate the sample-farm fixture. Throws (rather than seeding a
 * half-wired farm) if any block points at an unknown crop or any pump points at
 * an unknown block, so referential integrity is guaranteed before we touch the db.
 */
export function loadSampleFarm(): SampleFarmFixture {
  const path = fileURLToPath(
    new URL("../fixtures/sample-farm.json", import.meta.url),
  );
  const fixture = JSON.parse(readFileSync(path, "utf8")) as SampleFarmFixture;
  validateSampleFarm(fixture);
  return fixture;
}

function validateSampleFarm(fixture: SampleFarmFixture): void {
  const cropSlugs = new Set(fixture.crops.map((c) => c.slug));
  const blockSlugs = new Set(fixture.blocks.map((b) => b.slug));

  if (cropSlugs.size !== fixture.crops.length) {
    throw new Error("sample-farm fixture has duplicate crop slugs");
  }
  if (blockSlugs.size !== fixture.blocks.length) {
    throw new Error("sample-farm fixture has duplicate block slugs");
  }
  for (const block of fixture.blocks) {
    if (!cropSlugs.has(block.crop)) {
      throw new Error(
        `block "${block.slug}" references unknown crop "${block.crop}"`,
      );
    }
  }
  for (const pump of fixture.pumps) {
    if (pump.blocks.length === 0) {
      throw new Error(`pump "${pump.name}" serves no blocks`);
    }
    for (const slug of pump.blocks) {
      if (!blockSlugs.has(slug)) {
        throw new Error(
          `pump "${pump.name}" references unknown block "${slug}"`,
        );
      }
    }
  }
}

// The created farm with every relation included; what seedSampleFarm returns and
// what the tests assert against.
export type SeededFarm = Awaited<ReturnType<typeof seedSampleFarm>>;

/**
 * Seed the sample farm into `prisma`. Idempotent: clears prior farm-scoped data
 * (cascades to blocks, pumps, people, connections, recommendations) and upserts
 * the global crops, so it can run repeatedly against the same db. Returns the
 * farm with all relations resolved.
 */
export async function seedSampleFarm(prisma: PrismaClient) {
  const fixture = loadSampleFarm();

  return prisma.$transaction(async (tx) => {
    // Farms are farm-scoped; crops are shared across farms (unique by name).
    await tx.farm.deleteMany({});

    const cropIdBySlug = new Map<string, string>();
    for (const crop of fixture.crops) {
      const row = await tx.crop.upsert({
        where: { name: crop.name },
        update: { cropCoefficient: crop.cropCoefficient },
        create: { name: crop.name, cropCoefficient: crop.cropCoefficient },
      });
      cropIdBySlug.set(crop.slug, row.id);
    }

    const farm = await tx.farm.create({
      data: {
        name: fixture.farm.name,
        timezone: fixture.farm.timezone,
        isDemo: true, // seed/demo data, not a grower's live farm
        people: {
          create: [
            {
              name: fixture.owner.name,
              role: fixture.owner.role,
              language: fixture.owner.language,
            },
          ],
        },
        connections: {
          create: [
            {
              type: fixture.connection.type,
              status: fixture.connection.status,
              externalRef: fixture.connection.externalRef,
              authorizedAt: new Date(fixture.connection.authorizedAt),
            },
          ],
        },
      },
    });

    const blockIdBySlug = new Map<string, string>();
    for (const block of fixture.blocks) {
      const cropId = cropIdBySlug.get(block.crop);
      if (!cropId) {
        throw new Error(`crop "${block.crop}" was not seeded`);
      }
      const row = await tx.block.create({
        data: {
          name: block.name,
          acreage: block.acreage,
          farm: { connect: { id: farm.id } },
          crop: { connect: { id: cropId } },
        },
      });
      blockIdBySlug.set(block.slug, row.id);
    }

    for (const pump of fixture.pumps) {
      const blockIds = pump.blocks.map((slug) => {
        const id = blockIdBySlug.get(slug);
        if (!id) {
          throw new Error(`block "${slug}" was not seeded`);
        }
        return { id };
      });
      await tx.pump.create({
        data: {
          name: pump.name,
          serviceId: pump.serviceId,
          meterSerial: pump.meterSerial,
          rateSchedule: pump.rateSchedule,
          billingSerial: pump.billingSerial,
          location: pump.location,
          horsepower: pump.horsepower,
          farm: { connect: { id: farm.id } },
          blocks: { connect: blockIds },
        },
      });
    }

    return tx.farm.findUniqueOrThrow({
      where: { id: farm.id },
      include: {
        people: true,
        connections: true,
        blocks: { include: { crop: true, pumps: true } },
        pumps: { include: { blocks: true } },
      },
    });
  });
}
