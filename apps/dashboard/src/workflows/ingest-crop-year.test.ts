import { describe, expect, it } from "vitest";
import { ingestCropYear, type IngestDeps } from "./ingest-crop-year";
import type { CropProductionTx, RunInTenant } from "./steps/write-yield-records";
import { extractStep } from "./steps/extract";
import { poundGateStep } from "./steps/pound-gate";
import { writeYieldRecordsStep } from "./steps/write-yield-records";
import { corruptedFixturePages, reconcilingFixturePages } from "@/lib/crops/scrape/fixtures";
import type { CropLedger } from "@/lib/crops/types";

const FARM_ID = "farm_test";
const ENTITY_ID = "entity_test";
const CROP_YEAR = 2024;

/**
 * An in-memory fake of the tenant-scoped production-record surface. Captures created rows and serves
 * findMany so the idempotency path is exercisable, all without a database.
 */
function makeFakeTenant(): { runInTenant: RunInTenant; rows: { variety: string; pounds: number; supersededReason: string }[] } {
  const rows: { variety: string; pounds: number; supersededReason: string }[] = [];
  const tx: CropProductionTx = {
    productionRecord: {
      findMany: (args) =>
        Promise.resolve(
          rows
            .filter((r) => r.supersededReason === args.where.supersededReason)
            .map((r) => ({ variety: r.variety })),
        ),
      create: (args) => {
        rows.push({
          variety: args.data.variety,
          pounds: args.data.pounds,
          supersededReason: args.data.supersededReason,
        });
        return Promise.resolve({ id: `row_${rows.length}` });
      },
    },
  };
  const runInTenant: RunInTenant = (farmId, fn) => {
    expect(farmId).toBe(FARM_ID); // RLS pin is always the target farm
    return fn(tx);
  };
  return { runInTenant, rows };
}

/** A loadLedger fake that rebuilds the ledger from whatever rows the write step captured. */
function makeLoadLedger(rows: { variety: string; pounds: number }[]): IngestDeps["loadLedger"] {
  return () => {
    const ledger: CropLedger = {
      production: rows.map((r, i) => ({
        id: `p${i}`,
        cropYear: CROP_YEAR,
        variety: r.variety,
        pounds: r.pounds,
        source: "ALMOND_LOGIC",
        supersedesId: null,
      })),
      commitments: [],
      pools: [],
    };
    return Promise.resolve(ledger);
  };
}

describe("ingestCropYear (end-to-end with stub scrape + injected fakes)", () => {
  it("scrapes -> extracts -> gates -> writes -> recomputes for a reconciling document", async () => {
    const tenant = makeFakeTenant();
    const deps: IngestDeps = {
      farmId: FARM_ID,
      runInTenant: tenant.runInTenant,
      loadLedger: makeLoadLedger(tenant.rows),
    };

    const result = await ingestCropYear(ENTITY_ID, CROP_YEAR, deps);

    // Stub scrape was used (no live auth supplied).
    expect(result.scrapeBranch).toBe("stub");
    // The reconciling fixture certifies and writes both varieties.
    expect(result.coverage).toBe("reconciled");
    expect(result.write.withheld).toBe(false);
    expect(result.write.written).toBe(2);
    expect(new Set(result.write.varietiesWritten)).toEqual(new Set(["Nonpareil", "Monterey"]));

    // recomputePositions produced the position from the freshly-written ledger.
    const byVariety = new Map(result.positions.map((p) => [p.variety, p]));
    expect(result.positions).toHaveLength(2);
    expect(byVariety.get("Nonpareil")?.producedPounds).toBe(1_200_000);
    expect(byVariety.get("Monterey")?.producedPounds).toBe(800_000);
    expect(byVariety.get("Nonpareil")?.unsoldPounds).toBe(1_200_000); // nothing committed/pooled
  });

  it("is idempotent: a second identical run writes nothing new", async () => {
    const tenant = makeFakeTenant();
    const deps: IngestDeps = {
      farmId: FARM_ID,
      runInTenant: tenant.runInTenant,
      loadLedger: makeLoadLedger(tenant.rows),
    };

    const first = await ingestCropYear(ENTITY_ID, CROP_YEAR, deps);
    expect(first.write.written).toBe(2);

    const second = await ingestCropYear(ENTITY_ID, CROP_YEAR, deps);
    expect(second.write.written).toBe(0);
    expect(second.write.skipped).toBe(2);
    expect(tenant.rows).toHaveLength(2); // append-only, no duplicates
  });

  it("routes a corrupted document to needs_review and withholds the write", async () => {
    // Drive the step chain directly with the corrupted fixture: its printed total disagrees with
    // its line items, so the REAL pound-gate must return needs_review and nothing is written.
    const extracted = await extractStep({ pages: corruptedFixturePages() });
    expect(extracted.rows).toHaveLength(2);
    expect(extracted.controlTotalPounds).toBe(1_900_000); // printed total, NOT the 2,000,000 line sum

    const gated = await poundGateStep({
      rows: extracted.rows,
      controlTotalPounds: extracted.controlTotalPounds,
    });
    expect(gated.sumPounds).toBe(2_000_000);
    expect(gated.coverage).toBe("needs_review");

    const tenant = makeFakeTenant();
    const write = await writeYieldRecordsStep(
      {
        farmId: FARM_ID,
        entityId: ENTITY_ID,
        cropYear: CROP_YEAR,
        rows: gated.rows,
        controlTotalPounds: gated.controlTotalPounds,
        coverage: gated.coverage,
      },
      tenant.runInTenant,
    );
    expect(write.withheld).toBe(true);
    expect(write.written).toBe(0);
    expect(tenant.rows).toHaveLength(0); // a wrong number is NEVER persisted
  });

  it("sanity-checks the reconciling fixture extracts a 2,000,000 stated total", async () => {
    const extracted = await extractStep({ pages: reconcilingFixturePages() });
    expect(extracted.controlTotalPounds).toBe(2_000_000);
    const gated = await poundGateStep({
      rows: extracted.rows,
      controlTotalPounds: extracted.controlTotalPounds,
    });
    expect(gated.coverage).toBe("reconciled");
  });
});
