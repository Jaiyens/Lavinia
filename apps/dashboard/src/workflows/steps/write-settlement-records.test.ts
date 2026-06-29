import { describe, expect, it } from "vitest";
import {
  type ExistingProductionRow,
  type RunInSettlementTenant,
  type SettlementTx,
  settlementProvenance,
  writeSettlementRecordsStep,
} from "./write-settlement-records";

// These tests prove the settlement-ingestion invariants WITHOUT a database (a fake tenant client
// stands in for Prisma): a PACKER_SETTLED row is written with supersedesId pointing at the live
// ALMOND_LOGIC estimate for the same (cropYear, normalized variety) so the estimate->settled gap
// falls out of recomputePositions; a re-run is idempotent; a needs_review verdict writes nothing; and
// an AMBIGUOUS variety (>1 live estimate) is withheld to needs_review, never guessed.

const FARM_ID = "farm_test";
const CROP_YEAR = 2024;
const STATEMENT_ID = "stmt_abc";

type Created = {
  id: string;
  variety: string;
  pounds: number;
  source: string;
  supersedesId: string | null;
  supersededReason: string | null;
};

/**
 * A fake of the tenant-scoped production surface seeded with pre-existing rows. findMany serves the
 * seed + anything created; create appends. Captures created rows for assertions. Zero database.
 */
function makeFakeTenant(seed: ExistingProductionRow[]): {
  runInTenant: RunInSettlementTenant;
  created: Created[];
  all: Created[];
} {
  const created: Created[] = [];
  const seedRows: Created[] = seed.map((r) => ({
    id: r.id,
    variety: r.variety,
    pounds: r.pounds,
    source: r.source,
    supersedesId: r.supersedesId,
    supersededReason: r.supersededReason,
  }));
  let seq = 0;
  const tx: SettlementTx = {
    productionRecord: {
      findMany: () =>
        Promise.resolve(
          [...seedRows, ...created].map((r) => ({
            id: r.id,
            variety: r.variety,
            pounds: r.pounds,
            source: r.source,
            supersedesId: r.supersedesId,
            supersededReason: r.supersededReason,
          })),
        ),
      create: (args) => {
        seq += 1;
        const id = `settled_${seq}`;
        created.push({
          id,
          variety: args.data.variety,
          pounds: args.data.pounds,
          source: args.data.source,
          supersedesId: args.data.supersedesId,
          supersededReason: args.data.supersededReason,
        });
        return Promise.resolve({ id });
      },
    },
  };
  const runInTenant: RunInSettlementTenant = (farmId, fn) => {
    expect(farmId).toBe(FARM_ID); // RLS pin is always the target farm
    return fn(tx);
  };
  return { runInTenant, created, all: [...seedRows, ...created] };
}

/** A live ALMOND_LOGIC estimate row (not superseded, not written by this statement). */
function estimate(id: string, variety: string, pounds: number): ExistingProductionRow {
  return { id, variety, pounds, source: "ALMOND_LOGIC", supersedesId: null, supersededReason: "crop ingest entity e1" };
}

describe("writeSettlementRecordsStep sets supersedesId so the gap falls out", () => {
  it("supersedes the ONE live estimate for the matching normalized variety", async () => {
    // Estimate printed as "Nonpareil"; the settlement prints "NP" — normalizeVariety bridges them.
    const fake = makeFakeTenant([estimate("est_np", "Nonpareil", 120_000)]);
    const out = await writeSettlementRecordsStep(
      {
        farmId: FARM_ID,
        statementId: STATEMENT_ID,
        cropYear: CROP_YEAR,
        rows: [{ variety: "NP", pounds: 125_000, settledPriceCentsPerPound: 215 }],
        controlTotalPounds: 125_000,
        coverage: "reconciled",
      },
      fake.runInTenant,
    );

    expect(out.withheld).toBe(false);
    expect(out.written).toBe(1);
    expect(out.supersededVarieties).toEqual(["NP"]);
    expect(fake.created).toHaveLength(1);
    const row = fake.created[0]!;
    expect(row.source).toBe("PACKER_SETTLED");
    expect(row.variety).toBe("NP"); // stored verbatim, never the normalized form
    expect(row.supersedesId).toBe("est_np"); // <-- the gap-maker
    expect(row.supersededReason).toBe(settlementProvenance(STATEMENT_ID));
  });

  it("with NO matching live estimate, writes the settlement with supersedesId null", async () => {
    const fake = makeFakeTenant([]); // no estimates at all
    const out = await writeSettlementRecordsStep(
      {
        farmId: FARM_ID,
        statementId: STATEMENT_ID,
        cropYear: CROP_YEAR,
        rows: [{ variety: "Monterey", pounds: 80_000, settledPriceCentsPerPound: null }],
        controlTotalPounds: 80_000,
        coverage: "reconciled",
      },
      fake.runInTenant,
    );
    expect(out.written).toBe(1);
    expect(out.supersededVarieties).toEqual([]);
    expect(fake.created[0]!.supersedesId).toBeNull();
  });

  it("does NOT supersede an already-superseded estimate (liveRows excludes it)", async () => {
    // est_old was superseded by a prior settlement (settled_prior). The new statement must NOT pick
    // est_old; with no LIVE estimate left it writes supersedesId null.
    const seed: ExistingProductionRow[] = [
      { id: "est_old", variety: "Nonpareil", pounds: 120_000, source: "ALMOND_LOGIC", supersedesId: null, supersededReason: "crop ingest entity e1" },
      { id: "settled_prior", variety: "Nonpareil", pounds: 121_000, source: "PACKER_SETTLED", supersedesId: "est_old", supersededReason: "crop settlement other" },
    ];
    const fake = makeFakeTenant(seed);
    const out = await writeSettlementRecordsStep(
      {
        farmId: FARM_ID,
        statementId: STATEMENT_ID,
        cropYear: CROP_YEAR,
        rows: [{ variety: "Nonpareil", pounds: 122_000, settledPriceCentsPerPound: null }],
        controlTotalPounds: 122_000,
        coverage: "reconciled",
      },
      fake.runInTenant,
    );
    expect(out.written).toBe(1);
    expect(fake.created[0]!.supersedesId).toBeNull(); // est_old is dead; never re-superseded
  });

  it("a needs_review verdict writes NOTHING", async () => {
    const fake = makeFakeTenant([estimate("est_np", "Nonpareil", 120_000)]);
    const out = await writeSettlementRecordsStep(
      {
        farmId: FARM_ID,
        statementId: STATEMENT_ID,
        cropYear: CROP_YEAR,
        rows: [{ variety: "NP", pounds: 125_000, settledPriceCentsPerPound: null }],
        controlTotalPounds: 999_999,
        coverage: "needs_review",
      },
      fake.runInTenant,
    );
    expect(out.withheld).toBe(true);
    expect(out.written).toBe(0);
    expect(fake.created).toHaveLength(0);
  });

  it("AMBIGUOUS (>1 live estimate for the variety) -> needs_review, writes nothing for it", async () => {
    // Two live estimates normalize to "nonpareil" (NP + Nonpareil). The settlement must not guess.
    const fake = makeFakeTenant([
      estimate("est_a", "NP", 60_000),
      estimate("est_b", "Nonpareil", 60_000),
    ]);
    const out = await writeSettlementRecordsStep(
      {
        farmId: FARM_ID,
        statementId: STATEMENT_ID,
        cropYear: CROP_YEAR,
        rows: [{ variety: "Nonpareil", pounds: 120_000, settledPriceCentsPerPound: null }],
        controlTotalPounds: 120_000,
        coverage: "reconciled",
      },
      fake.runInTenant,
    );
    expect(out.ambiguous).toEqual(["Nonpareil"]);
    expect(out.written).toBe(0);
    expect(fake.created).toHaveLength(0);
  });

  it("is idempotent: a re-run skips varieties this statement already wrote", async () => {
    const seed = [estimate("est_np", "Nonpareil", 120_000)];
    const fake = makeFakeTenant(seed);
    const input = {
      farmId: FARM_ID,
      statementId: STATEMENT_ID,
      cropYear: CROP_YEAR,
      rows: [{ variety: "NP", pounds: 125_000, settledPriceCentsPerPound: null }],
      controlTotalPounds: 125_000,
      coverage: "reconciled" as const,
    };
    const first = await writeSettlementRecordsStep(input, fake.runInTenant);
    expect(first.written).toBe(1);
    const second = await writeSettlementRecordsStep(input, fake.runInTenant);
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(1);
    expect(fake.created).toHaveLength(1); // no duplicate row
  });
});
