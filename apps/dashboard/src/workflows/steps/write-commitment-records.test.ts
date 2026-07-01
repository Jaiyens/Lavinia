import { describe, expect, it } from "vitest";
import {
  type CommitmentTx,
  type RunInCommitmentTenant,
  commitmentProvenance,
  writeCommitmentRecordsStep,
} from "./write-commitment-records";

// Commitment-ingestion invariants WITHOUT a database: a CommitmentRecord is written per (buyer,
// variety) with price stored as integer cents/lb (null preserved), source ALMOND_LOGIC, only on a
// "reconciled" verdict, idempotent on re-run.

const FARM_ID = "farm_test";
const CROP_YEAR = 2024;
const REPORT_ID = "rep_xyz";

type Created = {
  variety: string;
  pounds: number;
  buyer: string;
  priceCentsPerPound: number | null;
  source: string;
  supersededReason: string;
};

function makeFakeTenant(): { runInTenant: RunInCommitmentTenant; created: Created[] } {
  const created: Created[] = [];
  const tx: CommitmentTx = {
    commitmentRecord: {
      findMany: (args) =>
        Promise.resolve(
          created
            .filter((r) => r.supersededReason === args.where.supersededReason)
            .map((r) => ({ buyer: r.buyer, variety: r.variety })),
        ),
      create: (args) => {
        created.push({
          variety: args.data.variety,
          pounds: args.data.pounds,
          buyer: args.data.buyer,
          priceCentsPerPound: args.data.priceCentsPerPound,
          source: args.data.source,
          supersededReason: args.data.supersededReason,
        });
        return Promise.resolve({ id: `c_${created.length}` });
      },
    },
  };
  const runInTenant: RunInCommitmentTenant = (farmId, fn) => {
    expect(farmId).toBe(FARM_ID);
    return fn(tx);
  };
  return { runInTenant, created };
}

describe("writeCommitmentRecordsStep", () => {
  it("writes one CommitmentRecord per (buyer, variety) with cents/lb price (null preserved)", async () => {
    const fake = makeFakeTenant();
    const out = await writeCommitmentRecordsStep(
      {
        farmId: FARM_ID,
        reportId: REPORT_ID,
        cropYear: CROP_YEAR,
        rows: [
          { buyer: "Holland Nut", variety: "Nonpareil", committedPounds: 100_000, priceCentsPerPound: 215 },
          { buyer: "Holland Nut", variety: "Monterey", committedPounds: 50_000, priceCentsPerPound: null },
        ],
        controlTotalPounds: 150_000,
        coverage: "reconciled",
      },
      fake.runInTenant,
    );
    expect(out.withheld).toBe(false);
    expect(out.written).toBe(2);
    expect(fake.created).toHaveLength(2);
    const np = fake.created.find((r) => r.variety === "Nonpareil")!;
    expect(np.source).toBe("ALMOND_LOGIC");
    expect(np.buyer).toBe("Holland Nut");
    expect(np.pounds).toBe(100_000);
    expect(np.priceCentsPerPound).toBe(215);
    expect(np.supersededReason).toBe(commitmentProvenance(REPORT_ID));
    const mont = fake.created.find((r) => r.variety === "Monterey")!;
    expect(mont.priceCentsPerPound).toBeNull(); // pounds-only commitment preserved
  });

  it("a needs_review verdict writes NOTHING", async () => {
    const fake = makeFakeTenant();
    const out = await writeCommitmentRecordsStep(
      {
        farmId: FARM_ID,
        reportId: REPORT_ID,
        cropYear: CROP_YEAR,
        rows: [{ buyer: "X", variety: "Nonpareil", committedPounds: 1, priceCentsPerPound: null }],
        controlTotalPounds: null,
        coverage: "needs_review",
      },
      fake.runInTenant,
    );
    expect(out.withheld).toBe(true);
    expect(out.written).toBe(0);
    expect(fake.created).toHaveLength(0);
  });

  it("is idempotent: a re-run skips (buyer, variety) pairs already written", async () => {
    const fake = makeFakeTenant();
    const input = {
      farmId: FARM_ID,
      reportId: REPORT_ID,
      cropYear: CROP_YEAR,
      rows: [{ buyer: "Holland Nut", variety: "Nonpareil", committedPounds: 100_000, priceCentsPerPound: 215 }],
      controlTotalPounds: 100_000,
      coverage: "reconciled" as const,
    };
    const first = await writeCommitmentRecordsStep(input, fake.runInTenant);
    expect(first.written).toBe(1);
    const second = await writeCommitmentRecordsStep(input, fake.runInTenant);
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(1);
    expect(fake.created).toHaveLength(1);
  });
});
